import { describe, expect } from 'vitest';

import { test } from '../base';
import {
  DOCUMENTO,
  diferencias,
  duplicadas,
  leerCatalogo,
  leerDocumento,
} from '../inventario';

/**
 * El catalogo de una base recien migrada contra docs/garantias-de-la-base.md.
 * Si alguien borra una restriccion, un indice parcial, un CHECK o un trigger
 * (o deshabilita un trigger), este test lo nombra. Si alguien agrega una sin
 * documentarla, tambien.
 */
describe('Inventario de garantias', () => {
  test(`Inventario · la base tiene exactamente lo que dice ${DOCUMENTO}`, async ({
    db,
  }) => {
    const documento = leerDocumento();

    // Si el parser dejara de leer filas, "coincide" seria trivialmente cierto.
    expect(documento.length, `${DOCUMENTO} parece vacio o mal formado`).toBeGreaterThan(
      50,
    );
    expect(duplicadas(documento), `nombres repetidos en ${DOCUMENTO}`).toEqual([]);

    const catalogo = await leerCatalogo(db);
    expect(diferencias(documento, catalogo)).toEqual([]);
  });
});

describe('Reglas generales del esquema', () => {
  test('INV-17 · toda FK es RESTRICT al borrar y al actualizar, ninguna en cascada', async ({
    db,
  }) => {
    const { rows } = await db.query<{ fk: string }>(`
      SELECT conname AS fk FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND contype = 'f'
        AND (confdeltype <> 'r' OR confupdtype <> 'r')`);
    expect(rows.map((r) => r.fk)).toEqual([]);
  });

  test('INV-21 · ninguna columna es timestamp sin zona horaria', async ({ db }) => {
    const { rows } = await db.query<{ columna: string }>(`
      SELECT table_name || '.' || column_name AS columna FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        AND data_type = 'timestamp without time zone'`);
    expect(rows.map((r) => r.columna)).toEqual([]);
  });

  test('Montos · ninguna columna de punto flotante, y todo monto es numeric', async ({
    db,
  }) => {
    const { rows } = await db.query<{ columna: string }>(`
      SELECT table_name || '.' || column_name || ' (' || data_type || ')' AS columna
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (data_type IN ('real', 'double precision')
             OR (column_name LIKE 'monto%' AND data_type <> 'numeric'))`);
    expect(rows.map((r) => r.columna)).toEqual([]);
  });

  test('INV-22 · ninguna columna guarda binarios', async ({ db }) => {
    const { rows } = await db.query<{ columna: string }>(`
      SELECT table_name || '.' || column_name AS columna FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'bytea'`);
    expect(rows.map((r) => r.columna)).toEqual([]);
  });

  test('Convencion · toda tabla tiene creado_el timestamptz NOT NULL con valor por defecto', async ({
    db,
  }) => {
    const { rows } = await db.query<{ tabla: string }>(`
      SELECT t.table_name AS tabla FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND t.table_name <> '_prisma_migrations'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name
            AND c.column_name = 'creado_el'
            AND c.data_type = 'timestamp with time zone'
            AND c.is_nullable = 'NO'
            AND c.column_default IS NOT NULL)`);
    expect(rows.map((r) => r.tabla)).toEqual([]);
  });
});
