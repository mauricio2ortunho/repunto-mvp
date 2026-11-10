import type { TipoDeImagen } from '@repunto/contratos';

/**
 * El tipo de una imagen por sus primeros bytes, no por lo que dice el pedido:
 * un Content-Type se escribe a mano, la firma del archivo no. Null si no es
 * PNG, JPG ni WebP; un SVG, que puede llevar código, cae acá.
 */
export function tipoPorBytes(bytes: Uint8Array): TipoDeImagen | null {
  const empieza = (firma: readonly number[], desde = 0) =>
    bytes.length >= desde + firma.length && firma.every((b, i) => bytes[desde + i] === b);

  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empieza([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF....WEBP
  if (empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/** La extensión con que se guarda: la dirección pública la lleva. */
export const EXTENSION: Record<TipoDeImagen, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
