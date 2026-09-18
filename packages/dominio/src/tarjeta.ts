import { diaEnLaPaz, finDelDia, sumarMesesCalendario } from './tiempo';
import type { Programa, Sello, Tarjeta } from './tipos';

/**
 * Progreso de una tarjeta: se cuentan los sellos no anulados (INV-10). No hay
 * contador; si alguna vez se agrega uno por rendimiento, es cache derivada de
 * esta cuenta.
 */
export function progresoDe(sellos: readonly Sello[]): number {
  return sellos.filter((sello) => !sello.anulado).length;
}

export function estaCompleta(progreso: number, programa: Programa): boolean {
  return progreso >= programa.sellos_requeridos;
}

export function faltanPara(progreso: number, programa: Programa): number {
  return Math.max(0, programa.sellos_requeridos - progreso);
}

/**
 * Vencida por fecha, no por estado: el cron que marca las vencidas corre una
 * vez por dia, y un sello puede llegar antes. `vence_el` es el ultimo instante
 * valido, asi que el dia del vencimiento todavia se puede sellar y canjear.
 */
export function estaVencida(tarjeta: Tarjeta, ahora: Date): boolean {
  if (tarjeta.vence_el === null) return false;
  return ahora.getTime() > tarjeta.vence_el.getTime();
}

/**
 * Vencimiento de una tarjeta a partir del instante en que arranca su reloj
 * (INV-13): un mes calendario despues, al fin del dia en La Paz. Nulo si el
 * programa no vence.
 */
export function vencimientoDesde(
  relojDesde: Date,
  vigenciaMeses: number | null,
): Date | null {
  if (vigenciaMeses === null) return null;
  return finDelDia(sumarMesesCalendario(diaEnLaPaz(relojDesde), vigenciaMeses));
}

/** El sello no anulado mas reciente, o null. */
export function ultimoSelloDe(sellos: readonly Sello[]): Sello | null {
  let ultimo: Sello | null = null;
  for (const sello of sellos) {
    if (sello.anulado) continue;
    if (ultimo === null || sello.creado_el.getTime() > ultimo.creado_el.getTime()) {
      ultimo = sello;
    }
  }
  return ultimo;
}

/** Del mas viejo al mas nuevo. Empata por id para que el orden sea estable. */
export function ordenadosPorFecha(sellos: readonly Sello[]): Sello[] {
  return [...sellos].sort((a, b) => {
    const diferencia = a.creado_el.getTime() - b.creado_el.getTime();
    return diferencia !== 0 ? diferencia : a.id.localeCompare(b.id);
  });
}
