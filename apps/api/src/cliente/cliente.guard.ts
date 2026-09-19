import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { errorDeApi } from '../caja/errores-http';
import { tokenDeLaCabecera } from '../caja/dispositivo.guard';
import { hashDeToken } from '../seguridad/token';

/**
 * La sesion del telefono del cliente. Igual que en caja: el guard saca el
 * token y deja su hash; a que cliente pertenece lo resuelve la consulta.
 */
@Injectable()
export class GuardDeCliente implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionConToken>();
    const token = tokenDeLaCabecera(peticion.headers['authorization']);
    if (token === null) throw errorDeApi('TOKEN_INVALIDO');
    peticion.tokenHash = hashDeToken(token);
    return true;
  }
}

export interface PeticionDelCliente {
  headers: Record<string, string | string[] | undefined>;
  tokenHash: string;
}

interface PeticionConToken {
  headers: Record<string, string | string[] | undefined>;
  tokenHash?: string;
}
