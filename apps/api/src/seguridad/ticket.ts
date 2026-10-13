import { createHmac } from 'node:crypto';

import { claveDerivada } from './cifrado';

/**
 * El ticket del alta, derivado y no al azar.
 *
 * Es el secreto con el que el telefono del cliente pregunta si ya lo
 * confirmaron y, si la cuenta es nueva, recibe la sesion. Antes era un token al
 * azar, y un segundo registro del mismo telefono lo reemplazaba: quien
 * conociera el telefono de alguien que se estaba registrando en el mostrador
 * podia anotarlo de nuevo desde su casa, quedarse con el ticket y llevarse la
 * sesion cuando el cajero confirmaba a la persona de verdad.
 *
 * Ahora un registro en curso no se reemplaza, y para eso el reintento legitimo
 * —la respuesta que se perdio en el wifi del local— tiene que poder recibir el
 * mismo ticket. Guardarlo en claro para devolverlo romperia la regla de que la
 * base solo tiene hashes de credenciales. En cambio se recalcula: el mismo
 * QR, el mismo telefono y la misma Idempotency-Key dan siempre el mismo
 * ticket, y sin la clave del servidor nadie puede calcularlo.
 *
 * Eso convierte a la Idempotency-Key de este endpoint en parte de la
 * credencial, y por eso se le exige largo de sobra (ver el controller).
 */
export function ticketDeRegistro(
  qr_slug: string,
  telefono: string,
  clave: string,
): string {
  // JSON y no concatenar: con un separador, ("a|b", "c") y ("a", "b|c") darian
  // el mismo mensaje.
  return createHmac('sha256', claveDerivada('ticket-de-registro'))
    .update(JSON.stringify([qr_slug, telefono, clave]), 'utf8')
    .digest('base64url');
}
