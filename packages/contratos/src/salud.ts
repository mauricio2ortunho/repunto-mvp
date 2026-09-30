import { z } from 'zod';

/**
 * Contrato de `GET /salud`.
 *
 * Lo consultan el chequeo del hosting y los dos frontends. Incluye el estado
 * de la base a proposito: una api que responde pero no puede consultar no esta
 * sana, y un chequeo que devuelve verde en ese caso es peor que no tenerlo.
 */
export const esquemaSalud = z.object({
  estado: z.enum(['ok', 'degradado']),
  version: z.string().min(1),
  /** Si la base contesta una consulta trivial. */
  base: z.enum(['ok', 'sin-conexion']),
});

export type Salud = z.infer<typeof esquemaSalud>;
