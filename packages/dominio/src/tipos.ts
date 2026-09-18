/**
 * El estado ya leido, en datos planos. Ninguna de estas formas conoce Prisma:
 * son lo que `apps/api` trae de la base y le pasa al dominio.
 *
 * Los campos que espejan columnas van en snake_case, como en la base, para que
 * no haga falta traducir nada en el medio.
 */

export interface Negocio {
  id: string;
  estado: 'activo' | 'suspendido';
  /** Falso: el premio solo se canjea en el local donde se abrio la tarjeta. */
  canje_cualquier_local: boolean;
}

export interface Local {
  id: string;
  negocio_id: string;
  activo: boolean;
}

export interface Dispositivo {
  id: string;
  local_id: string;
  revocado_el: Date | null;
}

export interface Turno {
  id: string;
  dispositivo_id: string;
  usuario_id: string;
  local_id: string;
  cerrado_el: Date | null;
}

/** Fila de usuario_local: quien opera donde. */
export interface Asignacion {
  usuario_id: string;
  local_id: string;
  activo: boolean;
}

export interface Programa {
  id: string;
  negocio_id: string;
  sellos_requeridos: number;
  premio: string;
  /** Nulo: la tarjeta no vence. */
  vigencia_meses: number | null;
  horas_entre_sellos: number;
}

export interface Condicion {
  id: string;
  negocio_id: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  /** Prefijo que el cliente muestra en caja. Cinco caracteres, sin ambiguos. */
  codigo_publico: string;
  /** Secreto del codigo rotativo, en base32. Llega descifrado. Nunca al log. */
  semilla_totp: string;
}

export interface Tarjeta {
  id: string;
  cliente_id: string;
  programa_id: string;
  negocio_id: string;
  /** Donde se abrio. Es "donde se acumulo" cuando el negocio limita el canje. */
  local_alta_id: string;
  estado: 'activa' | 'canjeada' | 'vencida';
  reloj_desde: Date | null;
  vence_el: Date | null;
}

export interface Sello {
  id: string;
  tarjeta_id: string;
  creado_el: Date;
  anulado: boolean;
}

/** La tarjeta activa del cliente en el negocio, con la regla que la rige. */
export interface TarjetaEnCurso {
  tarjeta: Tarjeta;
  /** El programa de la tarjeta, que puede ser una version vieja (INV-6). */
  programa: Programa;
  /** Todos sus sellos, anulados incluidos: el progreso se cuenta acá (INV-10). */
  sellos: readonly Sello[];
}
