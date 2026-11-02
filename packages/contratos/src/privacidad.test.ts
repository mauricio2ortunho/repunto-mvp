import { describe, expect, it } from 'vitest';

import { esquemaSellarRespuesta } from './caja';
import {
  limpiarEvento,
  limpiarMiga,
  problemasDelEsquema,
  tacharDatos,
} from './privacidad';

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
  it('del pedido deja solo la ruta, sin query, y saca al usuario', () => {
    const evento = limpiarEvento({
      request: {
        url: 'https://panel/caja?x=1',
        headers: { 'User-Agent': 'tablet', Referer: 'https://panel/vincular' },
      },
      user: { ip_address: '1.2.3.4' },
    });

    expect(evento.request).toEqual({ url: 'https://panel/caja' });
    expect(evento.user).toBeUndefined();
  });

  it('tacha telefonos y codigos en los mensajes', () => {
    const evento = limpiarEvento({
      message: 'no se pudo con K7Q4M-418329',
      exception: { values: [{ type: 'Error', value: 'telefono +59170124521' }] },
    });

    expect(evento.message).toBe('no se pudo con [codigo]');
    expect(evento.exception?.values?.[0]?.value).toBe('telefono [numero]');
  });
});

describe('limpiarMiga', () => {
  it('un pedido queda sin query', () => {
    const miga = limpiarMiga({
      category: 'fetch',
      data: { url: 'https://api/caja/registros?x=1', status_code: 200 },
    });

    expect(miga.data).toEqual({ url: 'https://api/caja/registros', status_code: 200 });
  });

  it('un mensaje de la consola queda tachado', () => {
    expect(
      limpiarMiga({ category: 'console', message: 'codigo k7q4m418329' }).message,
    ).toBe('codigo [codigo]');
  });
});

describe('problemasDelEsquema', () => {
  it('dice donde fallo el contrato, nunca lo que vino', () => {
    const resultado = esquemaSellarRespuesta.safeParse({
      nombre: 'Juan +59170124521',
      progreso: 'siete',
    });
    if (resultado.success) throw new Error('tenia que fallar');

    const problemas = problemasDelEsquema(resultado.error);

    expect(problemas).toContain('progreso: invalid_type');
    expect(problemas.join(' ')).not.toContain('Juan');
    expect(problemas.join(' ')).not.toContain('siete');
  });

  it('sin la forma de un error de esquema, no inventa nada', () => {
    expect(problemasDelEsquema(new Error('otra cosa'))).toEqual([]);
  });
});

describe('limpiarEvento, del lado de la api', () => {
  it('deja el metodo y la ruta, y nada mas del pedido', () => {
    const evento = limpiarEvento({
      request: {
        method: 'POST',
        url: 'https://api/caja/sellos?x=1',
        headers: { authorization: 'Bearer secreto', 'idempotency-key': 'clave' },
        data: { codigo: 'K7Q4M-418329' },
        query_string: 'x=1',
        cookies: { a: 'b' },
      },
    });

    expect(evento.request).toEqual({ method: 'POST', url: 'https://api/caja/sellos' });
  });
});
