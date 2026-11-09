import {
  type ClientesDelDueno,
  type CodigoDeVinculacion,
  type CondicionCambiada,
  type CondicionNueva,
  type DatosDelLocal,
  type DatosDePersona,
  type DuenoActual,
  type EntrarComoDuenoPeticion,
  type EntrarComoDuenoRespuesta,
  type NegocioDelDueno,
  type PersonaCreada,
  type ProgramaCambiado,
  type ProgramaNuevo,
  type PromoDelDueno,
  type ResumenDelDueno,
  esquemaClientesDelDueno,
  esquemaCodigoDeVinculacion,
  esquemaCondicionCambiada,
  esquemaDuenoActual,
  esquemaEntrarComoDuenoRespuesta,
  esquemaEstadoDePersona,
  esquemaNegocioDelDueno,
  esquemaPersonaBorrada,
  esquemaPersonaCreada,
  esquemaPinPuesto,
  esquemaProgramaCambiado,
  esquemaPromoDelDueno,
  esquemaQrCambiado,
  esquemaResumenDelDueno,
  esquemaTabletRevocada,
} from '@repunto/contratos';

import { sesionDeDueno } from '../sesion-de-dueno';
import {
  type CausaIncierta,
  type Esquema,
  type Fallo,
  type Respuesta,
  pedir,
} from './http';
import type { OperacionesDelNegocio } from './operaciones';

/**
 * Los endpoints del panel del dueño. La entrada no lleva credencial; el resto,
 * la sesión del dueño. Nunca la de la tablet ni la del admin.
 */

export function entrar(
  peticion: EntrarComoDuenoPeticion,
): Promise<Respuesta<EntrarComoDuenoRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: '/dueno/sesion', cuerpo: peticion, token: null },
    esquemaEntrarComoDuenoRespuesta,
  );
}

export function duenoActual(senal?: AbortSignal): Promise<Respuesta<DuenoActual>> {
  return pedir(
    { metodo: 'GET', ruta: '/dueno/yo', senal, token: sesionDeDueno().token() },
    esquemaDuenoActual,
  );
}

/** Cómo le va al negocio. El negocio lo pone la sesión, no el pedido. */
export function resumen(senal?: AbortSignal): Promise<Respuesta<ResumenDelDueno>> {
  return pedir(
    { metodo: 'GET', ruta: '/dueno/resumen', senal, token: sesionDeDueno().token() },
    esquemaResumenDelDueno,
  );
}

/** La promo vigente y la condición, con su historial. */
export function promo(senal?: AbortSignal): Promise<Respuesta<PromoDelDueno>> {
  return pedir(
    { metodo: 'GET', ruta: '/dueno/promo', senal, token: sesionDeDueno().token() },
    esquemaPromoDelDueno,
  );
}

/** Una versión nueva de la promo, con Idempotency-Key: el doble toque crea una. */
export function cambiarPrograma(
  programa: ProgramaNuevo,
  clave: string,
): Promise<Respuesta<ProgramaCambiado>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: '/dueno/promo/programa',
      cuerpo: programa,
      claveDeIdempotencia: clave,
      token: sesionDeDueno().token(),
    },
    esquemaProgramaCambiado,
  );
}

/** Una condición nueva, desde ahora, firmada por el dueño. */
export function cambiarCondicion(
  condicion: CondicionNueva,
  clave: string,
): Promise<Respuesta<CondicionCambiada>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: '/dueno/promo/condicion',
      cuerpo: condicion,
      claveDeIdempotencia: clave,
      token: sesionDeDueno().token(),
    },
    esquemaCondicionCambiada,
  );
}

/** Sus clientes, con el teléfono completo: los de visita más reciente primero. */
export function clientes(senal?: AbortSignal): Promise<Respuesta<ClientesDelDueno>> {
  return pedir(
    { metodo: 'GET', ruta: '/dueno/clientes', senal, token: sesionDeDueno().token() },
    esquemaClientesDelDueno,
  );
}

/** Sus locales, su equipo y sus tablets, con la marca para el cartel del QR. */
export function negocio(senal?: AbortSignal): Promise<Respuesta<NegocioDelDueno>> {
  return pedir(
    { metodo: 'GET', ruta: '/dueno/negocio', senal, token: sesionDeDueno().token() },
    esquemaNegocioDelDueno,
  );
}

/** Un QR nuevo al azar: el cartel pegado deja de servir. Sin clave. */
export function cambiarQr(local: string): Promise<Respuesta<unknown>> {
  return postear(`/locales/${encodeURIComponent(local)}/qr`, esquemaQrCambiado);
}

