import { Inject, Injectable } from '@nestjs/common';
import {
  type DetalleDeTarjeta,
  type MarcaDelNegocio,
  type MisTarjetas,
  type TarjetaDelCliente,
  esquemaDetalleDeTarjeta,
  esquemaMisTarjetas,
} from '@repunto/contratos';
import {
  type SituacionDeTarjeta,
  estadoParaElCliente,
  faltanPara,
  ordenarParaElCliente,
  rechazo,
} from '@repunto/dominio';

import { comoFecha, comoFechaONula } from '../caja/caja.sql';
import { errorDeApi, errorDeRechazo } from '../caja/errores-http';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Las tarjetas del cliente, como las ve en su telefono (especificacion
 * funcional, seccion 10).
 *
 * El cliente sale del token de sesion, nunca de la peticion (INV-1). El estado
 * y el orden los decide el dominio con el reloj de la base; esta clase solo
 * los lee y los arma.
 */

/** Una tarjeta tal como sale de la consulta, dentro de un jsonb. */
interface TarjetaCruda {
  id: string;
  estado: SituacionDeTarjeta['estado'];
  /** Dentro de un jsonb, un timestamptz llega como texto con su offset. */
  vence_el: string | null;
  sellos_requeridos: number;
  premio: string;
  progreso: number;
  ultimo_sello: string | null;
  negocio_suspendido: boolean;
  negocio: MarcaDelNegocio;
}

interface FilaDeLaLista {
  /** Nulo si el token no es de ninguna sesion. */
  cliente_id: string | null;
  ahora: Date | string;
  tarjetas: TarjetaCruda[];
}

interface FilaDelDetalle {
  cliente_id: string | null;
  ahora: Date | string;
  /** Nula si no existe o es de otro cliente: para quien pregunta, es lo mismo. */
  tarjeta: TarjetaCruda | null;
  condicion: { texto: string; monto_minimo: string | null } | null;
  canje_en: string | null;
  sellos: { fecha: string; local: string }[];
}

/** El cliente del token. Va primero en las dos consultas. */
function cteDelCliente(tokenHash: string): Prisma.Sql {
  return Prisma.sql`
    cli AS (
      SELECT d.cliente_id AS id
      FROM dispositivo_cliente d
      WHERE d.token_hash = ${tokenHash}
    )`;
}

/**
 * Arma cada tarjeta de `actual` —que cada consulta define a su manera— con su
 * programa, su negocio y su progreso. Lo comparten la lista y el detalle, asi
 * que una tarjeta se calcula igual en las dos pantallas.
 */
const CTE_DE_TARJETA = Prisma.sql`
  fila AS (
    SELECT a.id, a.estado, a.vence_el,
           -- El programa de LA TARJETA, no el vigente (INV-6).
           p.sellos_requeridos, p.premio,
           n.estado = 'suspendido' AS negocio_suspendido,
           jsonb_build_object(
             'nombre', n.nombre,
             'color_principal', n.color_principal,
             'logo_url', n.logo_url,
             'portada_url', n.portada_url,
             'plantilla_tarjeta', n.plantilla_tarjeta,
             'icono_sello', n.icono_sello
           ) AS negocio,
           -- Contado, no guardado (INV-10).
           (SELECT count(*) FROM sello s
            WHERE s.tarjeta_id = a.id AND NOT s.anulado)::int AS progreso,
           (SELECT max(s.creado_el) FROM sello s
            WHERE s.tarjeta_id = a.id AND NOT s.anulado) AS ultimo_sello
    FROM actual a
    JOIN programa p ON p.id = a.programa_id
    JOIN negocio n ON n.id = a.negocio_id
  )`;

