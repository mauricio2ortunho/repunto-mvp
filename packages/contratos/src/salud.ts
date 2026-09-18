import { z } from 'zod';

/**
 * Contrato de `GET /salud`.
 *
 * Existe para fijar el patron del andamiaje: un unico esquema declarado aca,
 * consumido por la api al responder y por los dos frontends al leer. Cuando
 * lleguen los contratos reales del producto, este se reemplaza sin ceremonia.
 */
export const esquemaSalud = z.object({
  estado: z.literal('ok'),
  version: z.string().min(1),
});

export type Salud = z.infer<typeof esquemaSalud>;
