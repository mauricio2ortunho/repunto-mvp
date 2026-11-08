import {
  type CondicionCambiada,
  type CondicionNueva,
  type DuenoActual,
  type EntrarComoDuenoPeticion,
  type EntrarComoDuenoRespuesta,
  type ProgramaCambiado,
  type ProgramaNuevo,
  type PromoDelDueno,
  type ResumenDelDueno,
  esquemaCondicionCambiada,
  esquemaDuenoActual,
  esquemaEntrarComoDuenoRespuesta,
  esquemaProgramaCambiado,
  esquemaPromoDelDueno,
  esquemaResumenDelDueno,
} from '@repunto/contratos';

import { sesionDeDueno } from '../sesion-de-dueno';
import { type CausaIncierta, type Fallo, type Respuesta, pedir } from './http';

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
  return fallo.mensaje;
}

const QUE_PASO: Record<CausaIncierta, string> = {
  sin_conexion: 'No hay conexión. Revisá internet y probá de nuevo.',
  tiempo: 'Repunto tardó demasiado en contestar. Probá de nuevo.',
  servidor: 'Repunto tuvo un problema. Probá de nuevo en un rato.',
  respuesta_ilegible: 'El panel no entendió la respuesta. Quedó registrado.',
};
