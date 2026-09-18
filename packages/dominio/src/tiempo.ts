/**
 * Zona horaria de todo corte de dia, semana o mes (CLAUDE.md, INV-21).
 * UTC-4 fijo: Bolivia no tiene horario de verano.
 */
export const ZONA_HORARIA = 'America/La_Paz';

/**
 * Minutos transcurridos entre dos instantes, truncados hacia abajo.
 *
 * Funcion de ejemplo del andamiaje. Lo que importa no es lo que calcula sino
 * la forma: `ahora` entra por parametro. Nada en `@repunto/dominio` lee el
 * reloj del sistema, porque es lo que hace testeables el vencimiento de la
 * tarjeta, el intervalo entre sellos y la ventana del codigo rotativo.
 *
 * Devuelve negativo si `ahora` es anterior a `desde`: quien llama decide si
 * eso es un error de su caso de uso.
 */
export function minutosTranscurridos(desde: Date, ahora: Date): number {
  const milisegundos = ahora.getTime() - desde.getTime();
  return Math.trunc(milisegundos / 60_000);
}
