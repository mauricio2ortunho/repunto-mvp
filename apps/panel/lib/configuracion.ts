/**
 * Valores que vienen del entorno. Son variables NEXT_PUBLIC_: Next las copia
 * dentro del bundle al compilar, asi que nada de aca es secreto.
 */

/** Sin barra final, para poder concatenar rutas que empiezan con `/`. */
export const urlDeLaApi = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/+$/, '');

/**
 * Donde contesta la app del cliente, sin barra final: el QR impreso de cada
 * local lleva a `<esta url>/r/<qr>`. En `next dev`, la app del cliente local.
 *
 * Fuera de `next dev` no hay valor por defecto: null si falta, y la hoja del
 * QR avisa en lugar de dibujar. Un cartel impreso que apunta a localhost se
 * pega en el mostrador y nadie se entera hasta que un cliente lo escanea.
 */
export const urlDeLaAppDelCliente: string | null =
  (
    process.env.NEXT_PUBLIC_URL_CLIENTE ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
  ).replace(/\/+$/, '') || null;

/**
 * Token de la tablet de demo, SOLO para `next dev`. Siembra el almacenamiento
 * de la tablet cuando esta vacio (ver `credencial.ts`), para no tener que
 * vincular el navegador de desarrollo cada vez que se limpia.
 *
 * En cualquier build —staging y produccion— se ignora aunque la variable
 * este cargada: lo que empieza con NEXT_PUBLIC_ viaja en el JavaScript que
 * baja cualquiera, y con el se podia sellar. Cada tablet obtiene el suyo en
 * /vincular. Con uno compartido, ademas, todas las cajas quedan bajo el mismo
 * turno y la auditoria de quien sello que se rompe.
 */
export const tokenDeEntorno: string | null =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_TOKEN_TABLET || null
    : null;
