import { type CodigoDeError } from './errores';
import type { Asignacion, Dispositivo, Local, Negocio, Turno } from './tipos';

/**
 * Lo que comparten sellar y canjear: de que equipo, en que local y con que
 * turno se esta operando. Es el paso 1 de la seccion 5 de la especificacion.
 */
export interface Caja {
  negocio: Negocio;
  local: Local;
  dispositivo: Dispositivo;
  /** El turno abierto de esa tablet, o null si nadie abrio ninguno. */
  turno: Turno | null;
  /** La asignacion del usuario del turno a ese local, o null si no la tiene. */
  asignacion: Asignacion | null;
}

/**
 * Resultado de revisar la caja. Cuando puede operar trae el turno, que ya
 * quedo verificado: quien decide no tiene que preguntarse otra vez si habia.
 */
export type RevisionDeCaja =
  { valido: true; turno: Turno } | { valido: false; codigo: CodigoDeError };

/**
 * Dice si la caja puede operar, y con que turno.
 *
 * El orden importa: primero el equipo, despues el turno, despues la persona.
 * Un local dado de baja o incoherente con el dispositivo es
 * LOCAL_NO_AUTORIZADO; la tablet revocada tiene su propio codigo porque el
 * dueño acaba de revocarla y quiere verlo.
 */
export function revisarCaja(caja: Caja): RevisionDeCaja {
  const { negocio, local, dispositivo, turno, asignacion } = caja;

  const no = (codigo: CodigoDeError): RevisionDeCaja => ({ valido: false, codigo });

  if (dispositivo.revocado_el !== null) return no('DISPOSITIVO_REVOCADO');

  // El local sale del dispositivo, nunca del request (INV-2).
  if (local.id !== dispositivo.local_id) return no('LOCAL_NO_AUTORIZADO');
  if (local.negocio_id !== negocio.id) return no('LOCAL_NO_AUTORIZADO');
  if (!local.activo) return no('LOCAL_NO_AUTORIZADO');

  // Nadie abrio turno en esa tablet, o el que habia ya se cerro: el mismo
  // codigo para los dos casos, porque la respuesta del cajero es la misma.
  if (turno === null) return no('TURNO_CERRADO');
  if (turno.dispositivo_id !== dispositivo.id) return no('LOCAL_NO_AUTORIZADO');
  if (turno.local_id !== local.id) return no('LOCAL_NO_AUTORIZADO');
  if (turno.cerrado_el !== null) return no('TURNO_CERRADO');

  // Un cajero solo opera en los locales que tiene asignados, y la asignacion
  // tiene que seguir activa: la FK garantiza que existio, no que siga vigente
  // (INV-3, CLAUDE.md seccion 14).
  if (asignacion === null) return no('LOCAL_NO_AUTORIZADO');
  if (asignacion.usuario_id !== turno.usuario_id) return no('LOCAL_NO_AUTORIZADO');
  if (asignacion.local_id !== local.id) return no('LOCAL_NO_AUTORIZADO');
  if (!asignacion.activo) return no('LOCAL_NO_AUTORIZADO');

  if (negocio.estado === 'suspendido') return no('NEGOCIO_SUSPENDIDO');

  return { valido: true, turno };
}
