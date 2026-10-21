import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test, una } from '../base';
import { crearAdmin, crearNegocio, unico } from '../escenario';

/**
 * Codigo de vinculacion de una tablet: de un solo uso, vence en minutos, y lo
 * genera alguien asignado a ESE local o, en la capacitacion del primer dia, el
 * admin de plataforma. Exactamente uno de los dos origenes.
 */

const GENERAR = `
  INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_usuario_id, expira_el)
  VALUES ($1, $2, $3, now() + make_interval(mins => $4))`;

const GENERAR_COMO_ADMIN = `
  INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_admin_id, expira_el)
  VALUES ($1, $2, $3, now() + interval '10 minutes')`;

describe('Vinculacion de tablets', () => {
  test('INV-2 · rechaza un codigo generado por alguien no asignado a ese local', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    // El dueno del negocio no esta asignado a ningun local: hoy no puede
    // generar codigos. Consecuencia buscada de la FK, documentada.
    await esperarRechazo(
      db,
      'vinculacion_pendiente_creador_asignado_al_local_fkey',
      GENERAR,
      [unico('cod'), a.local, a.dueno, 10],
    );
  });

  test('INV-2 · rechaza un codigo para un local del mismo negocio al que el usuario no esta asignado', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'vinculacion_pendiente_creador_asignado_al_local_fkey',
      GENERAR,
      [unico('cod'), a.otroLocal, a.cajero, 10],
    );
  });

  test('INV-2 · acepta un codigo generado por alguien asignado a ese local', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarAceptacion(db, GENERAR, [unico('cod'), a.otroLocal, a.supervisor, 10]);
  });

  test('Seccion 5 · acepta un codigo generado por el admin de plataforma, sin asignacion', async ({
    db,
  }) => {
    // El admin vincula las tablets en la capacitacion del primer dia. No
    // pertenece a ningun negocio, asi que entra por su propia columna.
    const a = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarAceptacion(db, GENERAR_COMO_ADMIN, [unico('cod'), a.local, admin]);
  });

  test('Seccion 5 · rechaza un codigo sin ningun origen', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'vinculacion_pendiente_un_solo_origen_chk',
      `INSERT INTO vinculacion_pendiente (codigo, local_id, expira_el)
       VALUES ($1, $2, now() + interval '10 minutes')`,
      [unico('cod'), a.local],
    );
  });

  test('Seccion 5 · rechaza un codigo con los dos origenes a la vez', async ({ db }) => {
    const a = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarRechazo(
      db,
      'vinculacion_pendiente_un_solo_origen_chk',
      `INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_usuario_id, creado_por_admin_id, expira_el)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [unico('cod'), a.local, a.supervisor, admin],
    );
  });

  test('Seccion 5 · rechaza atribuir la vinculacion a un admin que no existe', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'vinculacion_pendiente_creado_por_admin_id_fkey',
      GENERAR_COMO_ADMIN,
      [unico('cod'), a.local, '00000000-0000-0000-0000-000000000000'],
    );
  });

  test('Seccion 5 · rechaza dos vinculaciones con el mismo codigo', async ({ db }) => {
    const a = await crearNegocio(db);
    const codigo = unico('cod');
    await db.query(GENERAR, [codigo, a.local, a.supervisor, 10]);
    await esperarRechazo(db, 'vinculacion_pendiente_codigo_key', GENERAR, [
      codigo,
      a.otroLocal,
      a.supervisor,
      10,
    ]);
  });

  test('Seccion 5 · rechaza un codigo que nace vencido', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'vinculacion_pendiente_expira_posterior_chk', GENERAR, [
      unico('cod'),
      a.local,
      a.supervisor,
      -1,
    ]);
  });

  test('Seccion 5 · rechaza usar un codigo despues de vencido', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await una<{ id: string }>(db, `${GENERAR} RETURNING id`, [
      unico('cod'),
      a.local,
      a.supervisor,
      10,
    ]);
    await esperarRechazo(
      db,
      'vinculacion_pendiente_uso_antes_de_expirar_chk',
      `UPDATE vinculacion_pendiente SET usado_el = expira_el + interval '1 second' WHERE id = $1`,
      [id],
    );
  });

  test('Seccion 5 · acepta usar un codigo dentro de su vigencia', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await una<{ id: string }>(db, `${GENERAR} RETURNING id`, [
      unico('cod'),
      a.local,
      a.supervisor,
      10,
    ]);
    await esperarAceptacion(
      db,
      `UPDATE vinculacion_pendiente SET usado_el = creado_el + interval '2 minutes' WHERE id = $1`,
      [id],
    );
  });

  test('INV-2 · rechaza una tablet vinculada a otro local que el del codigo', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    const admin = await crearAdmin(db);
    const { id } = await una<{ id: string }>(db, `${GENERAR_COMO_ADMIN} RETURNING id`, [
      unico('cod'),
      a.local,
      admin,
    ]);
    await esperarRechazo(
      db,
      'dispositivo_caja_vinculacion_mismo_local_fkey',
      `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el, vinculacion_id)
       VALUES ($1, 'Caja 1', $2, now(), $3)`,
      [a.otroLocal, unico('token'), id],
    );
  });

  test('Seccion 5 · rechaza dos tablets vinculadas con el mismo codigo', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    const admin = await crearAdmin(db);
    const { id } = await una<{ id: string }>(db, `${GENERAR_COMO_ADMIN} RETURNING id`, [
      unico('cod'),
      a.local,
      admin,
    ]);
    const TABLET = `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el, vinculacion_id)
                    VALUES ($1, 'Caja 1', $2, now(), $3)`;
    await esperarAceptacion(db, TABLET, [a.local, unico('token'), id]);
    await esperarRechazo(db, 'dispositivo_caja_vinculacion_id_key', TABLET, [
      a.local,
      unico('token'),
      id,
    ]);
  });
});
