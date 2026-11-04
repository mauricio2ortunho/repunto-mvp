import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearAdmin, crearEntradaDeAdmin, unico } from '../escenario';

/**
 * La entrada al panel de administracion: un codigo de un solo uso que abre
 * una sola sesion, y siempre del mismo admin que lo genero.
 */

const ABRIR = `
  INSERT INTO sesion_admin (admin_id, token_hash, entrada_id, ultimo_acceso)
  VALUES ($1, $2, $3, now())`;

describe('Panel de administracion', () => {
  test('Seccion 5 · un codigo que nace vencido se rechaza', async ({ db }) => {
    const admin = await crearAdmin(db);
    await esperarRechazo(
      db,
      'entrada_admin_expira_posterior_chk',
      `INSERT INTO entrada_admin (admin_id, codigo, expira_el)
       VALUES ($1, $2, now() - interval '1 minute')`,
      [admin, unico('cod')],
    );
  });

  test('Seccion 5 · no se marca como usado un codigo ya vencido', async ({ db }) => {
    const { id } = await crearEntradaDeAdmin(db, { minutos: -1 });
    await esperarRechazo(
      db,
      'entrada_admin_uso_antes_de_expirar_chk',
      'UPDATE entrada_admin SET usado_el = now() WHERE id = $1',
      [id],
    );
  });

  test('Seccion 5 · dos codigos iguales se rechazan', async ({ db }) => {
    const { codigo, admin } = await crearEntradaDeAdmin(db);
    await esperarRechazo(
      db,
      'entrada_admin_codigo_key',
      `INSERT INTO entrada_admin (admin_id, codigo, expira_el)
       VALUES ($1, $2, now() + interval '10 minutes')`,
      [admin, codigo],
    );
  });

  test('Seccion 5 · un codigo abre una sola sesion', async ({ db }) => {
    const { id, admin } = await crearEntradaDeAdmin(db);
    await esperarAceptacion(db, ABRIR, [admin, unico('hash'), id]);
    await esperarRechazo(db, 'sesion_admin_entrada_id_key', ABRIR, [
      admin,
      unico('hash'),
      id,
    ]);
  });

  test('Seccion 14 · la sesion no puede ser de otro admin que el del codigo', async ({
    db,
  }) => {
    const { id } = await crearEntradaDeAdmin(db);
    const otro = await crearAdmin(db);
    await esperarRechazo(db, 'sesion_admin_entrada_mismo_admin_fkey', ABRIR, [
      otro,
      unico('hash'),
      id,
    ]);
  });

  test('Seccion 5 · dos sesiones con el mismo token se rechazan', async ({ db }) => {
    const a = await crearEntradaDeAdmin(db);
    const b = await crearEntradaDeAdmin(db, { admin: a.admin });
    const hash = unico('hash');
    await db.query(ABRIR, [a.admin, hash, a.id]);
    await esperarRechazo(db, 'sesion_admin_token_hash_key', ABRIR, [a.admin, hash, b.id]);
  });

  test('Cordura · no se revoca una sesion antes de que exista', async ({ db }) => {
    const { id, admin } = await crearEntradaDeAdmin(db);
    await db.query(ABRIR, [admin, unico('hash'), id]);
    await esperarRechazo(
      db,
      'sesion_admin_revocada_posterior_chk',
      `UPDATE sesion_admin SET revocada_el = creado_el - interval '1 second'`,
    );
  });
});
