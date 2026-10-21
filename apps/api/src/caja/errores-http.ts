import { HttpException } from '@nestjs/common';
import {
  type CodigoDeErrorDeApi,
  type DetalleDelMensaje,
  mensajeParaElCajero,
} from '@repunto/contratos';
import { type CodigoDeError, type Rechazo, ZONA_HORARIA } from '@repunto/dominio';

import type { EstadoDeCaja } from './lectura';

/**
 * De codigo de error a respuesta HTTP.
 *
 * El codigo lo decide el dominio; aca solo se elige el estado y se arma el
 * mensaje, que sale de `@repunto/contratos` para que el panel pueda mostrar el
 * mismo texto sin esperar la respuesta.
 *
 * El criterio de los estados: 403 cuando el problema es de permiso o de
 * alcance —hay que avisarle al dueño—, 422 cuando lo que llego esta mal
 * formado, y 409 cuando el pedido es valido pero el estado no lo permite, que
 * es casi todo el flujo de caja.
 */

const ESTADO_DE_CAJA: Record<CodigoDeError, number> = {
  CODIGO_INVALIDO: 422,
  CODIGO_YA_USADO: 409,
  DEMASIADO_PRONTO: 409,
  TARJETA_COMPLETA: 409,
  TARJETA_VENCIDA: 409,
  TARJETA_INCOMPLETA: 409,
  CANJE_EN_OTRO_LOCAL: 409,
  LOCAL_NO_AUTORIZADO: 403,
  DISPOSITIVO_REVOCADO: 403,
  NEGOCIO_SUSPENDIDO: 403,
  TURNO_CERRADO: 409,
  PROMO_NO_CONFIGURADA: 409,
  TELEFONO_INVALIDO: 422,
  // 404 y no 403: para esta caja, un registro de otra sucursal no existe.
  REGISTRO_NO_ENCONTRADO: 404,
  REGISTRO_YA_RESUELTO: 409,
  REGISTRO_EN_CURSO: 409,
  SELLO_NO_ENCONTRADO: 404,
  SELLO_YA_ANULADO: 409,
  ANULACION_NO_PERMITIDA: 403,
  SELLO_YA_CANJEADO: 409,
  // 404 y no 403: una tarjeta de otro cliente, para este, no existe.
  TARJETA_NO_ENCONTRADA: 404,
  USUARIO_NO_HABILITADO: 403,
  // 422 y no 401: en esta api, 401 es "la tablet no tiene credencial".
  PIN_INCORRECTO: 422,
  PIN_BLOQUEADO: 429,
  VINCULACION_INVALIDA: 422,
};

const ESTADO_DE_API: Record<CodigoDeErrorDeApi, number> = {
  TOKEN_INVALIDO: 401,
  FALTA_IDEMPOTENCY_KEY: 400,
  IDEMPOTENCIA_DISTINTA: 422,
  PETICION_INVALIDA: 422,
  TOPE_SUPERADO: 429,
};

/** Errores del transporte: credencial, idempotencia, tope de peticiones. */
export function errorDeApi(codigo: CodigoDeErrorDeApi): HttpException {
  return new HttpException(
    { codigo, mensaje: mensajeParaElCajero(codigo) },
    ESTADO_DE_API[codigo],
  );
}

/**
 * El rechazo del dominio, ya en HTTP. El detalle del rechazo se traduce a
 * texto —la hora en La Paz, el nombre del local— y de ahi sale el mensaje.
 *
 * Que este archivo compile es, de paso, la prueba de que las dos listas de
 * codigos siguen coincidiendo: si el dominio agrega uno y contratos no,
 * `mensajeParaElCajero` deja de aceptarlo.
 */
export function errorDeRechazo(
  rechazo: Rechazo,
  estado: EstadoDeCaja | null,
): HttpException {
  const detalle: DetalleDelMensaje = {};

  if (rechazo.detalle?.puede_sellar_desde !== undefined) {
    detalle.hora = horaEnLaPaz(rechazo.detalle.puede_sellar_desde);
  }
  if (rechazo.detalle?.bloqueado_hasta !== undefined) {
    detalle.hora = horaEnLaPaz(rechazo.detalle.bloqueado_hasta);
  }
  // El dominio dice de que local habla; el nombre lo pone la lectura.
  if (
    rechazo.detalle?.local_alta_id !== undefined &&
    estado?.enCurso?.tarjeta.local_alta_id === rechazo.detalle.local_alta_id &&
    estado.localDeLaTarjeta !== null
  ) {
    detalle.local = estado.localDeLaTarjeta;
  }

  return new HttpException(
    { codigo: rechazo.codigo, mensaje: mensajeParaElCajero(rechazo.codigo, detalle) },
    ESTADO_DE_CAJA[rechazo.codigo],
  );
}

/** `14:30`, hora de La Paz. Todo instante se guarda en UTC (INV-21). */
function horaEnLaPaz(instante: Date): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instante);
}

/**
 * El codigo de error que lleva una respuesta de la api, si lleva uno. Para
 * los topes que cuentan fracasos: se cuentan despues de que la transaccion se
 * deshizo, mirando con que codigo fallo.
 */
export function codigoDelError(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const cuerpo = error.getResponse();
  if (typeof cuerpo !== 'object' || !('codigo' in cuerpo)) return null;
  return typeof cuerpo.codigo === 'string' ? cuerpo.codigo : null;
}
