import { ALFABETO_CODIGO_PUBLICO } from './codigo';
import { type Rechazo, rechazo } from './errores';
import type { Local } from './tipos';

/**
 * Vincular una tablet a su local (CLAUDE.md, seccion 5): alguien autorizado
 * genera un codigo de un solo uso, quien instala la tablet lo escribe, y la
 * tablet recibe su sesion, que no vence hasta que se revoque.
 */

/** Cuanto dura un codigo de vinculacion sin usarse. */
export const MINUTOS_DE_VINCULACION = 15;

/** Ocho caracteres: unas 500 mil millones de combinaciones. */
export const LARGO_CODIGO_DE_VINCULACION = 8;

/**
 * Convierte bytes al azar en un codigo de vinculacion, con el mismo alfabeto
 * sin caracteres ambiguos que el codigo del cliente: se dicta y se tipea. La
 * aleatoriedad la pone quien llama, asi esto sigue siendo puro.
 */
export function codigoDeVinculacionDesde(bytes: Uint8Array): string {
  if (bytes.length < LARGO_CODIGO_DE_VINCULACION) {
    throw new Error(`Hacen falta ${LARGO_CODIGO_DE_VINCULACION} bytes para un codigo.`);
  }
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO_DE_VINCULACION; i += 1) {
    const byte = bytes[i] ?? 0;
    codigo += ALFABETO_CODIGO_PUBLICO[byte % ALFABETO_CODIGO_PUBLICO.length];
  }
  return codigo;
}

/**
 * Lo tipeado, en la forma en que se guarda: mayusculas, sin espacios ni
 * guiones. Null si no tiene forma de codigo, y ahi ni se consulta la base.
 */
export function normalizarCodigoDeVinculacion(tipeado: string): string | null {
  const codigo = tipeado.toUpperCase().replace(/[\s-]/g, '');
  if (codigo.length !== LARGO_CODIGO_DE_VINCULACION) return null;
  if (![...codigo].every((letra) => ALFABETO_CODIGO_PUBLICO.includes(letra))) return null;
  return codigo;
}

/** `K7QM4R8T` -> `K7QM-4R8T`: en dos mitades se dicta mejor. */
export function formatearCodigoDeVinculacion(codigo: string): string {
  const mitad = LARGO_CODIGO_DE_VINCULACION / 2;
  return `${codigo.slice(0, mitad)}-${codigo.slice(mitad)}`;
}

/** El codigo tal como esta en la base. */
export interface VinculacionPendiente {
  id: string;
  local_id: string;
  expira_el: Date;
  usado_el: Date | null;
  /**
   * Quien lo genero —el usuario del negocio o el admin— sigue activo. Si lo
   * dieron de baja despues de generarlo, el codigo deja de servir.
   */
  creador_activo: boolean;
}

export interface EntradaDeVinculacion {
  ahora: Date;
  /** Null si no hay ningun codigo asi. */
  vinculacion: VinculacionPendiente | null;
  /** El local del codigo. */
  local: Local | null;
}

export type DecisionDeVinculacion =
  Rechazo | { tipo: 'vincular'; efecto: { vinculacion_id: string; local_id: string } };

/**
 * Decide si la tablet se vincula. Un codigo que no existe, ya usado, vencido o
 * de alguien dado de baja responden igual: distinguirlos le diria a quien
 * prueba codigos cuales existen.
 */
export function decidirVinculacion(e: EntradaDeVinculacion): DecisionDeVinculacion {
  const v = e.vinculacion;
  if (
    v === null ||
    v.usado_el !== null ||
    v.expira_el.getTime() <= e.ahora.getTime() ||
    !v.creador_activo
  ) {
    return rechazo('VINCULACION_INVALIDA');
  }

  // El local del codigo existe (lo exige la FK); dado de baja, no se instala
  // una caja nueva ahi.
  if (e.local === null || e.local.id !== v.local_id || !e.local.activo) {
    return rechazo('LOCAL_NO_AUTORIZADO');
  }

  return { tipo: 'vincular', efecto: { vinculacion_id: v.id, local_id: v.local_id } };
}
