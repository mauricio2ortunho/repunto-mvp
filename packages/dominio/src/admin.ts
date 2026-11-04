import { type Rechazo, rechazo } from './errores';

/**
 * Entrar al panel de administracion (CLAUDE.md, seccion 5). Mientras no exista
 * la verificacion por correo o SMS, el codigo de un solo uso lo da la terminal
 * (`pnpm admin entrar`); el canje del codigo por la sesion es el mismo de
 * cualquier forma.
 *
 * El codigo tiene el formato del de vinculacion de una tablet —ocho
 * caracteres sin ambiguos, se dicta y se tipea—, asi que se genera y se
 * normaliza con las mismas funciones (`codigoDeVinculacionDesde`,
 * `normalizarCodigoDeVinculacion`).
 */

/** Cuanto dura un codigo de entrada sin usarse. */
export const MINUTOS_DE_ENTRADA_DE_ADMIN = 15;

/**
 * Cuantos dias sin usarse aguanta una sesion de admin. A diferencia de la
 * tablet, vence: con ella se crean y suspenden negocios, y no conviene que
 * quede abierta para siempre en una computadora olvidada. Cada pedido la
 * renueva, asi que quien la usa a diario no la ve vencer.
 */
export const DIAS_DE_SESION_DE_ADMIN = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** El codigo tal como esta en la base. */
export interface EntradaDeAdmin {
  id: string;
  admin_id: string;
  expira_el: Date;
  usado_el: Date | null;
  /** Si lo dieron de baja despues de generar el codigo, deja de servir. */
  admin_activo: boolean;
}

export type DecisionDeEntradaDeAdmin =
  Rechazo | { tipo: 'entrar'; efecto: { entrada_id: string; admin_id: string } };

/**
 * Decide si el codigo abre una sesion. Uno que no existe, ya usado, vencido o
 * de un admin dado de baja responden igual: distinguirlos le diria a quien
 * prueba codigos cuales existen.
 */
export function decidirEntradaDeAdmin(e: {
  ahora: Date;
  /** Null si no hay ningun codigo asi. */
  entrada: EntradaDeAdmin | null;
}): DecisionDeEntradaDeAdmin {
  const v = e.entrada;
  if (
    v === null ||
    v.usado_el !== null ||
    v.expira_el.getTime() <= e.ahora.getTime() ||
    !v.admin_activo
  ) {
    return rechazo('ENTRADA_INVALIDA');
  }
  return { tipo: 'entrar', efecto: { entrada_id: v.id, admin_id: v.admin_id } };
}

/** La sesion tal como esta en la base. */
export interface SesionDeAdmin {
  ultimo_acceso: Date;
  revocada_el: Date | null;
  admin_activo: boolean;
}

/**
 * Si la sesion sigue sirviendo. Revocada, de un admin dado de baja, o sin uso
 * durante DIAS_DE_SESION_DE_ADMIN, no: el panel vuelve a pedir el codigo.
 */
export function sesionDeAdminVigente(sesion: SesionDeAdmin, ahora: Date): boolean {
  if (sesion.revocada_el !== null || !sesion.admin_activo) return false;
  const vence = sesion.ultimo_acceso.getTime() + DIAS_DE_SESION_DE_ADMIN * MS_POR_DIA;
  return ahora.getTime() < vence;
}
