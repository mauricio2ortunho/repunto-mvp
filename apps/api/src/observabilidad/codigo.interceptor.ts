import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, catchError, throwError } from 'rxjs';

import { codigoDelError } from '../caja/errores-http';
import { anotar } from './contexto';

/**
 * El codigo con que se rechazo un pedido, para su linea de log. Los guards
 * corren antes que esto, asi que un 401 del guard no lleva codigo: el estado
 * ya lo dice.
 */
@Injectable()
export class CodigoInterceptor implements NestInterceptor {
  intercept(_contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    return siguiente.handle().pipe(
      catchError((error: unknown) => {
        anotar({ codigo: resultadoDelError(error) });
        return throwError(() => error);
      }),
    );
  }
}

/**
 * El codigo de la respuesta si lo tiene; si no, el estado HTTP; y si no fue
 * una respuesta de la api, un error interno, que es lo que hay que mirar.
 */
export function resultadoDelError(error: unknown): string {
  const codigo = codigoDelError(error);
  if (codigo !== null) return codigo;
  if (error instanceof HttpException) return `HTTP_${error.getStatus()}`;
  return 'ERROR_INTERNO';
}
