import { limpiarEvento, limpiarMiga, problemasDelEsquema } from '@repunto/contratos';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry en el panel (CLAUDE.md, seccion 8): los errores que se dan en el
 * navegador de la tablet, que de otro modo nadie ve.
 *
 * Solo arranca si existe `NEXT_PUBLIC_SENTRY_DSN`. En `next dev` y en los
 * tests no existe, y todo lo de este archivo se vuelve un no-op.
 *
 * Lo que sale es poco y a proposito:
 *
 *  - Ni grabacion de la sesion ni medicion de rendimiento.
 *  - Sin los clics ni el tecleo: la caja escribe el codigo del cliente y el
 *    PIN, y aunque Sentry no guarde el texto, no hace falta arriesgarlo.
 *  - Sin usuario, cookies ni cabeceras, y con telefonos y codigos tachados
 *    en los mensajes.
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
 * La API contesto 2xx con algo que no cumple el contrato. No es un corte ni
 * un rechazo: siempre es un bug, de un lado o del otro. Va solo donde
 * fallo el esquema, nunca lo que vino.
 */
export function avisarContratoRoto(error: unknown): void {
  Sentry.captureMessage('La respuesta de la API no cumple el contrato.', {
    level: 'error',
    extra: { problemas: problemasDelEsquema(error) },
  });
}
