import { describe, expect } from 'vitest';
import type { NegocioEnElTablero } from '@repunto/contratos';

import {
  crearCanje,
  crearCliente,
  crearEntradaDeAdmin,
  crearNegocio,
  crearSello,
  crearTarjeta,
} from '../escenario';
import { type Api, type Db, test } from './base';

/**
 * El tablero del piloto cuenta con las definiciones de la seccion 6: un
 * sello anulado no cuenta, las tarjetas vacias no son abiertas, y cliente
 * nuevo del mes es el de primer sello en el mes de La Paz.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

const DIA = 24;

describe('GET /admin/tablero', () => {
  test('cuenta sellos, canjes, clientes y tarjetas de cada negocio', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db, 'Con movimiento');
    const quieto = await crearNegocio(db, 'Quieto');

    // A: primer sello ahora. Activo, nuevo del mes, en la semana.
    const a = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSello(db, a, negocio);
    // B: primer sello hace 40 dias y otro hace 10. Activo, no nuevo, en el mes.
    const b = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSello(db, b, negocio, 40 * DIA);
    await crearSello(db, b, negocio, 10 * DIA);
    // C: un sello hace 70 dias. No activo; su tarjeta sigue abierta.
    const c = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSello(db, c, negocio, 70 * DIA);
    // D: su unico sello se anulo. No cuenta en nada.
    const d = await crearTarjeta(db, await crearCliente(db), negocio);
    const anulado = await crearSello(db, d, negocio);
    await db.query(
      `UPDATE sello SET anulado = true, anulado_el = now(), anulado_turno_id = $2
       WHERE id = $1`,
      [anulado, negocio.turno],
    );
    // E: tarjeta vacia. F: un canje de hoy.
    await crearTarjeta(db, await crearCliente(db), negocio);
    const f = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearCanje(db, f, negocio);

    const respuesta = await api.tableroDelAdmin(token);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['ventanas']).toEqual({
      semana_dias: 7,
      mes_dias: 30,
      cliente_activo_dias: 60,
      local_sin_sellos_dias: 7,
    });
    const negocios = respuesta.cuerpo['negocios'] as NegocioEnElTablero[];
    const conMovimiento = negocios.find((n) => n.id === negocio.id);
    expect(conMovimiento).toMatchObject({
      nombre: 'Con movimiento',
      estado: 'activo',
      sellos_semana: 1,
      sellos_mes: 2,
      canjes_mes: 1,
      clientes_activos: 2,
      clientes_nuevos_del_mes: 1,
      tarjetas_abiertas: 3,
    });
    const equipetrol = conMovimiento?.locales.find((l) => l.id === negocio.local);
    expect(equipetrol?.ultimo_sello).not.toBeNull();
    expect(equipetrol?.tablets_activas).toBe(1);
    expect(conMovimiento?.locales.find((l) => l.id === negocio.otroLocal)).toMatchObject({
      ultimo_sello: null,
      tablets_activas: 1,
    });
    expect(negocios.find((n) => n.id === quieto.id)).toMatchObject({
      sellos_semana: 0,
      sellos_mes: 0,
      canjes_mes: 0,
      clientes_activos: 0,
      clientes_nuevos_del_mes: 0,
      tarjetas_abiertas: 0,
    });
  });

  test('el inicio del mes es la 00:00 del dia 1 en La Paz', async ({ api, db }) => {
    const token = await entrar(api, db);

    const respuesta = await api.tableroDelAdmin(token);

    const inicio = new Date(String(respuesta.cuerpo['inicio_del_mes']));
    expect(inicio.getUTCDate()).toBe(1);
    expect(inicio.getUTCHours()).toBe(4);
    expect(inicio.getTime()).toBeLessThanOrEqual(
      Date.parse(String(respuesta.cuerpo['generado_el'])),
    );
  });

  test('un local cerrado no aparece; un negocio suspendido va al final', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const suspendido = await crearNegocio(db, 'Aaa primero por nombre');
    const activo = await crearNegocio(db, 'Zzz ultimo por nombre');
    await db.query(`UPDATE negocio SET estado = 'suspendido' WHERE id = $1`, [
      suspendido.id,
    ]);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [activo.otroLocal]);

    const negocios = (await api.tableroDelAdmin(token)).cuerpo[
      'negocios'
    ] as NegocioEnElTablero[];

    expect(negocios.map((n) => n.id)).toEqual([activo.id, suspendido.id]);
    expect(negocios[0]?.locales.map((l) => l.id)).toEqual([activo.local]);
  });

  test('sin sesion de admin, 401', async ({ api }) => {
    expect((await api.tableroDelAdmin(undefined)).estado).toBe(401);
  });
});
