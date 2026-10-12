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

/**
 * Si el negocio tiene la promo configurada, visto desde la caja: hacen falta
 * una condicion vigente y un programa vigente, que es exactamente lo que exige
 * `planDeSellado`. Van como booleanos y no como las filas enteras porque la
 * pregunta es si existen, y quien llama no siempre las trae completas.
 */
export interface PromoConfigurada {
  condicionVigente: boolean;
  programaVigente: boolean;
}

/**
 * Lo mismo que `revisarCaja` mas la promo: la respuesta entera a "¿esta caja
 * puede sellar ahora mismo?".
 *
 * Existe porque sin promo configurada la caja tampoco opera —sellar, canjear y
 * confirmar rechazan con PROMO_NO_CONFIGURADA— y quien pregunta por el estado
 * no tiene por que deducirlo de que el premio venga nulo. Es la misma regla
 * que aplica `planDeSellado`, escrita una sola vez.
 *
 * El orden importa: primero el equipo y el turno. Una tablet revocada con la
 * promo a medio configurar reporta la tablet, que es lo urgente y lo que el
 * dueño acaba de hacer.
 */
export function revisarCajaParaSellar(
  caja: Caja,
  promo: PromoConfigurada,
): RevisionDeCaja {
  const revision = revisarCaja(caja);
  if (!revision.valido) return revision;

  if (!promo.condicionVigente || !promo.programaVigente) {
    return { valido: false, codigo: 'PROMO_NO_CONFIGURADA' };
  }
  return revision;
}