/** Un pedido de /dueno que cambia algo. Sin clave, salvo que vaya una. */
function postear<T>(
  ruta: string,
  esquema: Esquema<T>,
  cuerpo?: unknown,
  clave?: string,
): Promise<Respuesta<T>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/dueno${ruta}`,
      cuerpo,
      claveDeIdempotencia: clave,
      token: sesionDeDueno().token(),
    },
    esquema,
  );
}

const persona = (id: string, accion: string) =>
  `/personas/${encodeURIComponent(id)}/${accion}`;

/**
 * Las secciones de locales, personas y tablets, para el dueño. Sin abrir ni
 * cerrar locales, y sin tocar dueños: lo hace el admin.
 */
export const OPERACIONES_DEL_DUENO: OperacionesDelNegocio = {
  crearLocal: null,
  cambiarEstadoDelLocal: null,
  guardarLocal: (local: string, datos: DatosDelLocal) =>
    postear(`/locales/${encodeURIComponent(local)}/datos`, esquemaNegocioDelDueno, datos),
  rutaDelQr: (local) => `/dueno/locales/${encodeURIComponent(local)}/qr`,
  generarCodigoDeVinculacion: (local, clave): Promise<Respuesta<CodigoDeVinculacion>> =>
    postear(
      `/locales/${encodeURIComponent(local)}/vinculacion`,
      esquemaCodigoDeVinculacion,
      undefined,
      clave,
    ),
  revocarTablet: (tablet) =>
    postear(`/tablets/${encodeURIComponent(tablet)}/revocacion`, esquemaTabletRevocada),
  manejaDuenos: false,
  generarEntradaDelDueno: null,
  crearPersona: (datos: DatosDePersona, clave): Promise<Respuesta<PersonaCreada>> =>
    postear('/personas', esquemaPersonaCreada, datos, clave),
  // Sin clave: la huella del cuerpo dejaría el PIN a la vista.
  ponerPin: (id, pin) => postear(persona(id, 'pin'), esquemaPinPuesto, { pin }),
  guardarPersona: (id, datos) =>
    postear(persona(id, 'datos'), esquemaNegocioDelDueno, datos),
  darDeBaja: (id) => postear(persona(id, 'baja'), esquemaEstadoDePersona),
  // El dueño no reactiva dueños: nunca lleva teléfono.
  reactivarPersona: (id) => postear(persona(id, 'reactivacion'), esquemaEstadoDePersona),
  borrarPersona: (id) => postear(persona(id, 'borrado'), esquemaPersonaBorrada),
};

/** Responde 204, sin cuerpo: cualquier 2xx alcanza. */
export function cerrarSesion(): Promise<Respuesta<unknown>> {
  return pedir(
    { metodo: 'POST', ruta: '/dueno/sesion/cierre', token: sesionDeDueno().token() },
    { safeParse: (datos: unknown) => ({ success: true as const, data: datos }) },
  );
}

/** La api ya no acepta la sesión: vencida, revocada o el dueño dado de baja. */
export function sesionPerdida(fallo: Fallo): boolean {
  return fallo.tipo === 'rechazo' && fallo.codigo === 'TOKEN_INVALIDO';
}

/**
 * El texto para el dueño cuando algo falla. Los rechazos traen su mensaje
 * escrito; el tope y los cortes no, o lo traen pensado para la caja.
 */
export function mensajeParaElDueno(fallo: Fallo): string {
  if (fallo.tipo === 'incierto') return QUE_PASO[fallo.causa];
  if (fallo.codigo === 'ENTRADA_INVALIDA') {
    return 'Ese código no sirve: ya se usó, venció o está mal escrito. Pedile uno nuevo a Repunto.';
  }
  if (fallo.codigo === 'TOPE_SUPERADO') {
    return 'Demasiados intentos desde esta conexión. Probá de nuevo en una hora.';
  }
  // Los textos de la api para estos hablan de la ficha del admin.
  if (
    fallo.codigo === 'LOCAL_NO_ENCONTRADO' ||
    fallo.codigo === 'PERSONA_NO_ENCONTRADA' ||
    fallo.codigo === 'TABLET_NO_ENCONTRADA'
  ) {
    return 'Eso ya no está en tu negocio. Recargá la página.';
  }
  if (fallo.codigo === 'LOCAL_CERRADO') {
    return 'Ese local está cerrado. Para vincularle una tablet, pedile a Repunto que lo reabra.';
  }
  return fallo.mensaje;
}

const QUE_PASO: Record<CausaIncierta, string> = {
  sin_conexion: 'No hay conexión. Revisá internet y probá de nuevo.',
  tiempo: 'Repunto tardó demasiado en contestar. Probá de nuevo.',
  servidor: 'Repunto tuvo un problema. Probá de nuevo en un rato.',
  respuesta_ilegible: 'El panel no entendió la respuesta. Quedó registrado.',
};
