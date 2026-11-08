import { Inject, Injectable } from '@nestjs/common';
import { type ResumenDelDueno, esquemaResumenDelDueno } from '@repunto/contratos';
import {
  DIAS_DE_CLIENTE_ACTIVO,
  DIAS_DE_CLIENTE_ENFRIADO,
  DIAS_DE_LA_SEMANA_QUE_PASO,
  DIAS_DE_LOCAL_SIN_SELLOS,
  DIAS_DEL_MES_QUE_PASO,
  SELLOS_PARA_ENFRIADO,
  SELLOS_PARA_VOLVIO,
  inicioDelMesEnLaPaz,
} from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';

interface FilaDeClientes {
  con_sellos: number;
  activos: number;
  nuevos_del_mes: number;
  volvieron: number;
  enfriados: number;
}

interface FilaDeVisitas {
  sellos_semana: number;
  sellos_mes: number;
  regresos_mes: number;
  dias_entre_visitas: number | null;
}

interface FilaDePremios {
  canjes_mes: number;
  tarjetas_abiertas: number;
  listas_para_canjear: number;
}

interface FilaDeLocal {
  id: string;
  nombre: string;
  sellos_semana: number;
  ultimo_sello: Date | null;
  tablets_activas: number;
}

/**
 * El resumen del panel del dueño: cómo le va a su negocio. Las definiciones
 * son las de la sección 6 (CLAUDE.md) y vienen del dominio; el corte del mes
 * es el de La Paz (INV-21), calculado afuera de la base para que no dependa
 * de la zona horaria del servidor.
 *
 * Todo cuenta por cliente dentro de ESTE negocio: el mismo cliente en otro
 * negocio es otra historia. Un sello anulado no cuenta en nada.
 */
