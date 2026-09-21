import { z } from 'zod';

/**
 * Contratos de la caja: sellar y canjear.
 *
 * El cuerpo lleva solo el codigo que el cliente muestra. Ni negocio, ni local,
 * ni turno, ni cliente: todo eso sale del token del dispositivo y de la base
 * (INV-1, INV-2). Un endpoint que aceptara un identificador de alcance seria
 * un agujero, no una comodidad.
 */

/**
 * Los mismos codigos que `CODIGOS_DE_ERROR` de `@repunto/dominio`, en el mismo
 * orden.
 *
 * Estan repetidos a proposito: los frontends los necesitan para decidir que
 * mostrar, y `contratos` no puede importar `dominio` (CLAUDE.md, seccion 3).
 * No "arreglar" esto importando dominio desde aca: rompe la regla de
 * dependencias. Un test en `apps/api` -el unico paquete que puede ver los dos-
 * falla si las dos listas dejan de coincidir.
 */
export const CODIGOS_DE_ERROR_DE_CAJA = [
  'CODIGO_INVALIDO',
  'CODIGO_YA_USADO',
  'DEMASIADO_PRONTO',
  'TARJETA_COMPLETA',
  'TARJETA_VENCIDA',
  'LOCAL_NO_AUTORIZADO',
  'DISPOSITIVO_REVOCADO',
  'NEGOCIO_SUSPENDIDO',
  'TURNO_CERRADO',
  'PROMO_NO_CONFIGURADA',
  'TARJETA_INCOMPLETA',
  'CANJE_EN_OTRO_LOCAL',
  'TELEFONO_INVALIDO',
  'REGISTRO_NO_ENCONTRADO',
  'REGISTRO_YA_RESUELTO',
  'SELLO_NO_ENCONTRADO',
  'SELLO_YA_ANULADO',
  'ANULACION_NO_PERMITIDA',
  'SELLO_YA_CANJEADO',
] as const;

export type CodigoDeErrorDeCaja = (typeof CODIGOS_DE_ERROR_DE_CAJA)[number];

/**
 * Errores del transporte, no del negocio. No los decide el dominio: son la
 * credencial, la idempotencia y el tope de peticiones.
 */
export const CODIGOS_DE_ERROR_DE_API = [
  /** Falta el token del dispositivo, o no resuelve a ninguno. */
  'TOKEN_INVALIDO',
  /** Falta la cabecera Idempotency-Key en un endpoint que crea algo. */
  'FALTA_IDEMPOTENCY_KEY',
  /** La misma clave llego con otro cuerpo: es un bug del panel, no un reintento. */
  'IDEMPOTENCIA_DISTINTA',
  /** El cuerpo no cumple el esquema. */
  'PETICION_INVALIDA',
  /** Demasiadas peticiones para ese cliente. */
  'TOPE_SUPERADO',
] as const;

export type CodigoDeErrorDeApi = (typeof CODIGOS_DE_ERROR_DE_API)[number];

/**
 * Todo error de la API tiene esta forma. `mensaje` es lo que se le muestra al
 * cajero tal cual: le dice que hacer, no que fallo adentro.
 */
export const esquemaError = z.object({
  codigo: z.enum([...CODIGOS_DE_ERROR_DE_CAJA, ...CODIGOS_DE_ERROR_DE_API]),
  mensaje: z.string().min(1),
});

export type ErrorDeLaApi = z.infer<typeof esquemaError>;

/**
 * Lo que el mensaje necesita y el codigo solo no dice, ya en texto: la hora en
 * La Paz y el nombre del local. Quien llama lo trae formateado -la API lo saca
 * del detalle del rechazo del dominio- asi este paquete no repite ni la zona
 * horaria ni la busqueda del local.
 */
export interface DetalleDelMensaje {
  /** DEMASIADO_PRONTO: `14:30`, hora de La Paz. */
  hora?: string;
  /** CANJE_EN_OTRO_LOCAL: el nombre del local donde se abrio la tarjeta. */
  local?: string;
}

