import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { reportar } from './sentry';

/**
 * Todo error que termina en la respuesta pasa por aca. Lo inesperado va a
 * Sentry; la respuesta la sigue armando Nest como siempre.
 *
 * El adaptador se inyecta a mano, con `@Inject`, porque Vercel compila con
 * esbuild y sin `design:paramtypes` la inyeccion implicita de
 * `BaseExceptionFilter` queda vacia (ver api/index.ts).
 */
@Catch()
export class FiltroDeErrores extends BaseExceptionFilter {
  constructor(@Inject(HttpAdapterHost) anfitrion: HttpAdapterHost) {
    super(anfitrion.httpAdapter);
  }

  override async catch(error: unknown, anfitrion: ArgumentsHost): Promise<void> {
    if (esInesperado(error)) await reportar(error);
    super.catch(error, anfitrion);
  }
}

/**
 * Un rechazo con su codigo —CODIGO_INVALIDO, TURNO_CERRADO— es la api
 * haciendo su trabajo. Inesperado es lo que no es una respuesta HTTP armada,
 * o lo es con un 5xx: una variable que falta, la base que no contesta.
 */
export function esInesperado(error: unknown): boolean {
  if (!(error instanceof HttpException)) return true;
  return error.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR;
}
