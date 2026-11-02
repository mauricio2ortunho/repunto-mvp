import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { limpiarEvento } from '@repunto/contratos';

import { contextoActual } from './contexto';

/**
 * Sentry en la api (CLAUDE.md, seccion 8): los errores que nadie esperaba, con
 * aviso por correo. Un rechazo de la caja no es un error: ese lo cuenta la
 * bitacora.
 *
 * Solo arranca si existe `SENTRY_DSN`. En local y en los tests no existe, y
 * todo lo de este archivo se vuelve un no-op: no hace falta preguntar antes de
 * reportar.
 *
 * Lo que sale del proceso es poco y a proposito:
 *
 *  - Sin integraciones por defecto ni instrumentacion de modulos: nada de
 *    medir rendimiento, que en serverless suma tiempo a cada pedido.
 *  - Sin el pedido: ni cuerpo —el codigo del cliente, el PIN, el telefono—,
 *    ni cabeceras —Authorization, Idempotency-Key—, ni query, ni IP.
 *  - Lo que si va son los ids que el pedido fue anotando y su `request_id`:
 *    con eso se cruza el error con la bitacora y con la linea del log.
 */

/** Cuanto espera un reporte a que el envio salga, antes de contestar. */
const ESPERA_DEL_ENVIO_MS = 2_000;

export function iniciarSentry(): void {
  const dsn = process.env['SENTRY_DSN'];
  if (dsn === undefined || dsn === '' || Sentry.isInitialized()) return;
  Sentry.init(opcionesDeSentry(dsn));
}

/** Separado de `iniciarSentry` para que el test arranque con su transporte. */
export function opcionesDeSentry(dsn: string): NodeOptions {
  return {
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? 'local',
    // Vercel la pone sola en cada despliegue: el error dice de que commit es.
    ...(process.env['VERCEL_GIT_COMMIT_SHA'] !== undefined && {
      release: process.env['VERCEL_GIT_COMMIT_SHA'],
    }),
    // Nada del pedido. limpiarEvento lo vuelve a sacar por las dudas.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    defaultIntegrations: false,
    enableRuntimeChannelInjection: false,
    integrations: [
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    beforeSend: limpiarEvento,
  };
}

/**
 * Manda el error con el contexto del pedido y espera a que salga.
 *
 * Espera porque en serverless la funcion se puede congelar apenas responde, y
 * un envio a medio camino se pierde. Solo pasa cuando algo ya fallo: el
 * pedido que anda bien no paga nada.
 */
export async function reportar(error: unknown): Promise<void> {
  if (!Sentry.isInitialized()) return;
  const contexto = contextoActual();
  Sentry.withScope((scope) => {
    if (contexto !== undefined) {
      scope.setTag('request_id', contexto.request_id);
      scope.setContext('pedido', { ...contexto.campos });
    }
    Sentry.captureException(error);
  });
  await Sentry.flush(ESPERA_DEL_ENVIO_MS);
}

/**
 * Corre la tarea avisandole a Sentry que empezo y como termino. Si una noche
 * no llega el aviso, Sentry manda el correo: es la unica forma de enterarse
 * de que el cron NO corrio, que no deja error en ningun lado.
 *
 * La primera vez crea el monitor solo, con este horario.
 */
export async function vigilarTarea<T>(
  nombre: string,
  /** Crontab, en UTC. */
  horario: string,
  correr: () => Promise<T>,
): Promise<T> {
  if (!Sentry.isInitialized()) return correr();
  try {
    return await Sentry.withMonitor(nombre, correr, {
      schedule: { type: 'crontab', value: horario },
      // Vercel Hobby corre el cron en cualquier minuto de la hora pedida.
      checkinMargin: 75,
      maxRuntime: 2,
      timezone: 'Etc/UTC',
    });
  } finally {
    await Sentry.flush(ESPERA_DEL_ENVIO_MS);
  }
}
