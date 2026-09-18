import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test, una } from '../base';
import { crearNegocio, unico } from '../escenario';

/**
 * Codigo de vinculacion de una tablet: de un solo uso, vence en minutos, y lo
 * genera alguien asignado a ESE local.
 */

const GENERAR = `
  INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_usuario_id, expira_el)
  VALUES ($1, $2, $3, now() + make_interval(mins => $4))`;

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
});
