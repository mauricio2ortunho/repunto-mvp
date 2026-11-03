import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El sistema de diseno compartido se publica como codigo fuente, con sus
  // modulos CSS: lo compila esta app, no un build propio.
  transpilePackages: ['@repunto/ui'],
};

/**
 * Sentry en el build (lib/sentry.ts es el del navegador). Lo que importa aca
 * es lo que NO entra: sin esto el bundle crece con medicion de rendimiento y
 * grabacion de sesion que no se usan, y es lo que baja el telefono del
 * cliente, muchas veces con datos moviles.
 *
 * La app no hace nada del lado del servidor —las paginas son estaticas y
 * hablan con la api desde el navegador—, asi que no se instrumenta.
 *
 * Los source maps se suben a Sentry al compilar, para que un error diga
 * archivo y linea del codigo, y se borran antes de publicar: nadie de afuera
 * los descarga. Suben solo si existe `SENTRY_AUTH_TOKEN` (en Vercel); sin el,
 * el build sigue igual y no sube nada.
 */
// `silent` calla tambien lo que falla: sin esto, un token que no llega al build
// o una subida rechazada no dejan ni una linea en el log de Vercel.
if (process.env.SENTRY_AUTH_TOKEN === undefined) {
  console.warn('[sentry] Sin SENTRY_AUTH_TOKEN: este build no sube source maps.');
}

export default withSentryConfig(nextConfig, {
  org: 'joel-04',
  project: 'repunto-cliente',
  silent: true,
  errorHandler: (error) => {
    console.warn(`[sentry] No se subieron los source maps: ${error.message}`);
  },
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  },
});
