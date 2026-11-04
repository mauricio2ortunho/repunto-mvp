import { Inject, Injectable } from '@nestjs/common';
import {
  type NegocioCreado,
  type NegocioNuevo,
  type NegociosDelAdmin,
  esquemaNegocioCreado,
  esquemaNegociosDelAdmin,
} from '@repunto/contratos';

import { PrismaService } from '../prisma/prisma.service';
import { guardarRespuestaDeAdmin, reservarIdempotenciaDeAdmin } from './idempotencia';

interface FilaDeNegocio {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  color_principal: string;
  logo_url: string | null;
  icono_sello: string;
  plantilla_tarjeta: string;
  locales_activos: number;
  programa: unknown;
  condicion: unknown;
  creado_el: Date;
}

/**
 * Los negocios, vistos por el admin de plataforma. Su alcance es la
 * plataforma entera: no hay negocio que salga de su token, y por eso es el
 * unico que elige negocio (CLAUDE.md, INV-1 vale para quien opera DENTRO de
 * un negocio).
 */
@Injectable()
export class NegociosDeAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /admin/negocios`: todos, suspendidos incluidos, los nuevos primero. */
  async listar(): Promise<NegociosDelAdmin> {
    const filas = await this.prisma.$queryRaw<FilaDeNegocio[]>`
      SELECT n.id, n.nombre, n.categoria, n.estado::text AS estado,
             n.color_principal, n.logo_url, n.icono_sello, n.plantilla_tarjeta,
             (SELECT count(*)::int FROM local l
              WHERE l.negocio_id = n.id AND l.activo) AS locales_activos,
             (SELECT jsonb_build_object('sellos_requeridos', p.sellos_requeridos,
                                        'premio', p.premio)
              FROM programa p WHERE p.negocio_id = n.id AND p.vigente) AS programa,
             -- La misma eleccion que la caja (ctePromoYTarjeta).
             (SELECT jsonb_build_object('texto', c.texto)
              FROM condicion_sello c
              WHERE c.negocio_id = n.id AND c.vigente_desde <= now()
              ORDER BY c.vigente_desde DESC, c.creado_el DESC
              LIMIT 1) AS condicion,
             n.creado_el
      FROM negocio n
      ORDER BY n.creado_el DESC, n.id`;

    return esquemaNegociosDelAdmin.parse({
      negocios: filas.map((f) => ({ ...f, creado_el: f.creado_el.toISOString() })),
    });
  }

  /**
   * `POST /admin/negocios`. El negocio, la version 1 de su promo y su primera
   * condicion, en una sola transaccion: o queda listo para sellar en cuanto
   * tenga un local y una tablet, o no queda nada.
   */
  async crear(
    adminId: string,
    clave: string,
    alta: NegocioNuevo,
  ): Promise<NegocioCreado> {
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios',
      clave,
      cuerpo: alta,
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaNegocioCreado.parse(guardada);

      const negocios = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO negocio (nombre, categoria, color_principal, icono_sello,
                             plantilla_tarjeta, canje_cualquier_local)
        VALUES (${alta.nombre}, ${alta.categoria}, ${alta.color_principal},
                ${alta.icono_sello}, ${alta.plantilla_tarjeta},
                ${alta.canje_cualquier_local})
        RETURNING id`;
      const negocio = negocios[0];
      if (negocio === undefined)
        throw new Error('El INSERT del negocio no devolvio fila.');

      const { programa, condicion } = alta;
      await tx.$executeRaw`
        INSERT INTO programa (negocio_id, version, sellos_requeridos, premio,
                              vigencia_meses, horas_entre_sellos, pide_monto, vigente)
        VALUES (${negocio.id}::uuid, 1, ${programa.sellos_requeridos},
                ${programa.premio}, ${programa.vigencia_meses},
                ${programa.horas_entre_sellos}, ${programa.pide_monto}, true)`;

      // Firmada por el admin: todavia no hay nadie del negocio
      // (condicion_sello_un_solo_autor_chk).
      await tx.$executeRaw`
        INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde,
                                     creado_por_admin_id)
        VALUES (${negocio.id}::uuid, ${condicion.texto},
                ${condicion.monto_minimo}::numeric, now(), ${adminId}::uuid)`;

      const respuesta = esquemaNegocioCreado.parse({ id: negocio.id });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }
}
