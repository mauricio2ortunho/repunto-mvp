/**
 * Donde contesta la api. Sin barra final: las rutas la traen.
 *
 * Es NEXT_PUBLIC_ porque la usa el navegador. Se graba en el build: cambiarla
 * en el hosting no hace efecto hasta volver a desplegar.
 */
export const urlDeLaApi = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/+$/, '');
