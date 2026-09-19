import { createHmac } from 'node:crypto';

import type { CodigoDeError } from './errores';
import type { Cliente } from './tipos';

/**
 * El codigo que el cliente muestra en caja: `K7Q4M-418329`.
 *
 *  - `K7Q4M` es su codigo publico. Identifica, no autentica, y es estable.
 *  - `418329` es un TOTP de 6 digitos derivado de su semilla (RFC 6238,
 *    HMAC-SHA1, ventana de 30 segundos).
 *
 * La direccion importa: lo muestra el cliente y lo tipea el cajero. Si lo
 * mostrara el negocio, cualquiera en la fila podria fotografiarlo.
 *
 * Todo aca es calculo puro: la semilla y el instante entran por parametro. El
 * registro del consumo (INV-9) no es de este paquete.
 */

/** 30 segundos. Se acepta la ventana actual y la anterior (CLAUDE.md, 6). */
export const VENTANA_SEGUNDOS = 30;

export const DIGITOS_TOTP = 6;

export const LARGO_CODIGO_PUBLICO = 5;

/**
 * Sin 0, O, 1, I, L, 5 ni S: a un metro del mostrador y con el brillo alto se
 * confunden. 29 simbolos: 29^5 = 20.511.149 combinaciones, holgado para
 * 100.000 clientes.
 */
export const ALFABETO_CODIGO_PUBLICO = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** El bloque de 30 segundos al que pertenece un instante. */
export function ventanaDe(instante: Date): number {
  return Math.floor(instante.getTime() / 1000 / VENTANA_SEGUNDOS);
}

/** La actual y la anterior, en ese orden. */
export function ventanasAceptadas(instante: Date): readonly [number, number] {
  const actual = ventanaDe(instante);
  return [actual, actual - 1];
}

/** TOTP de 6 digitos de esa semilla para esa ventana. */
export function codigoDeVentana(semilla: string, ventana: number): string {
  const contador = new Uint8Array(8);
  let resto = ventana;
  for (let i = 7; i >= 0; i -= 1) {
    contador[i] = resto & 0xff;
    resto = Math.floor(resto / 256);
  }

  const hmac = createHmac('sha1', decodificarBase32(semilla)).update(contador).digest();
  // Truncado dinamico del RFC 4226: los 4 bits bajos del ultimo byte dicen
  // desde donde leer los 31 bits que se convierten en digitos.
  const desplazamiento = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binario =
    (((hmac[desplazamiento] ?? 0) & 0x7f) << 24) |
    (((hmac[desplazamiento + 1] ?? 0) & 0xff) << 16) |
    (((hmac[desplazamiento + 2] ?? 0) & 0xff) << 8) |
    ((hmac[desplazamiento + 3] ?? 0) & 0xff);

  return String(binario % 10 ** DIGITOS_TOTP).padStart(DIGITOS_TOTP, '0');
}

export interface CodigoTipeado {
  codigo_publico: string;
  totp: string;
}

/**
 * Parte lo que el cajero tipeo. Tolera minusculas, espacios y guiones: va a
 * escribir como pueda. Devuelve null si no tiene la forma esperada.
 */
export function partirCodigoTipeado(tipeado: string): CodigoTipeado | null {
  const limpio = tipeado.replace(/[\s-]/g, '').toUpperCase();
  if (limpio.length !== LARGO_CODIGO_PUBLICO + DIGITOS_TOTP) return null;

  const codigo_publico = limpio.slice(0, LARGO_CODIGO_PUBLICO);
  const totp = limpio.slice(LARGO_CODIGO_PUBLICO);
  if (!esCodigoPublicoValido(codigo_publico)) return null;
  if (!/^\d+$/.test(totp)) return null;
  return { codigo_publico, totp };
}

export function esCodigoPublicoValido(texto: string): boolean {
  if (texto.length !== LARGO_CODIGO_PUBLICO) return false;
  return [...texto].every((letra) => ALFABETO_CODIGO_PUBLICO.includes(letra));
}

