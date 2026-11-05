import { ALFABETO_CODIGO_PUBLICO } from './codigo';

/**
 * El codigo que lleva el QR impreso en el mostrador de un local (`qr_slug`).
 *
 * Es lo unico que impide anotarse desde la casa con el telefono de otro: el
 * alta pide estar frente al mostrador, y el mostrador es este codigo. Por eso
 * va al azar y no se deduce del nombre del negocio ni de la sucursal.
 */

/** Diez caracteres de 29 posibles: unas 400 billones de combinaciones. */
export const LARGO_QR_DEL_LOCAL = 10;

/**
 * El mismo alfabeto sin ambiguos que el codigo del cliente, en minusculas:
 * va dentro de una direccion web, y alguien lo puede tener que tipear desde
 * el cartel si la camara no lee el QR. La aleatoriedad la pone quien llama.
 */
export function qrDelLocalDesde(bytes: Uint8Array): string {
  if (bytes.length < LARGO_QR_DEL_LOCAL) {
    throw new Error(`Hacen falta ${LARGO_QR_DEL_LOCAL} bytes para el QR de un local.`);
  }
  const alfabeto = ALFABETO_CODIGO_PUBLICO.toLowerCase();
  let qr = '';
  for (let i = 0; i < LARGO_QR_DEL_LOCAL; i += 1) {
    const byte = bytes[i] ?? 0;
    qr += alfabeto[byte % alfabeto.length];
  }
  return qr;
}
