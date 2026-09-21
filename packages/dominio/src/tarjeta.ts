import { diaEnLaPaz, finDelDia, sumarMesesCalendario } from './tiempo';
import type { Programa, Sello, Tarjeta, TarjetaEnCurso } from './tipos';

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

/** Cual es la tarjeta que aplica, y con que regla. */
export interface TarjetaElegida {
  /** La tarjeta sobre la que se opera, o null si hay que abrir una nueva. */
  enCurso: TarjetaEnCurso | null;
  /** La vencida que hay que cerrar antes de abrir la nueva, o null. */
  vencerTarjeta: string | null;
  /** La regla que rige: la de la tarjeta en curso (INV-6) o la vigente. */
  programa: Programa | null;
}

/**
 * Resuelve sobre que tarjeta se opera. Lo comparten el sellado y el alta del
 * cliente, que llegan al mismo punto por caminos distintos.
 *
 * Una tarjeta vencida deja de estar en curso: se cierra y se abre otra con la
 * regla vigente de hoy. El cron que vence tarjetas corre una vez por dia, y
 * trabar al cajero con el cliente enfrente hasta las 00:15 del dia siguiente
 * es el peor momento posible para hacerlo esperar.
 */
export function elegirTarjeta(
  enCurso: TarjetaEnCurso | null,
  programaVigente: Programa | null,
  ahora: Date,
): TarjetaElegida {
  const vencida =
    enCurso !== null && estaVencida(enCurso.tarjeta, ahora) ? enCurso : null;
  const vigente = vencida === null ? enCurso : null;
  return {
    enCurso: vigente,
    vencerTarjeta: vencida === null ? null : vencida.tarjeta.id,
    programa: vigente?.programa ?? programaVigente,
  };
}