/**
 * Convierte bytes al azar en un codigo publico. La aleatoriedad la provee
 * quien llama —`apps/api` al crear la cuenta—, asi esta funcion sigue siendo
 * pura y testeable. Necesita al menos LARGO_CODIGO_PUBLICO bytes.
 */
export function codigoPublicoDesde(bytes: Uint8Array): string {
  if (bytes.length < LARGO_CODIGO_PUBLICO) {
    throw new Error(`Hacen falta ${LARGO_CODIGO_PUBLICO} bytes para un codigo publico.`);
  }
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO_PUBLICO; i += 1) {
    const byte = bytes[i] ?? 0;
    codigo += ALFABETO_CODIGO_PUBLICO[byte % ALFABETO_CODIGO_PUBLICO.length];
  }
  return codigo;
}

export interface VerificacionDeCodigo {
  valido: boolean;
  /** La ventana que hay que registrar como consumida (INV-9). */
  ventana: number | null;
}

/**
 * Verifica el TOTP contra la semilla, aceptando la ventana actual y la
 * anterior, y devuelve cual de las dos resolvio: esa es la que se consume.
 */
export function verificarCodigo(entrada: {
  semilla: string;
  totp: string;
  ahora: Date;
}): VerificacionDeCodigo {
  for (const ventana of ventanasAceptadas(entrada.ahora)) {
    if (sonIguales(codigoDeVentana(entrada.semilla, ventana), entrada.totp)) {
      return { valido: true, ventana };
    }
  }
  return { valido: false, ventana: null };
}

/** Comparacion de tiempo constante: no filtra cuantos digitos acerto. */
function sonIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

function decodificarBase32(semilla: string): Uint8Array {
  const limpia = semilla.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;

  for (const letra of limpia) {
    const valor = ALFABETO_BASE32.indexOf(letra);
    if (valor < 0) throw new Error('La semilla no es base32.');
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Resultado de revisar el codigo tipeado. Cuando es valido trae el cliente ya
 * resuelto, asi quien decide no tiene que volver a preguntarse si era nulo.
 */
export type RevisionDeCodigo =
  { valido: true; cliente: Cliente } | { valido: false; codigo: CodigoDeError };

/**
 * El codigo tipeado contra el cliente que resolvio su prefijo: las tres
 * verificaciones que comparten sellar y canjear, en su orden.
 *
 * `cliente` es nulo cuando el prefijo no resuelve a nadie, y el resultado es
 * el mismo CODIGO_INVALIDO que si el TOTP no coincidiera. Esa igualdad es la
 * regla: distinguirlas permitiria averiguar que codigos publicos existen. Vive
 * aca, y no en `apps/api`, justamente por eso.
 *
 * `codigoYaUsado` lo responde la base: el insert en codigo_usado escribe, asi
 * que ocurre afuera, antes de decidir y en la misma transaccion (INV-9).
 */
export function revisarCodigo(entrada: {
  cliente: Cliente | null;
  codigo: string;
  codigoYaUsado: boolean;
  ahora: Date;
}): RevisionDeCodigo {
  const invalido = { valido: false, codigo: 'CODIGO_INVALIDO' } as const;

  const tipeado = partirCodigoTipeado(entrada.codigo);
  if (tipeado === null) return invalido;
  if (entrada.cliente === null) return invalido;
  if (tipeado.codigo_publico !== entrada.cliente.codigo_publico) return invalido;

  const verificacion = verificarCodigo({
    semilla: entrada.cliente.semilla_totp,
    totp: tipeado.totp,
    ahora: entrada.ahora,
  });
  if (!verificacion.valido) return invalido;

  if (entrada.codigoYaUsado) return { valido: false, codigo: 'CODIGO_YA_USADO' };
  return { valido: true, cliente: entrada.cliente };
}
