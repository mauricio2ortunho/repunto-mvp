import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearAdmin, crearEntradaDeDueno, crearNegocio, unico } from '../escenario';

/**
 * La entrada al panel del dueño: un código de un solo uso que abre una sola
 * sesión, siempre del mismo usuario que lo recibió, y ese usuario es el dueño.
 */

const ENTRADA = `
  INSERT INTO entrada_dueno (usuario_id, codigo, expira_el, creado_por_admin_id)
  VALUES ($1, $2, now() + interval '1 day', $3)`;

const ABRIR = `
  INSERT INTO sesion_dueno (usuario_id, token_hash, entrada_id, ultimo_acceso)
  VALUES ($1, $2, $3, now())`;

const PETICION = `
  INSERT INTO peticion_idempotente_dueno (usuario_id, endpoint, clave, huella_peticion)
  VALUES ($1, 'POST /dueno/promo/programa', $2, 'huella')`;

describe('Panel del dueno', () => {
  test('Seccion 5 · el codigo del dueno lo puede recibir el dueno', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarAceptacion(db, ENTRADA, [negocio.dueno, unico('cod'), admin]);
  });

  test('Seccion 14 · un cajero o un supervisor no reciben codigo de entrada', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    for (const persona of [negocio.cajero, negocio.supervisor]) {
      await esperarRechazo(db, 'entrada_dueno_usuario_es_dueno_fkey', ENTRADA, [
        persona,
        unico('cod'),
        admin,
      ]);
    }
  });

  test('Seccion 14 · el rol del codigo es siempre dueno', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    // Con el rol del cajero la FK compuesta pasaría: la frena el CHECK.
    await esperarRechazo(
      db,
      'entrada_dueno_solo_dueno_chk',
      `INSERT INTO entrada_dueno (usuario_id, rol, codigo, expira_el, creado_por_admin_id)
       VALUES ($1, 'cajero', $2, now() + interval '1 day', $3)`,
      [negocio.cajero, unico('cod'), admin],
    );
  });

  test('Seccion 14 · el dueno con codigo no deja de ser dueno', async ({ db }) => {
    const negocio = await crearNegocio(db);
    await crearEntradaDeDueno(db, negocio.dueno);
    await esperarRechazo(
      db,
      'entrada_dueno_usuario_es_dueno_fkey',
      `UPDATE usuario_negocio SET rol = 'supervisor', telefono = NULL WHERE id = $1`,
      [negocio.dueno],
    );
  });

  test('Seccion 5 · un codigo de un admin que no existe se rechaza', async ({ db }) => {
    const negocio = await crearNegocio(db);
    await esperarRechazo(db, 'entrada_dueno_creado_por_admin_id_fkey', ENTRADA, [
      negocio.dueno,
      unico('cod'),
      '00000000-0000-4000-8000-000000000000',
    ]);
  });

  test('Seccion 5 · un codigo que nace vencido se rechaza', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    await esperarRechazo(
      db,
      'entrada_dueno_expira_posterior_chk',
      `INSERT INTO entrada_dueno (usuario_id, codigo, expira_el, creado_por_admin_id)
       VALUES ($1, $2, now() - interval '1 minute', $3)`,
      [negocio.dueno, unico('cod'), admin],
    );
  });

  test('Seccion 5 · no se marca como usado un codigo ya vencido', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearEntradaDeDueno(db, negocio.dueno, { horas: -1 });
    await esperarRechazo(
      db,
      'entrada_dueno_uso_antes_de_expirar_chk',
      'UPDATE entrada_dueno SET usado_el = now() WHERE id = $1',
      [id],
    );
  });

  test('Seccion 5 · dos codigos iguales se rechazan', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const admin = await crearAdmin(db);
    const { codigo } = await crearEntradaDeDueno(db, negocio.dueno);
    await esperarRechazo(db, 'entrada_dueno_codigo_key', ENTRADA, [
      negocio.dueno,
      codigo,
      admin,
    ]);
  });

  test('Seccion 5 · un codigo abre una sola sesion', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearEntradaDeDueno(db, negocio.dueno);
    await esperarAceptacion(db, ABRIR, [negocio.dueno, unico('hash'), id]);
    await esperarRechazo(db, 'sesion_dueno_entrada_id_key', ABRIR, [
      negocio.dueno,
      unico('hash'),
      id,
    ]);
  });

  test('Seccion 14 · la sesion no puede ser de otro que el del codigo', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    const { id } = await crearEntradaDeDueno(db, negocio.dueno);
    await esperarRechazo(db, 'sesion_dueno_entrada_mismo_usuario_fkey', ABRIR, [
      otro.dueno,
      unico('hash'),
      id,
    ]);
  });

  test('Seccion 5 · dos sesiones con el mismo token se rechazan', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const a = await crearEntradaDeDueno(db, negocio.dueno);
    const b = await crearEntradaDeDueno(db, negocio.dueno);
    const hash = unico('hash');
    await db.query(ABRIR, [negocio.dueno, hash, a.id]);
    await esperarRechazo(db, 'sesion_dueno_token_hash_key', ABRIR, [
      negocio.dueno,
      hash,
      b.id,
    ]);
  });

  test('Seccion 5 · una sesion de un usuario que no existe se rechaza', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearEntradaDeDueno(db, negocio.dueno);
    // La compuesta tambien falla, pero Postgres revisa las FK en el orden en
    // que se crearon, y la simple va primero en la migracion.
    await esperarRechazo(db, 'sesion_dueno_usuario_id_fkey', ABRIR, [
      '00000000-0000-4000-8000-000000000000',
      unico('hash'),
      id,
    ]);
  });

  test('Cordura · no se revoca una sesion antes de que exista', async ({ db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearEntradaDeDueno(db, negocio.dueno);
    await db.query(ABRIR, [negocio.dueno, unico('hash'), id]);
    await esperarRechazo(
      db,
      'sesion_dueno_revocada_posterior_chk',
      `UPDATE sesion_dueno SET revocada_el = creado_el - interval '1 second'`,
    );
  });

  test('Seccion 9 · dos reintentos guardados con la misma clave se rechazan', async ({
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const clave = unico('clave-larga');
    await esperarAceptacion(db, PETICION, [negocio.dueno, clave]);
    await esperarRechazo(db, 'peticion_idempotente_dueno_pkey', PETICION, [
      negocio.dueno,
      clave,
    ]);
  });

  test('Seccion 9 · una clave de idempotencia corta se rechaza', async ({ db }) => {
    const negocio = await crearNegocio(db);
    await esperarRechazo(db, 'peticion_idempotente_dueno_clave_razonable_chk', PETICION, [
      negocio.dueno,
      'corta',
    ]);
  });

  test('Seccion 9 · el reintento de un dueno que no existe se rechaza', async ({
    db,
  }) => {
    await esperarRechazo(db, 'peticion_idempotente_dueno_usuario_id_fkey', PETICION, [
      '00000000-0000-4000-8000-000000000000',
      unico('clave-larga'),
    ]);
  });
});
