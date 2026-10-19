import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * El PIN de cuatro digitos del cajero, hasheado con scrypt y sal propia.
 *
 * Es el caso contrario al token (ver `token.ts`): diez mil combinaciones se
 * prueban en un instante contra un SHA-256, asi que el hash tiene que ser
 * lento y salado. Que sea salado es tambien lo que hace imposible buscar a un
 * cajero por su PIN, y es correcto: el PIN confirma, no identifica, y dos
 * cajeros pueden tener el mismo (CLAUDE.md, seccion 5).
 *
 * El freno de verdad no es este: es el bloqueo por PIN equivocados. Con diez
 * mil combinaciones, ningun hash salva un PIN que se puede probar sin limite.
 *
 * El PIN no se registra nunca: ni en el log, ni en una respuesta, ni en
 * Sentry (CLAUDE.md, seccion 8).
 *
 * Formato guardado: `scrypt$v1$<sal base64>$<hash base64>`. La version deja
 * cambiar los parametros mas adelante sin romper los PIN que ya existen.
 */

const VERSION = 'v1';
const LARGO_SAL = 16;
const LARGO_HASH = 32;
/** Los parametros por defecto de Node: ~50 ms por verificacion. */
const PARAMETROS = { N: 16_384, r: 8, p: 1 } as const;

export const FORMATO_DE_PIN = /^\d{4}$/;

export async function hashDePin(pin: string): Promise<string> {
  if (!FORMATO_DE_PIN.test(pin)) throw new Error('El PIN son cuatro digitos.');
  const sal = randomBytes(LARGO_SAL);
  const hash = await derivar(pin, sal);
  return ['scrypt', VERSION, sal.toString('base64'), hash.toString('base64')].join('$');
}

/**
 * Si el PIN coincide con el hash guardado. Un hash con otro formato o
 * corrupto es `false`, no una excepcion: para la caja, es un PIN que no entra.
 */
export async function pinCoincide(pin: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'scrypt' || partes[1] !== VERSION)
    return false;
  const sal = Buffer.from(partes[2] ?? '', 'base64');
  const esperado = Buffer.from(partes[3] ?? '', 'base64');
  if (sal.length !== LARGO_SAL || esperado.length !== LARGO_HASH) return false;

  const hash = await derivar(pin, sal);
  // Comparacion en tiempo constante: que el tiempo de respuesta no diga
  // cuantos bytes coincidieron.
  return timingSafeEqual(hash, esperado);
}

function derivar(pin: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolver, fallar) => {
    scrypt(pin, sal, LARGO_HASH, PARAMETROS, (error, clave) => {
      if (error !== null) fallar(error);
      else resolver(clave);
    });
  });
}
