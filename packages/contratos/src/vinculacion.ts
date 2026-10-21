import { z } from 'zod';

/**
 * `POST /caja/vinculacion`: la tablet nueva canjea el codigo de vinculacion por
 * su sesion (CLAUDE.md, seccion 5). Es publico —la tablet todavia no tiene
 * credencial—, asi que tiene tope por IP.
 */

/**
 * Lo tipeado, tal cual: la api lo normaliza —mayusculas, sin espacios ni
 * guiones— y decide. El tope de largo es solo para no aceptar cualquier cosa.
 */
export const esquemaVincularPeticion = z.object({
  codigo: z.string().min(1).max(32),
});

export type VincularPeticion = z.infer<typeof esquemaVincularPeticion>;

/**
 * El token de la tablet. Se entrega UNA sola vez: la base guarda solo su
 * hash. La tablet lo guarda y lo manda en cada pedido de la caja.
 */
export const esquemaVincularRespuesta = z.object({
  token: z.string().min(32),
});

export type VincularRespuesta = z.infer<typeof esquemaVincularRespuesta>;
