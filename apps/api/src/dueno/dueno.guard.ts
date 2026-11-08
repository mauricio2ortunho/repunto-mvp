import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { sesionDeDuenoVigente } from '@repunto/dominio';

import { tokenDeLaCabecera } from '../caja/dispositivo.guard';
import { errorDeApi } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { hashDeToken } from '../seguridad/token';

/**
 * Lo que el guard deja listo para el controller. El negocio sale de acá, de
 * la sesión, y nunca del pedido (INV-1).
 */
export interface PeticionDeDueno {
  headers: Record<string, string | string[] | undefined>;
  dueno: {
    id: string;
    nombre: string;
    sesion_id: string;
    negocio: { id: string; nombre: string; estado: 'activo' | 'suspendido' };
  };
}

interface FilaDeSesion {
  ahora: Date;
  sesion_id: string;
  usuario_id: string;
  nombre: string;
  ultimo_acceso: Date;
  revocada_el: Date | null;
  usuario_activo: boolean;
  negocio_id: string;
  negocio_nombre: string;
  negocio_estado: 'activo' | 'suspendido';
}

/**
 * Todo /dueno, salvo la entrada. Como el del admin, consulta la base: una
 * sesión que no existe, vencida, revocada o de un dueño dado de baja dan el
 * mismo 401, y el panel vuelve a pedir el código.
 *
 * El negocio suspendido no frena la entrada: el dueño sigue viendo lo suyo.
 * Lo que no se puede hacer con el negocio suspendido lo decide cada endpoint.
 *
 * Cada pedido válido renueva `ultimo_acceso`: el vencimiento se cuenta desde
 * el último uso, no desde la entrada.
 */
@Injectable()
export class GuardDeDueno implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<Partial<PeticionDeDueno>>();
    const token = tokenDeLaCabecera(peticion.headers?.['authorization']);
    if (token === null) throw errorDeApi('TOKEN_INVALIDO');

    const filas = await this.prisma.$queryRaw<FilaDeSesion[]>`
      SELECT now() AS ahora, s.id AS sesion_id, u.id AS usuario_id, u.nombre,
             s.ultimo_acceso, s.revocada_el, u.activo AS usuario_activo,
             n.id AS negocio_id, n.nombre AS negocio_nombre,
             n.estado::text AS negocio_estado
      FROM sesion_dueno s
      JOIN usuario_negocio u ON u.id = s.usuario_id
      JOIN negocio n ON n.id = u.negocio_id
      WHERE s.token_hash = ${hashDeToken(token)}`;

    const fila = filas[0];
    if (fila === undefined || !sesionDeDuenoVigente(fila, fila.ahora)) {
      throw errorDeApi('TOKEN_INVALIDO');
    }

    await this.prisma.$executeRaw`
      UPDATE sesion_dueno SET ultimo_acceso = now() WHERE id = ${fila.sesion_id}::uuid`;

    peticion.dueno = {
      id: fila.usuario_id,
      nombre: fila.nombre,
      sesion_id: fila.sesion_id,
      negocio: {
        id: fila.negocio_id,
        nombre: fila.negocio_nombre,
        estado: fila.negocio_estado,
      },
    };
    return true;
  }
}
