import { describe, expect } from 'vitest';

import { ICONOS_DE_SELLO, PLANTILLAS_DE_TARJETA } from '@repunto/contratos';

import { type Db, esperarRechazo, test } from '../base';

/**
 * Los valores de diseño viven dos veces: en el CHECK de la base, que es quien
 * los impone, y en `packages/contratos`, que es de donde los leen el panel y
 * la PWA para saber como dibujarlos.
 *
 * Las dos copias hacen falta —la base no puede dibujar un icono y el frontend
 * no puede impedir que se escriba uno que no existe— asi que lo que se cuida
 * es que no diverjan. Agregar un icono es una linea de migracion, una en
 * docs/garantias-de-la-base.md y una en contratos; si falta alguna, falla
 * esto. Es la misma guardia que tienen los codigos de error.
 */

/** Los literales del CHECK, en el orden en que Postgres los devuelve. */
async function valoresDelCheck(db: Db, restriccion: string): Promise<string[]> {
  const { rows } = await db.query<{ definicion: string }>(
    'SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE conname = $1',
    [restriccion],
  );
  const definicion = rows[0]?.definicion;
  if (definicion === undefined) {
    throw new Error(`No existe la restriccion ${restriccion} en la base.`);
  }
  return [...definicion.matchAll(/'([^']*)'/g)].map((encontrado) => encontrado[1] ?? '');
}

describe('los valores de diseño de contratos y los de la base', () => {
  test('`icono_sello`: la lista es la misma que el CHECK', async ({ db }) => {
    const enLaBase = await valoresDelCheck(db, 'negocio_icono_sello_chk');

    expect([...enLaBase].sort()).toEqual([...ICONOS_DE_SELLO].sort());
  });

  test('`plantilla_tarjeta`: la lista es la misma que el CHECK', async ({ db }) => {
    const enLaBase = await valoresDelCheck(db, 'negocio_plantilla_tarjeta_chk');

    expect([...enLaBase].sort()).toEqual([...PLANTILLAS_DE_TARJETA].sort());
  });

  test('un icono que no esta en la lista lo rechaza la base', async ({ db }) => {
    // Lo que hace que la lista de contratos pueda confiar en el dato: un valor
    // de diseño que no existe no llega a guardarse.
    await esperarRechazo(
      db,
      'negocio_icono_sello_chk',
      `INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
       VALUES ('Prueba', 'cafe', '#1A2B3C', 'clasica', 'cupcake')`,
    );
  });
});
