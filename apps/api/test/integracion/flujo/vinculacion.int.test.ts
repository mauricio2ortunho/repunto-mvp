import { describe, expect } from 'vitest';

import { formatearCodigoDeVinculacion } from '@repunto/dominio';

import { una } from '../base';
import { crearCodigoDeVinculacion, crearNegocio } from '../escenario';
import { TOPE_DE_VINCULACION_POR_IP } from '../../../src/caja/vinculacion.service';
import { contar, test } from './base';

/**
 * Vincular una tablet nueva, por HTTP: el codigo de un solo uso se canjea por
 * la sesion de la tablet, que no vence hasta que se revoque.
 */

describe('POST /caja/vinculacion · la tablet nueva canjea su codigo', () => {
  test('con el codigo vigente recibe su token, y la caja la reconoce', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id, codigo } = await crearCodigoDeVinculacion(db, negocio.local);

    const respuesta = await api.vincular({ codigo });

    expect(respuesta.estado).toBe(200);
    const token = String(respuesta.cuerpo['token']);
    const estado = await api.estadoDeCaja(token);
    expect(estado.estado).toBe(200);
    expect(estado.cuerpo['local']).toEqual({ nombre: 'Equipetrol' });
    // Nueva y sin turno: arranca pidiendo que alguien lo abra.
    expect(estado.cuerpo['impedimento']).toBe('TURNO_CERRADO');

    const tablet = await una<{
      nombre: string;
      vinculacion_id: string;
      token_hash: string;
    }>(
      db,
      'SELECT nombre, vinculacion_id, token_hash FROM dispositivo_caja WHERE vinculacion_id = $1',
      [id],
    );
    // crearNegocio ya trae una tablet en ese local.
    expect(tablet.nombre).toBe('Caja 2');
    // La base guarda el hash, nunca el token.
    expect(tablet.token_hash).not.toBe(token);
    const usado = await una<{ usado: boolean }>(
      db,
      'SELECT usado_el IS NOT NULL AS usado FROM vinculacion_pendiente WHERE id = $1',
      [id],
    );
    expect(usado.usado).toBe(true);
  });

  test('se acepta como se dicte: minusculas, con guion o con espacios', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearCodigoDeVinculacion(db, negocio.local);

    const respuesta = await api.vincular({
      codigo: ` ${formatearCodigoDeVinculacion(codigo).toLowerCase()} `,
    });

    expect(respuesta.estado).toBe(200);
  });

  test('un codigo ya usado no vincula otra tablet', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearCodigoDeVinculacion(db, negocio.local);
    await api.vincular({ codigo });

    const segunda = await api.vincular({ codigo });

    expect(segunda.estado).toBe(422);
    expect(segunda.cuerpo['codigo']).toBe('VINCULACION_INVALIDA');
  });

  test('usado, vencido o inexistente responden exactamente lo mismo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const usado = await crearCodigoDeVinculacion(db, negocio.local);
    await api.vincular({ codigo: usado.codigo });
    const vencido = await crearCodigoDeVinculacion(db, negocio.local, { minutos: -5 });

    const respuestas = await Promise.all([
      api.vincular({ codigo: usado.codigo }),
      api.vincular({ codigo: vencido.codigo }),
      api.vincular({ codigo: 'ABCD-EFGH' }),
      api.vincular({ codigo: 'esto no es un codigo' }),
    ]);

    for (const r of respuestas) {
      expect(r.estado).toBe(422);
      expect(r.cuerpo).toEqual(respuestas[0]?.cuerpo);
    }
  });

  test('si quien genero el codigo ya no esta activo, el codigo no sirve', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { codigo, admin } = await crearCodigoDeVinculacion(db, negocio.local);
    await db.query('UPDATE admin_plataforma SET activo = false WHERE id = $1', [admin]);

    const respuesta = await api.vincular({ codigo });

    expect(respuesta.cuerpo['codigo']).toBe('VINCULACION_INVALIDA');
  });

  test('en un local dado de baja no se instala una caja', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearCodigoDeVinculacion(db, negocio.local);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.local]);

    const respuesta = await api.vincular({ codigo });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');
  });

  test('dos tablets a la vez con el mismo codigo: se vincula una sola', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id, codigo } = await crearCodigoDeVinculacion(db, negocio.local);

    const respuestas = await Promise.all([
      api.vincular({ codigo }),
      api.vincular({ codigo }),
      api.vincular({ codigo }),
    ]);

    expect(respuestas.map((r) => r.estado).sort()).toEqual([200, 422, 422]);
    expect(await contar(db, 'dispositivo_caja', `vinculacion_id = '${id}'`)).toBe(1);
  });

  test('sin codigo, PETICION_INVALIDA', async ({ api, db }) => {
    await crearNegocio(db);
    expect((await api.vincular({})).cuerpo['codigo']).toBe('PETICION_INVALIDA');
  });

  test('tiene tope por IP: probar codigos al azar se frena', async ({ api, db }) => {
    await crearNegocio(db);
    for (let i = 0; i < TOPE_DE_VINCULACION_POR_IP; i += 1) {
      await api.vincular({ codigo: 'ABCD-EFGH' });
    }

    const pasada = await api.vincular({ codigo: 'ABCD-EFGH' });

    expect(pasada.estado).toBe(429);
    expect(pasada.cuerpo['codigo']).toBe('TOPE_SUPERADO');
  });
});
