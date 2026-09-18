import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearCliente, crearTarjeta, escenario } from '../escenario';

/**
 * Alcance entre negocios y locales: lo sostienen las FK compuestas
 * (CLAUDE.md, seccion 14). Cada caso arma datos donde exactamente UNA
 * restriccion aplica, para que el rechazo diga cual fue.
 */

const INSERTAR_SELLO = `
  INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id)
  VALUES ($1, $2, $3, $4, $5)`;

const INSERTAR_CANJE = `
  INSERT INTO canje (tarjeta_id, negocio_id, local_id, turno_id, premio_texto)
  VALUES ($1, $2, $3, $4, 'Un cafe')`;

const ANULAR_SELLO = `
  UPDATE sello SET anulado = true, anulado_el = now(), anulado_turno_id = $2 WHERE id = $1`;

describe('INV-2 · el local de un sello o un canje sale del dispositivo, no del request', () => {
  test('INV-2 · rechaza un sello con un local distinto al del turno', async ({ db }) => {
    const { a, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'sello_turno_mismo_local_fkey', INSERTAR_SELLO, [
      tarjeta,
      a.id,
      a.otroLocal,
      a.turno,
      a.condicion,
    ]);
  });

  test('INV-2 · rechaza un canje con un local distinto al del turno', async ({ db }) => {
    const { a, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'canje_turno_mismo_local_fkey', INSERTAR_CANJE, [
      tarjeta,
      a.id,
      a.otroLocal,
      a.turno,
    ]);
  });

  test('INV-2 · rechaza anular un sello desde la tablet de otra sucursal', async ({
    db,
  }) => {
    const { a, sello } = await escenario(db);
    await esperarRechazo(db, 'sello_anulado_turno_mismo_local_fkey', ANULAR_SELLO, [
      sello,
      a.turnoOtroLocal,
    ]);
  });

  test('INV-2 · acepta anular un sello desde un turno del mismo local', async ({
    db,
  }) => {
    const { a, sello } = await escenario(db);
    await esperarAceptacion(db, ANULAR_SELLO, [sello, a.turno]);
  });

  test('INV-2 · acepta un sello coherente: local, turno, tarjeta y condicion del mismo negocio', async ({
    db,
  }) => {
    const { a, tarjeta } = await escenario(db);
    await esperarAceptacion(db, INSERTAR_SELLO, [
      tarjeta,
      a.id,
      a.local,
      a.turno,
      a.condicion,
    ]);
  });
});

describe('INV-3 · un cajero o supervisor solo opera en sus locales', () => {
  const ABRIR_TURNO = `
    INSERT INTO turno_caja (dispositivo_id, usuario_id, local_id, abierto_el)
    VALUES ($1, $2, $3, now())`;

  test('INV-3 · rechaza abrir turno en un local que el cajero no tiene asignado', async ({
    db,
  }) => {
    const { a } = await escenario(db);
    await esperarRechazo(db, 'turno_caja_usuario_asignado_al_local_fkey', ABRIR_TURNO, [
      a.dispositivoOtroLocal,
      a.cajero,
      a.otroLocal,
    ]);
  });

  test('INV-3 · rechaza un turno que declara un local distinto al de su tablet', async ({
    db,
  }) => {
    const { a } = await escenario(db);
    await esperarRechazo(db, 'turno_caja_dispositivo_mismo_local_fkey', ABRIR_TURNO, [
      a.dispositivoOtroLocal,
      a.cajero,
      a.local,
    ]);
  });

  test('INV-3 · acepta abrir turno en un local asignado, desde una tablet de ese local', async ({
    db,
  }) => {
    const { a } = await escenario(db);
    await esperarAceptacion(db, ABRIR_TURNO, [a.dispositivo, a.cajero, a.local]);
  });

  const ASIGNAR =
    'INSERT INTO usuario_local (usuario_id, local_id, negocio_id) VALUES ($1, $2, $3)';

  test('INV-3 · rechaza asignar un usuario de otro negocio a un local', async ({
    db,
  }) => {
    const { a, b } = await escenario(db);
    await esperarRechazo(db, 'usuario_local_usuario_mismo_negocio_fkey', ASIGNAR, [
      b.cajero,
      a.local,
      a.id,
    ]);
  });

  test('INV-3 · rechaza la misma asignacion declarando el negocio del usuario', async ({
    db,
  }) => {
    const { a, b } = await escenario(db);
    await esperarRechazo(db, 'usuario_local_local_mismo_negocio_fkey', ASIGNAR, [
      b.cajero,
      a.local,
      b.id,
    ]);
  });

  test('INV-3 · rechaza asignar dos veces el mismo usuario al mismo local', async ({
    db,
  }) => {
    const { a } = await escenario(db);
    await esperarRechazo(db, 'usuario_local_pkey', ASIGNAR, [a.cajero, a.local, a.id]);
  });
});

