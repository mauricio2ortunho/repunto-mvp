import { Inject, Injectable } from '@nestjs/common';
import { type VincularRespuesta, esquemaVincularRespuesta } from '@repunto/contratos';
import {
  decidirVinculacion,
  normalizarCodigoDeVinculacion,
  rechazo,
} from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';
import { TopeDePeticiones } from '../seguridad/tope';
import { hashDeToken, nuevoToken } from '../seguridad/token';
import { errorDeRechazo } from './errores-http';

/**
 * Intentos de vinculacion por IP y por hora. Holgado para quien se equivoca
 * tipeando al instalar varias tablets; corto para quien prueba codigos al
 * azar: con ocho caracteres, veinte por hora no llegan a nada.
 */
export const TOPE_DE_VINCULACION_POR_IP = 20;

interface FilaDeVinculacion {
  ahora: Date;
  id: string;
  local_id: string;
  expira_el: Date;
  usado_el: Date | null;
  creador_activo: boolean;
  negocio_id: string;
  local_activo: boolean;
  tablets_del_local: number;
}

/**
 * `POST /caja/vinculacion`: la tablet nueva canjea el codigo por su sesion.
 * Quien decide es `decidirVinculacion`; aca se lee, se marca el codigo y se
 * crea la tablet.
 */
@Injectable()
export class VinculacionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  async vincular(tipeado: string, ip: string): Promise<VincularRespuesta> {
    // Cuenta todo intento, bueno o malo: el que prueba codigos no se entera
    // de cuales existen, y tampoco puede probar sin freno.
    await this.tope.exigir(`vinculacion-ip:${ip}`, TOPE_DE_VINCULACION_POR_IP);

    const codigo = normalizarCodigoDeVinculacion(tipeado);
    if (codigo === null) throw errorDeRechazo(rechazo('VINCULACION_INVALIDA'), null);

    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos tablets con el mismo codigo a la vez se ordenan aca, y
      // la segunda ve el codigo ya usado. Detras esta igual el indice unico
      // dispositivo_caja_vinculacion_id_key.
      const filas = await tx.$queryRaw<FilaDeVinculacion[]>`
        SELECT now() AS ahora, v.id, v.local_id, v.expira_el, v.usado_el,
               CASE WHEN v.creado_por_admin_id IS NOT NULL THEN coalesce(a.activo, false)
                    ELSE coalesce(u.activo AND ul.activo, false)
               END AS creador_activo,
               l.negocio_id, l.activo AS local_activo,
               (SELECT count(*)::int FROM dispositivo_caja d WHERE d.local_id = v.local_id)
                 AS tablets_del_local
        FROM vinculacion_pendiente v
        JOIN local l ON l.id = v.local_id
        LEFT JOIN admin_plataforma a ON a.id = v.creado_por_admin_id
        LEFT JOIN usuario_local ul
          ON ul.usuario_id = v.creado_por_usuario_id AND ul.local_id = v.local_id
        LEFT JOIN usuario_negocio u ON u.id = v.creado_por_usuario_id
        WHERE v.codigo = ${codigo}
        FOR UPDATE OF v`;

      const fila = filas[0];
      const decision = decidirVinculacion({
        ahora: fila?.ahora ?? new Date(0),
        vinculacion:
          fila === undefined
            ? null
            : {
                id: fila.id,
                local_id: fila.local_id,
                expira_el: fila.expira_el,
                usado_el: fila.usado_el,
                creador_activo: fila.creador_activo,
              },
        local:
          fila === undefined
            ? null
            : {
                id: fila.local_id,
                negocio_id: fila.negocio_id,
                activo: fila.local_activo,
              },
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      const { efecto } = decision;
      await tx.$executeRaw`
        UPDATE vinculacion_pendiente SET usado_el = now()
        WHERE id = ${efecto.vinculacion_id}::uuid AND usado_el IS NULL`;

      // El nombre es solo para reconocerla en la lista: Caja 1, Caja 2...
      const nombre = `Caja ${(fila?.tablets_del_local ?? 0) + 1}`;
      const token = nuevoToken();
      await tx.$executeRaw`
        INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el, vinculacion_id)
        VALUES (${efecto.local_id}::uuid, ${nombre}, ${hashDeToken(token)}, now(),
                ${efecto.vinculacion_id}::uuid)`;

      return esquemaVincularRespuesta.parse({ token });
    });
  }
}
