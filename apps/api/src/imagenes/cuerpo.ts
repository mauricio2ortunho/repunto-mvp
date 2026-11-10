import type { Readable } from 'node:stream';

import { rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';

/**
 * Los bytes del cuerpo, tal cual. Express solo lee JSON y formularios: el
 * cuerpo de una imagen queda sin tocar y se lee acá, con tope. Pasado el
 * tope se sigue leyendo sin guardar, para que la respuesta salga entera, y
 * se rechaza al final.
 */
export async function leerCuerpo(
  peticion: Readable & { headers: Record<string, string | string[] | undefined> },
  limite: number,
): Promise<Uint8Array> {
  const declarado = Number(peticion.headers['content-length']);
  const demasiado = () => errorDeRechazo(rechazo('IMAGEN_DEMASIADO_GRANDE'), null);
  if (Number.isFinite(declarado) && declarado > limite) {
    peticion.resume();
    throw demasiado();
  }

  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of peticion) {
    const trozo = Buffer.isBuffer(parte) ? parte : Buffer.from(String(parte));
    total += trozo.length;
    if (total <= limite) partes.push(trozo);
  }
  if (total > limite) throw demasiado();
  return new Uint8Array(Buffer.concat(partes));
}
