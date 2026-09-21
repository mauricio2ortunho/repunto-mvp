import type {
  Asignacion,
  Dispositivo,
  Local,
  Negocio,
  Rol,
  Turno,
} from '@repunto/dominio';

import { Prisma } from '../generated/prisma/client';

/**
 * La parte comun de las tres lecturas de la caja: sellar, dar de alta y
 * anular arrancan igual, del hash del token de la tablet, y bajan hasta el
 * turno abierto y la asignacion del cajero.
 *
 * Vive en un fragmento compartido y no copiado en cada consulta: son las
 * columnas que sostienen INV-1, INV-2 e INV-3, y tres copias que se van
 * separando entre si es exactamente como se pierde un invariante.
 */

export type Transaccion = Prisma.TransactionClient;

/** CTE `disp`, `loc`, `neg`, `turno` y `asig`. Va despues de un `WITH`. */
export function cteDeCaja(tokenHash: string): Prisma.Sql {
  return Prisma.sql`
    disp AS (
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
      -- El rol sale de aca, del usuario que abrio el turno, y nunca del
      -- request: es lo que decide quien puede anular que.
      SELECT t.id, t.dispositivo_id, t.usuario_id, t.local_id, t.cerrado_el, u.rol
      FROM turno_caja t
      JOIN disp ON t.dispositivo_id = disp.id
      JOIN usuario_negocio u ON u.id = t.usuario_id
      WHERE t.cerrado_el IS NULL
    ), asig AS (
      SELECT ul.usuario_id, ul.local_id, ul.activo
      FROM usuario_local ul
      JOIN turno ON ul.usuario_id = turno.usuario_id AND ul.local_id = turno.local_id
    )`;
}

/** Las columnas que devuelven esas CTE. Va en la lista del SELECT final. */
export const CAMPOS_DE_CAJA = Prisma.sql`
  now() AS ahora,
  (SELECT to_jsonb(x) FROM disp x) AS dispositivo,
  (SELECT to_jsonb(x) FROM loc x) AS local,
  (SELECT to_jsonb(x) FROM neg x) AS negocio,
  (SELECT to_jsonb(x) FROM turno x) AS turno,
  (SELECT to_jsonb(x) FROM asig x) AS asignacion`;

/** La fila cruda de esas columnas. Las fechas de un jsonb llegan como texto. */
export interface FilaDeCaja {
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
    rol: Rol;
    cerrado_el: string | null;
  } | null;
  asignacion: { usuario_id: string; local_id: string; activo: boolean } | null;
}

/** El estado de la caja, ya en las formas planas del dominio. */
export interface CajaLeida {
  /**
   * El instante de la transaccion, tomado por Postgres. Es el mismo `now()`
   * que usan los DEFAULT de las filas que se van a insertar.
   */
  ahora: Date;
  dispositivo: Dispositivo;
  local: Local;
  negocio: Negocio;
  turno: Turno | null;
  asignacion: Asignacion | null;
}

/**
 * Devuelve la caja, o null si el token no resuelve a ningun dispositivo.
 *
 * Que la tablet este revocada NO se resuelve aca: eso lo decide el dominio y
 * tiene su propio codigo de error, porque el dueño acaba de revocarla y quiere
 * ver ese mensaje y no un 401 generico.
 */
export function mapearCaja(fila: FilaDeCaja | undefined): CajaLeida | null {
  if (fila === undefined || fila.dispositivo === null) return null;
  if (fila.local === null || fila.negocio === null) {
    // Con dispositivo hay local y negocio: lo garantizan las FK.
    throw new Error('Un dispositivo sin local o sin negocio: la base lo impide.');
  }

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
  };
}

export function comoFecha(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

export function comoFechaONula(valor: Date | string | null): Date | null {
  return valor === null ? null : comoFecha(valor);
}
