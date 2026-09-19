import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { hashDeToken } from '../seguridad/token';
import { errorDeApi } from './errores-http';

/**
 * En caja se autentica el equipo, no la persona (CLAUDE.md, seccion 5): la
 * tablet manda su token de sesion, que no vence hasta que se revoque.
 *
 * El guard hace una sola cosa: saca el token de la cabecera y deja su hash en
 * la peticion. No consulta la base, y eso es deliberado. El dispositivo lo
 * resuelve la misma consulta que trae todo el estado del sellado, asi que no
 * hay dos viajes ni dos fotos distintas del mismo instante. Y una tablet
 * revocada no muere aca: es una decision del dominio, con su propio codigo de
 * error, porque el dueño acaba de revocarla y quiere ver ese mensaje.
 */
@Injectable()
export class GuardDeDispositivo implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionConToken>();
    const token = tokenDeLaCabecera(peticion.headers['authorization']);
    if (token === null) throw errorDeApi('TOKEN_INVALIDO');
    peticion.tokenHash = hashDeToken(token);
    return true;
  }
}

/** Lo que el guard deja listo para el controller. */
export interface PeticionDeCaja {
  headers: Record<string, string | string[] | undefined>;
  tokenHash: string;
}

interface PeticionConToken {
  headers: Record<string, string | string[] | undefined>;
  tokenHash?: string;
}

export function tokenDeLaCabecera(
  cabecera: string | string[] | undefined,
): string | null {
  if (typeof cabecera !== 'string') return null;
  const [esquema, token] = cabecera.split(' ');
  if (esquema?.toLowerCase() !== 'bearer') return null;
  if (token === undefined || token.length === 0) return null;
  return token;
}
