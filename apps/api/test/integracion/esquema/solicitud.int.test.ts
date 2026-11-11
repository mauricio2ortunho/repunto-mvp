import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearAdmin, crearNegocio, telefono } from '../escenario';

/**
 * La solicitud de negocio: una pendiente por teléfono, y una resuelta sabe
 * quién, cuándo y —si se aprobó— qué negocio se dio de alta.
 */

const PEDIR = `
  INSERT INTO solicitud_negocio (nombre_negocio, categoria, contacto, telefono)
  VALUES ('Pollos Ana', 'restaurante', 'Ana', $1)`;

const CON_ESTADO = `
  INSERT INTO solicitud_negocio (nombre_negocio, categoria, contacto, telefono, estado,
                                 negocio_id, resuelta_por_admin_id, resuelta_el,
                                 motivo_rechazo)
  VALUES ('Pollos Ana', 'restaurante', 'Ana', $1, $2::estado_solicitud,
          $3, $4, $5, $6)`;

describe('Solicitud de negocio', () => {
  test('Seccion 9 · una sola pendiente por teléfono', async ({ db }) => {
    const tel = telefono();
    await esperarAceptacion(db, PEDIR, [tel]);
    await esperarRechazo(db, 'solicitud_negocio_una_pendiente_por_telefono', PEDIR, [
      tel,
    ]);
  });

  test('Seccion 9 · rechazada, el mismo teléfono puede volver a pedir', async ({
    db,
  }) => {
    const tel = telefono();
    const admin = await crearAdmin(db);
    await esperarAceptacion(db, CON_ESTADO, [
      tel,
      'rechazada',
      null,
      admin,
      new Date(),
      'Ya está en otra app',
    ]);
    await esperarAceptacion(db, PEDIR, [tel]);
  });

  test('Seccion 1 · resuelta sin quién ni cuándo, no', async ({ db }) => {
    const admin = await crearAdmin(db);
    await esperarRechazo(db, 'solicitud_negocio_resolucion_chk', CON_ESTADO, [
      telefono(),
      'rechazada',
      null,
      null,
      null,
      null,
    ]);
    await esperarRechazo(db, 'solicitud_negocio_resolucion_chk', CON_ESTADO, [
      telefono(),
      'pendiente',
      null,
      admin,
      new Date(),
      null,
    ]);
  });

  test('Seccion 1 · aprobada es con negocio, y solo aprobada', async ({ db }) => {
    const admin = await crearAdmin(db);
    const negocio = await crearNegocio(db);
    await esperarRechazo(db, 'solicitud_negocio_aprobada_con_negocio_chk', CON_ESTADO, [
      telefono(),
      'aprobada',
      null,
      admin,
      new Date(),
      null,
    ]);
    await esperarRechazo(db, 'solicitud_negocio_aprobada_con_negocio_chk', CON_ESTADO, [
      telefono(),
      'rechazada',
      negocio.id,
      admin,
      new Date(),
      null,
    ]);
    await esperarAceptacion(db, CON_ESTADO, [
      telefono(),
      'aprobada',
      negocio.id,
      admin,
      new Date(),
      null,
    ]);
  });

  test('Modelo · dos solicitudes no aprueban el mismo negocio', async ({ db }) => {
    const admin = await crearAdmin(db);
    const negocio = await crearNegocio(db);
    const aprobada = [telefono(), 'aprobada', negocio.id, admin, new Date(), null];
    await esperarAceptacion(db, CON_ESTADO, aprobada);
    await esperarRechazo(db, 'solicitud_negocio_negocio_id_key', CON_ESTADO, [
      telefono(),
      'aprobada',
      negocio.id,
      admin,
      new Date(),
      null,
    ]);
  });

  test('Cordura · el motivo es de un rechazo', async ({ db }) => {
    await esperarRechazo(db, 'solicitud_negocio_motivo_solo_rechazada_chk', CON_ESTADO, [
      telefono(),
      'pendiente',
      null,
      null,
      null,
      'Un motivo',
    ]);
  });

  test('Seccion 1 · el negocio y el admin existen', async ({ db }) => {
    const admin = await crearAdmin(db);
    const negocio = await crearNegocio(db);
    const nadie = '00000000-0000-4000-8000-000000000000';
    await esperarRechazo(db, 'solicitud_negocio_negocio_id_fkey', CON_ESTADO, [
      telefono(),
      'aprobada',
      nadie,
      admin,
      new Date(),
      null,
    ]);
    await esperarRechazo(db, 'solicitud_negocio_resuelta_por_admin_id_fkey', CON_ESTADO, [
      telefono(),
      'aprobada',
      negocio.id,
      nadie,
      new Date(),
      null,
    ]);
  });
});
