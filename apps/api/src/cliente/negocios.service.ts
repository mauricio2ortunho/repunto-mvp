import { Inject, Injectable } from '@nestjs/common';
import { type Directorio, esquemaDirectorio } from '@repunto/contratos';

import { PrismaService } from '../prisma/prisma.service';

/**
 * El directorio de negocios adheridos: "Dónde juntar sellos" en la app del
 * cliente. Es para mirar, no para anotarse: el alta sigue exigiendo el QR del
 * mostrador.
 *
 * La consulta nombra columna por columna a proposito. `local.qr_slug` es la
 * credencial del alta y no sale de aca; el esquema de la respuesta tampoco lo
 * conoce, asi que aunque alguien lo agregue al SELECT, `parse` lo descarta.
 */
@Injectable()
export class NegociosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /negocios`. */
  async directorio(): Promise<Directorio> {
    const negocios = await this.prisma.$queryRaw<unknown[]>`
      SELECT n.id, n.nombre, n.categoria, n.color_principal, n.logo_url,
             n.portada_url, n.plantilla_tarjeta, n.icono_sello,
             -- La vigente, que es a lo sumo una por negocio (INV-5). Sin ella
             -- la caja responde PROMO_NO_CONFIGURADA: el negocio no se ofrece.
             p.premio, p.sellos_requeridos,
             jsonb_agg(
               jsonb_build_object('nombre', l.nombre, 'direccion', l.direccion)
               ORDER BY l.nombre
             ) AS locales
      FROM negocio n
      JOIN programa p ON p.negocio_id = n.id AND p.vigente
      -- Solo los abiertos: un local cerrado no sella.
      JOIN local l ON l.negocio_id = n.id AND l.activo
      WHERE n.estado = 'activo'
      GROUP BY n.id, p.id
      ORDER BY n.categoria, n.nombre, n.id`;

    return esquemaDirectorio.parse({ negocios });
  }
}
