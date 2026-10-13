import type { PeticionDeCaja } from './dispositivo.guard';
import { errorDeApi } from './errores-http';

/**
 * Lo que toda peticion de caja necesita antes de llegar al caso de uso.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Obligatoria en todo endpoint que crea algo (CLAUDE.md, seccion 9). Que falte
 * es un bug del panel: sin ella, el doble toque del cajero crea dos sellos.
 */
export function claveDeIdempotencia(peticion: PeticionDeCaja): string {
  const clave = peticion.headers['idempotency-key'];
  // El tope de 200 es el de `peticion_idempotente_clave_razonable_chk`. Sin
  // chequearlo aca, una clave mas larga llegaba a la base y volvia como 500.
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 200) {
    throw errorDeApi('FALTA_IDEMPOTENCY_KEY');
  }
  return clave;
}

/**
 * El id del objeto sobre el que se opera. Se valida antes de que llegue a la
 * consulta: un `::uuid` con basura adentro revienta en Postgres, y eso seria
 * un 500 donde corresponde un 422.
 */
export function idEnLaRuta(valor: string): string {
  if (!UUID.test(valor)) throw errorDeApi('PETICION_INVALIDA');
  return valor;
}