/**
 * El mensaje que ve el cajero. Dice que hacer: pedir el codigo de nuevo,
 * entregar el premio, avisarle al dueno. Nunca nombra tablas, codigos internos
 * ni restricciones.
 */
export function mensajeParaElCajero(
  codigo: CodigoDeErrorDeCaja | CodigoDeErrorDeApi,
  detalle: DetalleDelMensaje = {},
): string {
  switch (codigo) {
    case 'CODIGO_INVALIDO':
      return 'Ese código no es válido. Pedile el que muestra la app en este momento.';
    case 'CODIGO_YA_USADO':
      return 'Ese código ya se usó. Pedile el nuevo, que cambia cada 30 segundos.';
    case 'DEMASIADO_PRONTO':
      return detalle.hora === undefined
        ? 'Ya selló hace poco. Todavía no puede sellar de nuevo.'
        : `Ya selló hace poco. Puede volver a sellar a las ${detalle.hora}.`;
    case 'TARJETA_COMPLETA':
      return 'Ya tiene el premio listo: entregáselo y canjeá la tarjeta.';
    case 'TARJETA_VENCIDA':
      return 'Esa tarjeta venció y el premio ya no se puede entregar.';
    case 'TARJETA_INCOMPLETA':
      return 'Todavía no llega al premio.';
    case 'CANJE_EN_OTRO_LOCAL':
      return detalle.local === undefined
        ? 'El premio se entrega en la sucursal donde abrió la tarjeta.'
        : `El premio se entrega en la sucursal ${detalle.local}.`;
    case 'LOCAL_NO_AUTORIZADO':
      return 'Esta caja no puede sellar acá. Avisá al dueño.';
    case 'DISPOSITIVO_REVOCADO':
      return 'Esta tablet fue dada de baja. Avisá al dueño.';
    case 'NEGOCIO_SUSPENDIDO':
      return 'El negocio está suspendido. Avisá al dueño.';
    case 'TURNO_CERRADO':
      return 'Abrí tu turno con tu PIN antes de sellar.';
    case 'TELEFONO_INVALIDO':
      return 'Ese número no es válido. Revisalo con el cliente: si es boliviano, son ocho dígitos.';
    case 'REGISTRO_NO_ENCONTRADO':
      return 'Ese registro ya no está. Pedile que escanee el QR de nuevo.';
    case 'REGISTRO_YA_RESUELTO':
      return 'Ya lo confirmó alguien del equipo.';
    case 'SELLO_NO_ENCONTRADO':
      return 'Ese sello no está en esta caja.';
    case 'SELLO_YA_ANULADO':
      return 'Ese sello ya estaba anulado.';
    case 'ANULACION_NO_PERMITIDA':
      return 'Solo podés deshacer tu último sello y dentro de los 5 minutos. Pedíselo a tu supervisor.';
    case 'SELLO_YA_CANJEADO':
      return 'Ese sello ya se usó en un premio entregado. Avisá al dueño.';
    case 'PROMO_NO_CONFIGURADA':
      return 'Falta configurar la promo. Avisá al dueño: no se arregla desde la caja.';
    case 'TOKEN_INVALIDO':
      return 'Esta tablet no está vinculada. Avisá al dueño para volver a vincularla.';
    case 'FALTA_IDEMPOTENCY_KEY':
    case 'IDEMPOTENCIA_DISTINTA':
    case 'PETICION_INVALIDA':
      return 'No se pudo procesar. Volvé a intentarlo; si sigue igual, avisá al dueño.';
    case 'TOPE_SUPERADO':
      return 'Demasiados intentos seguidos. Esperá un momento.';
  }
}

/** `POST /caja/sellos`. El cajero tipea lo que el cliente le muestra. */
export const esquemaSellarPeticion = z.object({
  /** `K7Q4M-418329`, o como lo haya tipeado: se normaliza al validarlo. */
  codigo: z.string().min(1).max(40),
});

export type SellarPeticion = z.infer<typeof esquemaSellarPeticion>;

/** Lo que el cajero canta en voz alta. Esa frase es medio producto. */
export const esquemaSellarRespuesta = z.object({
  nombre: z.string(),
  progreso: z.int().nonnegative(),
  faltan: z.int().nonnegative(),
  completa: z.boolean(),
  premio: z.string(),
});

