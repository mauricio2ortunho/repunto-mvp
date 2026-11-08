import { Inject, Injectable } from '@nestjs/common';
import { type TableroDelPiloto, esquemaTableroDelPiloto } from '@repunto/contratos';
import {
  DIAS_DE_CLIENTE_ACTIVO,
  DIAS_DE_LA_SEMANA_QUE_PASO,
  DIAS_DE_LOCAL_SIN_SELLOS,
  DIAS_DEL_MES_QUE_PASO,
  inicioDelMesEnLaPaz,
} from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';

interface FilaDeNegocio {
  id: string;
  nombre: string;
  estado: string;
  sellos_semana: number;
  sellos_mes: number;
  canjes_mes: number;
  clientes_activos: number;
  clientes_nuevos_del_mes: number;
  tarjetas_abiertas: number;
}

interface FilaDeLocal {
  id: string;
  negocio_id: string;
  nombre: string;
  ultimo_sello: Date | null;
  tablets_activas: number;
}

/**
 * El tablero del piloto: si cada negocio esta usando el sistema. Cuenta con
 * las definiciones de la seccion 6 (CLAUDE.md), que vienen del dominio; el
 * corte del mes es el de La Paz (INV-21), calculado afuera de la base para
 * que no dependa de la zona horaria del servidor.
 *
 * Un sello anulado no cuenta en nada: es un error que se deshizo.
 */
@Injectable()
export class TableroDeAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /admin/tablero`. */
  async tablero(): Promise<TableroDelPiloto> {
    const [{ ahora } = { ahora: new Date() }] = await this.prisma.$queryRaw<
      { ahora: Date }[]
    >`SELECT now() AS ahora`;
    const inicioDelMes = inicioDelMesEnLaPaz(ahora);
    const semana = DIAS_DE_LA_SEMANA_QUE_PASO;
    const mes = DIAS_DEL_MES_QUE_PASO;
    const activo = DIAS_DE_CLIENTE_ACTIVO;

    const negocios = await this.prisma.$queryRaw<FilaDeNegocio[]>`
      SELECT n.id, n.nombre, n.estado::text AS estado,
             (SELECT count(*)::int FROM sello s
               WHERE s.negocio_id = n.id AND NOT s.anulado
                 AND s.creado_el > ${ahora}::timestamptz - make_interval(days => ${semana}::int))
               AS sellos_semana,
             (SELECT count(*)::int FROM sello s
               WHERE s.negocio_id = n.id AND NOT s.anulado
                 AND s.creado_el > ${ahora}::timestamptz - make_interval(days => ${mes}::int))
               AS sellos_mes,
             (SELECT count(*)::int FROM canje c
               WHERE c.negocio_id = n.id
                 AND c.creado_el > ${ahora}::timestamptz - make_interval(days => ${mes}::int))
               AS canjes_mes,
             (SELECT count(DISTINCT t.cliente_id)::int FROM sello s
               JOIN tarjeta t ON t.id = s.tarjeta_id
               WHERE s.negocio_id = n.id AND NOT s.anulado
                 AND s.creado_el > ${ahora}::timestamptz - make_interval(days => ${activo}::int))
               AS clientes_activos,
             (SELECT count(*)::int FROM (
                SELECT min(s.creado_el) AS primero FROM sello s
                JOIN tarjeta t ON t.id = s.tarjeta_id
                WHERE s.negocio_id = n.id AND NOT s.anulado
                GROUP BY t.cliente_id) p
               WHERE p.primero >= ${inicioDelMes}::timestamptz)
               AS clientes_nuevos_del_mes,
             (SELECT count(*)::int FROM tarjeta t
               WHERE t.negocio_id = n.id AND t.estado = 'activa'
                 AND EXISTS (SELECT 1 FROM sello s
                             WHERE s.tarjeta_id = t.id AND NOT s.anulado))
               AS tarjetas_abiertas
      FROM negocio n
      ORDER BY n.estado = 'suspendido', lower(n.nombre), n.id`;

    const locales = await this.prisma.$queryRaw<FilaDeLocal[]>`
      SELECT l.id, l.negocio_id, l.nombre,
             (SELECT max(s.creado_el) FROM sello s
               WHERE s.local_id = l.id AND NOT s.anulado) AS ultimo_sello,
             (SELECT count(*)::int FROM dispositivo_caja d
               WHERE d.local_id = l.id AND d.revocado_el IS NULL) AS tablets_activas
      FROM local l
      WHERE l.activo
      ORDER BY l.creado_el, l.id`;

    return esquemaTableroDelPiloto.parse({
      generado_el: ahora.toISOString(),
      inicio_del_mes: inicioDelMes.toISOString(),
      ventanas: {
        semana_dias: semana,
        mes_dias: mes,
        cliente_activo_dias: activo,
        local_sin_sellos_dias: DIAS_DE_LOCAL_SIN_SELLOS,
      },
      negocios: negocios.map((n) => ({
        ...n,
        locales: locales
          .filter((l) => l.negocio_id === n.id)
          .map((l) => ({
            id: l.id,
            nombre: l.nombre,
            ultimo_sello: l.ultimo_sello?.toISOString() ?? null,
            tablets_activas: l.tablets_activas,
          })),
      })),
    });
  }
}
