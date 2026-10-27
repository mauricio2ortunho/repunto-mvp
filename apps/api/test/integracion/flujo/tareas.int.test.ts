import { afterEach, beforeEach, describe, expect } from 'vitest';

import {
  codigoDe,
  crearCliente,
  crearClienteEnCaja,
  crearNegocio,
  crearSellos,
  crearTarjeta,
  crearTarjetaVencida,
} from '../escenario';
import { contar, test } from './base';

/**
 * La tarea nocturna (CLAUDE.md, seccion 7): vencer tarjetas y purgar lo que
 * ya no protege nada. La dispara Vercel Cron con un secreto; aca se la llama
 * igual, por HTTP.
 */

const SECRETO = 'secreto-de-prueba-del-cron-con-32-caracteres-o-mas';

let anterior: string | undefined;
beforeEach(() => {
  anterior = process.env['CRON_SECRET'];
  process.env['CRON_SECRET'] = SECRETO;
});
afterEach(() => {
  if (anterior === undefined) delete process.env['CRON_SECRET'];
  else process.env['CRON_SECRET'] = anterior;
});

describe('Tarea nocturna · quien la puede disparar', () => {
  test('sin secreto, 401', async ({ api, db }) => {
    await crearTarjetaVencida(db, await crearCliente(db), await crearNegocio(db));
    expect((await api.tareaNocturna()).estado).toBe(401);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });

  test('con otro secreto, 401', async ({ api, db }) => {
    await crearTarjetaVencida(db, await crearCliente(db), await crearNegocio(db));
    expect((await api.tareaNocturna(`${SECRETO}x`)).estado).toBe(401);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });

  test.for([
    ['sin configurar', undefined],
    ['vacio', ''],
    ['demasiado corto', 'corto'],
  ] as const)('con CRON_SECRET %s, rechaza siempre', async ([, valor], { api, db }) => {
    if (valor === undefined) delete process.env['CRON_SECRET'];
    else process.env['CRON_SECRET'] = valor;
    await crearTarjetaVencida(db, await crearCliente(db), await crearNegocio(db));

    // Ni con el secreto que haya quedado configurado, ni sin nada.
    expect((await api.tareaNocturna(valor)).estado).toBe(503);
    expect((await api.tareaNocturna()).estado).toBe(503);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });
});

describe('Tarea nocturna · vencer tarjetas', () => {
  test('vence solo las activas cuyo vence_el ya paso', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const vencida = await crearTarjetaVencida(db, await crearCliente(db), negocio);
    const enCurso = await crearTarjeta(db, await crearCliente(db), negocio);
    await db.query(
      `UPDATE tarjeta SET reloj_desde = now() - interval '10 days',
                          vence_el = now() + interval '20 days' WHERE id = $1`,
      [enCurso],
    );
    // Sin sellos no hay reloj (INV-12): no vence nunca.
    const vacia = await crearTarjeta(db, await crearCliente(db), negocio);
    const canjeada = await crearTarjetaVencida(db, await crearCliente(db), negocio);
    await db.query(`UPDATE tarjeta SET estado = 'canjeada' WHERE id = $1`, [canjeada]);

    const respuesta = await api.tareaNocturna(SECRETO);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({ estado: 'hecho', vencidas: 1 });
    const estados = await db.query<{ id: string; estado: string }>(
      'SELECT id, estado FROM tarjeta',
    );
    expect(Object.fromEntries(estados.rows.map((t) => [t.id, t.estado]))).toEqual({
      [vencida]: 'vencida',
      [enCurso]: 'activa',
      [vacia]: 'activa',
      [canjeada]: 'canjeada',
    });
  });

  test('correrla dos veces no cambia nada', async ({ api, db }) => {
    await crearTarjetaVencida(db, await crearCliente(db), await crearNegocio(db));

    expect((await api.tareaNocturna(SECRETO)).cuerpo).toMatchObject({ vencidas: 1 });
    expect((await api.tareaNocturna(SECRETO)).cuerpo).toEqual({
      estado: 'hecho',
      vencidas: 0,
      purgadas: { codigo_usado: 0, peticion_idempotente: 0, tope_peticion: 0 },
    });
    expect(await contar(db, 'tarjeta', "estado = 'vencida'")).toBe(1);
  });

  test('a la vez que un sello sobre la misma tarjeta: un solo efecto coherente', async ({
    api,
    db,
  }) => {
    // La version con el orden forzado esta en concurrencia.int.test.ts; esta
    // corre la tarea de verdad, en el orden que salga.
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const vencida = await crearTarjetaVencida(db, cliente.id, negocio);
    await crearSellos(db, vencida, negocio, 3);

    const [sello, tarea] = await Promise.all([
      api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } }),
      api.tareaNocturna(SECRETO),
    ]);

    expect(sello.estado).toBe(200);
    expect(sello.cuerpo['progreso']).toBe(1);
    expect(tarea.estado).toBe(200);
    // La vencio uno u otro, una sola vez; la nueva queda activa con su sello.
    expect(await contar(db, 'tarjeta', `id = '${vencida}' AND estado = 'vencida'`)).toBe(
      1,
    );
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
    expect(await contar(db, 'sello', `tarjeta_id = '${vencida}'`)).toBe(3);
    expect(await contar(db, 'sello')).toBe(4);
  });
});

