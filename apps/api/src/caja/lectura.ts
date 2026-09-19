import type {
  Asignacion,
  Cliente,
  Condicion,
  Dispositivo,
  Local,
  Negocio,
  Programa,
  Sello,
  Tarjeta,
  TarjetaEnCurso,
  Turno,
} from '@repunto/dominio';

import type { Prisma } from '../generated/prisma/client';
import { descifrarSemilla } from '../seguridad/cifrado';

/**
 * El adaptador de lectura del flujo de caja: trae en UNA consulta todo el
 * estado que `decidirSello` y `decidirCanje` necesitan.
 *
 * Arranca del hash del token de la tablet y baja: local, negocio, turno
 * abierto, asignacion del cajero, cliente por su codigo publico, programa y
 * condicion vigentes, tarjeta activa con sus sellos y su programa, y el ultimo
 * sello del cliente en ese negocio.
 *
 * Es SQL crudo, asi que Prisma no lo tipa. A cambio: un solo viaje, una sola
 * foto coherente del estado, y la transaccion del sellado tan corta como se
 * puede (INV-19). Lo compensan la interfaz explicita de la fila, mas abajo, y
 * los tests de integracion, que fallan al instante si una columna cambia.
 *
 * Nada de lo que decide viene del request: el negocio y el local salen del
 * dispositivo (INV-1, INV-2). Lo unico que viaja en el cuerpo es el codigo que
 * el cliente muestra.
 */

export type Transaccion = Prisma.TransactionClient;

/** El estado ya mapeado a las formas planas del dominio. */
export interface EstadoDeCaja {
  /**
   * El instante de la transaccion, tomado por Postgres. Es el mismo `now()`
   * que usan los DEFAULT de las filas que se van a insertar, asi que el reloj
   * de la tarjeta y la fecha del sello no pueden diferir ni un milisegundo.
   */
  ahora: Date;
  dispositivo: Dispositivo;
  local: Local;
  negocio: Negocio;
  turno: Turno | null;
  asignacion: Asignacion | null;
  cliente: Cliente | null;
  programaVigente: Programa | null;
  condicionVigente: Condicion | null;
  enCurso: TarjetaEnCurso | null;
  ultimoSelloDelCliente: Sello | null;
  /** Nombre del local donde se abrio la tarjeta en curso, para el mensaje. */
  localDeLaTarjeta: string | null;
}

interface FilaDePrograma {
  id: string;
  negocio_id: string;
  sellos_requeridos: number;
  premio: string;
  vigencia_meses: number | null;
  horas_entre_sellos: number;
}

interface FilaDeSello {
  id: string;
  tarjeta_id: string;
  creado_el: string;
  anulado: boolean;
}

/**
 * La fila cruda, tal cual sale de la consulta. Las fechas de adentro de un
 * jsonb llegan como texto ISO; las de primer nivel, como Date.
 */
interface FilaDeEstado {
  ahora: Date | string;
  dispositivo: { id: string; local_id: string; revocado_el: string | null } | null;
  local: { id: string; negocio_id: string; activo: boolean } | null;
  negocio: {
    id: string;
    estado: 'activo' | 'suspendido';
    canje_cualquier_local: boolean;
  } | null;
  turno: {
    id: string;
    dispositivo_id: string;
    usuario_id: string;
    local_id: string;
    cerrado_el: string | null;
  } | null;
  asignacion: { usuario_id: string; local_id: string; activo: boolean } | null;
  cliente: {
    id: string;
    nombre: string;
    codigo_publico: string;
    semilla_totp: string;
  } | null;
  programa_vigente: FilaDePrograma | null;
  condicion_vigente: { id: string; negocio_id: string } | null;
  tarjeta: {
    id: string;
    cliente_id: string;
    programa_id: string;
    negocio_id: string;
    local_alta_id: string;
    estado: 'activa' | 'canjeada' | 'vencida';
    reloj_desde: string | null;
    vence_el: string | null;
  } | null;
  programa_de_la_tarjeta: FilaDePrograma | null;
  local_de_la_tarjeta: string | null;
  sellos: FilaDeSello[] | null;
  ultimo_sello: FilaDeSello | null;
}

