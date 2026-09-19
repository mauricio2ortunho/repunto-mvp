import { createHash } from 'node:crypto';

import { errorDeApi } from './errores-http';
import type { Transaccion } from './lectura';

/**
 * `Idempotency-Key`: el cajero va a tocar el boton dos veces.
 *
 * Todo pasa dentro de la misma transaccion del sellado o del canje, y eso es
 * lo que hace innecesario cualquier estado "en curso":
 *
 *  1. La transaccion inserta su fila apenas resuelve de que tablet viene.
 *  2. Si entra un segundo intento con la misma clave, su INSERT queda
 *     bloqueado en la clave primaria hasta que el primero termine.
 *  3. Si el primero commiteo, el segundo encuentra el conflicto, lee la
 *     respuesta guardada y devuelve exactamente eso.
 *  4. Si el primero fallo y deshizo, la fila no existe y el segundo sigue de
 *     largo como si fuera el primero. Un rechazo no se cachea: el reintento
 *     vuelve a decidir con el estado de ese momento.
 *
 * La misma clave en otro endpoint es otra peticion, no un reintento: por eso
 * el endpoint es parte de la clave primaria.
 */

export interface PeticionIdempotente {
  dispositivo_id: string;
  /** `POST /caja/sellos`. */
  endpoint: string;
  /** Lo que la tablet mando en la cabecera. */
  clave: string;
  /** El cuerpo ya validado. Su huella distingue un reintento de otra cosa. */
  cuerpo: unknown;
}

interface FilaGuardada {
  huella_peticion: string;
  respuesta: unknown;
}

/**
 * Reserva la clave. Devuelve null si esta peticion es la primera y hay que
 * resolverla, o la respuesta ya guardada si es un reintento de una que
 * termino.
 */
export async function reservarIdempotencia(
  tx: Transaccion,
  peticion: PeticionIdempotente,
): Promise<unknown | null> {
  const huella = huellaDe(peticion.cuerpo);

  const insertadas = await tx.$executeRaw`
    INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
    VALUES (${peticion.dispositivo_id}::uuid, ${peticion.clave}, ${peticion.endpoint}, ${huella})
    ON CONFLICT DO NOTHING`;
  if (insertadas === 1) return null;

  const filas = await tx.$queryRaw<FilaGuardada[]>`
    SELECT huella_peticion, respuesta
    FROM peticion_idempotente
    WHERE dispositivo_id = ${peticion.dispositivo_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
  const guardada = filas[0];
  if (guardada === undefined) {
    throw new Error('La clave de idempotencia choco y despues no estaba.');
  }

  // Misma clave, otro cuerpo: no es un reintento, es un bug del panel.
  // Devolverle la respuesta de otra operacion seria peor que fallar.
  if (guardada.huella_peticion !== huella) throw errorDeApi('IDEMPOTENCIA_DISTINTA');

  if (guardada.respuesta === null) {
    // Imposible: la respuesta se guarda en la misma transaccion que inserto la
    // fila, asi que desde afuera nunca se ve una sin respuesta.
    throw new Error('Una peticion idempotente commiteada sin respuesta.');
  }
  return guardada.respuesta;
}

/** Guarda lo que se respondio, para que el reintento devuelva lo mismo. */
export async function guardarRespuesta(
  tx: Transaccion,
  peticion: PeticionIdempotente,
  respuesta: unknown,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE peticion_idempotente
    SET respuesta = ${JSON.stringify(respuesta)}::jsonb
    WHERE dispositivo_id = ${peticion.dispositivo_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
}

function huellaDe(cuerpo: unknown): string {
  return createHash('sha256').update(JSON.stringify(cuerpo), 'utf8').digest('hex');
}
