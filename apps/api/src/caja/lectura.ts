import type {
  Cliente,
  Condicion,
  Programa,
  Sello,
  Tarjeta,
  TarjetaEnCurso,
} from '@repunto/dominio';

import { Prisma } from '../generated/prisma/client';
import { descifrarSemilla } from '../seguridad/cifrado';
import {
  CAMPOS_DE_CAJA,
  type CajaLeida,
  type FilaDeCaja,
  type Transaccion,
  comoFecha,
  comoFechaONula,
  cteDeCaja,
  mapearCaja,
} from './caja.sql';

/**
 * El adaptador de lectura del sellado y del canje: trae en UNA consulta todo
 * el estado que `decidirSello` y `decidirCanje` necesitan.
 *
 * Es SQL crudo, asi que Prisma no lo tipa. A cambio: un solo viaje, una sola
 * foto coherente del estado, y la transaccion tan corta como se puede
 * (INV-19). Lo compensan la interfaz explicita de la fila y los tests de
 * integracion, que fallan al instante si una columna cambia.
 *
 * Nada de lo que decide viene del request: el negocio y el local salen del
 * dispositivo (INV-1, INV-2). Lo unico que viaja en el cuerpo es el codigo que
 * el cliente muestra.
 */

export type { Transaccion } from './caja.sql';

export interface EstadoDeCaja extends CajaLeida {
  cliente: Cliente | null;
  programaVigente: Programa | null;
  condicionVigente: Condicion | null;
  enCurso: TarjetaEnCurso | null;
  ultimoSelloDelCliente: Sello | null;
  /** Nombre del local donde se abrio la tarjeta en curso, para el mensaje. */
  localDeLaTarjeta: string | null;
}

export interface FilaDePrograma {
  id: string;
  negocio_id: string;
  sellos_requeridos: number;
  premio: string;
  vigencia_meses: number | null;
  horas_entre_sellos: number;
}

export interface FilaDeSello {
  id: string;
  tarjeta_id: string;
  creado_el: string;
  anulado: boolean;
}

export interface FilaDeTarjeta {
  id: string;
  cliente_id: string;
  programa_id: string;
  negocio_id: string;
  local_alta_id: string;
  estado: 'activa' | 'canjeada' | 'vencida';
  reloj_desde: string | null;
  vence_el: string | null;
}

interface FilaDeEstado extends FilaDeCaja {
  cliente: {
    id: string;
    nombre: string;
    codigo_publico: string;
    semilla_totp: string;
  } | null;
  programa_vigente: FilaDePrograma | null;
  condicion_vigente: { id: string; negocio_id: string } | null;
  tarjeta: FilaDeTarjeta | null;
  programa_de_la_tarjeta: FilaDePrograma | null;
  local_de_la_tarjeta: string | null;
  sellos: FilaDeSello[] | null;
  ultimo_sello: FilaDeSello | null;
}

/** Devuelve el estado, o null si el token no resuelve a ningun dispositivo. */
export async function leerEstado(
  tx: Transaccion,
  tokenHash: string,
  codigoPublico: string,
): Promise<EstadoDeCaja | null> {
  const filas = await tx.$queryRaw<FilaDeEstado[]>`
    WITH ${cteDeCaja(tokenHash)}, cli AS (
      SELECT c.id, c.nombre, c.codigo_publico, c.semilla_totp
      FROM cliente c WHERE c.codigo_publico = ${codigoPublico}
    ), ${ctePromoYTarjeta}
    SELECT ${CAMPOS_DE_CAJA}, ${CAMPOS_DE_PROMO_Y_TARJETA}`;

  const caja = mapearCaja(filas[0]);
  const fila = filas[0];
  if (caja === null || fila === undefined) return null;

  return {
    ...caja,
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
    ...mapearPromoYTarjeta(fila),
  };
}

/**
 * La promo vigente del negocio y la tarjeta en curso del cliente. Depende de
 * las CTE `neg` y `cli`, asi que quien lo use tiene que definirlas antes.
 * Lo comparten el sellado, el canje y el alta.
 */
export const ctePromoYTarjeta = Prisma.sql`
    prog AS (
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
    )`;

export const CAMPOS_DE_PROMO_Y_TARJETA = Prisma.sql`
  (SELECT to_jsonb(x) FROM cli x) AS cliente,
  (SELECT to_jsonb(x) FROM prog x) AS programa_vigente,
  (SELECT to_jsonb(x) FROM cond x) AS condicion_vigente,
  (SELECT to_jsonb(x) FROM tarj x) AS tarjeta,
  (SELECT to_jsonb(x) FROM tarj_prog x) AS programa_de_la_tarjeta,
  (SELECT x.nombre FROM tarj_loc x) AS local_de_la_tarjeta,
  (SELECT jsonb_agg(to_jsonb(x)) FROM sellos x) AS sellos,
  (SELECT to_jsonb(x) FROM ultimo x) AS ultimo_sello`;

export interface PromoYTarjeta {
  programaVigente: Programa | null;
  condicionVigente: Condicion | null;
  enCurso: TarjetaEnCurso | null;
  ultimoSelloDelCliente: Sello | null;
  localDeLaTarjeta: string | null;
}

export function mapearPromoYTarjeta(fila: {
  programa_vigente: FilaDePrograma | null;
  condicion_vigente: { id: string; negocio_id: string } | null;
  tarjeta: FilaDeTarjeta | null;
  programa_de_la_tarjeta: FilaDePrograma | null;
  local_de_la_tarjeta: string | null;
  sellos: FilaDeSello[] | null;
  ultimo_sello: FilaDeSello | null;
}): PromoYTarjeta {
  const tarjeta = fila.tarjeta;
  const programaDeLaTarjeta = fila.programa_de_la_tarjeta;

  return {
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

export function comoTarjeta(fila: FilaDeTarjeta): Tarjeta {
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

export function comoSello(fila: FilaDeSello): Sello {
  return {
    id: fila.id,
    tarjeta_id: fila.tarjeta_id,
    creado_el: comoFecha(fila.creado_el),
    anulado: fila.anulado,
  };
}