/**
 * Devuelve el estado, o null si el token no resuelve a ningun dispositivo.
 *
 * Que la tablet este revocada NO se resuelve aca: eso lo decide el dominio y
 * tiene su propio codigo de error, porque el dueño acaba de revocarla y quiere
 * ver ese mensaje y no un 401 generico.
 */
export async function leerEstado(
  tx: Transaccion,
  tokenHash: string,
  codigoPublico: string,
): Promise<EstadoDeCaja | null> {
  const filas = await tx.$queryRaw<FilaDeEstado[]>`
    WITH disp AS (
      SELECT d.id, d.local_id, d.revocado_el
      FROM dispositivo_caja d
      WHERE d.token_hash = ${tokenHash}
    ), loc AS (
      SELECT l.id, l.negocio_id, l.activo
      FROM local l JOIN disp ON disp.local_id = l.id
    ), neg AS (
      SELECT n.id, n.estado, n.canje_cualquier_local
      FROM negocio n JOIN loc ON loc.negocio_id = n.id
    ), turno AS (
      -- Un solo turno abierto por dispositivo lo garantiza el indice parcial
      -- turno_caja_uno_abierto_por_dispositivo: aca no hay nada que elegir.
      SELECT t.id, t.dispositivo_id, t.usuario_id, t.local_id, t.cerrado_el
      FROM turno_caja t JOIN disp ON t.dispositivo_id = disp.id
      WHERE t.cerrado_el IS NULL
    ), asig AS (
      SELECT u.usuario_id, u.local_id, u.activo
      FROM usuario_local u
      JOIN turno ON u.usuario_id = turno.usuario_id AND u.local_id = turno.local_id
    ), cli AS (
      SELECT c.id, c.nombre, c.codigo_publico, c.semilla_totp
      FROM cliente c WHERE c.codigo_publico = ${codigoPublico}
    ), prog AS (
      SELECT p.id, p.negocio_id, p.sellos_requeridos, p.premio,
             p.vigencia_meses, p.horas_entre_sellos
      FROM programa p JOIN neg ON p.negocio_id = neg.id
      WHERE p.vigente
    ), cond AS (
      SELECT c.id, c.negocio_id
      FROM condicion_sello c JOIN neg ON c.negocio_id = neg.id
      WHERE c.vigente_desde <= now()
      ORDER BY c.vigente_desde DESC, c.creado_el DESC
      LIMIT 1
    ), tarj AS (
      SELECT t.id, t.cliente_id, t.programa_id, t.negocio_id, t.local_alta_id,
             t.estado, t.reloj_desde, t.vence_el
      FROM tarjeta t
      JOIN cli ON t.cliente_id = cli.id
      JOIN neg ON t.negocio_id = neg.id
      WHERE t.estado = 'activa'
    ), tarj_prog AS (
      SELECT p.id, p.negocio_id, p.sellos_requeridos, p.premio,
             p.vigencia_meses, p.horas_entre_sellos
      FROM programa p JOIN tarj ON tarj.programa_id = p.id
    ), tarj_loc AS (
      SELECT l.nombre FROM local l JOIN tarj ON tarj.local_alta_id = l.id
    ), sellos AS (
      SELECT s.id, s.tarjeta_id, s.creado_el, s.anulado
      FROM sello s JOIN tarj ON s.tarjeta_id = tarj.id
    ), ultimo AS (
      -- Por cliente y negocio, no por tarjeta: si se midiera por tarjeta,
      -- alguien canjearia y sellaria de nuevo al instante.
      SELECT s.id, s.tarjeta_id, s.creado_el, s.anulado
      FROM sello s
      JOIN tarjeta t ON t.id = s.tarjeta_id
      JOIN cli ON t.cliente_id = cli.id
      JOIN neg ON t.negocio_id = neg.id
      WHERE NOT s.anulado
      ORDER BY s.creado_el DESC
      LIMIT 1
    )
    SELECT now() AS ahora,
           (SELECT to_jsonb(x) FROM disp x) AS dispositivo,
           (SELECT to_jsonb(x) FROM loc x) AS local,
           (SELECT to_jsonb(x) FROM neg x) AS negocio,
           (SELECT to_jsonb(x) FROM turno x) AS turno,
           (SELECT to_jsonb(x) FROM asig x) AS asignacion,
           (SELECT to_jsonb(x) FROM cli x) AS cliente,
           (SELECT to_jsonb(x) FROM prog x) AS programa_vigente,
           (SELECT to_jsonb(x) FROM cond x) AS condicion_vigente,
           (SELECT to_jsonb(x) FROM tarj x) AS tarjeta,
           (SELECT to_jsonb(x) FROM tarj_prog x) AS programa_de_la_tarjeta,
           (SELECT x.nombre FROM tarj_loc x) AS local_de_la_tarjeta,
           (SELECT jsonb_agg(to_jsonb(x)) FROM sellos x) AS sellos,
           (SELECT to_jsonb(x) FROM ultimo x) AS ultimo_sello`;

  const fila = filas[0];
  if (fila === undefined || fila.dispositivo === null) return null;
  if (fila.local === null || fila.negocio === null) {
    // Con dispositivo hay local y negocio: lo garantizan las FK.
    throw new Error('Un dispositivo sin local o sin negocio: la base lo impide.');
  }

  const tarjeta = fila.tarjeta;
  const programaDeLaTarjeta = fila.programa_de_la_tarjeta;

  return {
    ahora: comoFecha(fila.ahora),
    dispositivo: {
      id: fila.dispositivo.id,
      local_id: fila.dispositivo.local_id,
      revocado_el: comoFechaONula(fila.dispositivo.revocado_el),
    },
    local: fila.local,
    negocio: fila.negocio,
    turno:
      fila.turno === null
        ? null
        : { ...fila.turno, cerrado_el: comoFechaONula(fila.turno.cerrado_el) },
    asignacion: fila.asignacion,
    cliente:
      fila.cliente === null
        ? null
        : {
            id: fila.cliente.id,
            nombre: fila.cliente.nombre,
            codigo_publico: fila.cliente.codigo_publico,
            // Se descifra aca y no sale del proceso: ni en la respuesta, ni en
            // el log, ni en Sentry (CLAUDE.md, seccion 8).
            semilla_totp: descifrarSemilla(fila.cliente.semilla_totp),
          },
    programaVigente: fila.programa_vigente,
    condicionVigente: fila.condicion_vigente,
    enCurso:
      tarjeta === null || programaDeLaTarjeta === null
        ? null
        : {
            tarjeta: comoTarjeta(tarjeta),
            programa: programaDeLaTarjeta,
            sellos: (fila.sellos ?? []).map(comoSello),
          },
    ultimoSelloDelCliente:
      fila.ultimo_sello === null ? null : comoSello(fila.ultimo_sello),
    localDeLaTarjeta: fila.local_de_la_tarjeta,
  };
}

function comoTarjeta(fila: NonNullable<FilaDeEstado['tarjeta']>): Tarjeta {
  return {
    id: fila.id,
    cliente_id: fila.cliente_id,
    programa_id: fila.programa_id,
    negocio_id: fila.negocio_id,
    local_alta_id: fila.local_alta_id,
    estado: fila.estado,
    reloj_desde: comoFechaONula(fila.reloj_desde),
    vence_el: comoFechaONula(fila.vence_el),
  };
}

function comoSello(fila: FilaDeSello): Sello {
  return {
    id: fila.id,
    tarjeta_id: fila.tarjeta_id,
    creado_el: comoFecha(fila.creado_el),
    anulado: fila.anulado,
  };
}

function comoFecha(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

function comoFechaONula(valor: Date | string | null): Date | null {
  return valor === null ? null : comoFecha(valor);
}
