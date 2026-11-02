import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { conContexto } from '../../src/observabilidad/contexto';
import { esInesperado } from '../../src/observabilidad/errores.filter';
import {
  limpiarEvento,
  opcionesDeSentry,
  reportar,
  tacharDatos,
  vigilarTarea,
} from '../../src/observabilidad/sentry';

describe('tacharDatos', () => {
  it.each([
    [
      'un telefono en E.164',
      'Key (telefono)=(+59170124521) already exists',
      'Key (telefono)=([numero]) already exists',
    ],
    ['un telefono sin +', 'telefono 70124521 repetido', 'telefono [numero] repetido'],
    ['el codigo del cliente con guion', 'codigo K7Q4M-418329', 'codigo [codigo]'],
    ['el codigo sin guion', 'codigo k7q4m418329', 'codigo [codigo]'],
    ['el TOTP suelto', 'totp 418329', 'totp [numero]'],
  ])('tacha %s', (_caso, texto, esperado) => {
    expect(tacharDatos(texto)).toBe(esperado);
  });

  it.each([
    [
      'un UUID, que es lo que sirve para buscar',
      'tarjeta 550e8400-e29b-41d4-a716-446655440000',
    ],
    ['un UUID con tramos de puros digitos', 'sello 11111111-1111-4111-8111-000000000008'],
    ['un numero corto', 'faltan 9 sellos, intento 3 de 20'],
    ['un codigo de error', 'CODIGO_INVALIDO en 1200 ms'],
  ])('deja %s', (_caso, texto) => {
    expect(tacharDatos(texto)).toBe(texto);
  });
});

describe('limpiarEvento', () => {
  it('del pedido deja solo el metodo y la ruta, sin query', () => {
    const evento = limpiarEvento({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api/caja/sellos?x=1',
        headers: { authorization: 'Bearer secreto', 'idempotency-key': 'clave' },
        data: { codigo: 'K7Q4M-418329' },
        query_string: 'x=1',
        cookies: { a: 'b' },
        env: { REMOTE_ADDR: '1.2.3.4' },
      },
      user: { ip_address: '1.2.3.4' },
    });

    expect(evento.request).toEqual({ method: 'POST', url: 'https://api/caja/sellos' });
    expect(evento.user).toBeUndefined();
  });

  it('tacha los mensajes de las excepciones', () => {
    const evento = limpiarEvento({
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'duplicado +59170124521' }] },
    });

    expect(evento.exception?.values?.[0]?.value).toBe('duplicado [numero]');
  });
});

describe('esInesperado', () => {
  it('un rechazo con su codigo es la api haciendo su trabajo', () => {
    expect(esInesperado(new BadRequestException({ codigo: 'CODIGO_INVALIDO' }))).toBe(
      false,
    );
  });

  it('un 5xx armado si: una variable que falta', () => {
    expect(esInesperado(new ServiceUnavailableException())).toBe(true);
  });

  it('un error que no es HTTP si', () => {
    expect(esInesperado(new TypeError('x is undefined'))).toBe(true);
  });
});

/**
 * De punta a punta, con un transporte que guarda en vez de mandar: lo que
 * llega aca es lo que saldria del proceso.
 */
describe('lo que sale hacia Sentry', () => {
  const salido: unknown[] = [];

  beforeAll(() => {
    Sentry.init({
      ...opcionesDeSentry('https://clave@o1.ingest.us.sentry.io/1'),
      transport: () => ({
        send: (sobre) => {
          for (const [, carga] of sobre[1]) salido.push(carga);
          return Promise.resolve({});
        },
        flush: () => Promise.resolve(true),
      }),
    });
  });

  beforeEach(() => {
    salido.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it('el error lleva el request_id y los ids del pedido, y nada del pedido', async () => {
    await conContexto(
      {
        request_id: '6f1c2a0e-6c39-4a8e-9d3a-0d2b8c1e4f55',
        campos: { local_id: 'local-1', turno_id: 'turno-1', codigo: 'ERROR_INTERNO' },
      },
      () => reportar(new Error('no se pudo con +59170124521')),
    );

    const evento = salido[0] as ErrorEvent;
    expect(evento.tags?.['request_id']).toBe('6f1c2a0e-6c39-4a8e-9d3a-0d2b8c1e4f55');
    expect(evento.contexts?.['pedido']).toMatchObject({
      local_id: 'local-1',
      turno_id: 'turno-1',
    });
    expect(evento.exception?.values?.[0]?.value).toBe('no se pudo con [numero]');
    expect(JSON.stringify(evento)).not.toContain('59170124521');
  });

  it('la tarea avisa que empezo y que termino bien', async () => {
    const resultado = await vigilarTarea('tarea-de-prueba', '0 4 * * *', () =>
      Promise.resolve('hecho'),
    );

    expect(resultado).toBe('hecho');
    expect(salido).toEqual([
      expect.objectContaining({ monitor_slug: 'tarea-de-prueba', status: 'in_progress' }),
      expect.objectContaining({ monitor_slug: 'tarea-de-prueba', status: 'ok' }),
    ]);
  });

  it('si la tarea falla, avisa el error y lo deja pasar', async () => {
    await expect(
      vigilarTarea('tarea-de-prueba', '0 4 * * *', () =>
        Promise.reject(new Error('la base no contesta')),
      ),
    ).rejects.toThrow('la base no contesta');

    expect(salido.at(-1)).toMatchObject({
      monitor_slug: 'tarea-de-prueba',
      status: 'error',
    });
  });
});
