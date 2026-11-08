import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  type CodigoDeVinculacion,
  type TabletRevocada,
  esquemaCodigoDeVinculacion,
  esquemaTabletRevocada,
} from '@repunto/contratos';
import {
  LARGO_CODIGO_DE_VINCULACION,
  MINUTOS_DE_VINCULACION,
  codigoDeVinculacionDesde,
  formatearCodigoDeVinculacion,
  rechazo,
} from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import type { Transaccion } from '../caja/lectura';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearNegocio, negocioNoEncontrado } from '../admin/negocios.service';
import { type Firmante, guardarRespuesta, reservarIdempotencia } from './firmante';

/** Si choca con otro codigo pendiente, se prueba otro. */
const INTENTOS_DE_CODIGO = 5;

/**
 * Las tablets de la caja: el codigo para vincular una nueva y la revocacion
 * de una perdida. Lo mismo que `pnpm tablets`, sin terminal. Lo usan la
 * ficha del admin, el dia de la capacitacion, y el panel del dueno.
 *
 * El codigo queda firmado por quien lo pidio. El admin no es de ningun
 * negocio y firma por `creado_por_admin_id`; el dueno firma por
 * `creado_por_usuario_id`, que apunta a `usuario_local`: tiene que estar
 * asignado a ese local (CLAUDE.md, seccion 14).
 */
@Injectable()
export class TabletsDelNegocioService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * `POST /admin/negocios/:id/locales/:local/vinculacion` y
   * `POST /dueno/locales/:local/vinculacion`.
   */
  async generarCodigo(
    firmante: Firmante,
    negocioId: string,
    localId: string,
    clave: string,
  ): Promise<CodigoDeVinculacion> {
    // El local va en la huella: la misma clave para otro local no es un
    // reintento.
    const peticion = {
      firmante,
      endpoint:
        firmante.tipo === 'administracion'
          ? 'POST /admin/negocios/:id/locales/:local/vinculacion'
          : 'POST /dueno/locales/:local/vinculacion',
      clave,
      cuerpo: { negocio_id: negocioId, local_id: localId },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return esquemaCodigoDeVinculacion.parse(guardada);

      await bloquearNegocio(tx, negocioId);
      const locales = await tx.$queryRaw<{ activo: boolean }[]>`
        SELECT activo FROM local
        WHERE id = ${localId}::uuid AND negocio_id = ${negocioId}::uuid`;
      const local = locales[0];
      if (local === undefined) throw errorDeRechazo(rechazo('LOCAL_NO_ENCONTRADO'), null);
      // La vinculacion lo rechazaria igual (decidirVinculacion); decirlo
      // ahora le ahorra al admin dictar un codigo que no va a andar.
      if (!local.activo) throw errorDeRechazo(rechazo('LOCAL_CERRADO'), null);
      if (firmante.tipo === 'negocio') {
        await asignarAlDueno(tx, negocioId, localId, firmante.usuario_id);
      }
      const adminId = firmante.tipo === 'administracion' ? firmante.admin_id : null;
      const usuarioId = firmante.tipo === 'negocio' ? firmante.usuario_id : null;

      for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento += 1) {
        const codigo = codigoDeVinculacionDesde(randomBytes(LARGO_CODIGO_DE_VINCULACION));
        // Un choque con otro codigo pendiente abortaria la transaccion: se
        // pregunta antes, y el indice unico queda detras por si dos chocan
        // a la vez.
        const ocupado = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM vinculacion_pendiente WHERE codigo = ${codigo}`;
        if (ocupado.length > 0) continue;

        const filas = await tx.$queryRaw<{ expira_el: Date }[]>`
          INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_admin_id,
                                             creado_por_usuario_id, expira_el)
          VALUES (${codigo}, ${localId}::uuid, ${adminId}::uuid, ${usuarioId}::uuid,
                  now() + make_interval(mins => ${MINUTOS_DE_VINCULACION}::int))
          RETURNING expira_el`;

        const respuesta = esquemaCodigoDeVinculacion.parse({
          codigo: formatearCodigoDeVinculacion(codigo),
          expira_el: filas[0]?.expira_el.toISOString(),
        });
        await guardarRespuesta(tx, peticion, respuesta);
        return respuesta;
      }
      throw new Error('No se pudo generar un codigo de vinculacion libre.');
    });
  }

  /**
   * `POST /admin/negocios/:id/tablets/:tablet/revocacion`. Marca, nunca borra
   * (INV-17): sus turnos y sellos la siguen nombrando. Deja de servir en el
   * pedido siguiente (DISPOSITIVO_REVOCADO).
   */
  async revocar(negocioId: string, tabletId: string): Promise<TabletRevocada> {
    const filas = await this.prisma.$queryRaw<{ revocado_el: Date }[]>`
      UPDATE dispositivo_caja d
      SET revocado_el = coalesce(d.revocado_el, now())
      FROM local l
      WHERE d.id = ${tabletId}::uuid AND l.id = d.local_id
        AND l.negocio_id = ${negocioId}::uuid
      RETURNING d.revocado_el`;
    const fila = filas[0];
    if (fila === undefined) {
      const negocios = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM negocio WHERE id = ${negocioId}::uuid`;
      if (negocios.length === 0) throw negocioNoEncontrado();
      throw errorDeRechazo(rechazo('TABLET_NO_ENCONTRADA'), null);
    }
    return esquemaTabletRevocada.parse({ revocada_el: fila.revocado_el.toISOString() });
  }
}

/**
 * El dueno es de todo su negocio, pero su firma en `vinculacion_pendiente`
 * apunta a `usuario_local`: para firmar el codigo de un local tiene que
 * estar asignado a ese local, y activo (la vinculacion lo vuelve a mirar al
 * usar el codigo). Se lo asigna aca, en la misma transaccion, en lugar de
 * pedirle un paso aparte que no entenderia.
 *
 * Solo al dueno: a un supervisor o un cajero, asignarlo solo le abriria un
 * local que no es el suyo (INV-3). Si alguna vez firman ellos, tienen que
 * estar asignados de antes, y la FK lo exige.
 */
async function asignarAlDueno(
  tx: Transaccion,
  negocioId: string,
  localId: string,
  usuarioId: string,
): Promise<void> {
  const asignadas = await tx.$executeRaw`
    INSERT INTO usuario_local (usuario_id, local_id, negocio_id)
    SELECT u.id, ${localId}::uuid, u.negocio_id
    FROM usuario_negocio u
    WHERE u.id = ${usuarioId}::uuid AND u.negocio_id = ${negocioId}::uuid
      AND u.rol = 'dueno' AND u.activo
    ON CONFLICT (usuario_id, local_id) DO UPDATE SET activo = true`;
  if (asignadas === 0)
    throw new Error(
      'Codigo de vinculacion pedido por alguien que no es el dueno activo.',
    );
}
