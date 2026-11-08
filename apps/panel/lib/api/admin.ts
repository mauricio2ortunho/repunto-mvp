import {
  type AdminActual,
  type EntrarComoAdminPeticion,
  type EntrarComoAdminRespuesta,
  type CodigoDeVinculacion,
  type CondicionCambiada,
  type CondicionNueva,
  type DatosDelLocal,
  type DatosDelNegocio,
  type EstadoDelLocal,
  type EstadoDelNegocio,
  type FichaDelNegocio,
  type LocalCreado,
  type DatosDePersona,
  type EstadoDePersona,
  type PersonaBorrada,
  type PersonaCreada,
  type PersonaNueva,
  type PinPuesto,
  type NegocioCreado,
  type NegocioNuevo,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  type ProgramaNuevo,
  type QrCambiado,
  type TableroDelPiloto,
  type TabletRevocada,
  esquemaAdminActual,
  esquemaCodigoDeVinculacion,
  esquemaCondicionCambiada,
  esquemaEntrarComoAdminRespuesta,
  esquemaEstadoDelLocal,
  esquemaEstadoDelNegocio,
  esquemaFichaDelNegocio,
  esquemaLocalCreado,
  esquemaEstadoDePersona,
  esquemaPersonaBorrada,
  esquemaPersonaCreada,
  esquemaPinPuesto,
  esquemaNegocioCreado,
  esquemaNegociosDelAdmin,
  esquemaProgramaCambiado,
  esquemaQrCambiado,
  esquemaTableroDelPiloto,
  esquemaTabletRevocada,
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
/** El tablero del piloto: cómo viene cada negocio. */
export function tablero(senal?: AbortSignal): Promise<Respuesta<TableroDelPiloto>> {
  return pedir(
    { metodo: 'GET', ruta: '/admin/tablero', token: sesionDeAdmin().token(), senal },
    esquemaTableroDelPiloto,
  );
}

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

export function crearLocal(
  negocio: string,
  datos: DatosDelLocal,
  clave: string,
): Promise<Respuesta<LocalCreado>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/locales`,
      cuerpo: datos,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaLocalCreado,
  );
}

/** Devuelve la ficha ya cambiada. Sin clave: el mismo cuerpo deja lo mismo. */
export function guardarLocal(
  negocio: string,
  local: string,
  datos: DatosDelLocal,
): Promise<Respuesta<FichaDelNegocio>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/locales/${encodeURIComponent(local)}/datos`,
      cuerpo: datos,
      token: sesionDeAdmin().token(),
    },
    esquemaFichaDelNegocio,
  );
}

/** Un QR nuevo al azar: el cartel pegado deja de servir. Sin clave. */
export function cambiarQr(
  negocio: string,
  local: string,
): Promise<Respuesta<QrCambiado>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/locales/${encodeURIComponent(local)}/qr`,
      token: sesionDeAdmin().token(),
    },
    esquemaQrCambiado,
  );
}

export function cambiarEstadoDelLocal(
  negocio: string,
  local: string,
  activo: boolean,
): Promise<Respuesta<EstadoDelLocal>> {
  const accion = activo ? 'reapertura' : 'cierre';
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/locales/${encodeURIComponent(local)}/${accion}`,
      token: sesionDeAdmin().token(),
    },
    esquemaEstadoDelLocal,
  );
}

export function crearPersona(
  negocio: string,
  persona: PersonaNueva,
  clave: string,
): Promise<Respuesta<PersonaCreada>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas`,
      cuerpo: persona,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaPersonaCreada,
  );
}

/** Sin clave: la huella del cuerpo dejaria el PIN a la vista, y repetirlo no hace daño. */
export function ponerPin(
  negocio: string,
  persona: string,
  pin: string,
): Promise<Respuesta<PinPuesto>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas/${encodeURIComponent(persona)}/pin`,
      cuerpo: { pin },
      token: sesionDeAdmin().token(),
    },
    esquemaPinPuesto,
  );
}

/** Devuelve la ficha ya cambiada. Sin clave: el mismo cuerpo deja lo mismo. */
export function guardarPersona(
  negocio: string,
  persona: string,
  datos: DatosDePersona,
): Promise<Respuesta<FichaDelNegocio>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas/${encodeURIComponent(persona)}/datos`,
      cuerpo: datos,
      token: sesionDeAdmin().token(),
    },
    esquemaFichaDelNegocio,
  );
}

export function darDeBaja(
  negocio: string,
  persona: string,
): Promise<Respuesta<EstadoDePersona>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas/${encodeURIComponent(persona)}/baja`,
      token: sesionDeAdmin().token(),
    },
    esquemaEstadoDePersona,
  );
}

/** `telefono`: el del dueño, que se le liberó al darlo de baja. Los demás, null. */
export function reactivarPersona(
  negocio: string,
  persona: string,
  telefono: string | null,
): Promise<Respuesta<EstadoDePersona>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas/${encodeURIComponent(persona)}/reactivacion`,
      cuerpo: { telefono },
      token: sesionDeAdmin().token(),
    },
    esquemaEstadoDePersona,
  );
}

/** Solo a quien no tiene historia; si la tiene, PERSONA_CON_HISTORIA. */
export function borrarPersona(
  negocio: string,
  persona: string,
): Promise<Respuesta<PersonaBorrada>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/personas/${encodeURIComponent(persona)}/borrado`,
      token: sesionDeAdmin().token(),
    },
    esquemaPersonaBorrada,
  );
}

/** El codigo para vincular una tablet nueva a ese local. Vence a los 15 minutos. */
export function generarCodigoDeVinculacion(
  negocio: string,
  local: string,
  clave: string,
): Promise<Respuesta<CodigoDeVinculacion>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/locales/${encodeURIComponent(local)}/vinculacion`,
      claveDeIdempotencia: clave,
      token: sesionDeAdmin().token(),
    },
    esquemaCodigoDeVinculacion,
  );
}

/** Sin clave: revocar dos veces deja lo mismo. */
export function revocarTablet(
  negocio: string,
  tablet: string,
): Promise<Respuesta<TabletRevocada>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/admin/negocios/${encodeURIComponent(negocio)}/tablets/${encodeURIComponent(tablet)}/revocacion`,
      token: sesionDeAdmin().token(),
    },
    esquemaTabletRevocada,
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
  // El de la caja le habla al cajero de un cliente.
  if (fallo.codigo === 'TELEFONO_INVALIDO') {
    return 'Ese teléfono no es válido: si es boliviano, son ocho números.';
  }
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
