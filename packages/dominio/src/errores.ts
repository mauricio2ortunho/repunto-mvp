/**
 * Codigos de error del flujo de caja. Son vocabulario del dominio, no strings
 * sueltos: `apps/api` los mapea a HTTP y el panel, a un mensaje que le dice al
 * cajero que hacer.
 *
 * Los ocho primeros son los de CLAUDE.md, seccion 9. Los tres ultimos los pide
 * el flujo y esa lista dice "al menos".
 */
export const CODIGOS_DE_ERROR = [
  /** El prefijo no resuelve, o el TOTP no coincide. Nunca se distingue cual de
   * los dos: distinguirlos permitiria enumerar clientes. */
  'CODIGO_INVALIDO',
  /** Esa ventana de 30 segundos ya se consumio (INV-9). */
  'CODIGO_YA_USADO',
  /** No paso el intervalo minimo del programa desde el ultimo sello. */
  'DEMASIADO_PRONTO',
  /** La tarjeta ya llego a los sellos que pide el programa: hay que canjear. */
  'TARJETA_COMPLETA',
  /** Paso su vencimiento, aunque el cron todavia no la haya marcado. */
  'TARJETA_VENCIDA',
  /** El local no corresponde, esta dado de baja, o el usuario no opera ahi. */
  'LOCAL_NO_AUTORIZADO',
  /** La tablet fue revocada: deja de servir al instante. */
  'DISPOSITIVO_REVOCADO',
  /** El negocio esta suspendido: sus tarjetas quedan congeladas. */
  'NEGOCIO_SUSPENDIDO',
  /** Nadie abrio turno en esa tablet, o el turno ya se cerro. */
  'TURNO_CERRADO',
  /** El negocio no tiene programa vigente o condicion vigente. Es un error del
   * dueño, no del cajero: el mensaje le dice que avise, no que reintente. */
  'PROMO_NO_CONFIGURADA',
  /** La tarjeta no tiene sellos suficientes para el premio. */
  'TARJETA_INCOMPLETA',
  /** El negocio solo permite canjear donde se abrio la tarjeta. */
  'CANJE_EN_OTRO_LOCAL',
] as const;

export type CodigoDeError = (typeof CODIGOS_DE_ERROR)[number];

export interface Rechazo {
  tipo: 'rechazado';
  codigo: CodigoDeError;
}

export function rechazo(codigo: CodigoDeError): Rechazo {
  return { tipo: 'rechazado', codigo };
}
