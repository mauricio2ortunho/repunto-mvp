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

/** Quien opera en el panel. El cliente no es un rol de caja. */
export type Rol = 'dueno' | 'supervisor' | 'cajero';

export interface Turno {
  id: string;
  dispositivo_id: string;
  usuario_id: string;
  local_id: string;
  /**
   * El rol del usuario que abrio el turno. Sale de usuario_negocio, via el
   * turno: nunca del request. Es lo que decide quien puede anular que (seccion
   * 5), igual que el local sale del dispositivo (INV-2).
   */
  rol: Rol;
  /**
   * Si el usuario que abrio el turno sigue activo en el negocio. Sale de
   * usuario_negocio igual que el rol: a un cajero que se fue se le da de baja
   * y, aunque haya dejado su turno abierto, no opera mas.
   */
  usuario_activo: boolean;
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

/**
 * Alguien que escaneo el QR del mostrador y escribio su telefono y su nombre.
 * Todavia no es un cliente: lo es cuando el cajero lo confirma de cuerpo
 * presente, y esa confirmacion reemplaza al codigo de verificacion.
 */
export interface RegistroPendiente {
  id: string;
  /** El local del QR que escaneo. De ahi sale el local del primer sello. */
  local_id: string;
  /** E.164, ya normalizado (INV-20). */
  telefono: string;
  nombre: string;
  estado: 'pendiente' | 'confirmado' | 'descartado';
  /** Pasado este instante ya no se puede confirmar: el cliente se fue. */
  expira_el: Date;
}

/** La tarjeta activa del cliente en el negocio, con la regla que la rige. */
export interface TarjetaEnCurso {
  tarjeta: Tarjeta;
  /** El programa de la tarjeta, que puede ser una version vieja (INV-6). */
  programa: Programa;
  /** Todos sus sellos, anulados incluidos: el progreso se cuenta acá (INV-10). */
  sellos: readonly Sello[];
}
