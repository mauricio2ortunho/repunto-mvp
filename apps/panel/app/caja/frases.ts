import type { AnularRespuesta, CanjearRespuesta } from '@repunto/contratos';

/**
 * Lo que el cajero le dice al cliente en voz alta.
 *
 * Solo pone en palabras lo que ya decidio la API. No calcula nada: si la
 * tarjeta esta completa lo dice `completa`, no `faltan === 0`, y quien elige
 * que frase usar es la vista, mirando ese campo.
 *
 * El premio no va adentro de la frase porque no sabemos como viene escrito
 * ("Cafe americano", "un cafe gratis"): metido en una oracion queda mal la
 * mitad de las veces. Se muestra aparte, debajo.
 */

interface Avance {
  nombre: string;
  progreso: number;
  faltan: number;
}

/** "Juan Perez" se saluda "Juan": la frase se dice en voz alta. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

function saludo(nombre: string): string {
  const n = primerNombre(nombre);
  return n === '' ? '¡Listo!' : `¡Listo, ${n}!`;
}

export function fraseDeAvance(progreso: number, faltan: number): string {
  const falta =
    faltan === 1
      ? '¡Te falta uno solo para el premio!'
      : `Te faltan ${faltan} para el premio.`;
  if (progreso === 0) return falta;
  if (progreso === 1) return `Ese es tu primer sello. ${falta}`;
  return `Ya llevás ${progreso} sellos. ${falta}`;
}

/** Despues de sellar una tarjeta que no se completo. */
export function fraseDelSello(r: Avance): string {
  return `${saludo(r.nombre)} ${fraseDeAvance(r.progreso, r.faltan)}`;
}

/** Despues de confirmar un registro, con o sin sello en el mismo acto. */
export function fraseDelAlta(r: Avance): string {
  return `${saludo(r.nombre)} Ya tenés tu tarjeta. ${fraseDeAvance(r.progreso, r.faltan)}`;
}

export function fraseDeTarjetaCompleta(nombre: string): string {
  const n = primerNombre(nombre);
  return n === ''
    ? '¡Felicitaciones! Completaste la tarjeta y te ganaste el premio.'
    : `¡Felicitaciones, ${n}! Completaste la tarjeta y te ganaste el premio.`;
}

export function fraseDelCanje(r: CanjearRespuesta): string {
  const n = primerNombre(r.nombre);
  const base = n === '' ? '¡Acá tenés tu premio!' : `¡Acá tenés tu premio, ${n}!`;
  if (r.sobrantes === 0) return base;
  const sellos = r.sobrantes === 1 ? '1 sello' : `${r.sobrantes} sellos`;
  return `${base} Y ya arrancás la tarjeta nueva con ${sellos}.`;
}

/**
 * Despues de deshacer. No se dice en voz alta: casi siempre se deshace porque
 * se sello a otro cliente, que ya no esta. Es para el cajero.
 */
export function fraseDeAnulacion(r: AnularRespuesta): string {
  if (r.completa) return 'La tarjeta sigue completa.';
  const sellos = r.progreso === 1 ? '1 sello' : `${r.progreso} sellos`;
  const falta = r.faltan === 1 ? 'le falta 1' : `le faltan ${r.faltan}`;
  return `Quedó con ${sellos}: ${falta} para el premio.`;
}

/**
 * `30.00` -> `Bs 30`, `1500.5` -> `Bs 1.500,50`. Trabaja sobre el texto: el
 * monto no pasa por un numero de punto flotante. Si no tiene forma de monto,
 * se muestra tal cual.
 */
export function formatearBolivianos(monto: string): string {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(monto.trim());
  if (m?.[1] === undefined) return `Bs ${monto.trim()}`;
  const entero = m[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = (m[2] ?? '').padEnd(2, '0');
  return /^0*$/.test(decimales) ? `Bs ${entero}` : `Bs ${entero},${decimales}`;
}

/** Un monto minimo de cero no es condicion: no se muestra. */
export function esMontoCero(monto: string): boolean {
  return /^0*(?:[.,]0*)?$/.test(monto.trim());
}

/** Para distinguir dos registros con el mismo nombre. Tolera relojes corridos. */
export function haceCuanto(creadoEl: string, ahora: number): string {
  const minutos = Math.floor((ahora - Date.parse(creadoEl)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
}
