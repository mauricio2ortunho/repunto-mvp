import { errorDeApi } from '../caja/errores-http';
import { huellaDe } from '../caja/idempotencia';
import type { Transaccion } from '../caja/lectura';

/**
 * `Idempotency-Key` para lo que crea el panel de administracion. El mismo
 * mecanismo que la caja (caja/idempotencia.ts, donde esta explicado), sobre
 * `peticion_idempotente_admin`: aquella tabla se indexa por tablet y el admin
 * no tiene una.
 */

export interface PeticionIdempotenteDeAdmin {
  admin_id: string;
  /** `POST /admin/negocios`. */
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
 * Null si esta peticion es la primera y hay que resolverla; la respuesta ya
 * guardada si es un reintento de una que termino.
 */
export async function reservarIdempotenciaDeAdmin(
  tx: Transaccion,
  peticion: PeticionIdempotenteDeAdmin,
): Promise<unknown | null> {
  const huella = huellaDe(peticion.cuerpo);

  const insertadas = await tx.$executeRaw`
    INSERT INTO peticion_idempotente_admin (admin_id, clave, endpoint, huella_peticion)
    VALUES (${peticion.admin_id}::uuid, ${peticion.clave}, ${peticion.endpoint}, ${huella})
    ON CONFLICT DO NOTHING`;
  if (insertadas === 1) return null;

  const filas = await tx.$queryRaw<FilaGuardada[]>`
    SELECT huella_peticion, respuesta
    FROM peticion_idempotente_admin
    WHERE admin_id = ${peticion.admin_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
  const guardada = filas[0];
  if (guardada === undefined) {
    throw new Error('La clave de idempotencia choco y despues no estaba.');
  }
  if (guardada.huella_peticion !== huella) throw errorDeApi('IDEMPOTENCIA_DISTINTA');
  if (guardada.respuesta === null) {
    throw new Error('Una peticion idempotente commiteada sin respuesta.');
  }
  return guardada.respuesta;
}

export async function guardarRespuestaDeAdmin(
  tx: Transaccion,
  peticion: PeticionIdempotenteDeAdmin,
  respuesta: unknown,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE peticion_idempotente_admin
    SET respuesta = ${JSON.stringify(respuesta)}::jsonb
    WHERE admin_id = ${peticion.admin_id}::uuid
      AND endpoint = ${peticion.endpoint}
      AND clave = ${peticion.clave}`;
}
