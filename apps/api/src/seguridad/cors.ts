/**
 * CORS: quien puede llamar a esta api desde un navegador.
 *
 * Hace falta porque los frontends viven en otro origen —Netlify— y el
 * navegador bloquea de entrada cualquier llamada entre origenes distintos. Sin
 * esto no falla un endpoint: fallan todos, y solo en un navegador. Los tests
 * de integracion usan `fetch` desde Node, que ignora CORS por completo, asi
 * que este archivo tiene su propio test de preflight.
 *
 * Tres cosas que no son obvias y que sin ellas el panel no anda:
 *
 *  - `Authorization`, `Idempotency-Key` e `If-None-Match` no estan en la lista
 *    blanca del navegador. Hay que nombrarlas o el preflight las rechaza.
 *  - `ETag` no se puede LEER desde JavaScript salvo que se exponga. Sin eso, el
 *    panel manda `If-None-Match` vacio para siempre y nunca recibe un 304: no
 *    se rompe nada visible, solo deja de funcionar el ahorro.
 *  - El preflight se cachea. Como cada consulta de la lista de registros lleva
 *    `If-None-Match`, sin cache el panel haria dos viajes cada tres segundos.
 */

/** Un dia. El navegador recorta este numero a su maximo, y esta bien. */
const SEGUNDOS_DE_CACHE = 86_400;

/** Lo que usa el panel en desarrollo: cliente en 3000, panel en 3002. */
const EN_DESARROLLO = ['http://localhost:3000', 'http://localhost:3002'];

export interface OpcionesDeCors {
  origin: (
    origen: string | undefined,
    responder: (error: Error | null, permitido?: boolean) => void,
  ) => void;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * La lista de origenes, de `ORIGENES_PERMITIDOS`, separados por coma.
 *
 * En produccion es obligatoria: si falta, la api no arranca. La alternativa
 * —abrir a todos, o no abrir a nadie— se descubriria recien en el navegador de
 * alguien, con un error de CORS que no dice que falta una variable.
 */
export function origenesPermitidos(): string[] {
  const crudo = process.env['ORIGENES_PERMITIDOS'];
  const lista = (crudo ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');

  if (lista.length > 0) return lista;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'Falta ORIGENES_PERMITIDOS: sin ella, ningun navegador puede llamar a la api. ' +
        'Son los origenes de los frontends separados por coma, por ejemplo ' +
        'https://repunto-panel.netlify.app,https://repunto-cliente.netlify.app',
    );
  }
  return EN_DESARROLLO;
}

/**
 * Si ese origen esta permitido.
 *
 * Acepta un comodin de subdominio —`https://*.netlify.app`— porque cada
 * preview de Netlify tiene su propia URL y nadie va a mantener esa lista a
 * mano. El comodin cubre subdominios, nunca el dominio pelado.
 */
export function origenPermitido(origen: string, permitidos: readonly string[]): boolean {
  return permitidos.some((patron) => coincide(origen, patron));
}

function coincide(origen: string, patron: string): boolean {
  if (patron === origen) return true;
  if (!patron.includes('://*.')) return false;

  const [protocolo, hostDelPatron] = patron.split('://');
  if (protocolo === undefined || hostDelPatron === undefined) return false;

  let url: URL;
  try {
    url = new URL(origen);
  } catch {
    return false;
  }
  if (url.protocol !== `${protocolo}:`) return false;
  return url.host.endsWith(`.${hostDelPatron.slice('*.'.length)}`);
}

/**
 * Lo que recibe `app.enableCors`.
 *
 * `credentials` va en false a proposito: la caja y el cliente se autentican con
 * un token en la cabecera `Authorization`, no con cookies. Ponerlo en true
 * obligaria a devolver el origen exacto en cada respuesta sin ganar nada.
 */
export function opcionesDeCors(permitidos = origenesPermitidos()): OpcionesDeCors {
  return {
    origin(origen, responder) {
      // Sin cabecera `Origin` no es un navegador: curl, otra api, un health
      // check. CORS no se aplica ahi y no hay nada que proteger.
      if (origen === undefined) return responder(null, true);
      responder(null, origenPermitido(origen, permitidos));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'If-None-Match'],
    // X-Request-Id: el panel lo puede mostrar en un error, y con el se
    // encuentra el pedido en el log y en la bitacora.
    exposedHeaders: ['ETag', 'X-Request-Id'],
    credentials: false,
    maxAge: SEGUNDOS_DE_CACHE,
  };
}
