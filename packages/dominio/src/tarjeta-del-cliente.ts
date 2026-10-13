import { estaCompleta, estaVencida, faltanPara } from './tarjeta';
import type { Tarjeta } from './tipos';

/**
 * Como ve el cliente sus tarjetas (especificacion funcional, secciones 10 y
 * 12): en que estado esta cada una y en que orden aparecen.
 *
 * Vive en el dominio y no en la app porque las dos cosas son reglas: el orden
 * "por cercania a completarse" lo pide la especificacion, y el estado depende
 * del vencimiento, que se mide con el reloj del servidor. La app las muestra.
 */

/**
 * La lista esta repetida en `packages/contratos`, por lo mismo que los codigos
 * de error: la app la necesita y contratos no puede importar dominio. Un test
 * en `apps/api` falla si dejan de coincidir.
 */
export const ESTADOS_PARA_EL_CLIENTE = [
  /** Llego a los sellos del premio: lo puede pedir en el mostrador. */
  'completa',
  /** Juntando sellos. */
  'en_curso',
  /** El negocio esta suspendido: la tarjeta no se puede sellar ni canjear, pero
   * no desaparece (especificacion, seccion 12). */
  'congelada',
  /** Paso su vencimiento. */
  'vencida',
  /** El premio ya se entrego. */
  'canjeada',
] as const;

export type EstadoParaElCliente = (typeof ESTADOS_PARA_EL_CLIENTE)[number];

/** Lo que hace falta saber de una tarjeta para decidir como la ve el cliente. */
export interface SituacionDeTarjeta {
  estado: Tarjeta['estado'];
  vence_el: Date | null;
  /** Sellos no anulados (INV-10). */
  progreso: number;
  /** Los del programa de ESTA tarjeta, no los del vigente (INV-6). */
  sellos_requeridos: number;
  /** El mas reciente no anulado, o nulo si no tiene. */
  ultimo_sello: Date | null;
  negocio_suspendido: boolean;
}

/**
 * El estado que ve el cliente. La prioridad importa, y va de lo definitivo a
 * lo transitorio:
 *
 *  - Canjeada y vencida son finales: que el negocio este suspendido ya no
 *    cambia nada.
 *  - Vencida se decide por fecha y no por la columna `estado`: el cron que la
 *    marca no corre todavia (CLAUDE.md, seccion 15), y una tarjeta completa
 *    pero vencida no se puede canjear. Mostrarla "completa" mandaria al
 *    cliente a pedir un premio que la caja le va a negar.
 *  - Congelada va antes que completa por lo mismo: con el negocio suspendido,
 *    el premio tampoco se entrega.
 */
export function estadoParaElCliente(
  tarjeta: SituacionDeTarjeta,
  ahora: Date,
): EstadoParaElCliente {
  if (tarjeta.estado === 'canjeada') return 'canjeada';
  if (tarjeta.estado === 'vencida' || estaVencida(tarjeta, ahora)) return 'vencida';
  if (tarjeta.negocio_suspendido) return 'congelada';
  if (estaCompleta(tarjeta.progreso, tarjeta)) return 'completa';
  return 'en_curso';
}

/** En que lugar de la lista va cada estado. */
const LUGAR: Record<EstadoParaElCliente, number> = {
  completa: 0,
  en_curso: 1,
  congelada: 2,
  vencida: 3,
  canjeada: 4,
};

/**
 * "Ordenada por cercania a completarse" (especificacion, seccion 10).
 *
 * Primero las completas, que tienen un premio esperando. Despues las en curso,
 * de la que menos sellos le faltan a la que mas: se cuenta en sellos y no en
 * porcentaje, porque el cliente piensa "me falta uno", no "voy por el 80 %".
 * Al final las que ya no suman: congeladas y vencidas. Dentro de un mismo
 * lugar, la que se uso mas recientemente va primero.
 *
 * Devuelve un arreglo nuevo: no toca el que recibe.
 */
export function ordenarParaElCliente<T extends SituacionDeTarjeta>(
  tarjetas: readonly T[],
  ahora: Date,
): T[] {
  const conEstado = tarjetas.map((tarjeta) => ({
    tarjeta,
    lugar: LUGAR[estadoParaElCliente(tarjeta, ahora)],
    faltan: faltanPara(tarjeta.progreso, tarjeta),
    reciente: tarjeta.ultimo_sello?.getTime() ?? Number.NEGATIVE_INFINITY,
  }));

  conEstado.sort(
    (a, b) => a.lugar - b.lugar || a.faltan - b.faltan || b.reciente - a.reciente,
  );
  return conEstado.map(({ tarjeta }) => tarjeta);
}
