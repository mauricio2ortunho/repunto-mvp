import { errorDeApi } from '../caja/errores-http';
import { huellaDe } from '../caja/idempotencia';
import type { Transaccion } from '../caja/lectura';

/**
 * `Idempotency-Key` para lo que crea el panel del dueño. El mismo mecanismo
 * que la caja (caja/idempotencia.ts, donde está explicado), sobre
 * `peticion_idempotente_dueno`: el dueño no tiene tablet ni es admin.
 */

export interface PeticionIdempotenteDeDueno {
  usuario_id: string;
  /** `POST /dueno/promo/programa`. */
  endpoint: string;
  clave: string;
  /** El cuerpo ya validado. */
  cuerpo: unknown;
}

interface FilaGuardada {
  huella_peticion: string;
  respuesta: unknown;
}

/**
 * Null si esta petición es la primera y hay que resolverla; la respuesta ya
 * guardada si es un reintento de una que terminó.
 */
export async function reservarIdempotenciaDeDueno(
  tx: Transaccion,
  peticion: PeticionIdempotenteDeDueno,
): Promise<unknown | null> {
  const huella = huellaDe(peticion.cuerpo);

  const insertadas = await tx.$executeRaw`
    INSERT INTO peticion_idempotente_dueno (usuario_id, clave, endpoint, huella_peticion)
    VALUES (${peticion.usuario_id}::uuid, ${peticion.clave}, ${peticion.endpoint}, ${huella})
    ON CONFLICT DO NOTHING`;
  if (insertadas === 1) return null;

  const filas = await tx.$queryRaw<FilaGuardada[]>`
    SELECT huella_peticion, respuesta
    FROM peticion_idempotente_dueno
    WHERE usuario_id = ${peticion.usuario_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
  const guardada = filas[0];
  if (guardada === undefined) {
    throw new Error('La clave de idempotencia chocó y después no estaba.');
  }
  if (guardada.huella_peticion !== huella) throw errorDeApi('IDEMPOTENCIA_DISTINTA');
  if (guardada.respuesta === null) {
    throw new Error('Una petición idempotente commiteada sin respuesta.');
  }
  return guardada.respuesta;
}

export async function guardarRespuestaDeDueno(
  tx: Transaccion,
  peticion: PeticionIdempotenteDeDueno,
  respuesta: unknown,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE peticion_idempotente_dueno
    SET respuesta = ${JSON.stringify(respuesta)}::jsonb
    WHERE usuario_id = ${peticion.usuario_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
}
