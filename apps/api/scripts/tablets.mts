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
 *   pnpm tablets salud
 *
 * El codigo se imprime en pantalla para dictarlo, y nada mas: no va a ningun
 * log (CLAUDE.md, seccion 8).
 */

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
/** Si choca con otro codigo pendiente, se prueba otro. */
const INTENTOS_DE_CODIGO = 5;
/** La alerta de local sin sellos (CLAUDE.md, seccion 7). */
const DIAS_SIN_SELLOS_PARA_ALERTA = 7;

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
    else if (orden === 'salud') await salud(db);
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

/**
 * El chequeo de salud por local (CLAUDE.md, seccion 8): cuando sello por
 * ultima vez cada tablet activa, y cuando intento algo, segun la bitacora. Un
 * local sin sellos en siete dias es un local donde el sistema se abandono; si
 * ademas tiene intentos recientes, lo estan usando y algo lo rechaza.
 *
 * Existe aca hasta que haya panel del dueño y del admin, donde va a vivir.
 */
async function salud(db: Client): Promise<void> {
  const filas = await db.query<{
    negocio: string;
    local: string;
    tablet: string;
    ultimo_sello: Date | null;
    ultimo_intento: Date | null;
    ultimo_rechazo: string | null;
  }>(
    `SELECT n.nombre AS negocio, l.nombre AS local, d.nombre AS tablet,
            (SELECT max(s.creado_el) FROM sello s
               JOIN turno_caja t ON t.id = s.turno_id
              WHERE t.dispositivo_id = d.id) AS ultimo_sello,
            (SELECT max(i.creado_el) FROM intento_caja i
              WHERE i.dispositivo_id = d.id) AS ultimo_intento,
            (SELECT i.resultado FROM intento_caja i
              WHERE i.dispositivo_id = d.id AND i.resultado <> 'ok'
              ORDER BY i.creado_el DESC LIMIT 1) AS ultimo_rechazo
     FROM dispositivo_caja d
     JOIN local l ON l.id = d.local_id
     JOIN negocio n ON n.id = l.negocio_id
     WHERE d.revocado_el IS NULL AND l.activo
     ORDER BY n.nombre, l.nombre, d.nombre`,
  );
  if (filas.rows.length === 0) return console.log('No hay tablets activas.');

  // El ultimo sello de cada local, de cualquiera de sus tablets.
  const porLocal = new Map<string, Date | null>();
  for (const t of filas.rows) {
    const clave = `${t.negocio} / ${t.local}`;
    const previo = porLocal.get(clave) ?? null;
    if (t.ultimo_sello !== null && (previo === null || t.ultimo_sello > previo)) {
      porLocal.set(clave, t.ultimo_sello);
    } else if (!porLocal.has(clave)) {
      porLocal.set(clave, previo);
    }
  }

  const ahora = Date.now();
  const dias = (instante: Date | null) =>
    instante === null ? null : Math.floor((ahora - instante.getTime()) / 86_400_000);

  for (const t of filas.rows) {
    const sello =
      t.ultimo_sello === null
        ? 'nunca'
        : `${fecha(t.ultimo_sello)} (${dias(t.ultimo_sello)} d)`;
    const intento = t.ultimo_intento === null ? 'nunca' : fecha(t.ultimo_intento);
    const rechazo =
      t.ultimo_rechazo === null ? '' : `  ultimo rechazo: ${t.ultimo_rechazo}`;
    console.log(
      `${t.negocio} / ${t.local} / ${t.tablet}  ultimo sello: ${sello}  ultimo intento: ${intento}${rechazo}`,
    );
  }

  const abandonados = [...porLocal].filter(([, ultimo]) => {
    const d = dias(ultimo);
    return d === null || d >= DIAS_SIN_SELLOS_PARA_ALERTA;
  });
  console.log(
    abandonados.length === 0
      ? `
Todos los locales sellaron en los ultimos ${DIAS_SIN_SELLOS_PARA_ALERTA} dias.`
      : `
SIN SELLOS EN ${DIAS_SIN_SELLOS_PARA_ALERTA} DIAS O MAS: ${abandonados.map(([l]) => l).join(', ')}`,
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
  pnpm tablets salud
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
