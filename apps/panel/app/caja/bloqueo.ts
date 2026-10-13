import { mensajeParaElCajero } from '@repunto/contratos';
import type { CodigoDeError } from '../../lib/api/http';

/**
 * Como se muestra una caja que no puede operar.
 *
 * El criterio no es si es un error, sino quien lo resuelve:
 *
 * - 'instruccion': lo resuelve el cajero ahi mismo. TURNO_CERRADO es el
 *   estado de todas las mananas -llega, toca su nombre, escribe el PIN- y va
 *   neutro, como cualquier otra tarjeta. Pintarlo de rojo a diario entrena al
 *   equipo a ignorar el rojo justo el dia que importa.
 *
 * - 'alarma': nadie en el mostrador lo puede resolver; el mensaje termina en
 *   "avisa al dueno". Tablet dada de baja o sin vincular, negocio suspendido,
 *   local no autorizado, promo sin configurar. Fondo de alerta.
 *
 * Un codigo que no este en la lista va como alarma: si el mostrador no sabe
 * resolverlo, lo que corresponde es avisar.
 */
export type TonoDeBloqueo = 'instruccion' | 'alarma';

export interface Bloqueo {
  codigo: CodigoDeError;
  /** Ya escrito para el cajero. */
  mensaje: string;
  tono: TonoDeBloqueo;
}

const SE_RESUELVEN_EN_EL_MOSTRADOR: ReadonlySet<CodigoDeError> = new Set([
  'TURNO_CERRADO',
]);

export function tonoDeBloqueo(codigo: CodigoDeError): TonoDeBloqueo {
  return SE_RESUELVEN_EN_EL_MOSTRADOR.has(codigo) ? 'instruccion' : 'alarma';
}

/** `mensaje` es el que mando la API; si no hay, el de contratos para ese codigo. */
export function crearBloqueo(codigo: CodigoDeError, mensaje?: string): Bloqueo {
  return {
    codigo,
    mensaje: mensaje ?? mensajeParaElCajero(codigo),
    tono: tonoDeBloqueo(codigo),
  };
}
