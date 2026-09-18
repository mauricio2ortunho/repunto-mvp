import { describe, expect } from 'vitest';

import { esperarAceptacion, esperarRechazo, test, una } from '../base';
import { crearCanje, crearCliente, crearTarjeta, escenario } from '../escenario';

const ABRIR_TARJETA = `
  INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
  VALUES ($1, $2, $3, $4)`;

describe('INV-11 · como maximo una tarjeta activa por cliente y negocio', () => {
  test('INV-11 · rechaza una segunda tarjeta activa del mismo cliente en el mismo negocio', async ({
    db,
  }) => {
    const { a, cliente } = await escenario(db);
    await esperarRechazo(db, 'tarjeta_una_activa_por_cliente_negocio', ABRIR_TARJETA, [
      cliente,
      a.programa,
      a.id,
      a.otroLocal,
    ]);
  });

  test('INV-11 · rechaza eludirlo declarando un negocio distinto al del programa', async ({
    db,
  }) => {
    const { a, b, cliente } = await escenario(db);
    // Programa de A con negocio_id de B: el indice no la veria como "otra
    // activa en A". La FK compuesta es la que lo impide.
    await esperarRechazo(db, 'tarjeta_programa_mismo_negocio_fkey', ABRIR_TARJETA, [
      cliente,
      a.programa,
      b.id,
      b.local,
    ]);
  });

  test('INV-11 · acepta una tarjeta activa del mismo cliente en otro negocio', async ({
    db,
  }) => {
    const { b, cliente } = await escenario(db);
    await esperarAceptacion(db, ABRIR_TARJETA, [cliente, b.programa, b.id, b.local]);
  });

  test('INV-11 · acepta una tarjeta activa nueva cuando la anterior ya se canjeo', async ({
    db,
  }) => {
    // Este es el que falla si el indice pierde su WHERE: sin el, la canjeada
    // tambien contaria y el canje no podria abrir la tarjeta siguiente.
    const { a, cliente, tarjeta } = await escenario(db);
    await crearCanje(db, tarjeta, a);
    await db.query(`UPDATE tarjeta SET estado = 'canjeada' WHERE id = $1`, [tarjeta]);
    await esperarAceptacion(db, ABRIR_TARJETA, [cliente, a.programa, a.id, a.local]);
  });

  test('INV-11 · acepta una tarjeta activa nueva cuando la anterior vencio', async ({
    db,
  }) => {
    const { a, cliente, tarjeta } = await escenario(db);
    await db.query(`UPDATE tarjeta SET estado = 'vencida' WHERE id = $1`, [tarjeta]);
    await esperarAceptacion(db, ABRIR_TARJETA, [cliente, a.programa, a.id, a.local]);
  });
});

describe('INV-6 · una tarjeta nunca cambia de programa', () => {
  test('INV-6 · rechaza cambiarle el programa a una tarjeta, aunque sea otra version del mismo negocio', async ({
    db,
  }) => {
    const { a, tarjeta } = await escenario(db);
    const { id: version2 } = await una<{ id: string }>(
      db,
      `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
       VALUES ($1, 2, 8, 'Un cafe grande', 4, false) RETURNING id`,
      [a.id],
    );
    await esperarRechazo(
      db,
      'tarjeta_programa_id_inmutable',
      'UPDATE tarjeta SET programa_id = $2 WHERE id = $1',
      [tarjeta, version2],
    );
  });

  test('INV-6 · acepta actualizar el resto de la tarjeta: estado, reloj y vencimiento', async ({
    db,
  }) => {
    const { tarjeta } = await escenario(db);
    await esperarAceptacion(
      db,
      `UPDATE tarjeta
       SET reloj_desde = now(), vence_el = now() + interval '1 month', estado = 'vencida'
       WHERE id = $1`,
      [tarjeta],
    );
  });

  test('INV-6 · acepta reescribir el mismo programa: no es un cambio', async ({ db }) => {
    const { tarjeta } = await escenario(db);
    await esperarAceptacion(
      db,
      'UPDATE tarjeta SET programa_id = programa_id WHERE id = $1',
      [tarjeta],
    );
  });
});

describe('INV-12 · una tarjeta sin sellos no vence', () => {
  test('INV-12 · rechaza un vencimiento sin reloj arrancado', async ({ db }) => {
    const { tarjeta } = await escenario(db);
    await esperarRechazo(
      db,
      'tarjeta_vence_solo_con_reloj_chk',
      `UPDATE tarjeta SET vence_el = now() + interval '1 month' WHERE id = $1`,
      [tarjeta],
    );
  });

  test('INV-12 · rechaza un vencimiento anterior al arranque del reloj', async ({
    db,
  }) => {
    const { tarjeta } = await escenario(db);
    await esperarRechazo(
      db,
      'tarjeta_vence_solo_con_reloj_chk',
      `UPDATE tarjeta SET reloj_desde = now(), vence_el = now() - interval '1 day' WHERE id = $1`,
      [tarjeta],
    );
  });

  test('INV-12 · una tarjeta nueva nace sin reloj ni vencimiento', async ({ db }) => {
    const { a } = await escenario(db);
    const cliente = await crearCliente(db);
    const tarjeta = await crearTarjeta(db, cliente, a);
    const fila = await una<{ reloj_desde: Date | null; vence_el: Date | null }>(
      db,
      'SELECT reloj_desde, vence_el FROM tarjeta WHERE id = $1',
      [tarjeta],
    );
    expect(fila).toEqual({ reloj_desde: null, vence_el: null });
  });

  test('INV-12 · acepta reloj sin vencimiento: programa sin vigencia', async ({ db }) => {
    const { tarjeta } = await escenario(db);
    await esperarAceptacion(db, 'UPDATE tarjeta SET reloj_desde = now() WHERE id = $1', [
      tarjeta,
    ]);
  });
});

describe('INV-16 · un canje por tarjeta', () => {
  test('INV-16 · rechaza un segundo canje sobre la misma tarjeta', async ({ db }) => {
    const { a, tarjeta } = await escenario(db);
    await crearCanje(db, tarjeta, a);
    await esperarRechazo(
      db,
      'canje_tarjeta_id_key',
      `INSERT INTO canje (tarjeta_id, negocio_id, local_id, turno_id, premio_texto)
       VALUES ($1, $2, $3, $4, 'Un cafe')`,
      [tarjeta, a.id, a.local, a.turno],
    );
  });
});
