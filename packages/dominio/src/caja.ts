import { type CodigoDeError } from './errores';
import type { Asignacion, Dispositivo, Local, Negocio, Turno } from './tipos';

/**
 * Lo que comparten sellar y canjear: de que equipo, en que local y con que
 * turno se esta operando. Es el paso 1 de la seccion 5 de la especificacion.
 */
export interface Caja {
  /** El reloj, para saber si el turno se agoto por inactividad. */
  ahora: Date;
  negocio: Negocio;
  local: Local;
  dispositivo: Dispositivo;
  /** El turno abierto de esa tablet, o null si nadie abrio ninguno. */
  turno: Turno | null;
  /** La asignacion del usuario del turno a ese local, o null si no la tiene. */
  asignacion: Asignacion | null;
}

/**
 * Minutos sin sellar ni canjear despues de los cuales el turno se cierra
 * solo. Lo que cuenta es la actividad del turno, no las consultas: el panel
 * pregunta por el estado cada pocos segundos aunque nadie lo toque.
 */
export const MINUTOS_DE_INACTIVIDAD_DEL_TURNO = 60;

/**
 * El instante en que el turno se agota si nadie hace nada. Es tambien el
 * `cerrado_el` que se le pone al cerrarlo: el momento real, no el momento en
 * que alguien se dio cuenta.
 */
export function finPorInactividad(turno: Pick<Turno, 'ultima_actividad'>): Date {
  return new Date(
    turno.ultima_actividad.getTime() + MINUTOS_DE_INACTIVIDAD_DEL_TURNO * 60_000,
  );
}

/** Si el turno ya paso su hora sin actividad. Justo en el limite, ya paso. */
export function turnoAgotado(
  turno: Pick<Turno, 'ultima_actividad'>,
  ahora: Date,
): boolean {
  return ahora.getTime() >= finPorInactividad(turno).getTime();
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
  const { ahora, negocio, local, dispositivo, turno, asignacion } = caja;

  const no = (codigo: CodigoDeError): RevisionDeCaja => ({ valido: false, codigo });

  const tablet = revisarTablet({ dispositivo, local });
  if (tablet !== null) return no(tablet);
  if (local.negocio_id !== negocio.id) return no('LOCAL_NO_AUTORIZADO');

  // Nadie abrio turno en esa tablet, o el que habia ya se cerro: el mismo
  // codigo para los dos casos, porque la respuesta del cajero es la misma.
  if (turno === null) return no('TURNO_CERRADO');
  if (turno.dispositivo_id !== dispositivo.id) return no('LOCAL_NO_AUTORIZADO');
  if (turno.local_id !== local.id) return no('LOCAL_NO_AUTORIZADO');
  if (turno.cerrado_el !== null) return no('TURNO_CERRADO');
  // Una hora sin sellar ni canjear: quien lo abrio puede haberse ido. Que se
  // cierre en la base es otra cosa, y llega despues; para la caja ya esta
  // cerrado.
  if (turnoAgotado(turno, ahora)) return no('TURNO_CERRADO');
  // Dado de baja con el turno abierto: para la caja, ese turno ya no existe.
  // Lo que hay que hacer es que otra persona abra el suyo.
  if (!turno.usuario_activo) return no('TURNO_CERRADO');

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
 * La primera mitad de `revisarCaja`: si el equipo mismo puede seguir
 * operando, antes de mirar turno o persona. Devuelve el codigo del rechazo, o
 * null si la tablet esta habilitada.
 *
 * Existe aparte porque las lecturas de la caja —la lista de registros, los
 * sellos recientes— no necesitan turno, pero una tablet revocada tampoco las
 * puede leer: la perdieron, y lo que muestran son nombres de clientes.
 */
export function revisarTablet({
  dispositivo,
  local,
}: Pick<Caja, 'dispositivo' | 'local'>): CodigoDeError | null {
  if (dispositivo.revocado_el !== null) return 'DISPOSITIVO_REVOCADO';

  // El local sale del dispositivo, nunca del request (INV-2).
  if (local.id !== dispositivo.local_id) return 'LOCAL_NO_AUTORIZADO';
  if (!local.activo) return 'LOCAL_NO_AUTORIZADO';
  return null;
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
