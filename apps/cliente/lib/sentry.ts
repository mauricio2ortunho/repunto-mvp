import { limpiarEvento, limpiarMiga, problemasDelEsquema } from '@repunto/contratos';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry en la app del cliente (CLAUDE.md, seccion 8): los errores que se dan
 * en el telefono de cada cliente, que de otro modo nadie ve. Es el mismo
 * criterio que el panel (apps/panel/lib/sentry.ts); lo que se borra de cada
 * evento esta en `@repunto/contratos`, una sola vez para las tres apps.
 *
 * Solo arranca si existe `NEXT_PUBLIC_SENTRY_DSN`. En `next dev` y en los
 * tests no existe, y todo lo de este archivo se vuelve un no-op.
 *
 * Sin grabacion de la sesion ni medicion de rendimiento, sin los clics ni el
 * tecleo —el cliente escribe su telefono—, sin usuario, cookies ni cabeceras.
 */
export function iniciarSentry(): void {
  // Literal, para que Next la escriba en el bundle al compilar.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn === undefined || dsn === '') return;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
    // Vercel la expone sola: el error dice de que despliegue es.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    integrations: (porDefecto) => [
      ...porDefecto.filter((integracion) => integracion.name !== 'Breadcrumbs'),
      Sentry.breadcrumbsIntegration({ dom: false }),
    ],
    beforeSend: limpiarEvento,
    beforeBreadcrumb: limpiarMiga,
  });
}

/**
 * La api contesto 2xx con algo que no se puede leer o no cumple el contrato.
 * No es un corte ni un rechazo: siempre es un bug, de un lado o del otro. Va
 * solo donde fallo, nunca lo que vino.
 */
export function avisarContratoRoto(error: unknown): void {
  Sentry.captureMessage('La respuesta de la api no cumple el contrato.', {
    level: 'error',
    extra: { problemas: problemasDelEsquema(error) },
  });
}
