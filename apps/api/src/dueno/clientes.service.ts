import { Inject, Injectable } from '@nestjs/common';
import {
  CLIENTES_EN_LA_LISTA,
  type ClientesDelDueno,
  esquemaClientesDelDueno,
} from '@repunto/contratos';
import {
  DIAS_DE_CLIENTE_ACTIVO,
  DIAS_DE_CLIENTE_ENFRIADO,
  SELLOS_PARA_ENFRIADO,
  inicioDelMesEnLaPaz,
} from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';

interface FilaDeCliente {
  nombre: string;
  telefono: string;
  sellos: number;
  primer_sello: Date | null;
  ultimo_sello: Date | null;
  premios: number;
  tarjeta_sellos: number | null;
  sellos_requeridos: number | null;
  vence_el: Date | null;
  activo: boolean;
  enfriado: boolean;
  nuevo_del_mes: boolean;
}

/**
 * Los clientes del dueño: los que tienen tarjeta en su negocio. Con las
 * mismas definiciones que el resumen (CLAUDE.md, sección 6, desde el
 * dominio), para que "dejaron de venir: 4" sean los mismos 4 de la lista.
 *
 * Solo su historia en este negocio: el mismo cliente en otro negocio no se
 * ve, ni sus otras tarjetas. El teléfono va completo: el dueño ve a sus
 * clientes (decisión del 2026-11-08). La caja no: INV-4.
 */
@Injectable()
export class ClientesDelDuenoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /dueno/clientes`. El negocio sale de la sesión, nunca del pedido. */
  async clientes(negocioId: string): Promise<ClientesDelDueno> {
    const [{ ahora } = { ahora: new Date() }] = await this.prisma.$queryRaw<
      { ahora: Date }[]
    >`SELECT now() AS ahora`;
    const inicioDelMes = inicioDelMesEnLaPaz(ahora);

    const [{ total } = { total: 0 }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(DISTINCT cliente_id)::int AS total FROM tarjeta
      WHERE negocio_id = ${negocioId}::uuid`;

    const filas = await this.prisma.$queryRaw<FilaDeCliente[]>`
      WITH por_cliente AS (
        SELECT t.cliente_id,
               count(s.id) FILTER (WHERE NOT s.anulado)::int AS sellos,
               min(s.creado_el) FILTER (WHERE NOT s.anulado) AS primer_sello,
               max(s.creado_el) FILTER (WHERE NOT s.anulado) AS ultimo_sello
        FROM tarjeta t
        LEFT JOIN sello s ON s.tarjeta_id = t.id
        WHERE t.negocio_id = ${negocioId}::uuid
        GROUP BY t.cliente_id
      )
      SELECT c.nombre, c.telefono, pc.sellos, pc.primer_sello, pc.ultimo_sello,
             (SELECT count(*)::int FROM canje k
                JOIN tarjeta tk ON tk.id = k.tarjeta_id
               WHERE k.negocio_id = ${negocioId}::uuid AND tk.cliente_id = c.id)
               AS premios,
             activa.sellos AS tarjeta_sellos, activa.sellos_requeridos, activa.vence_el,
             coalesce(pc.ultimo_sello > ${ahora}::timestamptz
                        - make_interval(days => ${DIAS_DE_CLIENTE_ACTIVO}::int), false)
               AS activo,
             (pc.sellos >= ${SELLOS_PARA_ENFRIADO}
              AND pc.ultimo_sello <= ${ahora}::timestamptz
                        - make_interval(days => ${DIAS_DE_CLIENTE_ENFRIADO}::int))
               AS enfriado,
             coalesce(pc.primer_sello >= ${inicioDelMes}::timestamptz, false)
               AS nuevo_del_mes
      FROM por_cliente pc
      JOIN cliente c ON c.id = pc.cliente_id
      -- Como mucho una activa por cliente y negocio (INV-11).
      LEFT JOIN LATERAL (
        SELECT (SELECT count(*)::int FROM sello s
                 WHERE s.tarjeta_id = t.id AND NOT s.anulado) AS sellos,
               p.sellos_requeridos, t.vence_el
        FROM tarjeta t
        JOIN programa p ON p.id = t.programa_id
        WHERE t.cliente_id = c.id AND t.negocio_id = ${negocioId}::uuid
          AND t.estado = 'activa'
      ) activa ON true
      ORDER BY pc.ultimo_sello DESC NULLS LAST, lower(c.nombre), c.id
      LIMIT ${CLIENTES_EN_LA_LISTA}`;

    return esquemaClientesDelDueno.parse({
      generado_el: ahora.toISOString(),
      total,
      ventanas: {
        cliente_activo_dias: DIAS_DE_CLIENTE_ACTIVO,
        enfriado_dias: DIAS_DE_CLIENTE_ENFRIADO,
        sellos_para_enfriado: SELLOS_PARA_ENFRIADO,
      },
      clientes: filas.map((f) => ({
        nombre: f.nombre,
        telefono: f.telefono,
        sellos: f.sellos,
        primer_sello: f.primer_sello?.toISOString() ?? null,
        ultimo_sello: f.ultimo_sello?.toISOString() ?? null,
        premios: f.premios,
        tarjeta:
          f.tarjeta_sellos === null || f.sellos_requeridos === null
            ? null
            : {
                sellos: f.tarjeta_sellos,
                sellos_requeridos: f.sellos_requeridos,
                vence_el: f.vence_el?.toISOString() ?? null,
              },
        activo: f.activo,
        enfriado: f.enfriado,
        nuevo_del_mes: f.nuevo_del_mes,
      })),
    });
  }
}
