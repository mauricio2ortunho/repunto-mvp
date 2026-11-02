/**
 * Lo que no sale hacia Sentry desde ninguna de las tres apps (CLAUDE.md,
 * secciones 8 y 9). Vive aca porque es el unico paquete que ven la api y los
 * dos frontends, y la regla tiene que ser la misma en los tres.
 *
 * No importa Sentry: los tipos de abajo son lo minimo de un evento que hace
 * falta tocar, y los de Sentry encajan en ellos.
 */

/**
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

export interface EventoDeError {
  request?: { method?: string; url?: string };
  user?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
}

/**
 * Lo ultimo antes de salir. Del pedido quedan el metodo y la ruta sin query:
 * ni cuerpo —el codigo, el PIN, el telefono—, ni cabeceras, ni cookies. Sin
 * usuario. Y los mensajes tachados: un error de Postgres puede citar la fila
 * que choco, telefono incluido.
 */
export function limpiarEvento<T extends EventoDeError>(evento: T): T {
  const pedido = evento.request;
  if (pedido !== undefined) {
    for (const clave of Object.keys(pedido)) {
      if (clave !== 'method' && clave !== 'url') {
        delete (pedido as Record<string, unknown>)[clave];
      }
    }
    if (pedido.url !== undefined) pedido.url = sinQuery(pedido.url);
  }
  delete evento.user;
  if (evento.message !== undefined) evento.message = tacharDatos(evento.message);
  for (const excepcion of evento.exception?.values ?? []) {
    if (excepcion.value !== undefined) excepcion.value = tacharDatos(excepcion.value);
  }
  return evento;
}

export interface MigaDeError {
  message?: string;
  data?: Record<string, unknown>;
}

/** Cada miga es un mensaje de la consola o un pedido: tachada y sin query. */
export function limpiarMiga<T extends MigaDeError>(miga: T): T {
  if (miga.message !== undefined) miga.message = tacharDatos(miga.message);
  const url = miga.data?.['url'];
  if (typeof url === 'string' && miga.data !== undefined) {
    miga.data['url'] = sinQuery(url);
  }
  return miga;
}

/**
 * Donde fallo un esquema de Zod —`progreso: invalid_type`—, nunca lo que
 * vino: la respuesta puede traer nombres y telefonos.
 */
export function problemasDelEsquema(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return [];
  const { issues } = error;
  if (!Array.isArray(issues)) return [];
  return issues.map((problema: unknown) => {
    if (typeof problema !== 'object' || problema === null) return '?';
    const camino =
      'path' in problema && Array.isArray(problema.path) ? problema.path : [];
    const codigo = 'code' in problema ? String(problema.code) : '?';
    return `${camino.join('.') || '(raiz)'}: ${codigo}`;
  });
}

function sinQuery(url: string): string {
  return url.split('?')[0] ?? url;
}
