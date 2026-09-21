import type { Programa, Sello, SelloParaAnular, TarjetaEnCurso } from '@repunto/dominio';

import {
  CAMPOS_DE_CAJA,
  type CajaLeida,
  type FilaDeCaja,
  type Transaccion,
  comoFecha,
  cteDeCaja,
  mapearCaja,
} from './caja.sql';
import {
  type FilaDePrograma,
  type FilaDeSello,
  type FilaDeTarjeta,
  comoSello,
  comoTarjeta,
} from './lectura';

/**
 * El estado que `decidirAnulacion` necesita, en una sola consulta: la caja
 * —con el ROL del turno, que es lo que decide quien puede anular que—, el
 * sello que se quiere anular, su tarjeta con todos sus sellos, y el ultimo
 * sello que otorgo el usuario de este turno en este local.
 *
 * Ese ultimo sello viene de la base y no de un calculo de la api: que el
 * cajero solo pueda deshacer "el ultimo suyo" es una regla, y la decide el
 * dominio comparando.
 */

export interface EstadoDeAnulacion extends CajaLeida {
  sello: SelloParaAnular | null;
  ultimoSelloDelUsuario: Sello | null;
  tarjeta: TarjetaEnCurso | null;
  nombreDelCliente: string | null;
  programaDeLaTarjeta: Programa | null;
}

interface FilaDeAnulacion extends FilaDeCaja {
  sello: {
    id: string;
    tarjeta_id: string;
    local_id: string;
    usuario_id: string;
    creado_el: string;
    anulado: boolean;
    tarjeta_estado: 'activa' | 'canjeada' | 'vencida';
  } | null;
  tarjeta: FilaDeTarjeta | null;
  programa_de_la_tarjeta: FilaDePrograma | null;
  sellos: FilaDeSello[] | null;
  nombre_del_cliente: string | null;
  ultimo_del_usuario: FilaDeSello | null;
}

export async function leerEstadoParaAnulacion(
  tx: Transaccion,
  tokenHash: string,
  selloId: string,
): Promise<EstadoDeAnulacion | null> {
  const filas = await tx.$queryRaw<FilaDeAnulacion[]>`
    WITH ${cteDeCaja(tokenHash)}, sel AS (
      SELECT s.id, s.tarjeta_id, s.local_id, s.creado_el, s.anulado,
             otorgado.usuario_id, t.estado AS tarjeta_estado
      FROM sello s
      JOIN turno_caja otorgado ON otorgado.id = s.turno_id
      JOIN tarjeta t ON t.id = s.tarjeta_id
      WHERE s.id = ${selloId}::uuid
    ), tarj AS (
      SELECT t.id, t.cliente_id, t.programa_id, t.negocio_id, t.local_alta_id,
             t.estado, t.reloj_desde, t.vence_el
      FROM tarjeta t JOIN sel ON sel.tarjeta_id = t.id
    ), tarj_prog AS (
      SELECT p.id, p.negocio_id, p.sellos_requeridos, p.premio,
             p.vigencia_meses, p.horas_entre_sellos
      FROM programa p JOIN tarj ON tarj.programa_id = p.id
    ), sellos AS (
      SELECT s.id, s.tarjeta_id, s.creado_el, s.anulado
      FROM sello s JOIN tarj ON s.tarjeta_id = tarj.id
    ), cli AS (
      SELECT c.nombre FROM cliente c JOIN tarj ON tarj.cliente_id = c.id
    ), ultimo_del_usuario AS (
      SELECT s.id, s.tarjeta_id, s.creado_el, s.anulado
      FROM sello s
      JOIN turno_caja otorgado ON otorgado.id = s.turno_id
      JOIN turno ON otorgado.usuario_id = turno.usuario_id
      WHERE NOT s.anulado AND s.local_id = turno.local_id
      ORDER BY s.creado_el DESC
      LIMIT 1
    )
    SELECT ${CAMPOS_DE_CAJA},
           (SELECT to_jsonb(x) FROM sel x) AS sello,
           (SELECT to_jsonb(x) FROM tarj x) AS tarjeta,
           (SELECT to_jsonb(x) FROM tarj_prog x) AS programa_de_la_tarjeta,
           (SELECT jsonb_agg(to_jsonb(x)) FROM sellos x) AS sellos,
           (SELECT x.nombre FROM cli x) AS nombre_del_cliente,
           (SELECT to_jsonb(x) FROM ultimo_del_usuario x) AS ultimo_del_usuario`;

  const fila = filas[0];
  const caja = mapearCaja(fila);
  if (caja === null || fila === undefined) return null;

  const tarjeta = fila.tarjeta;
  const programa = fila.programa_de_la_tarjeta;

  return {
    ...caja,
    sello:
      fila.sello === null
        ? null
        : { ...fila.sello, creado_el: comoFecha(fila.sello.creado_el) },
    ultimoSelloDelUsuario:
      fila.ultimo_del_usuario === null ? null : comoSello(fila.ultimo_del_usuario),
    tarjeta:
      tarjeta === null || programa === null
        ? null
        : {
            tarjeta: comoTarjeta(tarjeta),
            programa,
            sellos: (fila.sellos ?? []).map(comoSello),
          },
    nombreDelCliente: fila.nombre_del_cliente,
    programaDeLaTarjeta: programa,
  };
}
