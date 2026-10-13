/**
 * Codigos de error del flujo de caja. Son vocabulario del dominio, no strings
 * sueltos: `apps/api` los mapea a HTTP y el panel, a un mensaje que le dice al
 * cajero que hacer.
 *
 * Los ocho primeros son los de CLAUDE.md, seccion 9. Los cuatro ultimos los
 * pide el flujo y esa lista dice "al menos".
 *
 * La lista esta repetida en `packages/contratos` porque los frontends la
 * necesitan y contratos no puede importar dominio (CLAUDE.md, seccion 3). Un
 * test en apps/api —el unico que puede ver los dos paquetes— falla si dejan de
 * coincidir.
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
  /** Solo del canje: un premio no se entrega sobre una tarjeta vencida. Al
   * sellar, una tarjeta vencida no rechaza nada: se cierra y se abre una nueva
   * (especificacion funcional, seccion 5). */
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

  // Alta del cliente en el mostrador.
  /** Lo tipeado no es un telefono que se pueda normalizar a E.164 (INV-20). */
  'TELEFONO_INVALIDO',
  /** No existe, no es de este local, o ya vencio. Los tres dan lo mismo: si se
   * distinguieran, desde una tablet se podria averiguar que registros hay en
   * otra sucursal. */
  'REGISTRO_NO_ENCONTRADO',
  /** Otro cajero del local lo confirmo o lo descarto primero. */
  'REGISTRO_YA_RESUELTO',
  /** Ese telefono ya tiene un registro esperando en ese local, hecho desde
   * otro equipo. No se reemplaza: si se reemplazara, cualquiera que conozca el
   * telefono de quien se esta registrando se quedaria con su sesion. */
  'REGISTRO_EN_CURSO',

  // Anulacion.
  /** No existe, o no es de este local. */
  'SELLO_NO_ENCONTRADO',
  /** Ese sello ya estaba anulado. */
  'SELLO_YA_ANULADO',
  /** El cajero quiere anular algo que no es su ultimo sello, o que ya paso los
   * cinco minutos, o que es de otro cajero. Un solo codigo para los tres: al
   * cajero le sirve la misma frase, y separarlos le diria de quien es cada
   * sello del local. */
  'ANULACION_NO_PERMITIDA',
  /** El premio que incluia ese sello ya se entrego. */
  'SELLO_YA_CANJEADO',

  // Tarjetas del cliente.
  /** No existe, o es de otro cliente. Los dos dan lo mismo: si se
   * distinguieran, probando ids se podria averiguar cuales existen. */
  'TARJETA_NO_ENCONTRADA',
] as const;

export type CodigoDeError = (typeof CODIGOS_DE_ERROR)[number];

/**
 * Lo que el mensaje al cajero necesita y el codigo solo no dice. Lo calcula el
 * dominio, que es quien conoce la regla: si lo recalculara `apps/api` para
 * armar el texto, la regla viviria en dos lados.
 */
export interface DetalleDeRechazo {
  /** DEMASIADO_PRONTO: desde cuando el cliente puede volver a sellar. */
  puede_sellar_desde?: Date;
  /** CANJE_EN_OTRO_LOCAL: el local donde se abrio la tarjeta. */
  local_alta_id?: string;
}

export interface Rechazo {
  tipo: 'rechazado';
  codigo: CodigoDeError;
  detalle?: DetalleDeRechazo;
}

export function rechazo(codigo: CodigoDeError, detalle?: DetalleDeRechazo): Rechazo {
  return detalle === undefined
    ? { tipo: 'rechazado', codigo }
    : { tipo: 'rechazado', codigo, detalle };
}
