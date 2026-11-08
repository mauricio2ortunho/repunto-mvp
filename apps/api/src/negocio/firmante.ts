import type { Transaccion } from '../caja/lectura';
import {
  guardarRespuestaDeAdmin,
  reservarIdempotenciaDeAdmin,
} from '../admin/idempotencia';
import {
  guardarRespuestaDeDueno,
  reservarIdempotenciaDeDueno,
} from '../dueno/idempotencia';

/**
 * Quién hace un cambio sobre un negocio: el admin de plataforma desde la
 * ficha, o alguien del negocio (hoy, el dueño desde su panel). Lo que se
 * escribe es lo mismo; cambian la firma que queda y la tabla de su
 * `Idempotency-Key`.
 */
export type Firmante =
  { tipo: 'administracion'; admin_id: string } | { tipo: 'negocio'; usuario_id: string };

export interface PeticionFirmada {
  firmante: Firmante;
  /** `POST /dueno/personas`: distinto para cada uno, como su tabla. */
  endpoint: string;
  clave: string;
  /** El cuerpo ya validado. */
  cuerpo: unknown;
}

/**
 * Null si es la primera y hay que resolverla; la respuesta guardada si es un
 * reintento. Cada firmante tiene su tabla: el admin no tiene negocio y el
 * dueño no es admin.
 */
export function reservarIdempotencia(
  tx: Transaccion,
  p: PeticionFirmada,
): Promise<unknown | null> {
  const { endpoint, clave, cuerpo } = p;
  return p.firmante.tipo === 'administracion'
    ? reservarIdempotenciaDeAdmin(tx, {
        admin_id: p.firmante.admin_id,
        endpoint,
        clave,
        cuerpo,
      })
    : reservarIdempotenciaDeDueno(tx, {
        usuario_id: p.firmante.usuario_id,
        endpoint,
        clave,
        cuerpo,
      });
}

export function guardarRespuesta(
  tx: Transaccion,
  p: PeticionFirmada,
  respuesta: unknown,
): Promise<void> {
  const { endpoint, clave, cuerpo } = p;
  return p.firmante.tipo === 'administracion'
    ? guardarRespuestaDeAdmin(
        tx,
        { admin_id: p.firmante.admin_id, endpoint, clave, cuerpo },
        respuesta,
      )
    : guardarRespuestaDeDueno(
        tx,
        { usuario_id: p.firmante.usuario_id, endpoint, clave, cuerpo },
        respuesta,
      );
}
