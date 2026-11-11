import {
  type CodigoDelCliente,
  type DetalleDeTarjeta,
  type Directorio,
  type EstadoDelRegistro,
  type MisTarjetas,
  type RegistroPeticion,
  type RegistroRespuesta,
  type SolicitudNueva,
  type SolicitudRecibida,
  esquemaCodigoDelCliente,
  esquemaDetalleDeTarjeta,
  esquemaDirectorio,
  esquemaEstadoDelRegistro,
  esquemaMisTarjetas,
  esquemaRegistroRespuesta,
  esquemaSolicitudRecibida,
} from '@repunto/contratos';

import { type Respuesta, pedir } from './http';

/**
 * Los endpoints que usa la app, cada uno con el esquema de su respuesta.
 * Ninguno manda un identificador de cliente: el cliente sale del token (INV-1).
 */

/** `POST /registros`. El reintento repite la clave: el ticket se deriva de ella. */
export function registrar(
  cuerpo: RegistroPeticion,
  clave: string,
): Promise<Respuesta<RegistroRespuesta>> {
  return pedir({
    metodo: 'POST',
    ruta: '/registros',
    cuerpo,
    clave,
    esquema: esquemaRegistroRespuesta,
  });
}

/** `GET /registros/mio`, con el ticket como credencial. */
export function miRegistro(
  ticket: string,
  senal?: AbortSignal,
): Promise<Respuesta<EstadoDelRegistro>> {
  return pedir({
    metodo: 'GET',
    ruta: '/registros/mio',
    token: ticket,
    senal,
    esquema: esquemaEstadoDelRegistro,
  });
}

export function misTarjetas(
  token: string,
  senal?: AbortSignal,
): Promise<Respuesta<MisTarjetas>> {
  return pedir({
    metodo: 'GET',
    ruta: '/mis/tarjetas',
    token,
    senal,
    esquema: esquemaMisTarjetas,
  });
}

export function miTarjeta(
  token: string,
  id: string,
  senal?: AbortSignal,
): Promise<Respuesta<DetalleDeTarjeta>> {
  return pedir({
    metodo: 'GET',
    ruta: `/mis/tarjetas/${encodeURIComponent(id)}`,
    token,
    senal,
    esquema: esquemaDetalleDeTarjeta,
  });
}

/** `GET /negocios`, publico: sin token. */
export function negocios(senal?: AbortSignal): Promise<Respuesta<Directorio>> {
  return pedir({
    metodo: 'GET',
    ruta: '/negocios',
    senal,
    esquema: esquemaDirectorio,
  });
}

export function miCodigo(
  token: string,
  senal?: AbortSignal,
): Promise<Respuesta<CodigoDelCliente>> {
  return pedir({
    metodo: 'GET',
    ruta: '/mi/codigo',
    token,
    senal,
    esquema: esquemaCodigoDelCliente,
  });
}

/**
 * `POST /solicitudes`: pedir sumar un negocio. Público y sin clave: el
 * reenvío no crea otra, porque la base admite una sola pendiente por
 * teléfono.
 */
export function pedirSumarNegocio(
  cuerpo: SolicitudNueva,
): Promise<Respuesta<SolicitudRecibida>> {
  return pedir({
    metodo: 'POST',
    ruta: '/solicitudes',
    cuerpo,
    esquema: esquemaSolicitudRecibida,
  });
}