export type SellarRespuesta = z.infer<typeof esquemaSellarRespuesta>;

/**
 * `POST /caja/canjes`. Pide el codigo igual que el sellado: el canje lo
 * confirma el negocio, pero con el cliente presente. Sin su codigo, un cajero
 * podria entregarse el premio de alguien que no esta.
 */
export const esquemaCanjearPeticion = esquemaSellarPeticion;

export type CanjearPeticion = z.infer<typeof esquemaCanjearPeticion>;

export const esquemaCanjearRespuesta = z.object({
  nombre: z.string(),
  premio: z.string(),
  /** Sellos que pasaron a la tarjeta nueva. */
  sobrantes: z.int().nonnegative(),
});

export type CanjearRespuesta = z.infer<typeof esquemaCanjearRespuesta>;

/**
 * `GET /caja/registros`: la lista que el cajero mira mientras el cliente
 * termina de escribir.
 *
 * Va el nombre y los ultimos cuatro digitos, nunca el telefono entero: con
 * tres personas registrandose a la vez, el cajero pregunta "terminado en
 * 4521?" antes de confirmar, y sin eso confirma la fila equivocada. El resto
 * del numero no le hace falta para nada.
 */
export const esquemaRegistroEnCaja = z.object({
  id: z.uuid(),
  nombre: z.string(),
  telefono_final: z.string().length(4),
  creado_el: z.iso.datetime(),
});

export const esquemaRegistrosPendientes = z.object({
  registros: z.array(esquemaRegistroEnCaja),
});

export type RegistroEnCaja = z.infer<typeof esquemaRegistroEnCaja>;
export type RegistrosPendientes = z.infer<typeof esquemaRegistrosPendientes>;

/**
 * `POST /caja/registros/:id/confirmar`. Los dos botones del panel son este
 * mismo endpoint: `sellar` en true es "confirmar y sellar", en false es "solo
 * confirmar". Lo decide el cajero, no el sistema.
 */
export const esquemaConfirmarPeticion = z.object({ sellar: z.boolean() });

export const esquemaConfirmarRespuesta = z.object({
  nombre: z.string(),
  progreso: z.int().nonnegative(),
  faltan: z.int().nonnegative(),
  completa: z.boolean(),
  premio: z.string(),
  /** Si se otorgo un sello en el mismo acto. */
  sello: z.boolean(),
});

export type ConfirmarPeticion = z.infer<typeof esquemaConfirmarPeticion>;
export type ConfirmarRespuesta = z.infer<typeof esquemaConfirmarRespuesta>;

export const esquemaDescartarRespuesta = z.object({
  estado: z.literal('descartado'),
});

export type DescartarRespuesta = z.infer<typeof esquemaDescartarRespuesta>;

/** `POST /caja/sellos/:id/anulacion`: como queda la tarjeta despues. */
export const esquemaAnularRespuesta = z.object({
  nombre: z.string(),
  progreso: z.int().nonnegative(),
  faltan: z.int().nonnegative(),
  completa: z.boolean(),
});

export type AnularRespuesta = z.infer<typeof esquemaAnularRespuesta>;

/**
 * `GET /caja/sellos/recientes`: de donde saca el supervisor cual anular.
 * El cajero ve solo los suyos del turno; el supervisor y el dueño, los del
 * local en las ultimas 24 horas. Un cajero nunca ve la base de clientes.
 */
export const esquemaSelloReciente = z.object({
  id: z.uuid(),
  /** Nombre del cliente al que se le otorgo. */
  nombre: z.string(),
  /** Quien lo otorgo. */
  cajero: z.string(),
  creado_el: z.iso.datetime(),
  anulado: z.boolean(),
});

export const esquemaSellosRecientes = z.object({
  sellos: z.array(esquemaSelloReciente),
});

export type SelloReciente = z.infer<typeof esquemaSelloReciente>;
export type SellosRecientes = z.infer<typeof esquemaSellosRecientes>;
