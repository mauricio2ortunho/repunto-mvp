import { z } from 'zod';

/**
 * `GET /admin/tablero`: el tablero del piloto. Una fila por negocio con lo
 * que dice si el sistema se esta usando: sellos, canjes, clientes, y el
 * ultimo sello de cada local abierto.
 *
 * Las ventanas viajan en la respuesta: las decide el dominio, y el panel las
 * usa en las etiquetas ("activos en 60 dias") sin repetirlas.
 */

const cantidad = z.int().nonnegative();

export const esquemaLocalEnElTablero = z.object({
  id: z.uuid(),
  nombre: z.string(),
  /** Ultimo sello no anulado, de cualquiera de sus tablets. */
  ultimo_sello: z.iso.datetime().nullable(),
  tablets_activas: cantidad,
});

export type LocalEnElTablero = z.infer<typeof esquemaLocalEnElTablero>;

export const esquemaNegocioEnElTablero = z.object({
  id: z.uuid(),
  nombre: z.string(),
  estado: z.enum(['activo', 'suspendido']),
  /** Sellos no anulados en la ultima semana y en el ultimo mes. */
  sellos_semana: cantidad,
  sellos_mes: cantidad,
  canjes_mes: cantidad,
  /** Con al menos un sello en la ventana de cliente activo. */
  clientes_activos: cantidad,
  /** Su primer sello en este negocio cayo en el mes calendario, en La Paz. */
  clientes_nuevos_del_mes: cantidad,
  /** Activas y con al menos un sello: las vacias no cuentan (seccion 6). */
  tarjetas_abiertas: cantidad,
  /** Solo los abiertos. */
  locales: z.array(esquemaLocalEnElTablero),
});

export type NegocioEnElTablero = z.infer<typeof esquemaNegocioEnElTablero>;

export const esquemaTableroDelPiloto = z.object({
  generado_el: z.iso.datetime(),
  /** Desde cuando cuenta "el mes": la 00:00 del dia 1 en La Paz. */
  inicio_del_mes: z.iso.datetime(),
  ventanas: z.object({
    semana_dias: z.int().positive(),
    mes_dias: z.int().positive(),
    cliente_activo_dias: z.int().positive(),
    local_sin_sellos_dias: z.int().positive(),
  }),
  /** Los activos primero, por nombre. */
  negocios: z.array(esquemaNegocioEnElTablero),
});

export type TableroDelPiloto = z.infer<typeof esquemaTableroDelPiloto>;
