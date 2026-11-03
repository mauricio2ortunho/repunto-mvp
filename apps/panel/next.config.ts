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
 * es lo que NO entra: sin esto el bundle de la tablet triplicaba su tamano
 * con medicion de rendimiento y grabacion de sesion que no se usan.
 *
 * El panel no hace nada del lado del servidor —las paginas son estaticas y
 * hablan con la api desde el navegador—, asi que no se instrumenta.
 *
 * Los source maps se suben a Sentry al compilar, para que un error diga
 * archivo y linea del codigo y no `491-e96395.js:61:6336`, y se borran antes
 * de publicar: nadie de afuera los descarga. Suben solo si existe
 * `SENTRY_AUTH_TOKEN` (en Vercel); sin el, el build sigue igual y no sube nada.
 */
export default withSentryConfig(nextConfig, {
  org: 'joel-04',
  project: 'repunto-panel',
  silent: true,
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
