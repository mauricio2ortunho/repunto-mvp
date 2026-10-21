import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LARGO_CODIGO_DE_VINCULACION,
  MINUTOS_DE_VINCULACION,
  ZONA_HORARIA,
  codigoDeVinculacionDesde,
  formatearCodigoDeVinculacion,
  normalizarTelefono,
} from '@repunto/dominio';
import { Client } from 'pg';

/**
 * Las tablets de la caja, desde la terminal del admin de plataforma: generar
 * el codigo para vincular una, listarlas y revocar una perdida.
 *
 * Existe porque el admin y el dueño entran por telefono y codigo, y eso
 * todavia no esta (necesita WhatsApp). Cuando esten sus paneles, esto se hace
 * desde ahi; la tablet vincula igual, con la misma pagina.
 *
 * A diferencia del seed, corre en cualquier entorno, produccion incluida: es
 * como se van a instalar las tablets del piloto. Va contra DATABASE_URL.
 *
 *   pnpm tablets vincular <qr_del_local> --admin <telefono>
 *   pnpm tablets listar [qr_del_local]
 *   pnpm tablets revocar <id_de_la_tablet>
 *
 * El codigo se imprime en pantalla para dictarlo, y nada mas: no va a ningun
 * log (CLAUDE.md, seccion 8).
 */

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
/** Si choca con otro codigo pendiente, se prueba otro. */
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
    if (orden === 'vincular') await vincular(db, resto);
    else if (orden === 'listar') await listar(db, resto[0]);
    else if (orden === 'revocar') await revocar(db, resto[0]);
    else ayuda();
  } finally {
    await db.end();
  }
}

async function vincular(db: Client, args: string[]): Promise<void> {
  const qr = args.find((a) => !a.startsWith('--'));
  const indice = args.indexOf('--admin');
  const telefono = normalizarTelefono(indice >= 0 ? (args[indice + 1] ?? '') : '');
  if (qr === undefined || telefono === null) return ayuda();

  const admin = await db.query<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM admin_plataforma WHERE telefono = $1 AND activo',
    [telefono],
  );
  const quien = admin.rows[0];
  if (quien === undefined)
    throw new Error(`No hay un admin activo con el telefono ${telefono}.`);

  const local = await db.query<{ id: string; nombre: string; negocio: string }>(
    `SELECT l.id, l.nombre, n.nombre AS negocio
     FROM local l JOIN negocio n ON n.id = l.negocio_id
     WHERE l.qr_slug = $1 AND l.activo`,
    [qr],
  );
  const destino = local.rows[0];
  if (destino === undefined) throw new Error(`No hay un local activo con el QR ${qr}.`);

  for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento += 1) {
    const codigo = codigoDeVinculacionDesde(randomBytes(LARGO_CODIGO_DE_VINCULACION));
    try {
      const fila = await db.query<{ expira_el: Date }>(
        `INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_admin_id, expira_el)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))
         RETURNING expira_el`,
        [codigo, destino.id, quien.id, MINUTOS_DE_VINCULACION],
      );
      const expira = fila.rows[0]?.expira_el ?? new Date();
      console.log(`
  Tablet nueva para ${destino.negocio}, local ${destino.nombre}.

    Codigo:  ${formatearCodigoDeVinculacion(codigo)}

  En la tablet, abri el panel en /vincular y escribilo.
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

async function listar(db: Client, qr: string | undefined): Promise<void> {
  const filas = await db.query<{
    id: string;
    nombre: string;
    local: string;
    vinculado_el: Date;
    revocado_el: Date | null;
    quien: string | null;
  }>(
    `SELECT d.id, d.nombre, l.nombre AS local, d.vinculado_el, d.revocado_el,
            coalesce(a.nombre, u.nombre) AS quien
     FROM dispositivo_caja d
     JOIN local l ON l.id = d.local_id
     LEFT JOIN vinculacion_pendiente v ON v.id = d.vinculacion_id
     LEFT JOIN admin_plataforma a ON a.id = v.creado_por_admin_id
     LEFT JOIN usuario_negocio u ON u.id = v.creado_por_usuario_id
     WHERE $1::text IS NULL OR l.qr_slug = $1
     ORDER BY l.nombre, d.vinculado_el`,
    [qr ?? null],
  );
  if (filas.rows.length === 0) return console.log('No hay tablets.');
  for (const t of filas.rows) {
    const estado = t.revocado_el === null ? 'activa' : `REVOCADA ${fecha(t.revocado_el)}`;
    console.log(
      `${t.id}  ${t.local} / ${t.nombre}  vinculada ${fecha(t.vinculado_el)}` +
        ` por ${t.quien ?? 'el seed'}  ${estado}`,
    );
  }
}

async function revocar(db: Client, id: string | undefined): Promise<void> {
  if (id === undefined || !/^[0-9a-f-]{36}$/i.test(id)) return ayuda();
  // Marca, nunca borra (INV-17): los turnos y sellos de la tablet la siguen
  // referenciando. Deja de servir en el pedido siguiente.
  const r = await db.query<{ nombre: string }>(
    `UPDATE dispositivo_caja SET revocado_el = now()
     WHERE id = $1 AND revocado_el IS NULL RETURNING nombre`,
    [id],
  );
  console.log(
    r.rowCount === 1
      ? `Revocada: ${r.rows[0]?.nombre ?? id}. Ya no puede operar.`
      : 'No hay una tablet activa con ese id (puede que ya estuviera revocada).',
  );
}

function esChoqueDeCodigo(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'constraint' in error &&
    error.constraint === 'vinculacion_pendiente_codigo_key'
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
  pnpm tablets vincular <qr_del_local> --admin <telefono>
  pnpm tablets listar [qr_del_local]
  pnpm tablets revocar <id_de_la_tablet>
`);
  process.exitCode = 1;
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
