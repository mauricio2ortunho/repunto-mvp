/**
 * Claves de idempotencia: una por accion, no una por toque.
 *
 * La clave nace cuando el cajero pide algo y se conserva solo mientras no se
 * sabe si eso paso: se corto la conexion, tardo demasiado, el servidor se cayo.
 * Si vuelve a tocar el mismo boton con el mismo codigo, viaja la misma clave y
 * la API devuelve el resultado original en vez de sellar dos veces.
 *
 * Apenas llega una respuesta que dice que paso -un 2xx o un rechazo 4xx-, la
 * clave se olvida. Si no, el proximo intento con ese mismo cuerpo recibiria la
 * repeticion del anterior y el cajero veria "sellado" sin que se selle nada.
 *
 * La firma identifica la accion con su cuerpo (`sellar:K7Q4M-418329`). Con
 * otro codigo cambia la firma y nace otra clave: la misma clave con otro cuerpo
 * es IDEMPOTENCIA_DISTINTA.
 */

/** Pasado esto, un reintento ya no es reintento: es otra accion. */
const VIGENCIA_MS = 5 * 60 * 1000;

export interface GestorDeIdempotencia {
  /** La clave pendiente para esta firma, o una nueva. */
  clavePara(firma: string): string;
  /** La accion tuvo respuesta: la proxima con esta firma es otra accion. */
  olvidar(firma: string): void;
}

export function crearGestorDeIdempotencia(
  generar: () => string = generarUuid,
  ahora: () => number = Date.now,
): GestorDeIdempotencia {
  const pendientes = new Map<string, { clave: string; desde: number }>();

  return {
    clavePara(firma) {
      const t = ahora();
      for (const [f, p] of pendientes) {
        if (t - p.desde > VIGENCIA_MS) pendientes.delete(f);
      }
      const pendiente = pendientes.get(firma);
      if (pendiente !== undefined) return pendiente.clave;
      const clave = generar();
      pendientes.set(firma, { clave, desde: t });
      return clave;
    },
    olvidar(firma) {
      pendientes.delete(firma);
    },
  };
}

/**
 * uuid v4. `crypto.randomUUID` solo existe en contexto seguro (https o
 * localhost): una tablet que prueba el panel contra `http://192.168.x.x` no lo
 * tiene. `getRandomValues` si, en cualquier contexto.
 */
export function generarUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();

  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