@Injectable()
export class ResumenDelDuenoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /dueno/resumen`. El negocio sale de la sesión, nunca del pedido. */
  async resumen(negocioId: string): Promise<ResumenDelDueno> {
    const [{ ahora } = { ahora: new Date() }] = await this.prisma.$queryRaw<
      { ahora: Date }[]
    >`SELECT now() AS ahora`;
    const inicioDelMes = inicioDelMesEnLaPaz(ahora);
    const semana = DIAS_DE_LA_SEMANA_QUE_PASO;
    const mes = DIAS_DEL_MES_QUE_PASO;

    // Una fila por cliente con lo que hace falta de su historia acá.
    const [clientes] = await this.prisma.$queryRaw<FilaDeClientes[]>`
      WITH por_cliente AS (
        SELECT t.cliente_id, count(*) AS sellos,
               min(s.creado_el) AS primero, max(s.creado_el) AS ultimo
        FROM sello s
        JOIN tarjeta t ON t.id = s.tarjeta_id
        WHERE s.negocio_id = ${negocioId}::uuid AND NOT s.anulado
        GROUP BY t.cliente_id
      )
      SELECT count(*)::int AS con_sellos,
             count(*) FILTER (
               WHERE ultimo > ${ahora}::timestamptz
                              - make_interval(days => ${DIAS_DE_CLIENTE_ACTIVO}::int)
             )::int AS activos,
             count(*) FILTER (WHERE primero >= ${inicioDelMes}::timestamptz)::int
               AS nuevos_del_mes,
             count(*) FILTER (WHERE sellos >= ${SELLOS_PARA_VOLVIO})::int AS volvieron,
             count(*) FILTER (
               WHERE sellos >= ${SELLOS_PARA_ENFRIADO}
                 AND ultimo <= ${ahora}::timestamptz
                              - make_interval(days => ${DIAS_DE_CLIENTE_ENFRIADO}::int)
             )::int AS enfriados
      FROM por_cliente`;

    // Cada sello con su lugar en la historia de su cliente: el primero es la
    // llegada, los demás son regresos. La frecuencia es la MEDIANA de los días
    // entre un sello y el anterior del mismo cliente (sección 6), no el
    // promedio: un cliente que vuelve una vez al año no la arrastra.
    const [visitas] = await this.prisma.$queryRaw<FilaDeVisitas[]>`
      WITH ordenados AS (
        SELECT s.creado_el,
               row_number() OVER (PARTITION BY t.cliente_id
                                  ORDER BY s.creado_el, s.id) AS orden,
               s.creado_el - lag(s.creado_el) OVER (PARTITION BY t.cliente_id
                                                    ORDER BY s.creado_el, s.id) AS desde_el_anterior
        FROM sello s
        JOIN tarjeta t ON t.id = s.tarjeta_id
        WHERE s.negocio_id = ${negocioId}::uuid AND NOT s.anulado
      )
      SELECT count(*) FILTER (
               WHERE creado_el > ${ahora}::timestamptz - make_interval(days => ${semana}::int)
             )::int AS sellos_semana,
             count(*) FILTER (
               WHERE creado_el > ${ahora}::timestamptz - make_interval(days => ${mes}::int)
             )::int AS sellos_mes,
             count(*) FILTER (
               WHERE orden > 1
                 AND creado_el > ${ahora}::timestamptz - make_interval(days => ${mes}::int)
             )::int AS regresos_mes,
             round((percentile_cont(0.5) WITHIN GROUP (
               ORDER BY extract(epoch FROM desde_el_anterior) / 86400
             ))::numeric, 1)::float8 AS dias_entre_visitas
      FROM ordenados`;

    // Lista para canjear: activa y con los sellos que pide SU programa, que
    // puede no ser el vigente (INV-6).
    const [premios] = await this.prisma.$queryRaw<FilaDePremios[]>`
      WITH tarjetas AS (
        SELECT t.id, p.sellos_requeridos,
               (SELECT count(*) FROM sello s
                 WHERE s.tarjeta_id = t.id AND NOT s.anulado) AS sellos
        FROM tarjeta t
        JOIN programa p ON p.id = t.programa_id
        WHERE t.negocio_id = ${negocioId}::uuid AND t.estado = 'activa'
      )
      SELECT (SELECT count(*)::int FROM canje c
               WHERE c.negocio_id = ${negocioId}::uuid
                 AND c.creado_el > ${ahora}::timestamptz - make_interval(days => ${mes}::int))
               AS canjes_mes,
             (SELECT count(*)::int FROM tarjetas WHERE sellos > 0) AS tarjetas_abiertas,
             (SELECT count(*)::int FROM tarjetas WHERE sellos >= sellos_requeridos)
               AS listas_para_canjear`;

    const locales = await this.prisma.$queryRaw<FilaDeLocal[]>`
      SELECT l.id, l.nombre,
             (SELECT count(*)::int FROM sello s
               WHERE s.local_id = l.id AND NOT s.anulado
                 AND s.creado_el > ${ahora}::timestamptz - make_interval(days => ${semana}::int))
               AS sellos_semana,
             (SELECT max(s.creado_el) FROM sello s
               WHERE s.local_id = l.id AND NOT s.anulado) AS ultimo_sello,
             (SELECT count(*)::int FROM dispositivo_caja d
               WHERE d.local_id = l.id AND d.revocado_el IS NULL) AS tablets_activas
      FROM local l
      WHERE l.negocio_id = ${negocioId}::uuid AND l.activo
      ORDER BY l.creado_el, l.id`;

    return esquemaResumenDelDueno.parse({
      generado_el: ahora.toISOString(),
      inicio_del_mes: inicioDelMes.toISOString(),
      ventanas: {
        semana_dias: semana,
        mes_dias: mes,
        cliente_activo_dias: DIAS_DE_CLIENTE_ACTIVO,
        enfriado_dias: DIAS_DE_CLIENTE_ENFRIADO,
        sellos_para_enfriado: SELLOS_PARA_ENFRIADO,
        local_sin_sellos_dias: DIAS_DE_LOCAL_SIN_SELLOS,
      },
      clientes,
      visitas,
      premios,
      locales: locales.map((l) => ({
        ...l,
        ultimo_sello: l.ultimo_sello?.toISOString() ?? null,
      })),
    });
  }
}
