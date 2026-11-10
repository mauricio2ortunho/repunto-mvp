import {
  LIMITES_DE_IMAGEN,
  TIPOS_DE_IMAGEN,
  type ImagenDelNegocio,
} from '@repunto/contratos';

/**
 * Las imágenes se achican en el navegador antes de subirlas: el logo se ve
 * chico y la portada a lo ancho de un teléfono, así que guardar la foto de
 * 12 megapíxeles de la cámara solo haría lenta la app del cliente. Redibujar
 * la imagen también le borra los datos ocultos de la foto (la ubicación GPS
 * donde se sacó, el modelo del teléfono).
 */

/** Achicada para que su lado más largo no pase `maximo`. Nunca se agranda. */
export function medidasAchicadas(
  ancho: number,
  alto: number,
  maximo: number,
): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** Lo que se ofrece al elegir el archivo; un SVG no aparece. */
export const ACEPTA = TIPOS_DE_IMAGEN.join(',');

/**
 * En qué se guarda si el navegador no sabe hacer WebP (Safari viejo): el
 * logo en PNG, por la transparencia; la portada, que es una foto, en JPG.
 */
export function tipoDeRespaldo(imagen: ImagenDelNegocio): 'image/png' | 'image/jpeg' {
  return imagen === 'logo' ? 'image/png' : 'image/jpeg';
}

export type ImagenAchicada =
  | { ok: true; archivo: Blob; ancho: number; alto: number }
  | { ok: false; mensaje: string };

/** Solo en el navegador: usa canvas. */
export async function achicarImagen(
  archivo: File,
  imagen: ImagenDelNegocio,
): Promise<ImagenAchicada> {
  if (!(TIPOS_DE_IMAGEN as readonly string[]).includes(archivo.type)) {
    return { ok: false, mensaje: 'Elegí una imagen PNG, JPG o WebP.' };
  }
  let dibujo: ImageBitmap;
  try {
    dibujo = await createImageBitmap(archivo);
  } catch {
    return { ok: false, mensaje: 'No se pudo abrir esa imagen. Probá con otra.' };
  }
  const { ancho, alto } = medidasAchicadas(
    dibujo.width,
    dibujo.height,
    LIMITES_DE_IMAGEN.ladoMaximo[imagen],
  );
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext('2d');
  if (contexto === null) {
    dibujo.close();
    return { ok: false, mensaje: 'Este navegador no puede preparar la imagen.' };
  }
  contexto.drawImage(dibujo, 0, 0, ancho, alto);
  dibujo.close();

  const aBlob = (tipo: string) =>
    new Promise<Blob | null>((listo) => lienzo.toBlob(listo, tipo, 0.85));
  let resultado = await aBlob('image/webp');
  // El que no sabe WebP devuelve PNG sin avisar: se elige el respaldo a mano.
  if (resultado?.type !== 'image/webp') resultado = await aBlob(tipoDeRespaldo(imagen));
  if (resultado === null) {
    return { ok: false, mensaje: 'No se pudo preparar la imagen. Probá con otra.' };
  }
  if (resultado.size > LIMITES_DE_IMAGEN.bytes) {
    return { ok: false, mensaje: 'La imagen sigue siendo muy pesada. Probá con otra.' };
  }
  return { ok: true, archivo: resultado, ancho, alto };
}
