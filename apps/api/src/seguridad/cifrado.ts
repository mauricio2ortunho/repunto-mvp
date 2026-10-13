import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifrado de la semilla TOTP del cliente, que esta cifrada en reposo.
 *
 * AES-256-GCM: cifra y autentica a la vez, asi que una semilla manipulada en
 * la base falla al descifrar en lugar de producir codigos que no son de nadie.
 *
 * La semilla descifrada no sale de este proceso: no va en ninguna respuesta,
 * no va al log y no va a Sentry (CLAUDE.md, seccion 8).
 */

const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12;
const LARGO_CLAVE = 32;
const VERSION = 'v1';

function clave(): Buffer {
  const crudo = process.env['CLAVE_CIFRADO_SEMILLAS'];
  if (crudo === undefined || crudo === '') {
    throw new Error(
      'Falta CLAVE_CIFRADO_SEMILLAS. Son 32 bytes en base64: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".",
    );
  }
  const bytes = Buffer.from(crudo, 'base64');
  if (bytes.length !== LARGO_CLAVE) {
    throw new Error(
      `CLAVE_CIFRADO_SEMILLAS tiene ${bytes.length} bytes y tiene que tener ${LARGO_CLAVE}.`,
    );
  }
  return bytes;
}

/** `v1.iv.tag.cifrado`, todo en base64url. Es lo que se guarda en la columna. */
export function cifrarSemilla(semilla: string): string {
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv(ALGORITMO, clave(), iv);
  const cifrado = Buffer.concat([cifrador.update(semilla, 'utf8'), cifrador.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cifrador.getAuthTag().toString('base64url'),
    cifrado.toString('base64url'),
  ].join('.');
}

export function descifrarSemilla(guardado: string): string {
  const [version, iv, tag, cifrado] = guardado.split('.');
  if (
    version !== VERSION ||
    iv === undefined ||
    tag === undefined ||
    cifrado === undefined
  ) {
    throw new Error('La semilla guardada no tiene el formato esperado.');
  }
  const descifrador = createDecipheriv(ALGORITMO, clave(), Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    descifrador.update(Buffer.from(cifrado, 'base64url')),
    descifrador.final(),
  ]).toString('utf8');
}

/**
 * Una clave para otro proposito, derivada de CLAVE_CIFRADO_SEMILLAS con HKDF.
 *
 * Derivar y no reusar: la misma clave para cifrar semillas y para firmar
 * otra cosa mezclaria los dos usos, y un descuido en uno comprometeria el
 * otro. Con HKDF y un `proposito` distinto, cada uso tiene su clave y ninguna
 * revela a la maestra. Y no hace falta otra variable de entorno que cargar en
 * cada despliegue.
 */
export function claveDerivada(proposito: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', clave(), Buffer.alloc(0), `repunto:${proposito}`, LARGO_CLAVE),
  );
}
