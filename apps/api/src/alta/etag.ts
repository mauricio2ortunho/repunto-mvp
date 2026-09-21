import { createHash } from 'node:crypto';

/**
 * ETag de una respuesta. El panel de caja pide la lista de registros cada
 * pocos segundos; mientras nadie se registre, el contenido es identico y el
 * servidor contesta 304 sin cuerpo.
 */
export function etiquetaDe(contenido: unknown): string {
  const huella = createHash('sha256')
    .update(JSON.stringify(contenido), 'utf8')
    .digest('base64url')
    .slice(0, 27);
  return `"${huella}"`;
}
