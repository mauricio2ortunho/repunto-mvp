/**
 * Fechas para mostrar, siempre en hora de La Paz y nunca en la del telefono
 * (INV-21). La api manda instantes en UTC; aca se les pone la zona.
 *
 * La zona va escrita aca y no importada: la app no puede importar el dominio
 * (CLAUDE.md, seccion 3). Es la misma que `ZONA_HORARIA` de alla.
 */
const ZONA = 'America/La_Paz';

const UN_DIA_MS = 86_400_000;

const diaLargo = new Intl.DateTimeFormat('es-BO', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'long',
});

const fechaYHora = new Intl.DateTimeFormat('es-BO', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `AAAA-MM-DD` del dia en La Paz: sirve para contar dias calendario. */
const claveDeDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "14 de noviembre". */
export function diaEnLaPaz(iso: string): string {
  return diaLargo.format(new Date(iso));
}

/** El dia y la hora de La Paz, por ejemplo "12 oct, 17:02". */
export function fechaYHoraEnLaPaz(iso: string): string {
  return fechaYHora.format(new Date(iso));
}

/**
 * Cuantos dias calendario de La Paz faltan hasta ese instante: 0 si es hoy, 1
 * si es mañana. Se cuentan dias y no horas: una tarjeta que vence esta noche
 * "vence hoy" aunque falten veinte horas.
 */
export function diasHasta(iso: string, ahora: number): number {
  const hoy = Date.parse(`${claveDeDia.format(new Date(ahora))}T00:00:00Z`);
  const ese = Date.parse(`${claveDeDia.format(new Date(iso))}T00:00:00Z`);
  return Math.round((ese - hoy) / UN_DIA_MS);
}
