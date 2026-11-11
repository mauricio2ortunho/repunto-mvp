import { Inject, Injectable } from '@nestjs/common';
import {
  SOLICITUDES_RESUELTAS_EN_LA_LISTA,
  TOPES_DE_SOLICITUD,
  type SolicitudDelAdmin,
  type SolicitudNueva,
  type SolicitudRecibida,
  type SolicitudesDelAdmin,
  esquemaSolicitudDelAdmin,
  esquemaSolicitudNueva,
  esquemaSolicitudRecibida,
  esquemaSolicitudesDelAdmin,
} from '@repunto/contratos';
import { normalizarTelefono, rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import { Prisma } from '../generated/prisma/client';
import type { Transaccion } from '../caja/lectura';
import { PrismaService } from '../prisma/prisma.service';
import { TopeDePeticiones, UN_DIA } from '../seguridad/tope';

interface FilaDeSolicitud {
  id: string;
  nombre_negocio: string;
  categoria: string;
  contacto: string;
  telefono: string;
  mensaje: string | null;
  estado: string;
  motivo_rechazo: string | null;
  negocio_id: string | null;
  creado_el: Date;
  resuelta_el: Date | null;
}

/** Fijas, sin nada del pedido: por eso pueden ir como SQL crudo. */
const COLUMNAS = Prisma.raw(`id, nombre_negocio, categoria, contacto, telefono, mensaje,
  estado::text AS estado, motivo_rechazo, negocio_id, creado_el, resuelta_el`);

/**
 * La solicitud de negocio (CLAUDE.md, sección 1): alguien la pide desde la
 * app, el admin la resuelve. No crea nada sola: aprobarla es dar de alta el
 * negocio (negocios.service, `crear`), que la marca en la misma transacción.
 */
@Injectable()
export class SolicitudesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  /**
   * `POST /solicitudes`, público. Con tope por conexión y por teléfono, y una
   * sola pendiente por teléfono (índice en la base): el reenvío no crea otra.
   * Contesta siempre lo mismo, para no decirle a nadie si ese teléfono ya
   * había pedido.
   */
  async pedir(cuerpo: SolicitudNueva, ip: string): Promise<SolicitudRecibida> {
    const solicitud = esquemaSolicitudNueva.parse(cuerpo);
    const telefono = normalizarTelefono(solicitud.telefono);
    if (telefono === null) throw errorDeRechazo(rechazo('TELEFONO_INVALIDO'), null);

    await this.tope.exigir(`solicitud-ip:${ip}`, TOPES_DE_SOLICITUD.porIpPorHora);
    await this.tope.exigir(
      `solicitud-tel:${telefono}`,
      TOPES_DE_SOLICITUD.porTelefonoPorDia,
      UN_DIA,
    );

    await this.prisma.$executeRaw`
      INSERT INTO solicitud_negocio (nombre_negocio, categoria, contacto, telefono, mensaje)
      VALUES (${solicitud.nombre_negocio}, ${solicitud.categoria}, ${solicitud.contacto},
              ${telefono}, ${solicitud.mensaje})
      ON CONFLICT (telefono) WHERE estado = 'pendiente' DO NOTHING`;
    return esquemaSolicitudRecibida.parse({ recibida: true });
  }

  /** `GET /admin/solicitudes`: todas las pendientes, y las últimas resueltas. */
  async listar(): Promise<SolicitudesDelAdmin> {
    const filas = await this.prisma.$queryRaw<FilaDeSolicitud[]>`
      (SELECT ${COLUMNAS} FROM solicitud_negocio WHERE estado = 'pendiente'
       ORDER BY creado_el, id)
      UNION ALL
      (SELECT ${COLUMNAS} FROM solicitud_negocio WHERE estado <> 'pendiente'
       ORDER BY resuelta_el DESC, id LIMIT ${SOLICITUDES_RESUELTAS_EN_LA_LISTA})`;
    return esquemaSolicitudesDelAdmin.parse({ solicitudes: filas.map(comoSolicitud) });
  }

  /** `GET /admin/solicitudes/:id`: la que se abre para darla de alta. */
  async una(id: string): Promise<SolicitudDelAdmin> {
    const filas = await this.prisma.$queryRaw<FilaDeSolicitud[]>`
      SELECT ${COLUMNAS} FROM solicitud_negocio WHERE id = ${id}::uuid`;
    const fila = filas[0];
    if (fila === undefined)
      throw errorDeRechazo(rechazo('SOLICITUD_NO_ENCONTRADA'), null);
    return comoSolicitud(fila);
  }

  /**
   * `POST /admin/solicitudes/:id/rechazo`. Solo una pendiente: rechazar dos
   * veces, o una ya aprobada, es SOLICITUD_YA_RESUELTA. Queda guardada.
   */
  async rechazar(
    adminId: string,
    id: string,
    motivo: string | null,
  ): Promise<SolicitudDelAdmin> {
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE solicitud_negocio
      SET estado = 'rechazada', motivo_rechazo = ${motivo},
          resuelta_por_admin_id = ${adminId}::uuid, resuelta_el = now()
      WHERE id = ${id}::uuid AND estado = 'pendiente'`;
    if (cambiadas === 0) await exigirPendiente(this.prisma, id);
    return this.una(id);
  }
}

/**
 * Aprobar al dar de alta el negocio, dentro de su transacción: si la
 * solicitud ya no está pendiente, el alta entera se deshace.
 */
export async function aprobarSolicitud(
  tx: Transaccion,
  adminId: string,
  solicitudId: string,
  negocioId: string,
): Promise<void> {
  const cambiadas = await tx.$executeRaw`
    UPDATE solicitud_negocio
    SET estado = 'aprobada', negocio_id = ${negocioId}::uuid,
        resuelta_por_admin_id = ${adminId}::uuid, resuelta_el = now()
    WHERE id = ${solicitudId}::uuid AND estado = 'pendiente'`;
  if (cambiadas === 0) await exigirPendiente(tx, solicitudId);
}

/** Cuál de los dos: no existe, o ya se resolvió. Siempre lanza. */
async function exigirPendiente(
  db: Pick<Transaccion, '$queryRaw'>,
  id: string,
): Promise<never> {
  const filas = await db.$queryRaw<{ estado: string }[]>`
    SELECT estado::text AS estado FROM solicitud_negocio WHERE id = ${id}::uuid`;
  throw errorDeRechazo(
    rechazo(filas.length === 0 ? 'SOLICITUD_NO_ENCONTRADA' : 'SOLICITUD_YA_RESUELTA'),
    null,
  );
}

function comoSolicitud(f: FilaDeSolicitud): SolicitudDelAdmin {
  return esquemaSolicitudDelAdmin.parse({
    ...f,
    creado_el: f.creado_el.toISOString(),
    resuelta_el: f.resuelta_el?.toISOString() ?? null,
  });
}
