import { createHash, timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { tokenDeLaCabecera } from '../caja/dispositivo.guard';
import { errorDeApi } from '../caja/errores-http';

/**
 * Menos que esto no es un secreto, es una contraseña. Con uno corto el guard
 * se comporta como si no hubiera ninguno.
 */
const LARGO_MINIMO_DEL_SECRETO = 32;

/**
 * Los trabajos programados los dispara Vercel Cron, que manda
 * `Authorization: Bearer <CRON_SECRET>`. Es la unica credencial de estos
 * endpoints: cualquiera puede llamar a la URL.
 *
 * Sin `CRON_SECRET` configurado rechaza siempre, nunca deja pasar: un
 * despliegue al que le falta la variable no puede quedar con las tareas
 * abiertas al mundo. El 503 y no el 401 es para que el log de Vercel diga que
 * falta configurar, no que alguien se equivoco de secreto.
 *
 * Se lee en cada pedido y no al arrancar, para que los tests puedan cambiarlo.
 */
@Injectable()
export class GuardDeTareas implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const esperado = process.env['CRON_SECRET'] ?? '';
    if (esperado.length < LARGO_MINIMO_DEL_SECRETO) {
      throw new ServiceUnavailableException('Falta CRON_SECRET en el entorno.');
    }
    const peticion = contexto
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const recibido = tokenDeLaCabecera(peticion.headers['authorization']);
    if (recibido === null || !coinciden(recibido, esperado)) {
      throw errorDeApi('TOKEN_INVALIDO');
    }
    return true;
  }
}

/**
 * En tiempo constante. Se comparan los hashes y no los textos porque
 * `timingSafeEqual` exige el mismo largo, y comparar largos antes delataria
 * el del secreto.
 */
function coinciden(recibido: string, esperado: string): boolean {
  const hash = (texto: string) => createHash('sha256').update(texto, 'utf8').digest();
  return timingSafeEqual(hash(recibido), hash(esperado));
}