describe('INV-8 · la condicion es de la marca, no se cruza entre negocios', () => {
  test('INV-8 · rechaza un sello con la condicion de otra marca', async ({ db }) => {
    const { a, b, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'sello_condicion_mismo_negocio_fkey', INSERTAR_SELLO, [
      tarjeta,
      a.id,
      a.local,
      a.turno,
      b.condicion,
    ]);
  });

  test('INV-8 · rechaza una condicion escrita por un usuario de otra marca', async ({
    db,
  }) => {
    const { a, b } = await escenario(db);
    await esperarRechazo(
      db,
      'condicion_sello_autor_mismo_negocio_fkey',
      `INSERT INTO condicion_sello (negocio_id, texto, vigente_desde, usuario_id)
       VALUES ($1, 'Dos por uno', now(), $2)`,
      [a.id, b.dueno],
    );
  });
});

describe('INV-18 · sello y canje ocurren en un local del negocio de la tarjeta', () => {
  test('INV-18 · rechaza sellar una tarjeta en un local de otro negocio', async ({
    db,
  }) => {
    const { a, b, tarjeta } = await escenario(db);
    // Turno de B en su local: coherente entre si. Lo unico mal es el negocio.
    await esperarRechazo(db, 'sello_local_mismo_negocio_fkey', INSERTAR_SELLO, [
      tarjeta,
      a.id,
      b.local,
      b.turno,
      a.condicion,
    ]);
  });

  test('INV-18 · rechaza el mismo sello declarando el negocio del local', async ({
    db,
  }) => {
    const { b, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'sello_tarjeta_mismo_negocio_fkey', INSERTAR_SELLO, [
      tarjeta,
      b.id,
      b.local,
      b.turno,
      b.condicion,
    ]);
  });

  test('INV-18 · rechaza canjear una tarjeta en un local de otro negocio', async ({
    db,
  }) => {
    const { a, b, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'canje_local_mismo_negocio_fkey', INSERTAR_CANJE, [
      tarjeta,
      a.id,
      b.local,
      b.turno,
    ]);
  });

  test('INV-18 · rechaza el mismo canje declarando el negocio del local', async ({
    db,
  }) => {
    const { b, tarjeta } = await escenario(db);
    await esperarRechazo(db, 'canje_tarjeta_mismo_negocio_fkey', INSERTAR_CANJE, [
      tarjeta,
      b.id,
      b.local,
      b.turno,
    ]);
  });

  test('INV-18 · rechaza una tarjeta abierta en un local de otro negocio', async ({
    db,
  }) => {
    const { a, b } = await escenario(db);
    // Cliente nuevo: el del escenario ya tiene tarjeta activa en A, y el indice
    // de INV-11 saltaria antes que esta FK.
    const cliente = await crearCliente(db);
    await esperarRechazo(
      db,
      'tarjeta_local_alta_mismo_negocio_fkey',
      `INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
       VALUES ($1, $2, $3, $4)`,
      [cliente, a.programa, a.id, b.local],
    );
  });

  test('INV-18 · acepta la tarjeta del mismo cliente en el otro negocio, con su propio local', async ({
    db,
  }) => {
    const { b, cliente } = await escenario(db);
    await crearTarjeta(db, cliente, b);
  });
});
