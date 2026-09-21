import { randomBytes } from 'node:crypto';

/**
 * La semilla TOTP del cliente: veinte bytes al azar en base32, que es lo que
 * el algoritmo espera (RFC 4226). Se genera aca y se guarda cifrada; en claro
 * no sale nunca del proceso.
 *
 * Generar secretos es infraestructura, no una regla de negocio: el dominio
 * recibe la semilla ya hecha y solo calcula con ella.
 */

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BYTES_DE_SEMILLA = 20;

export function generarSemilla(): string {
  const bytes = randomBytes(BYTES_DE_SEMILLA);
  let acumulado = 0;
  let bits = 0;
  let semilla = '';

  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      semilla += ALFABETO_BASE32[(acumulado >> bits) & 0x1f];
    }
  }
  if (bits > 0) semilla += ALFABETO_BASE32[(acumulado << (5 - bits)) & 0x1f];
  return semilla;
}
