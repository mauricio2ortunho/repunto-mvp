import { esquemaError, mensajeParaElCajero, type ErrorDeLaApi } from '@repunto/contratos';
import { urlDeLaApi } from '../configuracion';
import { credencialDeLaTablet } from '../credencial';

/**
 * Transporte del panel contra la API: credencial, idempotencia, tiempo maximo
 * y la traduccion de cualquier cosa que vuelva a algo que se pueda mostrar.
 *
 * Toda respuesta termina en uno de tres casos, porque la caja tiene que hacer
 * cosas distintas en cada uno:
 * - `ok`: paso. Se muestra el resultado.
 * - `rechazo`: la API dijo que no y por que. Se muestra `mensaje` tal cual.
 * - `incierto`: no se sabe si paso. Se reintenta con la misma clave.
 */

export type CodigoDeError = ErrorDeLaApi['codigo'];

/** Lo que el panel usa de un esquema de Zod, sin importar zod. */
export interface Esquema<T> {
  safeParse(
    datos: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export type CausaIncierta =
  | 'sin_conexion'
  | 'tiempo'
  | 'servidor'
  /** Llego un 2xx que no cumple el contrato: un bug, no un corte. */
  | 'respuesta_ilegible';

export type Fallo =
  | {
      ok: false;
      tipo: 'rechazo';
      /** null si la API mando un codigo que contratos todavia no conoce. */
      codigo: CodigoDeError | null;
      mensaje: string;
      estado: number;
    }
  | { ok: false; tipo: 'incierto'; causa: CausaIncierta };

export type Respuesta<T> = { ok: true; datos: T; cabeceras: Headers } | Fallo;

/** Lo que volvio, antes de interpretarlo. `cuerpo` es undefined si no era JSON. */
export interface Crudo {
  estado: number;
  cabeceras: Headers;
  cuerpo: unknown;
}

export interface Pedido {
  metodo: 'GET' | 'POST';
  ruta: string;
  cuerpo?: unknown;
  claveDeIdempotencia?: string;
  cabeceras?: Record<string, string>;
  /** Para cortar una consulta que ya no importa, como al desmontar. */
  senal?: AbortSignal;
  tiempoMaximoMs?: number;
}

const TIEMPO_MAXIMO_MS = 10_000;

/**
 * Hace la peticion y lee el cuerpo. El tiempo maximo cubre las dos cosas: una
 * conexion que entrega cabeceras y despues se cuelga tambien es un corte.
 */
export async function pedirCrudo(
  pedido: Pedido,
): Promise<Crudo | 'sin_conexion' | 'tiempo' | 'cancelado'> {
  const controlador = new AbortController();
  const temporizador = setTimeout(
    () => controlador.abort(),
    pedido.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS,
  );
  const cortarDesdeAfuera = () => controlador.abort();
  pedido.senal?.addEventListener('abort', cortarDesdeAfuera, { once: true });

  const cabeceras: Record<string, string> = {
    Accept: 'application/json',
    ...pedido.cabeceras,
  };
  // Sin token no se inventa nada: la peticion sale sin cabecera, la API
  // contesta TOKEN_INVALIDO y el cajero lee "Esta tablet no esta vinculada".
  const token = credencialDeLaTablet().token();
  if (token !== null) cabeceras.Authorization = `Bearer ${token}`;
  if (pedido.claveDeIdempotencia !== undefined) {
    cabeceras['Idempotency-Key'] = pedido.claveDeIdempotencia;
  }
  if (pedido.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  try {
    const res = await fetch(`${urlDeLaApi}${pedido.ruta}`, {
      method: pedido.metodo,
      headers: cabeceras,
      ...(pedido.cuerpo !== undefined && { body: JSON.stringify(pedido.cuerpo) }),
      // Con If-None-Match puesto a mano, el navegador no usa su cache y deja
      // ver el 304. Igual se aclara, para que nadie lo "optimice".
      cache: 'no-store',
      signal: controlador.signal,
    });
    const texto = await res.text();
    return { estado: res.status, cabeceras: res.headers, cuerpo: leerJson(texto) };
  } catch {
    if (pedido.senal?.aborted === true) return 'cancelado';
    return controlador.signal.aborted ? 'tiempo' : 'sin_conexion';
  } finally {
    clearTimeout(temporizador);
    pedido.senal?.removeEventListener('abort', cortarDesdeAfuera);
  }
}

function leerJson(texto: string): unknown {
  if (texto === '') return undefined;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Convierte lo que volvio en algo que la caja sabe mostrar.
 *
 * Si el error no trae la forma del contrato -un proxy que contesta HTML, un
 * 401 vacio-, el texto sale de `mensajeParaElCajero` segun el estado HTTP.
 */
export function interpretar<T>(crudo: Crudo, esquema: Esquema<T>): Respuesta<T> {
  const { estado, cabeceras, cuerpo } = crudo;

  if (estado >= 200 && estado < 300) {
    const valido = esquema.safeParse(cuerpo);
    if (valido.success) return { ok: true, datos: valido.data, cabeceras };
    console.error('[repunto] La respuesta no cumple el contrato.', valido.error);
    return { ok: false, tipo: 'incierto', causa: 'respuesta_ilegible' };
  }

  const error = esquemaError.safeParse(cuerpo);
  if (error.success) {
    return {
      ok: false,
      tipo: 'rechazo',
      codigo: error.data.codigo,
      mensaje: error.data.mensaje,
      estado,
    };
  }

  if (estado >= 500) return { ok: false, tipo: 'incierto', causa: 'servidor' };

  // Un codigo nuevo que este paquete todavia no lista: el mensaje igual esta
  // escrito para el cajero, asi que se muestra.
  const suelto = mensajeSuelto(cuerpo);
  if (suelto !== null)
    return { ok: false, tipo: 'rechazo', codigo: null, mensaje: suelto, estado };

  const codigo: CodigoDeError =
    estado === 401
      ? 'TOKEN_INVALIDO'
      : estado === 429
        ? 'TOPE_SUPERADO'
        : 'PETICION_INVALIDA';
  return {
    ok: false,
    tipo: 'rechazo',
    codigo,
    mensaje: mensajeParaElCajero(codigo),
    estado,
  };
}

function mensajeSuelto(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('mensaje' in cuerpo))
    return null;
  const { mensaje } = cuerpo;
  return typeof mensaje === 'string' && mensaje.trim() !== '' ? mensaje : null;
}

export async function pedir<T>(
  pedido: Pedido,
  esquema: Esquema<T>,
): Promise<Respuesta<T>> {
  const crudo = await pedirCrudo(pedido);
  if (crudo === 'cancelado' || crudo === 'sin_conexion') {
    return { ok: false, tipo: 'incierto', causa: 'sin_conexion' };
  }
  if (crudo === 'tiempo') return { ok: false, tipo: 'incierto', causa: 'tiempo' };
  return interpretar(crudo, esquema);
}
