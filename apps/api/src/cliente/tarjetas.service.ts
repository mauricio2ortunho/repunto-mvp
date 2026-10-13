import { Inject, Injectable } from '@nestjs/common';
import {
  type MarcaDelNegocio,
  type MisTarjetas,
  esquemaMisTarjetas,
} from '@repunto/contratos';
import {
  type SituacionDeTarjeta,
  estadoParaElCliente,
  faltanPara,
  ordenarParaElCliente,
} from '@repunto/dominio';

import { comoFecha, comoFechaONula } from '../caja/caja.sql';
import { errorDeApi } from '../caja/errores-http';
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

@Injectable()
export class TarjetasService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /mis/tarjetas`. */
  async de(tokenHash: string): Promise<MisTarjetas> {
    const filas = await this.prisma.$queryRaw<FilaDeLaLista[]>`
      WITH cli AS (
        SELECT d.cliente_id AS id
        FROM dispositivo_cliente d
        WHERE d.token_hash = ${tokenHash}
      ), actual AS (
        -- Una por negocio: la activa, que es a lo sumo una (INV-11), o si no
        -- queda ninguna, la ultima. Asi un negocio no desaparece de la app
        -- cuando la tarjeta vence, y la lista no crece con las viejas.
        SELECT DISTINCT ON (t.negocio_id)
               t.id, t.estado, t.vence_el, t.programa_id, t.negocio_id
        FROM tarjeta t JOIN cli ON t.cliente_id = cli.id
        ORDER BY t.negocio_id, (t.estado = 'activa') DESC, t.creado_el DESC
      ), fila AS (
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
      )
      SELECT (SELECT id FROM cli) AS cliente_id,
             now() AS ahora,
             COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM fila f), '[]'::jsonb) AS tarjetas`;

    const fila = filas[0];
    if (fila === undefined || fila.cliente_id === null)
      throw errorDeApi('TOKEN_INVALIDO');

    const ahora = comoFecha(fila.ahora);
    const situaciones = fila.tarjetas.map((tarjeta) => ({
      ...tarjeta,
      vence_el: comoFechaONula(tarjeta.vence_el),
      ultimo_sello: comoFechaONula(tarjeta.ultimo_sello),
    }));

    return esquemaMisTarjetas.parse({
      tarjetas: ordenarParaElCliente(situaciones, ahora).map((tarjeta) => ({
        id: tarjeta.id,
        negocio: tarjeta.negocio,
        estado: estadoParaElCliente(tarjeta, ahora),
        progreso: tarjeta.progreso,
        sellos_requeridos: tarjeta.sellos_requeridos,
        faltan: faltanPara(tarjeta.progreso, tarjeta),
        premio: tarjeta.premio,
        vence_el: tarjeta.vence_el?.toISOString() ?? null,
      })),
    });
  }
}
