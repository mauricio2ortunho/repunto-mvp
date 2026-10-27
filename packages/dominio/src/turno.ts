import { finPorInactividad, revisarTablet, turnoAgotado } from './caja';
import { type Rechazo, rechazo } from './errores';
import type { Asignacion, Dispositivo, Local, Negocio, Rol, Turno } from './tipos';

/**
 * Abrir turno en la caja (CLAUDE.md, seccion 5): el cajero toca su nombre en
 * la lista de la tablet y escribe su PIN. El nombre identifica, el PIN
 * confirma y la autoridad la tiene el dispositivo.
 */

/** PIN equivocados que bloquean a un usuario. */
export const PIN_EQUIVOCADOS_PARA_BLOQUEAR = 10;

/**
 * El tramo en que se cuentan los PIN equivocados. Es un tramo fijo del reloj
 * —:00, :15, :30, :45—, no "los ultimos quince minutos": el bloqueo se levanta
 * al terminar el tramo, y la caja puede decir a que hora.
 */
export const MINUTOS_DEL_TRAMO_DE_PIN = 15;

const MS_DEL_TRAMO = MINUTOS_DEL_TRAMO_DE_PIN * 60_000;

/** Cuando termina el tramo de PIN en curso: ahi se levanta el bloqueo. */
export function finDelTramoDePin(ahora: Date): Date {
  return new Date((Math.floor(ahora.getTime() / MS_DEL_TRAMO) + 1) * MS_DEL_TRAMO);
}

/** Quien quiere abrir turno, tal como lo ve la caja. */
export interface UsuarioDeCaja {
  id: string;
  negocio_id: string;
  rol: Rol;
  /** Dado de baja: no abre turno, aunque su PIN sea correcto. */
  activo: boolean;
  /** Sin PIN puesto no hay nada que confirmar. */
  tiene_pin: boolean;
}

export interface EntradaDeApertura {
  ahora: Date;
  negocio: Negocio;
  local: Local;
  dispositivo: Dispositivo;
  /** El usuario elegido, o null si no existe o es de otro negocio. */
  usuario: UsuarioDeCaja | null;
  /** Su asignacion al local de la tablet, o null si no la tiene. */
  asignacion: Asignacion | null;
  /** PIN equivocados de ese usuario en el tramo en curso. */
  equivocados: number;
  /**
   * Si el PIN coincide. Lo verifica la api: el hash es infraestructura, y el
   * dominio no recibe el PIN ni su hash.
   */
  pinCorrecto: boolean;
  /** El turno abierto de esa tablet, si hay uno. */
  turnoAbierto: Turno | null;
}

export type DecisionDeApertura =
  | Rechazo
  /** Ese mismo usuario ya tenia el turno abierto: el doble toque no abre otro. */
  | { tipo: 'ya_abierto'; turno_id: string }
  | {
      tipo: 'abrir';
      efecto: {
        dispositivo_id: string;
        usuario_id: string;
        local_id: string;
        /**
         * El turno que estaba abierto y se cierra: el de otro usuario, por
         * cambio de cajero, o uno agotado por inactividad, de quien sea.
         */
        cerrar_turno: { id: string; cerrado_el: Date } | null;
      };
    };

/**
 * Decide si se abre el turno. El orden importa:
 *
 *  1. La tablet y el negocio: si no pueden operar, no hay turno que abrir.
 *  2. El usuario: que exista en este negocio, siga activo, tenga PIN y este
 *     asignado a este local (INV-3). Un solo codigo para todo eso: la lista de
 *     la tablet ya muestra solo a quien puede, asi que llegar aca es raro y la
 *     respuesta es la misma, avisar al dueño.
 *  3. El bloqueo, ANTES que el PIN: un usuario bloqueado no sigue probando,
 *     ni siquiera acertando.
 *  4. El PIN.
 */
export function decidirApertura(e: EntradaDeApertura): DecisionDeApertura {
  const tablet = revisarTablet(e);
  if (tablet !== null) return rechazo(tablet);
  if (e.local.negocio_id !== e.negocio.id) return rechazo('LOCAL_NO_AUTORIZADO');
  if (e.negocio.estado === 'suspendido') return rechazo('NEGOCIO_SUSPENDIDO');

  const { usuario, asignacion } = e;
  if (
    usuario === null ||
    usuario.negocio_id !== e.negocio.id ||
    !usuario.activo ||
    !usuario.tiene_pin ||
    asignacion === null ||
    asignacion.usuario_id !== usuario.id ||
    asignacion.local_id !== e.local.id ||
    !asignacion.activo
  ) {
    return rechazo('USUARIO_NO_HABILITADO');
  }

  if (e.equivocados >= PIN_EQUIVOCADOS_PARA_BLOQUEAR) {
    return rechazo('PIN_BLOQUEADO', { bloqueado_hasta: finDelTramoDePin(e.ahora) });
  }
  if (!e.pinCorrecto) return rechazo('PIN_INCORRECTO');

  const abierto = e.turnoAbierto;
  const agotado = abierto !== null && turnoAgotado(abierto, e.ahora);
  // Un turno agotado no se recupera, ni siquiera por quien lo abrio: se
  // cierra y empieza otro, para que la actividad de hoy no cuelgue del turno
  // de la mañana.
  if (abierto !== null && !agotado && abierto.usuario_id === usuario.id) {
    return { tipo: 'ya_abierto', turno_id: abierto.id };
  }

  return {
    tipo: 'abrir',
    efecto: {
      dispositivo_id: e.dispositivo.id,
      usuario_id: usuario.id,
      local_id: e.local.id,
      cerrar_turno:
        abierto === null
          ? null
          : {
              id: abierto.id,
              // El agotado se cerro cuando se agoto, no ahora.
              cerrado_el: agotado ? finPorInactividad(abierto) : e.ahora,
            },
    },
  };
}
