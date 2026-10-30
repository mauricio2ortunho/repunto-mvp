/**
 * Valores que vienen del entorno. Son variables NEXT_PUBLIC_: Next las copia
 * dentro del bundle al compilar, asi que nada de aca es secreto.
 */

/** Sin barra final, para poder concatenar rutas que empiezan con `/`. */
export const urlDeLaApi = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/+$/, '');

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
