import { encode } from 'uqr';

/**
 * El QR impreso en el mostrador de un local. Lleva a la pagina de alta de la
 * app del cliente, `/r/<qr>` (apps/cliente/app/r/[local]).
 */

/** La direccion que codifica el QR. `base` va sin barra final. */
export function direccionDelQr(base: string, qrSlug: string): string {
  return `${base}/r/${encodeURIComponent(qrSlug)}`;
}

/**
 * Cuatro modulos de margen blanco: lo que pide la norma para que la camara
 * encuentre el QR sobre un mostrador con otras cosas alrededor.
 */
export const MARGEN_DEL_QR = 4;

export interface DibujoDeQr {
  /** Lado del cuadrado en modulos, margen incluido: el viewBox del SVG. */
  lado: number;
  /** Un `d` de <path> con un cuadradito por modulo oscuro. */
  camino: string;
}

/**
 * El QR como un solo trazo SVG. Correccion de errores Q (25%): un cartel
 * pegado se mancha, se dobla y le da el sol, y la direccion es corta, asi
 * que el QR sigue siendo chico.
 */
export function dibujarQr(texto: string): DibujoDeQr {
  const { data, size } = encode(texto, { ecc: 'Q', border: MARGEN_DEL_QR });
  const partes: string[] = [];
  data.forEach((fila, y) => {
    fila.forEach((oscuro, x) => {
      if (oscuro) partes.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return { lado: size, camino: partes.join('') };
}
