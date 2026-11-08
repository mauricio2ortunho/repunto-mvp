import type { CondicionDelHistorial } from '@repunto/contratos';

/**
 * Quién escribió una condición, dicho para el dueño. La del alta la cargamos
 * nosotros: para él es "Repunto", no "Administración".
 */
export function autorParaElDueno(c: CondicionDelHistorial): string {
  return c.autor.tipo === 'administracion' ? 'Repunto' : c.autor.nombre;
}

/** "1 tarjeta en curso" o "3 tarjetas en curso"; "ninguna" si no hay. */
export function tarjetasEnCurso(cuantas: number): string {
  if (cuantas === 0) return 'Ninguna tarjeta en curso.';
  return cuantas === 1 ? '1 tarjeta en curso.' : `${cuantas} tarjetas en curso.`;
}
