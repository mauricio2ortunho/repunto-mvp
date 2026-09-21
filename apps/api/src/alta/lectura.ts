import type { Cliente, RegistroPendiente } from '@repunto/dominio';

import {
  CAMPOS_DE_CAJA,
  type CajaLeida,
  type FilaDeCaja,
  type Transaccion,
  comoFecha,
  cteDeCaja,
  mapearCaja,
} from '../caja/caja.sql';
import {
  CAMPOS_DE_PROMO_Y_TARJETA,
  type FilaDePrograma,
  type FilaDeSello,
  type FilaDeTarjeta,
  type PromoYTarjeta,
  ctePromoYTarjeta,
  mapearPromoYTarjeta,
} from '../caja/lectura';

/**
 * El estado que `decidirAlta` necesita, en una sola consulta: la caja, el
 * registro pendiente y —si el telefono de ese registro ya era de alguien— su
 * cuenta, con la tarjeta que tenga en este negocio.
 *
 * El cliente se resuelve por el TELEFONO del registro, no por nada que venga
 * en el request: el que ya existe no se registra de nuevo, abre una tarjeta
 * mas (especificacion funcional, seccion 3).
 */

export interface EstadoDeAlta extends CajaLeida, PromoYTarjeta {
  registro: RegistroPendiente | null;
  /** Solo id y nombre: el alta no necesita el secreto de nadie. */
  clienteExistente: Pick<Cliente, 'id' | 'nombre'> | null;
}

interface FilaDeAlta extends FilaDeCaja {
  registro: {
    id: string;
    local_id: string;
    telefono: string;
    nombre: string;
    estado: 'pendiente' | 'confirmado' | 'descartado';
    expira_el: string;
  } | null;
  cliente: { id: string; nombre: string } | null;
  programa_vigente: FilaDePrograma | null;
  condicion_vigente: { id: string; negocio_id: string } | null;
  tarjeta: FilaDeTarjeta | null;
  programa_de_la_tarjeta: FilaDePrograma | null;
  local_de_la_tarjeta: string | null;
  sellos: FilaDeSello[] | null;
  ultimo_sello: FilaDeSello | null;
}

export async function leerEstadoParaAlta(
  tx: Transaccion,
  tokenHash: string,
  registroId: string,
): Promise<EstadoDeAlta | null> {
  const filas = await tx.$queryRaw<FilaDeAlta[]>`
    WITH ${cteDeCaja(tokenHash)}, reg AS (
      SELECT r.id, r.local_id, r.telefono, r.nombre, r.estado, r.expira_el
      FROM registro_pendiente r WHERE r.id = ${registroId}::uuid
    ), cli AS (
      SELECT c.id, c.nombre, c.codigo_publico, c.semilla_totp
      FROM cliente c JOIN reg ON c.telefono = reg.telefono
    ), ${ctePromoYTarjeta}
    SELECT ${CAMPOS_DE_CAJA},
           (SELECT to_jsonb(x) FROM reg x) AS registro,
           ${CAMPOS_DE_PROMO_Y_TARJETA}`;

  const fila = filas[0];
  const caja = mapearCaja(fila);
  if (caja === null || fila === undefined) return null;

  return {
    ...caja,
    registro:
      fila.registro === null
        ? null
        : { ...fila.registro, expira_el: comoFecha(fila.registro.expira_el) },
    clienteExistente: fila.cliente,
    ...mapearPromoYTarjeta(fila),
  };
}