describe('Tarea nocturna · purgar', () => {
  test('borra lo de mas de 24 horas y deja lo reciente', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearCliente(db);
    for (const horas of [25, 23]) {
      await db.query(
        `INSERT INTO codigo_usado (cliente_id, ventana, negocio_id, creado_el)
         VALUES ($1, $2, $3, now() - make_interval(hours => $4::int))`,
        [cliente, 1000 + horas, negocio.id, horas],
      );
      await db.query(
        `INSERT INTO peticion_idempotente
           (dispositivo_id, clave, endpoint, huella_peticion, respuesta, creado_el)
         VALUES ($1, $2, 'POST /caja/sellos', 'huella', '{}',
                 now() - make_interval(hours => $3::int))`,
        [negocio.dispositivo, `clave-de-hace-${horas}-horas`, horas],
      );
      await db.query(
        `INSERT INTO tope_peticion (clave, ventana, cuenta)
         VALUES ($1, date_trunc('hour', now()) - make_interval(hours => $2::int), 1)`,
        [`tope-de-hace-${horas}-horas`, horas],
      );
    }

    const respuesta = await api.tareaNocturna(SECRETO);

    expect(respuesta.cuerpo).toEqual({
      estado: 'hecho',
      vencidas: 0,
      purgadas: { codigo_usado: 1, peticion_idempotente: 1, tope_peticion: 1 },
    });
    expect(await contar(db, 'codigo_usado', 'ventana = 1023')).toBe(1);
    expect(await contar(db, 'peticion_idempotente', "clave like '%-23-%'")).toBe(1);
    expect(await contar(db, 'tope_peticion', "clave like '%-23-%'")).toBe(1);
    expect(await contar(db, 'codigo_usado')).toBe(1);
    expect(await contar(db, 'peticion_idempotente')).toBe(1);
    expect(await contar(db, 'tope_peticion')).toBe(1);
  });
});

describe('Tarea nocturna · el candado', () => {
  test('si otra corrida lo tiene, responde en-curso y no toca nada', async ({
    api,
    db,
    pool,
  }) => {
    await crearTarjetaVencida(db, await crearCliente(db), await crearNegocio(db));

    // Otra corrida a medio camino: tiene el candado y todavia no commiteo.
    const otra = await pool.connect();
    try {
      await otra.query('BEGIN');
      await otra.query(
        `SELECT pg_advisory_xact_lock(hashtext('repunto:tarea-nocturna'))`,
      );

      const respuesta = await api.tareaNocturna(SECRETO);

      expect(respuesta.estado).toBe(200);
      expect(respuesta.cuerpo).toEqual({ estado: 'en-curso' });
      expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
    } finally {
      await otra.query('ROLLBACK');
      otra.release();
    }

    // Suelto el candado, la siguiente corre normal.
    expect((await api.tareaNocturna(SECRETO)).cuerpo).toMatchObject({ vencidas: 1 });
  });
});
