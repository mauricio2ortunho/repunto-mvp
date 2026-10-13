/**
 * Valores que vienen del entorno. Son variables NEXT_PUBLIC_: Next las copia
 * dentro del bundle al compilar, asi que nada de aca es secreto.
 */

/** Sin barra final, para poder concatenar rutas que empiezan con `/`. */
export const urlDeLaApi = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/+$/, '');

/**
 * Token compartido para desarrollo y staging. Solo siembra el almacenamiento
 * de la tablet cuando esta vacio (ver `credencial.ts`); el cliente HTTP nunca
 * lo lee directo.
 *
 * En produccion no va: cada tablet tiene su propio token, obtenido al
 * vincularla. Con uno compartido, todas las cajas de un local quedan bajo el
 * mismo turno y la auditoria de quien sello que se rompe.
 */
export const tokenDeEntorno: string | null = process.env.NEXT_PUBLIC_TOKEN_TABLET || null;
