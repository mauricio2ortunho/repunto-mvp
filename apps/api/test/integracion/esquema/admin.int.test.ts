import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearAdmin, crearEntradaDeAdmin, crearNegocio, unico } from '../escenario';

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

/**
 * Lo que crea el admin: la condicion que escribe en el alta del negocio, y la
 * idempotencia de sus pedidos.
 */

const CONDICION = `
  INSERT INTO condicion_sello (negocio_id, texto, vigente_desde, usuario_id, creado_por_admin_id)
  VALUES ($1, 'Un capuchino', now(), $2, $3)`;

const PETICION = `
  INSERT INTO peticion_idempotente_admin (admin_id, endpoint, clave, huella_peticion)
  VALUES ($1, 'POST /admin/negocios', $2, 'huella')`;

describe('Lo que crea el admin', () => {
  test('Seccion 4 · la condicion la puede escribir el admin, sin nadie del negocio', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarAceptacion(db, CONDICION, [negocio.id, null, admin]);
  });

  test('Seccion 4 · una condicion sin autor se rechaza', async ({ db }) => {
    const negocio = await crearNegocio(db);
    await esperarRechazo(db, 'condicion_sello_un_solo_autor_chk', CONDICION, [
      negocio.id,
      null,
      null,
    ]);
  });

  test('Seccion 4 · una condicion con los dos autores se rechaza', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarRechazo(db, 'condicion_sello_un_solo_autor_chk', CONDICION, [
      negocio.id,
      negocio.dueno,
      admin,
    ]);
  });

  test('Seccion 4 · una condicion de un admin que no existe se rechaza', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await esperarRechazo(db, 'condicion_sello_creado_por_admin_id_fkey', CONDICION, [
      negocio.id,
      null,
      '00000000-0000-4000-8000-000000000000',
    ]);
  });

  test('INV-17 · una condicion de un negocio que no existe se rechaza', async ({
    db,
  }) => {
    // Escrita por el admin no pasa por la FK compuesta del autor, asi que la
    // que la frena es la simple.
    const admin = await crearAdmin(db);
    await esperarRechazo(db, 'condicion_sello_negocio_id_fkey', CONDICION, [
      '00000000-0000-4000-8000-000000000000',
      null,
      admin,
    ]);
  });

  test('Seccion 9 · el mismo reintento no se guarda dos veces', async ({ db }) => {
    const admin = await crearAdmin(db);
    const clave = unico('clave-larga');
    await esperarAceptacion(db, PETICION, [admin, clave]);
    await esperarRechazo(db, 'peticion_idempotente_admin_pkey', PETICION, [admin, clave]);
  });

  test('Seccion 9 · una clave de idempotencia corta se rechaza', async ({ db }) => {
    const admin = await crearAdmin(db);
    await esperarRechazo(db, 'peticion_idempotente_admin_clave_razonable_chk', PETICION, [
      admin,
      'corta',
    ]);
  });

  test('Seccion 9 · el reintento de un admin que no existe se rechaza', async ({
    db,
  }) => {
    await esperarRechazo(db, 'peticion_idempotente_admin_admin_id_fkey', PETICION, [
      '00000000-0000-4000-8000-000000000000',
      unico('clave-larga'),
    ]);
  });
});
