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
 */
export default withSentryConfig(nextConfig, {
  org: 'joel-04',
  project: 'repunto-panel',
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
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
