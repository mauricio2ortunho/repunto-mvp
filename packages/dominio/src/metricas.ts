import { DESFASE_LA_PAZ_MINUTOS, diaEnLaPaz } from './tiempo';

/**
 * Las definiciones de las metricas (CLAUDE.md, seccion 6), en un solo lugar.
 * La api las usa para contar; el panel las recibe en la respuesta y las
 * muestra en las etiquetas, asi una ventana cambia aca y en ningun otro lado.
 */

/** Cliente activo: al menos un sello en los ultimos 60 dias. */
export const DIAS_DE_CLIENTE_ACTIVO = 60;

/**
 * Un local sin sellos en 7 dias es un local donde el sistema se abandono
 * (CLAUDE.md, secciones 7 y 8).
 */
export const DIAS_DE_LOCAL_SIN_SELLOS = 7;

/** Lo que cuenta el tablero como "la semana" y "el mes" que pasaron. */
export const DIAS_DE_LA_SEMANA_QUE_PASO = 7;
export const DIAS_DEL_MES_QUE_PASO = 30;

/**
 * El primer instante del mes calendario en La Paz al que pertenece
 * `instante`: la 00:00 del dia 1, en UTC. Cliente nuevo del mes es el que
 * tuvo su primer sello desde ahi.
 */
export function inicioDelMesEnLaPaz(instante: Date): Date {
  const { anio, mes } = diaEnLaPaz(instante);
  return new Date(Date.UTC(anio, mes - 1, 1) - DESFASE_LA_PAZ_MINUTOS * 60_000);
}

/**
 * Cliente enfriado (CLAUDE.md, seccion 6): 3 o mas sellos en su historia en
 * el negocio y ninguno en los ultimos 30 dias. Venia seguido y dejo de venir:
 * es el unico numero del resumen del dueño que pide una accion.
 */
export const SELLOS_PARA_ENFRIADO = 3;
export const DIAS_DE_CLIENTE_ENFRIADO = 30;

/**
 * Cliente que volvio: con 2 o mas sellos en el negocio. Cada sello es una
 * visita aunque caiga el mismo dia: el intervalo minimo del programa ya separa
 * una visita de otra (decision del 2026-11-08).
 */
export const SELLOS_PARA_VOLVIO = 2;
