/**
 * Un reloj alineado con el del servidor.
 *
 * El reloj del telefono puede estar corrido minutos, y una cuenta regresiva
 * con ese reloj mostraria vigente un codigo que la caja ya no acepta. Este
 * toma el `ahora` que mando la api y avanza con un reloj monotono
 * (`performance.now()`), que no salta si el usuario cambia la hora.
 */
export interface RelojDelServidor {
  /** Milisegundos desde 1970, en el reloj del servidor. */
  ahora(): number;
}

export function relojDesde(
  ahoraDelServidor: string,
  monotono: () => number = () => performance.now(),
): RelojDelServidor {
  const base = Date.parse(ahoraDelServidor);
  const desde = monotono();
  return { ahora: () => base + (monotono() - desde) };
}
