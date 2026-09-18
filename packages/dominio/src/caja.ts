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
  turno: Turno;
  /** La asignacion del usuario del turno a ese local, o null si no la tiene. */
  asignacion: Asignacion | null;
}

/**
 * Devuelve el codigo de error si la caja no puede operar, o null si puede.
 *
 * El orden importa: primero el equipo, despues el turno, despues la persona.
 * Un local dado de baja o incoherente con el dispositivo es
 * LOCAL_NO_AUTORIZADO; la tablet revocada tiene su propio codigo porque el
 * dueño acaba de revocarla y quiere verlo.
 */
export function revisarCaja(caja: Caja): CodigoDeError | null {
  const { negocio, local, dispositivo, turno, asignacion } = caja;

  if (dispositivo.revocado_el !== null) return 'DISPOSITIVO_REVOCADO';

  // El local sale del dispositivo, nunca del request (INV-2).
  if (local.id !== dispositivo.local_id) return 'LOCAL_NO_AUTORIZADO';
  if (local.negocio_id !== negocio.id) return 'LOCAL_NO_AUTORIZADO';
  if (!local.activo) return 'LOCAL_NO_AUTORIZADO';

  if (turno.dispositivo_id !== dispositivo.id) return 'LOCAL_NO_AUTORIZADO';
  if (turno.local_id !== local.id) return 'LOCAL_NO_AUTORIZADO';
  if (turno.cerrado_el !== null) return 'TURNO_CERRADO';

  // Un cajero solo opera en los locales que tiene asignados, y la asignacion
  // tiene que seguir activa: la FK garantiza que existio, no que siga vigente
  // (INV-3, CLAUDE.md seccion 14).
  if (asignacion === null) return 'LOCAL_NO_AUTORIZADO';
  if (asignacion.usuario_id !== turno.usuario_id) return 'LOCAL_NO_AUTORIZADO';
  if (asignacion.local_id !== local.id) return 'LOCAL_NO_AUTORIZADO';
  if (!asignacion.activo) return 'LOCAL_NO_AUTORIZADO';

  if (negocio.estado === 'suspendido') return 'NEGOCIO_SUSPENDIDO';

  return null;
}
