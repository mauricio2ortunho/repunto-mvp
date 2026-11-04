/**
 * Fechas para el panel de administracion. Siempre en hora de La Paz, no en la
 * de la computadora que mira (CLAUDE.md, INV-21): el negocio vive ahi.
 */
const ZONA = 'America/La_Paz';

const FECHA_Y_HORA = new Intl.DateTimeFormat('es-BO', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "4 nov 2026, 08:00". */
export function fechaYHora(iso: string): string {
  return FECHA_Y_HORA.format(new Date(iso));
}
