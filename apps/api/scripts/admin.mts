import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LARGO_CODIGO_DE_VINCULACION,
  MINUTOS_DE_ENTRADA_DE_ADMIN,
  ZONA_HORARIA,
  codigoDeVinculacionDesde,
  formatearCodigoDeVinculacion,
  normalizarTelefono,
} from '@repunto/dominio';
import { Client } from 'pg';

/**
 * La entrada al panel de administracion, desde la terminal: generar el codigo
 * para abrir una sesion, listar las sesiones y revocar una.
 *
 * Existe porque el admin entra por codigo, y mandarlo por correo o SMS todavia
 * no esta. Cuando este, el codigo llega por ahi y `entrar` sobra; listar y
 * revocar siguen sirviendo.
 *
 * Como `pnpm tablets`, corre en cualquier entorno, contra DATABASE_URL.
 *
 *   pnpm admin entrar --admin <telefono>
 *   pnpm admin sesiones
 *   pnpm admin revocar <id_de_la_sesion>
 *
 * El codigo se imprime en pantalla y nada mas: no va a ningun log
 * (CLAUDE.md, seccion 8).
 */

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
/** Si choca con otro codigo, se prueba otro. */
const INTENTOS_DE_CODIGO = 5;

async function principal(): Promise<void> {
  const env = resolve(RAIZ, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('Falta DATABASE_URL.');

  const [orden, ...resto] = process.argv.slice(2);
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    if (orden === 'entrar') await entrar(db, resto);
    else if (orden === 'sesiones') await sesiones(db);
    else if (orden === 'revocar') await revocar(db, resto[0]);
    else ayuda();
  } finally {
    await db.end();
  }
}

async function entrar(db: Client, args: string[]): Promise<void> {
  const indice = args.indexOf('--admin');
  const telefono = normalizarTelefono(indice >= 0 ? (args[indice + 1] ?? '') : '');
  if (telefono === null) return ayuda();

  const admin = await db.query<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM admin_plataforma WHERE telefono = $1 AND activo',
    [telefono],
  );
  const quien = admin.rows[0];
  if (quien === undefined)
    throw new Error(`No hay un admin activo con el telefono ${telefono}.`);

  for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento += 1) {
    const codigo = codigoDeVinculacionDesde(randomBytes(LARGO_CODIGO_DE_VINCULACION));
    try {
      const fila = await db.query<{ expira_el: Date }>(
        `INSERT INTO entrada_admin (admin_id, codigo, expira_el)
         VALUES ($1, $2, now() + make_interval(mins => $3::int))
         RETURNING expira_el`,
        [quien.id, codigo, MINUTOS_DE_ENTRADA_DE_ADMIN],
      );
      const expira = fila.rows[0]?.expira_el ?? new Date();
      console.log(`
  Entrada al panel de administracion para ${quien.nombre}.

    Codigo:  ${formatearCodigoDeVinculacion(codigo)}

  Abri el panel en /admin/entrar y escribilo. No lo compartas con nadie.
  Vence a las ${horaEnLaPaz(expira)} (hora de La Paz) y sirve una sola vez.
`);
      return;
    } catch (error) {
      if (esChoqueDeCodigo(error)) continue;
      throw error;
    }
  }
  throw new Error('No se pudo generar un codigo libre. Proba de nuevo.');
}

async function sesiones(db: Client): Promise<void> {
  const filas = await db.query<{
    id: string;
    nombre: string;
    creado_el: Date;
    ultimo_acceso: Date;
    revocada_el: Date | null;
  }>(
    `SELECT s.id, a.nombre, s.creado_el, s.ultimo_acceso, s.revocada_el
     FROM sesion_admin s JOIN admin_plataforma a ON a.id = s.admin_id
     ORDER BY s.ultimo_acceso DESC`,
  );
  if (filas.rows.length === 0) return console.log('No hay sesiones.');
  for (const s of filas.rows) {
    const estado =
      s.revocada_el === null ? 'abierta' : `REVOCADA ${fecha(s.revocada_el)}`;
    console.log(
      `${s.id}  ${s.nombre}  desde ${fecha(s.creado_el)}` +
        `  ultimo uso ${fecha(s.ultimo_acceso)}  ${estado}`,
    );
  }
}

async function revocar(db: Client, id: string | undefined): Promise<void> {
  if (id === undefined) return ayuda();
  const filas = await db.query(
    `UPDATE sesion_admin SET revocada_el = now()
     WHERE id = $1::uuid AND revocada_el IS NULL RETURNING id`,
    [id],
  );
  console.log(
    filas.rowCount === 1
      ? 'Sesion revocada: ese equipo tiene que volver a entrar con un codigo.'
      : 'No hay una sesion abierta con ese id.',
  );
}

function esChoqueDeCodigo(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'constraint' in error &&
    error.constraint === 'entrada_admin_codigo_key'
  );
}

function horaEnLaPaz(instante: Date): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instante);
}

function fecha(instante: Date): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(instante);
}

function ayuda(): void {
  console.log(`
  pnpm admin entrar --admin <telefono>
  pnpm admin sesiones
  pnpm admin revocar <id_de_la_sesion>
`);
  process.exitCode = 1;
}

principal().catch((error: unknown) => {
  // Sin la base levantada, pg tira un AggregateError con el mensaje vacio:
  // sin el codigo, el script terminaria en silencio.
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(mensaje || `No se pudo conectar a la base (${codigo || 'sin detalle'}).`);
  process.exitCode = 1;
});
