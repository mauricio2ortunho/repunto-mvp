import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';

import type { TipoDeImagen } from '@repunto/contratos';

import { firmar, sha256Hex } from './firma';

/**
 * Dónde viven las imágenes: Cloudflare R2 (INV-22). En la base va solo la
 * dirección pública que devuelve `guardar`.
 *
 * Se habla con R2 por su API compatible con S3, con la firma de `firma.ts`
 * y `node:https`: sin el SDK de Amazon, que pesa MB y en serverless es
 * tiempo de arranque en cada instancia fría.
 */
export interface AlmacenDeImagenes {
  /** Sube y devuelve la dirección pública. Falla con un Error si R2 no la acepta. */
  guardar(clave: string, bytes: Uint8Array, tipo: TipoDeImagen): Promise<string>;
}

/** El token de inyección: null si este entorno no tiene R2 configurado. */
export const ALMACEN_DE_IMAGENES = Symbol('ALMACEN_DE_IMAGENES');

export interface ConfigDeR2 {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlPublica: string;
}

/**
 * Las cinco variables, o null si falta alguna: sin R2, subir una imagen
 * contesta IMAGENES_NO_CONFIGURADAS en lugar de fallar a medias.
 * `R2_ENDPOINT` es opcional: lo usan los tests para apuntar a un R2 falso.
 */
export function configDeR2(entorno: NodeJS.ProcessEnv): ConfigDeR2 | null {
  const leer = (nombre: string) => {
    const valor = entorno[nombre]?.trim();
    return valor === undefined || valor === '' ? null : valor;
  };
  const cuenta = leer('R2_ACCOUNT_ID');
  const bucket = leer('R2_BUCKET');
  const accessKeyId = leer('R2_ACCESS_KEY_ID');
  const secretAccessKey = leer('R2_SECRET_ACCESS_KEY');
  const urlPublica = leer('R2_URL_PUBLICA');
  if (
    cuenta === null ||
    bucket === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    urlPublica === null
  ) {
    return null;
  }
  return {
    endpoint: leer('R2_ENDPOINT') ?? `https://${cuenta}.r2.cloudflarestorage.com`,
    bucket,
    accessKeyId,
    secretAccessKey,
    urlPublica: urlPublica.replace(/\/+$/, ''),
  };
}

export class AlmacenR2 implements AlmacenDeImagenes {
  constructor(private readonly config: ConfigDeR2) {}

  async guardar(clave: string, bytes: Uint8Array, tipo: TipoDeImagen): Promise<string> {
    const url = new URL(`${this.config.endpoint}/${this.config.bucket}/${clave}`);
    const cabeceras = firmar(
      {
        metodo: 'PUT',
        url,
        cabeceras: {
          'content-type': tipo,
          // La clave sale del contenido: la misma dirección nunca cambia de
          // imagen, así que el navegador la puede guardar para siempre.
          'cache-control': 'public, max-age=31536000, immutable',
        },
        huellaDelCuerpo: sha256Hex(bytes),
      },
      {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        region: 'auto',
        servicio: 's3',
      },
      new Date(),
    );
    const estado = await enviar(url, cabeceras, bytes);
    if (estado < 200 || estado >= 300) {
      // Sin el cuerpo de la respuesta: puede repetir datos del pedido firmado.
      throw new Error(`R2 no guardó la imagen: respondió ${estado}.`);
    }
    return `${this.config.urlPublica}/${clave}`;
  }
}

/** Tiempo máximo para que R2 conteste: la función de Vercel corta a los 15 s. */
const TIEMPO_MAXIMO_MS = 10_000;

/** Un PUT con `node:https` (o `http`, en los tests): devuelve el estado. */
function enviar(
  url: URL,
  cabeceras: Record<string, string>,
  cuerpo: Uint8Array,
): Promise<number> {
  const pedir = url.protocol === 'http:' ? requestHttp : requestHttps;
  return new Promise((resolver, rechazar) => {
    const pedido = pedir(
      url,
      {
        method: 'PUT',
        headers: { ...cabeceras, 'content-length': String(cuerpo.byteLength) },
        timeout: TIEMPO_MAXIMO_MS,
      },
      (respuesta) => {
        // Se lee y se descarta: si no, el socket queda abierto.
        respuesta.resume();
        respuesta.on('end', () => resolver(respuesta.statusCode ?? 0));
        respuesta.on('error', rechazar);
      },
    );
    pedido.on('timeout', () => pedido.destroy(new Error('R2 no contestó a tiempo.')));
    pedido.on('error', rechazar);
    pedido.end(cuerpo);
  });
}