@Injectable()
export class TarjetasService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /mis/tarjetas`. */
  async de(tokenHash: string): Promise<MisTarjetas> {
    const filas = await this.prisma.$queryRaw<FilaDeLaLista[]>`
      WITH ${cteDelCliente(tokenHash)}, actual AS (
        -- Una por negocio: la activa, que es a lo sumo una (INV-11), o si no
        -- queda ninguna, la ultima. Asi un negocio no desaparece de la app
        -- cuando la tarjeta vence, y la lista no crece con las viejas.
        SELECT DISTINCT ON (t.negocio_id)
               t.id, t.estado, t.vence_el, t.programa_id, t.negocio_id
        FROM tarjeta t JOIN cli ON t.cliente_id = cli.id
        ORDER BY t.negocio_id, (t.estado = 'activa') DESC, t.creado_el DESC
      ), ${CTE_DE_TARJETA}
      SELECT (SELECT id FROM cli) AS cliente_id,
             now() AS ahora,
             COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM fila f), '[]'::jsonb) AS tarjetas`;

    const fila = filas[0];
    if (fila === undefined || fila.cliente_id === null)
      throw errorDeApi('TOKEN_INVALIDO');

    const ahora = comoFecha(fila.ahora);
    const situaciones = fila.tarjetas.map(situacionDe);

    return esquemaMisTarjetas.parse({
      tarjetas: ordenarParaElCliente(situaciones, ahora).map((tarjeta) =>
        paraElCliente(tarjeta, ahora),
      ),
    });
  }

  /**
   * `GET /mis/tarjetas/:id`. Cualquier tarjeta del cliente, no solo la actual:
   * la app puede tener abierta una que el cajero acaba de canjear.
   *
   * Una tarjeta que no existe y una de otro cliente dan el mismo 404. Si se
   * distinguieran, probando ids se podria averiguar cuales existen.
   */
  async detalle(tokenHash: string, id: string): Promise<DetalleDeTarjeta> {
    const filas = await this.prisma.$queryRaw<FilaDelDetalle[]>`
      WITH ${cteDelCliente(tokenHash)}, actual AS (
        SELECT t.id, t.estado, t.vence_el, t.programa_id, t.negocio_id, t.local_alta_id
        FROM tarjeta t JOIN cli ON t.cliente_id = cli.id
        WHERE t.id = ${id}::uuid
      ), ${CTE_DE_TARJETA}, cond AS (
        -- La vigente es la de vigente_desde mas reciente (INV-7), y es del
        -- negocio, no del local (INV-8).
        -- ::text a proposito: dentro de un jsonb, un numeric se vuelve numero
        -- JSON y la plata no viaja en coma flotante (CLAUDE.md, seccion 9).
        SELECT c.texto, c.monto_minimo::text AS monto_minimo
        FROM condicion_sello c JOIN actual a ON c.negocio_id = a.negocio_id
        WHERE c.vigente_desde <= now()
        ORDER BY c.vigente_desde DESC, c.creado_el DESC
        LIMIT 1
      )
      SELECT (SELECT id FROM cli) AS cliente_id,
             now() AS ahora,
             (SELECT to_jsonb(f) FROM fila f) AS tarjeta,
             (SELECT to_jsonb(c) FROM cond c) AS condicion,
             -- Donde se entrega el premio, si el negocio lo limita: el local
             -- donde se abrio la tarjeta (especificacion, seccion 7).
             (SELECT CASE WHEN n.canje_cualquier_local THEN NULL ELSE l.nombre END
              FROM actual a
              JOIN negocio n ON n.id = a.negocio_id
              JOIN local l ON l.id = a.local_alta_id) AS canje_en,
             -- Los que cuentan, del mas reciente al mas viejo. Los sobrantes de
             -- un canje vienen con su fecha y su local de origen (INV-15).
             COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object('fecha', s.creado_el, 'local', l.nombre)
                        ORDER BY s.creado_el DESC)
               FROM sello s
               JOIN actual a ON s.tarjeta_id = a.id
               JOIN local l ON l.id = s.local_id
               WHERE NOT s.anulado
             ), '[]'::jsonb) AS sellos`;

    const fila = filas[0];
    if (fila === undefined || fila.cliente_id === null)
      throw errorDeApi('TOKEN_INVALIDO');
    if (fila.tarjeta === null)
      throw errorDeRechazo(rechazo('TARJETA_NO_ENCONTRADA'), null);

    const ahora = comoFecha(fila.ahora);
    return esquemaDetalleDeTarjeta.parse({
      ...paraElCliente(situacionDe(fila.tarjeta), ahora),
      ahora: ahora.toISOString(),
      condicion: fila.condicion,
      canje_en: fila.canje_en,
      sellos: fila.sellos.map((sello) => ({
        fecha: comoFecha(sello.fecha).toISOString(),
        local: sello.local,
      })),
    });
  }
}

type Situacion = Omit<TarjetaCruda, 'vence_el' | 'ultimo_sello'> & SituacionDeTarjeta;

function situacionDe(tarjeta: TarjetaCruda): Situacion {
  return {
    ...tarjeta,
    vence_el: comoFechaONula(tarjeta.vence_el),
    ultimo_sello: comoFechaONula(tarjeta.ultimo_sello),
  };
}

function paraElCliente(tarjeta: Situacion, ahora: Date): TarjetaDelCliente {
  return {
    id: tarjeta.id,
    negocio: tarjeta.negocio,
    estado: estadoParaElCliente(tarjeta, ahora),
    progreso: tarjeta.progreso,
    sellos_requeridos: tarjeta.sellos_requeridos,
    faltan: faltanPara(tarjeta.progreso, tarjeta),
    premio: tarjeta.premio,
    vence_el: tarjeta.vence_el?.toISOString() ?? null,
  };
}
