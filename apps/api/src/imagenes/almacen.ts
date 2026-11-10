import { AwsClient } from 'aws4fetch';
import type { TipoDeImagen } from '@repunto/contratos';

/**
 * Dónde viven las imágenes: Cloudflare R2 (INV-22). En la base va solo la
 * dirección pública que devuelve `guardar`.
 *
 * Se habla con R2 por su API compatible con S3, firmando con `aws4fetch`:
 * pesa unos KB contra los MB del SDK de Amazon, y en serverless eso es
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
  private readonly cliente: AwsClient;

  constructor(private readonly config: ConfigDeR2) {
    this.cliente = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }

  async guardar(clave: string, bytes: Uint8Array, tipo: TipoDeImagen): Promise<string> {
    const respuesta = await this.cliente.fetch(
      `${this.config.endpoint}/${this.config.bucket}/${clave}`,
      {
        method: 'PUT',
        body: bytes,
        headers: {
          'content-type': tipo,
          // La clave sale del contenido: la misma dirección nunca cambia de
          // imagen, así que el navegador la puede guardar para siempre.
          'cache-control': 'public, max-age=31536000, immutable',
        },
      },
    );
    if (!respuesta.ok) {
      // Sin el cuerpo: puede repetir la firma del pedido.
      throw new Error(`R2 no guardó la imagen: respondió ${respuesta.status}.`);
    }
    return `${this.config.urlPublica}/${clave}`;
  }
}
