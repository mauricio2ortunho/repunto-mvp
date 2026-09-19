import { DatabaseError, Pool, type PoolClient, type QueryResultRow } from 'pg';
import { expect, inject, test as testDeVitest } from 'vitest';

/**
 * Infraestructura de los tests de integracion contra Postgres real.
 *
 * Aislamiento:
 *  - La base la recrea preparar-base.ts una vez por corrida: esquema, sin filas.
 *  - Cada test recibe `db`, una conexion dentro de una transaccion que se
 *    deshace SIEMPRE al terminar, pase lo que pase en el test.
 *  - Antes de abrir esa transaccion se exige que todas las tablas esten
 *    vacias. Si un test llegara a commitear algo, falla el siguiente y lo dice.
 *  - Ningun dato se comparte entre tests: cada uno arma su escenario adentro
 *    de su propia transaccion (ver escenario.ts).
 */

export type Db = PoolClient;

export const test = testDeVitest.extend<{ pool: Pool; db: Db }>({
  pool: [
    // eslint-disable-next-line no-empty-pattern -- Vitest exige desestructurar el contexto del fixture aunque no use nada de el.
    async ({}, use) => {
      configurarEntorno();
      const pool = new Pool({ connectionString: inject('urlBaseTest'), max: 2 });
      await use(pool);
      await pool.end();
    },
    { scope: 'file' },
  ],

  db: async ({ pool }, use) => {
    const conexion = await pool.connect();
    try {
      await exigirBaseVacia(conexion);
      await conexion.query('BEGIN');
      await use(conexion);
    } finally {
      await conexion.query('ROLLBACK');
      conexion.release();
    }
  },
});

/**
 * Lo que el proceso de la api leeria del entorno. Lo pasa el globalSetup, que
 * es quien leyo .env: las variables que se cambian alla no llegan solas hasta
 * aca, porque los tests corren en otro proceso.
 */
export function configurarEntorno(): void {
  process.env['DATABASE_URL'] = inject('urlBaseTest');
  process.env['CLAVE_CIFRADO_SEMILLAS'] = inject('claveCifrado');
}

export async function exigirBaseVacia(db: Db): Promise<void> {
  // Un solo viaje: cuenta las filas de todas las tablas del esquema.
  const { rows } = await db.query<{ tabla: string; filas: string }>(`
    SELECT t.tablename AS tabla,
           (xpath('/row/n/text()',
                  query_to_xml(format('SELECT count(*) AS n FROM %I.%I', t.schemaname, t.tablename),
                               false, true, '')))[1]::text AS filas
    FROM pg_tables t
    WHERE t.schemaname = 'public' AND t.tablename <> '_prisma_migrations'`);

  const conDatos = rows.filter((fila) => fila.filas !== '0');
  if (conDatos.length > 0) {
    const detalle = conDatos.map((fila) => `${fila.tabla} (${fila.filas})`).join(', ');
    throw new Error(
      `La base de tests no esta vacia antes de este test: ${detalle}. ` +
        'Algun test anterior commiteo datos en lugar de dejarlos en su transaccion.',
    );
  }
}

/**
 * Ejecuta `sql` y exige que Postgres lo rechace por la restriccion
 * `restriccion`, exactamente. Si lo acepta, o lo rechaza otra restriccion,
 * falla diciendo cual.
 *
 * Corre dentro de un SAVEPOINT: pase lo que pase, la transaccion del test
 * queda usable y sin el efecto del intento.
 */
export async function esperarRechazo(
  db: Db,
  restriccion: string,
  sql: string,
  parametros: readonly unknown[] = [],
): Promise<void> {
  await db.query('SAVEPOINT intento');
  let rechazo: DatabaseError | undefined;
  try {
    await db.query(sql, [...parametros]);
  } catch (error) {
    if (!(error instanceof DatabaseError)) throw error;
    rechazo = error;
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT intento');
    await db.query('RELEASE SAVEPOINT intento');
  }

  if (rechazo === undefined) {
    throw new Error(
      `Postgres ACEPTO la operacion. Se esperaba que la rechazara "${restriccion}": ` +
        `o esa restriccion ya no existe, o no cubre este caso.\n  ${compactar(sql)}`,
    );
  }
  expect(
    rechazo.constraint,
    `Postgres rechazo la operacion, pero no por "${restriccion}": ${rechazo.message}`,
  ).toBe(restriccion);
}

/**
 * Ejecuta `sql` y exige que Postgres lo acepte. Para los casos positivos: una
 * restriccion demasiado amplia tambien es un bug. El efecto queda dentro de la
 * transaccion del test, que igual se deshace al final.
 */
export async function esperarAceptacion<Fila extends QueryResultRow = QueryResultRow>(
  db: Db,
  sql: string,
  parametros: readonly unknown[] = [],
): Promise<Fila[]> {
  await db.query('SAVEPOINT intento');
  try {
    const { rows } = await db.query<Fila>(sql, [...parametros]);
    await db.query('RELEASE SAVEPOINT intento');
    return rows;
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT intento');
    const motivo =
      error instanceof DatabaseError
        ? `${error.constraint ?? error.code}: ${error.message}`
        : String(error);
    throw new Error(
      `Postgres RECHAZO una operacion que tenia que aceptar (${motivo}).\n  ${compactar(sql)}`,
      { cause: error },
    );
  }
}

/** Devuelve la unica fila de `sql`. Falla si no hay exactamente una. */
export async function una<Fila extends QueryResultRow>(
  db: Db,
  sql: string,
  parametros: readonly unknown[] = [],
): Promise<Fila> {
  const { rows } = await db.query<Fila>(sql, [...parametros]);
  const [fila, ...resto] = rows;
  if (fila === undefined || resto.length > 0) {
    throw new Error(`Se esperaba una fila y hubo ${rows.length}.\n  ${compactar(sql)}`);
  }
  return fila;
}

function compactar(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
