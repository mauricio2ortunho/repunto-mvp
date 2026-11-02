/**
 * Lo que no sale hacia Sentry desde ninguna de las tres apps (CLAUDE.md,
 * secciones 8 y 9). Vive aca porque es el unico paquete que ven la api y los
 * dos frontends, y la regla tiene que ser la misma en los tres.
 *
 * Tacha el codigo del cliente (`K7Q4M-418329`, con o sin guion) y toda tira
 * de seis o mas digitos suelta, con o sin `+`: telefonos, el TOTP solo.
 * Respeta los UUID, cuyos tramos van pegados a guiones y letras: son los ids
 * que sirven para buscar.
 */
export function tacharDatos(texto: string): string {
  // Primero los numeros: un telefono de once digitos tambien tiene la forma
  // de un codigo sin guion, y quedaria con el + suelto.
  return texto
    .replace(/(?<![\w-])\+?\d{6,}(?![\w-])/g, '[numero]')
    .replace(/\b[A-Za-z0-9]{5}[-\s]?\d{6}\b/g, '[codigo]');
}
