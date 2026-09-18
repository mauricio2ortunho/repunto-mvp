import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Db } from './base';

/**
 * Compara docs/garantias-de-la-base.md con el catalogo de Postgres. El formato
 * del documento esta explicado en el propio documento, seccion "Formato que
 * lee el test".
 */

export const DOCUMENTO = 'docs/garantias-de-la-base.md';

const TIPOS = ['PK', 'UNIQUE', 'UNIQUE parcial', 'FK', 'CHECK', 'TRIGGER'] as const;
type Tipo = (typeof TIPOS)[number];

/** Tipos cuya definicion se compara con el catalogo. */
const CON_DEFINICION: ReadonlySet<Tipo> = new Set([
  'PK',
  'UNIQUE',
  'UNIQUE parcial',
  'FK',
]);

export interface Garantia {
  nombre: string;
  tabla: string;
  tipo: Tipo | 'TRIGGER deshabilitado';
  /** Columnas, o `(columnas) → tabla(columnas)`. Nulo para CHECK y TRIGGER. */
  definicion: string | null;
}

export function leerDocumento(): Garantia[] {
  const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
  const texto = readFileSync(resolve(raiz, DOCUMENTO), 'utf8');

  const garantias: Garantia[] = [];
  for (const [indice, linea] of texto.split(/\r?\n/).entries()) {
    if (!linea.startsWith('| `')) continue;
    const celdas = linea
      .split('|')
      .slice(1, -1)
      .map((celda) => celda.trim());
    const nombre = primerCodigo(celdas[0]);
    const tabla = primerCodigo(celdas[1]);
    const tipo = celdas[2];
    if (nombre === null || tabla === null || tipo === undefined || !esTipo(tipo)) {
      throw new Error(
        `${DOCUMENTO}:${indice + 1}: fila con formato invalido.\n  ${linea}`,
      );
    }
    garantias.push({
      nombre,
      tabla,
      tipo,
      definicion: CON_DEFINICION.has(tipo) ? primerCodigo(celdas[3]) : null,
    });
  }
  return garantias;
}

function esTipo(valor: string): valor is Tipo {
  return (TIPOS as readonly string[]).includes(valor);
}

/** El primer bloque entre backticks de una celda, o nulo si no hay. */
function primerCodigo(celda: string | undefined): string | null {
  const encontrado = celda?.match(/`([^`]+)`/);
  return encontrado?.[1] ?? null;
}

export async function leerCatalogo(db: Db): Promise<Garantia[]> {
  const { rows } = await db.query<Garantia>(`
    -- PK, UNIQUE y UNIQUE parcial: los indices unicos, con sus columnas en orden.
    SELECT i.relname AS nombre,
           t.relname AS tabla,
           CASE WHEN x.indisprimary THEN 'PK'
                WHEN x.indpred IS NOT NULL THEN 'UNIQUE parcial'
                ELSE 'UNIQUE' END AS tipo,
           '(' || string_agg(a.attname, ', ' ORDER BY k.orden) || ')' AS definicion
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    CROSS JOIN LATERAL unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, orden)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE t.relnamespace = 'public'::regnamespace
      AND x.indisunique
      AND t.relname <> '_prisma_migrations'
    GROUP BY 1, 2, 3

    UNION ALL

    -- FK: (columnas) → tabla(columnas).
    SELECT c.conname, t.relname, 'FK',
           '(' || (SELECT string_agg(a.attname, ', ' ORDER BY k.orden)
                   FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, orden)
                   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
           || ') → ' || r.relname || '('
           || (SELECT string_agg(a.attname, ', ' ORDER BY k.orden)
               FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, orden)
               JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum)
           || ')'
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class r ON r.oid = c.confrelid
    WHERE c.connamespace = 'public'::regnamespace AND c.contype = 'f'

    UNION ALL

    SELECT c.conname, t.relname, 'CHECK', NULL
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.connamespace = 'public'::regnamespace AND c.contype = 'c'

    UNION ALL

    -- Triggers escritos a mano. Los internos son los que Postgres crea para las FK.
    SELECT g.tgname, t.relname,
           CASE WHEN g.tgenabled = 'D' THEN 'TRIGGER deshabilitado' ELSE 'TRIGGER' END,
           NULL
    FROM pg_trigger g
    JOIN pg_class t ON t.oid = g.tgrelid
    WHERE t.relnamespace = 'public'::regnamespace AND NOT g.tgisinternal`);
  return rows;
}

/**
 * Diferencias entre lo documentado y lo que hay en la base, una por linea,
 * escritas para que quien las lea sepa que hacer. Vacio si coinciden.
 */
export function diferencias(documento: Garantia[], catalogo: Garantia[]): string[] {
  const enBase = new Map(catalogo.map((g) => [g.nombre, g]));
  const enDocumento = new Map(documento.map((g) => [g.nombre, g]));
  const salida: string[] = [];

  for (const esperada of documento) {
    const real = enBase.get(esperada.nombre);
    const quien = `${esperada.nombre} (${esperada.tipo} en ${esperada.tabla})`;
    if (real === undefined) {
      salida.push(`FALTA EN LA BASE: ${quien}. Esta documentada pero no existe.`);
      continue;
    }
    if (real.tipo === 'TRIGGER deshabilitado' && esperada.tipo === 'TRIGGER') {
      salida.push(`DESHABILITADO: ${quien}. Existe pero no se ejecuta.`);
      continue;
    }
    if (real.tabla !== esperada.tabla || real.tipo !== esperada.tipo) {
      salida.push(
        `DISTINTA: ${esperada.nombre}. El documento dice ${esperada.tipo} en ${esperada.tabla}; ` +
          `la base tiene ${real.tipo} en ${real.tabla}.`,
      );
      continue;
    }
    if (esperada.definicion !== null && real.definicion !== esperada.definicion) {
      salida.push(
        `DISTINTA: ${esperada.nombre}. El documento dice ${esperada.definicion}; ` +
          `la base tiene ${real.definicion ?? '(nada)'}.`,
      );
    }
  }

  for (const real of catalogo) {
    if (!enDocumento.has(real.nombre)) {
      salida.push(
        `NO DOCUMENTADA: ${real.nombre} (${real.tipo} en ${real.tabla}). ` +
          `Existe en la base: agregala a ${DOCUMENTO} con su invariante.`,
      );
    }
  }

  return salida;
}

/** Nombres que aparecen mas de una vez en el documento. */
export function duplicadas(documento: Garantia[]): string[] {
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const { nombre } of documento) {
    if (vistas.has(nombre)) repetidas.add(nombre);
    vistas.add(nombre);
  }
  return [...repetidas];
}
