import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { sesionDeAdminVigente } from '@repunto/dominio';

import { tokenDeLaCabecera } from '../caja/dispositivo.guard';
import { errorDeApi } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { hashDeToken } from '../seguridad/token';

/** Lo que el guard deja listo para el controller. */
export interface PeticionDeAdmin {
  headers: Record<string, string | string[] | undefined>;
  admin: { id: string; nombre: string; sesion_id: string };
}

interface FilaDeSesion {
  ahora: Date;
  sesion_id: string;
  admin_id: string;
  nombre: string;
  ultimo_acceso: Date;
  revocada_el: Date | null;
  admin_activo: boolean;
}

/**
 * Todo /admin, salvo la entrada. A diferencia del de la tablet, este guard si
 * consulta la base: lo que decide es solo si la sesion sirve, no hay un
 * estado del negocio que leer en la misma foto, y asi cada endpoint de /admin
 * recibe al admin ya resuelto.
 *
 * Una sesion que no existe, vencida, revocada o de un admin dado de baja dan
 * el mismo 401: el panel vuelve a pedir el codigo.
 *
 * Cada pedido valido renueva `ultimo_acceso`: el vencimiento se cuenta desde
 * el ultimo uso, no desde la entrada.
 */
@Injectable()
export class GuardDeAdmin implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<Partial<PeticionDeAdmin>>();
    const token = tokenDeLaCabecera(peticion.headers?.['authorization']);
    if (token === null) throw errorDeApi('TOKEN_INVALIDO');

    const filas = await this.prisma.$queryRaw<FilaDeSesion[]>`
      SELECT now() AS ahora, s.id AS sesion_id, a.id AS admin_id, a.nombre,
             s.ultimo_acceso, s.revocada_el, a.activo AS admin_activo
      FROM sesion_admin s
      JOIN admin_plataforma a ON a.id = s.admin_id
      WHERE s.token_hash = ${hashDeToken(token)}`;

    const fila = filas[0];
    if (fila === undefined || !sesionDeAdminVigente(fila, fila.ahora)) {
      throw errorDeApi('TOKEN_INVALIDO');
    }

    await this.prisma.$executeRaw`
      UPDATE sesion_admin SET ultimo_acceso = now() WHERE id = ${fila.sesion_id}::uuid`;

    peticion.admin = {
      id: fila.admin_id,
      nombre: fila.nombre,
      sesion_id: fila.sesion_id,
    };
    return true;
  }
}
