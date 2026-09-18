import { describe, expect } from 'vitest';

import { type Db, esperarAceptacion, esperarRechazo, test, una } from '../base';
import { crearLocal, crearSello, escenario } from '../escenario';

const NUEVA_CONDICION = `
  INSERT INTO condicion_sello (negocio_id, texto, vigente_desde, usuario_id)
  VALUES ($1, 'Cualquier torta', now() + interval '1 hour', $2)`;

describe('INV-7 · una condicion nueva aplica hacia adelante y no invalida sellos dados', () => {
  test('INV-7 · insertar una condicion nueva no toca los sellos ya otorgados', async ({
    db,
  }) => {
    const { a, tarjeta, sello } = await escenario(db);
    await crearSello(db, tarjeta, a);

    const antes = await progreso(db, tarjeta);
    await esperarAceptacion(db, NUEVA_CONDICION, [a.id, a.dueno]);
    const despues = await progreso(db, tarjeta);

    expect(despues).toEqual(antes);
    const primero = await una<{ condicion_id: string; anulado: boolean }>(
      db,
      'SELECT condicion_id, anulado FROM sello WHERE id = $1',
      [sello],
    );
    expect(primero).toEqual({ condicion_id: a.condicion, anulado: false });
  });

  test('INV-7 · rechaza editar el texto de una condicion', async ({ db }) => {
    const { a } = await escenario(db);
    await esperarRechazo(
      db,
      'condicion_sello_solo_insercion',
      `UPDATE condicion_sello SET texto = 'Cualquier cafe' WHERE id = $1`,
      [a.condicion],
    );
  });

  test('INV-7 · rechaza mover hacia atras la fecha de una condicion', async ({ db }) => {
    const { a } = await escenario(db);
    await esperarRechazo(
      db,
      'condicion_sello_solo_insercion',
      `UPDATE condicion_sello SET vigente_desde = now() - interval '1 year' WHERE id = $1`,
      [a.condicion],
    );
  });

  test('INV-7 · rechaza borrar una condicion con sellos', async ({ db }) => {
    const { a } = await escenario(db);
    await esperarRechazo(
      db,
      'condicion_sello_solo_insercion',
      'DELETE FROM condicion_sello WHERE id = $1',
      [a.condicion],
    );
  });

  test('INV-7 · rechaza borrar una condicion aunque nadie haya sellado con ella', async ({
    db,
  }) => {
    const { a } = await escenario(db);
    const { id } = await una<{ id: string }>(db, `${NUEVA_CONDICION} RETURNING id`, [
      a.id,
      a.dueno,
    ]);
    await esperarRechazo(
      db,
      'condicion_sello_solo_insercion',
      'DELETE FROM condicion_sello WHERE id = $1',
      [id],
    );
  });
});

describe('INV-17 · anular marca, nunca borra', () => {
  const MARCAR = `UPDATE sello SET anulado = $2, anulado_el = $3, anulado_turno_id = $4 WHERE id = $1`;

  test('INV-17 · rechaza un sello anulado sin fecha ni turno', async ({ db }) => {
    const { sello } = await escenario(db);
    await esperarRechazo(db, 'sello_anulacion_completa_chk', MARCAR, [
      sello,
      true,
      null,
      null,
    ]);
  });

  test('INV-17 · rechaza un sello anulado con fecha pero sin turno', async ({ db }) => {
    const { sello } = await escenario(db);
    await esperarRechazo(db, 'sello_anulacion_completa_chk', MARCAR, [
      sello,
      true,
      new Date(),
      null,
    ]);
  });

  test('INV-17 · rechaza un sello anulado con turno pero sin fecha', async ({ db }) => {
    const { a, sello } = await escenario(db);
    await esperarRechazo(db, 'sello_anulacion_completa_chk', MARCAR, [
      sello,
      true,
      null,
      a.turno,
    ]);
  });

  test('INV-17 · rechaza rastros de anulacion en un sello que no esta anulado', async ({
    db,
  }) => {
    const { a, sello } = await escenario(db);
    await esperarRechazo(db, 'sello_anulacion_completa_chk', MARCAR, [
      sello,
      false,
      new Date(),
      a.turno,
    ]);
  });

  test('INV-17 · acepta una anulacion completa: bandera, fecha y turno', async ({
    db,
  }) => {
    const { a, sello } = await escenario(db);
    await esperarAceptacion(db, MARCAR, [sello, true, new Date(), a.turno]);
  });

  test('INV-17 · rechaza borrar una tarjeta que tiene sellos', async ({ db }) => {
    const { tarjeta } = await escenario(db);
    await esperarRechazo(
      db,
      'sello_tarjeta_mismo_negocio_fkey',
      'DELETE FROM tarjeta WHERE id = $1',
      [tarjeta],
    );
  });

  test('INV-17 · rechaza borrar un negocio que tiene locales', async ({ db }) => {
    // Negocio con un unico hijo, para que la FK que salte sea una sola.
    const { id } = await una<{ id: string }>(
      db,
      `INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
       VALUES ('Solo un local', 'cafe', '#000000', 'minima', 'huella') RETURNING id`,
    );
    await crearLocal(db, id, 'Unico');
    await esperarRechazo(
      db,
      'local_negocio_id_fkey',
      'DELETE FROM negocio WHERE id = $1',
      [id],
    );
  });

  // PENDIENTE, a proposito. Un sello no tiene hijos, asi que ninguna FK frena
  // su DELETE: la base hoy lo acepta. Cerrarlo requiere revocar DELETE al rol
  // de aplicacion (docs/garantias-de-la-base.md, "Lo que la base todavia no
  // impide"). `test.fails` pasa mientras el agujero exista; el dia que se
  // cierre, este test empieza a fallar para que alguien le saque el `.fails`.
  test.fails(
    'INV-17 · PENDIENTE: la base deberia rechazar el DELETE de un sello (hoy lo acepta)',
    async ({ db }) => {
      const { sello } = await escenario(db);
      await expect(
        db.query('DELETE FROM sello WHERE id = $1', [sello]),
      ).rejects.toThrow();
    },
  );
});

describe('Cordura del sello', () => {
  test('Cordura · rechaza un monto de compra negativo', async ({ db }) => {
    const { sello } = await escenario(db);
    await esperarRechazo(
      db,
      'sello_monto_no_negativo_chk',
      'UPDATE sello SET monto = -1 WHERE id = $1',
      [sello],
    );
  });

  test('Cordura · acepta un monto con centavos', async ({ db }) => {
    const { sello } = await escenario(db);
    const [fila] = await esperarAceptacion<{ monto: string }>(
      db,
      'UPDATE sello SET monto = 57.50 WHERE id = $1 RETURNING monto',
      [sello],
    );
    // numeric vuelve como texto exacto: sin redondeo binario.
    expect(fila?.monto).toBe('57.50');
  });
});

/** Progreso de la tarjeta segun INV-10: sellos no anulados, contados. */
async function progreso(db: Db, tarjeta: string): Promise<{ sellos: string }> {
  return una<{ sellos: string }>(
    db,
    'SELECT count(*) AS sellos FROM sello WHERE tarjeta_id = $1 AND NOT anulado',
    [tarjeta],
  );
}
