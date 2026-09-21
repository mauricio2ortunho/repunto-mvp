import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearCliente, crearNegocio, crearRegistro, telefono, unico } from '../escenario';

/**
 * Lo que la base impide alrededor del alta del cliente en el mostrador
 * (especificacion funcional, seccion 3).
 */

const REGISTRO = `
  INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
  VALUES ($1, $2, 'Juan', $3, now() + interval '30 minutes')`;

describe('Seccion 3 · registro pendiente', () => {
  test('rechaza dos pendientes del mismo telefono en el mismo local', async ({ db }) => {
    const a = await crearNegocio(db);
    const tel = telefono();
    await db.query(REGISTRO, [a.local, tel, unico('ticket')]);

    await esperarRechazo(db, 'registro_pendiente_uno_por_telefono_y_local', REGISTRO, [
      a.local,
      tel,
      unico('ticket'),
    ]);
  });

  test('acepta el mismo telefono pendiente en otro local: son dos negocios distintos', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    const tel = telefono();
    await db.query(REGISTRO, [a.local, tel, unico('ticket')]);

    await esperarAceptacion(db, REGISTRO, [a.otroLocal, tel, unico('ticket')]);
  });

  test('acepta registrarse de nuevo cuando el anterior ya se resolvio', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    const tel = telefono();
    const { id } = await crearRegistro(db, a.local, { telefono: tel });
    await db.query(
      `UPDATE registro_pendiente SET estado = 'descartado', resuelto_el = now(),
       resuelto_turno_id = $2 WHERE id = $1`,
      [id, a.turno],
    );

    await esperarAceptacion(db, REGISTRO, [a.local, tel, unico('ticket')]);
  });

  test('rechaza dos registros con el mismo ticket', async ({ db }) => {
    const a = await crearNegocio(db);
    const ticket = unico('ticket');
    await db.query(REGISTRO, [a.local, telefono(), ticket]);

    await esperarRechazo(db, 'registro_pendiente_ticket_hash_key', REGISTRO, [
      a.otroLocal,
      telefono(),
      ticket,
    ]);
  });

  test('INV-20 · rechaza un telefono sin normalizar', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'registro_pendiente_telefono_e164_chk', REGISTRO, [
      a.local,
      '70123456',
      unico('ticket'),
    ]);
  });

  test('rechaza un registro que nace vencido', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'registro_pendiente_expira_posterior_chk',
      `INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
       VALUES ($1, $2, 'Juan', $3, now() - interval '1 minute')`,
      [a.local, telefono(), unico('ticket')],
    );
  });

  test('INV-2 · rechaza confirmar con el turno de otra sucursal', async ({ db }) => {
    const a = await crearNegocio(db);
    const cliente = await crearCliente(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarRechazo(
      db,
      'registro_pendiente_turno_mismo_local_fkey',
      `UPDATE registro_pendiente
       SET estado = 'confirmado', cliente_id = $2, cliente_creado = true,
           resuelto_el = now(), resuelto_turno_id = $3
       WHERE id = $1`,
      [id, cliente, a.turnoOtroLocal],
    );
  });
});

describe('Seccion 3 · un registro resuelto sabe quien, cuando y sobre que cuenta', () => {
  test('rechaza confirmar sin decir a que cliente', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarRechazo(
      db,
      'registro_pendiente_resolucion_coherente_chk',
      `UPDATE registro_pendiente SET estado = 'confirmado', resuelto_el = now(),
       resuelto_turno_id = $2 WHERE id = $1`,
      [id, a.turno],
    );
  });

  test('rechaza descartar sin decir quien lo descarto', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarRechazo(
      db,
      'registro_pendiente_resolucion_coherente_chk',
      `UPDATE registro_pendiente SET estado = 'descartado' WHERE id = $1`,
      [id],
    );
  });

  test('rechaza un pendiente con rastros de resolucion', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarRechazo(
      db,
      'registro_pendiente_resolucion_coherente_chk',
      `UPDATE registro_pendiente SET resuelto_el = now() WHERE id = $1`,
      [id],
    );
  });

  test('acepta la confirmacion completa', async ({ db }) => {
    const a = await crearNegocio(db);
    const cliente = await crearCliente(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarAceptacion(
      db,
      `UPDATE registro_pendiente
       SET estado = 'confirmado', cliente_id = $2, cliente_creado = true,
           resuelto_el = now(), resuelto_turno_id = $3
       WHERE id = $1`,
      [id, cliente, a.turno],
    );
  });
});

describe('Seccion 3 · la sesion solo se entrega sobre una cuenta nueva', () => {
  test('rechaza entregar sesion sobre un registro todavia pendiente', async ({ db }) => {
    const a = await crearNegocio(db);
    const { id } = await crearRegistro(db, a.local);

    await esperarRechazo(
      db,
      'registro_pendiente_sesion_solo_si_cuenta_nueva_chk',
      `UPDATE registro_pendiente SET sesion_entregada_el = now() WHERE id = $1`,
      [id],
    );
  });

  test('rechaza entregar sesion cuando la cuenta ya existia', async ({ db }) => {
    const a = await crearNegocio(db);
    const cliente = await crearCliente(db);
    const { id } = await crearRegistro(db, a.local);
    await db.query(
      `UPDATE registro_pendiente
       SET estado = 'confirmado', cliente_id = $2, cliente_creado = false,
           resuelto_el = now(), resuelto_turno_id = $3
       WHERE id = $1`,
      [id, cliente, a.turno],
    );

    // Esta es la regla de seguridad del alta, en la base: el que se registro
    // con el telefono de otro no se lleva la cuenta ajena.
    await esperarRechazo(
      db,
      'registro_pendiente_sesion_solo_si_cuenta_nueva_chk',
      `UPDATE registro_pendiente SET sesion_entregada_el = now() WHERE id = $1`,
      [id],
    );
  });

  test('acepta entregarla cuando esa confirmacion creo la cuenta', async ({ db }) => {
    const a = await crearNegocio(db);
    const cliente = await crearCliente(db);
    const { id } = await crearRegistro(db, a.local);
    await db.query(
      `UPDATE registro_pendiente
       SET estado = 'confirmado', cliente_id = $2, cliente_creado = true,
           resuelto_el = now(), resuelto_turno_id = $3
       WHERE id = $1`,
      [id, cliente, a.turno],
    );

    await esperarAceptacion(
      db,
      `UPDATE registro_pendiente SET sesion_entregada_el = now() WHERE id = $1`,
      [id],
    );
  });
});
