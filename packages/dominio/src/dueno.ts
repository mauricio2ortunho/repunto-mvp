import { type Rechazo, rechazo } from './errores';

/**
 * Entrar al panel del dueño (CLAUDE.md, sección 5). Mientras no exista
 * WhatsApp, el código de un solo uso lo genera el admin desde la ficha del
 * negocio y se lo pasa al dueño; cuando exista, le llega solo. El canje del
 * código por la sesión es el mismo de cualquier forma.
 *
 * El código tiene el formato del de vinculación de una tablet —ocho
 * caracteres sin ambiguos, se dicta y se tipea—, así que se genera y se
 * normaliza con las mismas funciones (`codigoDeVinculacionDesde`,
 * `normalizarCodigoDeVinculacion`).
 */

/**
 * Cuánto dura un código de entrada sin usarse. Más que el del admin (15
 * minutos): el admin se lo manda por WhatsApp y el dueño lo abre cuando
 * puede. Sigue siendo de un solo uso.
 */
export const HORAS_DE_ENTRADA_DE_DUENO = 24;

/**
 * Cuántos días sin usarse aguanta la sesión del dueño. Más que la del admin
 * (7): el dueño entra una o dos veces por semana desde su celular, y con 7
 * días le pediría un código casi cada vez. Cada pedido la renueva.
 */
export const DIAS_DE_SESION_DE_DUENO = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** El código tal como está en la base. */
export interface EntradaDeDueno {
  id: string;
  usuario_id: string;
  expira_el: Date;
  usado_el: Date | null;
  /** Si lo dieron de baja después de generar el código, deja de servir. */
  usuario_activo: boolean;
}

export type DecisionDeEntradaDeDueno =
  Rechazo | { tipo: 'entrar'; efecto: { entrada_id: string; usuario_id: string } };

/**
 * Decide si el código abre una sesión. Uno que no existe, ya usado, vencido o
 * de un dueño dado de baja responden igual: distinguirlos le diría a quien
 * prueba códigos cuáles existen.
 */
export function decidirEntradaDeDueno(e: {
  ahora: Date;
  /** Null si no hay ningún código así. */
  entrada: EntradaDeDueno | null;
}): DecisionDeEntradaDeDueno {
  const v = e.entrada;
  if (
    v === null ||
    v.usado_el !== null ||
    v.expira_el.getTime() <= e.ahora.getTime() ||
    !v.usuario_activo
  ) {
    return rechazo('ENTRADA_INVALIDA');
  }
  return { tipo: 'entrar', efecto: { entrada_id: v.id, usuario_id: v.usuario_id } };
}

/** La sesión tal como está en la base. */
export interface SesionDeDueno {
  ultimo_acceso: Date;
  revocada_el: Date | null;
  usuario_activo: boolean;
}

/**
 * Si la sesión sigue sirviendo. Revocada, de un dueño dado de baja, o sin uso
 * durante DIAS_DE_SESION_DE_DUENO, no: el panel vuelve a pedir el código.
 */
export function sesionDeDuenoVigente(sesion: SesionDeDueno, ahora: Date): boolean {
  if (sesion.revocada_el !== null || !sesion.usuario_activo) return false;
  const vence = sesion.ultimo_acceso.getTime() + DIAS_DE_SESION_DE_DUENO * MS_POR_DIA;
  return ahora.getTime() < vence;
}
