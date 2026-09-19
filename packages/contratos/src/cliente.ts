import { z } from 'zod';

/**
 * Contrato de `GET /mi/codigo`.
 *
 * El codigo lo calcula el servidor, no el telefono: la PWA no importa
 * `dominio` (CLAUDE.md, seccion 3) y, sobre todo, la semilla no sale del
 * servidor en ninguna circunstancia.
 *
 * La peticion no lleva ningun identificador de cliente, ni siquiera el propio:
 * el cliente sale del token de sesion.
 */
export const esquemaCodigoDelCliente = z.object({
  /**
   * La ventana actual y la siguiente, en ese orden. Con las dos, la app
   * aguanta un minuto sin volver a pedir, que es lo que dura una fila.
   */
  codigos: z
    .array(
      z.object({
        /** `K7Q4M-418329`. */
        codigo: z.string(),
        /** Ultimo instante en que ese codigo sirve, en UTC. */
        vence_el: z.iso.datetime(),
      }),
    )
    .length(2),
});

export type CodigoDelCliente = z.infer<typeof esquemaCodigoDelCliente>;
