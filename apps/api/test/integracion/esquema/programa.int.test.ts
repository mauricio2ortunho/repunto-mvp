import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import { crearNegocio } from '../escenario';

const NUEVA_VERSION = `
  INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente, vigencia_meses)
  VALUES ($1, $2, $3, 'Un cafe', $4, $5, $6)`;

describe('INV-5 · un programa nunca se edita: cada cambio es una version nueva', () => {
  test('INV-5 · rechaza una segunda version vigente del mismo negocio', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_una_vigente_por_negocio', NUEVA_VERSION, [
      a.id,
      2,
      12,
      4,
      true,
      1,
    ]);
  });

  test('INV-5 · acepta el recambio: la vieja deja de ser vigente y entra la nueva', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarAceptacion(db, 'UPDATE programa SET vigente = false WHERE id = $1', [
      a.programa,
    ]);
    await esperarAceptacion(db, NUEVA_VERSION, [a.id, 2, 12, 4, true, 1]);
  });

  test('INV-5 · rechaza repetir un numero de version', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_negocio_id_version_key', NUEVA_VERSION, [
      a.id,
      1,
      12,
      4,
      false,
      1,
    ]);
  });

  test('INV-5 · rechaza la version cero', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_version_positiva_chk', NUEVA_VERSION, [
      a.id,
      0,
      12,
      4,
      false,
      1,
    ]);
  });

  test('INV-5 · rechaza editar el premio de un programa', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'programa_inmutable',
      `UPDATE programa SET premio = 'Dos cafes' WHERE id = $1`,
      [a.programa],
    );
  });

  test('INV-5 · rechaza editar la cantidad de sellos, aunque tambien cambie vigente', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'programa_inmutable',
      'UPDATE programa SET sellos_requeridos = 5, vigente = false WHERE id = $1',
      [a.programa],
    );
  });

  test('INV-5 · rechaza volver a hacer vigente una version vieja', async ({ db }) => {
    const a = await crearNegocio(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [a.programa]);
    await esperarRechazo(
      db,
      'programa_inmutable',
      'UPDATE programa SET vigente = true WHERE id = $1',
      [a.programa],
    );
  });

  test('INV-5 · rechaza borrar un programa, aunque no tenga tarjetas', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_inmutable', 'DELETE FROM programa WHERE id = $1', [
      a.programa,
    ]);
  });
});

describe('Cordura del programa', () => {
  test('Cordura · rechaza un programa de cero sellos', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_sellos_requeridos_positivo_chk', NUEVA_VERSION, [
      a.id,
      2,
      0,
      4,
      false,
      1,
    ]);
  });

  test('Cordura · rechaza un intervalo negativo entre sellos', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'programa_horas_entre_sellos_no_negativo_chk',
      NUEVA_VERSION,
      [a.id, 2, 10, -1, false, 1],
    );
  });

  test('Cordura · rechaza una vigencia de cero meses', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'programa_vigencia_meses_positiva_chk', NUEVA_VERSION, [
      a.id,
      2,
      10,
      4,
      false,
      0,
    ]);
  });

  test('Cordura · acepta vigencia nula: la tarjeta no vence', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarAceptacion(db, NUEVA_VERSION, [a.id, 2, 10, 4, false, null]);
  });
});
