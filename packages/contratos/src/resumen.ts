import { z } from 'zod';

/**
 * `GET /dueno/resumen`: cómo le va al negocio del dueño. El negocio sale de
 * la sesión (INV-1). Cuenta con las definiciones de la sección 6 de
 * CLAUDE.md, que decide el dominio; las ventanas viajan en la respuesta para
 * que el panel las use en las etiquetas sin repetirlas.
 *
 * Un sello anulado no cuenta en nada: es un error que se deshizo.
 */

const cantidad = z.int().nonnegative();

export const esquemaLocalEnElResumen = z.object({
  id: z.uuid(),
  nombre: z.string(),
  sellos_semana: cantidad,
  /** Último sello no anulado, de cualquiera de sus tablets. */
  ultimo_sello: z.iso.datetime().nullable(),
  tablets_activas: cantidad,
});

export type LocalEnElResumen = z.infer<typeof esquemaLocalEnElResumen>;

export const esquemaResumenDelDueno = z.object({
  generado_el: z.iso.datetime(),
  /** Desde cuándo cuenta "el mes": la 00:00 del día 1 en La Paz. */
  inicio_del_mes: z.iso.datetime(),
  ventanas: z.object({
    semana_dias: z.int().positive(),
    mes_dias: z.int().positive(),
    cliente_activo_dias: z.int().positive(),
    enfriado_dias: z.int().positive(),
    sellos_para_enfriado: z.int().positive(),
    local_sin_sellos_dias: z.int().positive(),
  }),
  clientes: z.object({
    /** Con al menos un sello en el negocio, en toda su historia. */
    con_sellos: cantidad,
    /** Con al menos un sello en la ventana de cliente activo. */
    activos: cantidad,
    /** Su primer sello en este negocio cayó en el mes calendario. */
    nuevos_del_mes: cantidad,
    /** Con 2 o más sellos: volvieron al menos una vez. */
    volvieron: cantidad,
    /** 3 o más sellos y ninguno en la ventana de enfriado. */
    enfriados: cantidad,
  }),
  visitas: z.object({
    sellos_semana: cantidad,
    sellos_mes: cantidad,
    /** Sellos del mes que no fueron el primero de su cliente: alguien volvió. */
    regresos_mes: cantidad,
    /**
     * Mediana de días entre sellos consecutivos del mismo cliente, con un
     * decimal. Null si nadie volvió todavía.
     */
    dias_entre_visitas: z.number().nonnegative().nullable(),
  }),
  premios: z.object({
    canjes_mes: cantidad,
    /** Activas y con al menos un sello: las vacías no cuentan. */
    tarjetas_abiertas: cantidad,
    /** Activas y con los sellos que pide su programa: falta entregar el premio. */
    listas_para_canjear: cantidad,
  }),
  /** Los locales abiertos. */
  locales: z.array(esquemaLocalEnElResumen),
});

export type ResumenDelDueno = z.infer<typeof esquemaResumenDelDueno>;
