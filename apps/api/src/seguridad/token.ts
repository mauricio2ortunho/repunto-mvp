import { createHash, randomBytes } from 'node:crypto';

/**
 * Los tokens de sesion —el de la tablet y el del telefono del cliente— se
 * guardan hasheados: quien lea la base no puede hacerse pasar por un equipo.
 *
 * SHA-256 y no bcrypt a proposito: el token lo genera el servidor con 32 bytes
 * al azar, asi que no hay nada que adivinar por fuerza bruta, y el hash tiene
 * que poder buscarse por indice. Un PIN de cuatro digitos es el caso contrario
 * y no se guarda asi.
 */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Token nuevo, 32 bytes al azar en base64url. */
export function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}
