import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { una } from '../base';
import { codigoDe, crearClienteEnCaja, crearNegocio } from '../escenario';
import { contar, levantarApi, test } from './base';
import {
  TOPE_DE_CODIGOS_EQUIVOCADOS,
  TOPE_POR_TELEFONO,
} from '../../../src/seguridad/tope';

/**
 * Los topes cuentan en la base, no en la memoria de cada proceso. En
 * serverless cada invocacion puede ser otra instancia: si cada una contara la
 * suya, el tope real no existiria (CLAUDE.md, seccion 15).
 */
describe('Topes de peticiones · una sola cuenta entre instancias', () => {
  test('dos instancias de la api suman al mismo tope', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { qr_slug } = await una<{ qr_slug: string }>(
      db,
      'SELECT qr_slug FROM local WHERE id = $1',
      [negocio.local],
    );
    const otra = await levantarApi();
    try {
      // Reintentos del mismo equipo: misma clave, mismo ticket. Solo el tope
      // por telefono los puede frenar.
      const clave = randomUUID();
      const cuerpo = { qr_slug, telefono: '70124521', nombre: 'Ana' };
      const estados: number[] = [];
      for (let i = 0; i < TOPE_POR_TELEFONO; i += 1) {
        const instancia = i % 2 === 0 ? api : otra.api;
        estados.push((await instancia.registrar(cuerpo, clave)).estado);
      }
      expect(estados.every((estado) => estado === 202)).toBe(true);

      // Con la cuenta en memoria, cada instancia iba por la mitad del tope.
      const pasada = await otra.api.registrar(cuerpo, clave);
      expect(pasada.estado).toBe(429);
      expect(pasada.cuerpo['codigo']).toBe('TOPE_SUPERADO');
    } finally {
      await otra.apagar();
    }
  });

  test('la tabla no guarda el telefono ni la IP en claro', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { qr_slug } = await una<{ qr_slug: string }>(
      db,
      'SELECT qr_slug FROM local WHERE id = $1',
      [negocio.local],
    );

    await api.registrar({ qr_slug, telefono: '70124521', nombre: 'Ana' });

    const { claves } = await una<{ claves: string }>(
      db,
      "SELECT string_agg(clave, ' ') AS claves FROM tope_peticion",
    );
    expect(claves).not.toContain('70124521');
    expect(claves).not.toContain('127.0.0.1');
    expect(claves.split(' ')).toHaveLength(2);
  });
});

describe('Caja · tope de códigos equivocados por tablet', () => {
  test('tras veinte equivocados, la tablet no sella ni con un código bueno', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    for (let i = 0; i < TOPE_DE_CODIGOS_EQUIVOCADOS; i += 1) {
      const intento = await api.sellar({
        token: negocio.token,
        cuerpo: { codigo: 'ZZZZZ-000000' },
      });
      expect(intento.cuerpo['codigo']).toBe('CODIGO_INVALIDO');
    }

    const bueno = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(bueno.estado).toBe(429);
    expect(bueno.cuerpo['codigo']).toBe('TOPE_SUPERADO');
    expect(String(bueno.cuerpo['mensaje'])).toContain('hora en punto');
    expect(await contar(db, 'sello')).toBe(0);

    // El canje pasa por el mismo tope: es el mismo codigo tipeado.
    const canje = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(canje.cuerpo['codigo']).toBe('TOPE_SUPERADO');
  });

  test('el tope es de esa tablet: la de otro local sigue sellando', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    for (let i = 0; i < TOPE_DE_CODIGOS_EQUIVOCADOS; i += 1) {
      await api.sellar({ token: negocio.token, cuerpo: { codigo: 'ZZZZZ-000000' } });
    }

    const respuesta = await api.sellar({
      token: otro.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
  });

  test('un sello que sale bien, o un código ya usado, no cuenta', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const codigo = codigoDe(cliente);

    expect((await api.sellar({ token: negocio.token, cuerpo: { codigo } })).estado).toBe(
      200,
    );
    const repetido = await api.sellar({ token: negocio.token, cuerpo: { codigo } });
    expect(repetido.cuerpo['codigo']).toBe('CODIGO_YA_USADO');

    expect(await contar(db, 'tope_peticion')).toBe(0);
  });
});
