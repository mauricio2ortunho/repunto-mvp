import {
  MENSAJE_GENERICO_PARA_EL_CLIENTE,
  esquemaError,
  mensajeParaElCliente,
} from '@repunto/contratos';

import { urlDeLaApi } from '../configuracion';

/**
 * Transporte de la app contra la api. Toda respuesta termina en uno de tres
 * casos, porque la pantalla hace cosas distintas en cada uno:
 *
 * - `ok`: paso, y la respuesta cumple el contrato.
 * - `rechazo`: la api dijo que no, y por que.
 * - `incierto`: no se sabe que paso —sin conexion, tiempo, error del
 *   servidor—. Lo que se pueda mostrar sin conexion, se muestra de lo guardado.
 *
 * El mensaje sale SIEMPRE de `mensajeParaElCliente`, nunca del campo `mensaje`
 * de la api: ese esta escrito para el cajero.
 */

/** Lo que la app usa de un esquema de Zod, sin importar zod. */
export interface Esquema<T> {
  safeParse(
    datos: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export type CausaIncierta = 'sin_conexion' | 'tiempo' | 'servidor' | 'respuesta_ilegible';

export type Fallo =
  | {
      ok: false;
      tipo: 'rechazo';
      /** null si la api mando un codigo que contratos todavia no conoce. */
      codigo: string | null;
      mensaje: string;
      estado: number;
    }
  | { ok: false; tipo: 'incierto'; causa: CausaIncierta; mensaje: string };

export type Respuesta<T> = { ok: true; datos: T } | Fallo;

export interface Pedido<T> {
  metodo: 'GET' | 'POST';
  ruta: string;
  esquema: Esquema<T>;
  cuerpo?: unknown;
  /** Sesion o ticket: van en Authorization, nunca en la URL (terminaria en los logs). */
  token?: string | null;
  clave?: string;
  /** Para cortar una consulta que ya no importa, como al salir de la pantalla. */
  senal?: AbortSignal;
  tiempoMaximoMs?: number;
}

const TIEMPO_MAXIMO_MS = 10_000;

const MENSAJE_INCIERTO: Record<CausaIncierta, string> = {
  sin_conexion: 'No hay conexión. Revisá tu internet y probá de nuevo.',
  tiempo: 'Está tardando demasiado. Probá de nuevo en un momento.',
  servidor: MENSAJE_GENERICO_PARA_EL_CLIENTE,
  respuesta_ilegible: MENSAJE_GENERICO_PARA_EL_CLIENTE,
};

function incierto(causa: CausaIncierta): Fallo {
  return { ok: false, tipo: 'incierto', causa, mensaje: MENSAJE_INCIERTO[causa] };
}

export async function pedir<T>(
  pedido: Pedido<T>,
  hacerFetch: typeof fetch = (...args) => fetch(...args),
  base: string = urlDeLaApi,
): Promise<Respuesta<T>> {
  const control = new AbortController();
  let porTiempo = false;
  const reloj = setTimeout(() => {
    porTiempo = true;
    control.abort();
  }, pedido.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);
  const alCancelar = () => control.abort();
  pedido.senal?.addEventListener('abort', alCancelar);

  try {
    const cabeceras: Record<string, string> = {};
    if (pedido.token) cabeceras['authorization'] = `Bearer ${pedido.token}`;
    if (pedido.clave !== undefined) cabeceras['idempotency-key'] = pedido.clave;
    if (pedido.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';

    let respuesta: Response;
    let cuerpo: unknown;
    try {
      respuesta = await hacerFetch(`${base}${pedido.ruta}`, {
        method: pedido.metodo,
        headers: cabeceras,
        body: pedido.cuerpo === undefined ? undefined : JSON.stringify(pedido.cuerpo),
        signal: control.signal,
        cache: 'no-store',
      });
      // El tiempo maximo cubre tambien el cuerpo: una conexion que entrega
      // cabeceras y despues se cuelga es un corte igual.
      const texto = await respuesta.text();
      cuerpo = texto === '' ? undefined : JSON.parse(texto);
    } catch (error) {
      if (porTiempo) return incierto('tiempo');
      if (error instanceof SyntaxError) return incierto('respuesta_ilegible');
      return incierto('sin_conexion');
    }

    if (respuesta.ok) {
      const valido = pedido.esquema.safeParse(cuerpo);
      return valido.success
        ? { ok: true, datos: valido.data }
        : incierto('respuesta_ilegible');
    }
    if (respuesta.status >= 500) return incierto('servidor');

    const error = esquemaError.safeParse(cuerpo);
    const codigo = error.success
      ? error.data.codigo
      : respuesta.status === 401
        ? 'TOKEN_INVALIDO'
        : null;
    return {
      ok: false,
      tipo: 'rechazo',
      codigo,
      mensaje: mensajeParaElCliente(codigo ?? ''),
      estado: respuesta.status,
    };
  } finally {
    clearTimeout(reloj);
    pedido.senal?.removeEventListener('abort', alCancelar);
  }
}
