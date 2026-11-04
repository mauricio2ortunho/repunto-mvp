import {
  type AdminActual,
  type EntrarComoAdminPeticion,
  type EntrarComoAdminRespuesta,
  type CondicionCambiada,
  type CondicionNueva,
  type DatosDelNegocio,
  type EstadoDelNegocio,
  type FichaDelNegocio,
  type NegocioCreado,
  type NegocioNuevo,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  type ProgramaNuevo,
  esquemaAdminActual,
  esquemaCondicionCambiada,
  esquemaEntrarComoAdminRespuesta,
  esquemaEstadoDelNegocio,
  esquemaFichaDelNegocio,
  esquemaNegocioCreado,
  esquemaNegociosDelAdmin,
  esquemaProgramaCambiado,
} from '@repunto/contratos';

import { sesionDeAdmin } from '../sesion-de-admin';
import { type CausaIncierta, type Fallo, type Respuesta, pedir } from './http';

/**
 * Los endpoints del panel de administracion. Cada uno dice que credencial
 * lleva: la entrada ninguna, el resto la sesion del admin. Nunca la de la
 * tablet.
 */

export function entrar(
  peticion: EntrarComoAdminPeticion,
): Promise<Respuesta<EntrarComoAdminRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: '/admin/sesion', cuerpo: peticion, token: null },
    esquemaEntrarComoAdminRespuesta,
  );
}

export function adminActual(senal?: AbortSignal): Promise<Respuesta<AdminActual>> {
  return pedir(
    { metodo: 'GET', ruta: '/admin/yo', senal, token: sesionDeAdmin().token() },
    esquemaAdminActual,
  );
}

/** Responde 204, sin cuerpo: cualquier 2xx alcanza. */
export function cerrarSesion(): Promise<Respuesta<unknown>> {
  return pedir(
    { metodo: 'POST', ruta: '/admin/sesion/cierre', token: sesionDeAdmin().token() },
    { safeParse: (datos: unknown) => ({ success: true as const, data: datos }) },
  );
}

export function negocios(senal?: AbortSignal): Promise<Respuesta<NegociosDelAdmin>> {
  return pedir(
    { metodo: 'GET', ruta: '/admin/negocios', senal, token: sesionDeAdmin().token() },
    esquemaNegociosDelAdmin,
  );
}

/**
 * El alta. La clave la decide quien llama: la misma mientras no se sepa si el
 * alta paso, para que el reintento no cree dos negocios.
 */
export function crearNegocio(
  peticion: NegocioNuevo,
  clave: string,
): Promise<Respuesta<NegocioCreado>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: '/admin/negocios',
      cuerpo: peticion,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaNegocioCreado,
  );
}

export function ficha(
  id: string,
  senal?: AbortSignal,
): Promise<Respuesta<FichaDelNegocio>> {
  return pedir(
    {
      metodo: 'GET',
      ruta: `/admin/negocios/${encodeURIComponent(id)}`,
      senal,
      token: sesionDeAdmin().token(),
    },
    esquemaFichaDelNegocio,
  );
}

/** Devuelve la ficha ya cambiada. Sin clave: el mismo cuerpo deja lo mismo. */
export function guardarDatos(
  id: string,
  datos: DatosDelNegocio,
): Promise<Respuesta<FichaDelNegocio>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(id)}/datos`,
      cuerpo: datos,
      token: sesionDeAdmin().token(),
    },
    esquemaFichaDelNegocio,
  );
}

export function cambiarPrograma(
  id: string,
  programa: ProgramaNuevo,
  clave: string,
): Promise<Respuesta<ProgramaCambiado>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(id)}/programa`,
      cuerpo: programa,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaProgramaCambiado,
  );
}

export function cambiarCondicion(
  id: string,
  condicion: CondicionNueva,
  clave: string,
): Promise<Respuesta<CondicionCambiada>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(id)}/condicion`,
      cuerpo: condicion,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaCondicionCambiada,
  );
}

export function cambiarEstado(
  id: string,
  estado: EstadoDelNegocio['estado'],
): Promise<Respuesta<EstadoDelNegocio>> {
  const accion = estado === 'suspendido' ? 'suspension' : 'reactivacion';
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(id)}/${accion}`,
      token: sesionDeAdmin().token(),
    },
    esquemaEstadoDelNegocio,
  );
}

/** La api dijo que esta sesion ya no sirve: hay que volver a entrar. */
export function sesionPerdida(fallo: Fallo): boolean {
  return fallo.tipo === 'rechazo' && fallo.codigo === 'TOKEN_INVALIDO';
}

/**
 * El texto para el admin cuando algo falla. Los rechazos traen su mensaje
 * escrito; el tope y los cortes no, o lo traen pensado para la caja.
 */
export function mensajeParaElAdmin(fallo: Fallo): string {
  if (fallo.tipo === 'incierto') return QUE_PASO[fallo.causa];
  if (fallo.codigo === 'TOPE_SUPERADO') {
    return 'Demasiados intentos desde esta conexión. Probá de nuevo en una hora.';
  }
  return fallo.mensaje;
}

const QUE_PASO: Record<CausaIncierta, string> = {
  sin_conexion: 'No hay conexión con el servidor. Revisá internet y probá de nuevo.',
  tiempo: 'El servidor tardó demasiado en contestar. Probá de nuevo.',
  servidor: 'El servidor tuvo un problema. Probá de nuevo en un rato.',
  respuesta_ilegible: 'El panel no entendió la respuesta del servidor. Quedó registrado.',
};
