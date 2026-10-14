/**
 * Plata para mostrar. Vive aca, y no en cada app, porque el panel y la app del
 * cliente tienen que mostrar el mismo monto de la misma forma.
 *
 * La api manda los montos como texto decimal (`"30.00"`): la plata no viaja en
 * coma flotante (CLAUDE.md, seccion 9), y tampoco pasa por un numero aca.
 */

/**
 * `30.00` -> `Bs 30`, `1500.5` -> `Bs 1.500,50`. Trabaja sobre el texto. Si no
 * tiene forma de monto, se muestra tal cual.
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
