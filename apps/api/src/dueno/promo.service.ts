import { Inject, Injectable } from '@nestjs/common';
import {
  type CondicionCambiada,
  type CondicionNueva,
  type ProgramaCambiado,
  type ProgramaNuevo,
  type PromoDelDueno,
  esquemaCondicionCambiada,
  esquemaProgramaCambiado,
  esquemaPromoDelDueno,
} from '@repunto/contratos';

import { bloquearNegocio } from '../admin/negocios.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  condicionNueva,
  condicionesRecientes,
  versionNuevaDelPrograma,
} from '../promo/promo';
import { guardarRespuestaDeDueno, reservarIdempotenciaDeDueno } from './idempotencia';

interface FilaDePromo {
  tarjetas_en_curso: number;
  version: number | null;
  sellos_requeridos: number | null;
  premio: string | null;
  vigencia_meses: number | null;
  horas_entre_sellos: number | null;
  pide_monto: boolean | null;
  desde: Date | null;
}

/** Quién pide: el dueño y su negocio, los dos de la sesión (INV-1). */
export interface DuenoQuePide {
  usuario_id: string;
  negocio_id: string;
}

/**
 * La promo y la condición, vistas y cambiadas por el dueño. Lo que se
 * escribe es lo mismo que cuando lo cambia el admin (promo/promo.ts); acá
 * cambia de dónde sale el negocio y quién firma.
 *
 * Con el negocio suspendido se puede cambiar igual: no sella nadie, y al
 * reactivarlo la caja ya tiene la promo que el dueño quiere.
 */
@Injectable()
export class PromoDelDuenoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /dueno/promo`. */
  async promo(negocioId: string): Promise<PromoDelDueno> {
    const filas = await this.prisma.$queryRaw<FilaDePromo[]>`
      SELECT (SELECT count(*)::int FROM tarjeta t
              WHERE t.negocio_id = n.id AND t.estado = 'activa') AS tarjetas_en_curso,
             p.version, p.sellos_requeridos, p.premio, p.vigencia_meses,
             p.horas_entre_sellos, p.pide_monto, p.creado_el AS desde
      FROM negocio n
      LEFT JOIN programa p ON p.negocio_id = n.id AND p.vigente
      WHERE n.id = ${negocioId}::uuid`;
    const f = filas[0];
    if (f === undefined) throw new Error('El negocio de la sesión no existe.');

    return esquemaPromoDelDueno.parse({
      programa:
        f.version === null
          ? null
          : {
              version: f.version,
              sellos_requeridos: f.sellos_requeridos,
              premio: f.premio,
              vigencia_meses: f.vigencia_meses,
              horas_entre_sellos: f.horas_entre_sellos,
              pide_monto: f.pide_monto,
              desde: f.desde?.toISOString(),
            },
      tarjetas_en_curso: f.tarjetas_en_curso,
      condiciones: await condicionesRecientes(this.prisma, negocioId),
    });
  }

  /** `POST /dueno/promo/programa`: una versión nueva (INV-5). */
  async cambiarPrograma(
    dueno: DuenoQuePide,
    clave: string,
    programa: ProgramaNuevo,
  ): Promise<ProgramaCambiado> {
    // El negocio va en la huella, como en el admin: si el dueño cambiara de
    // negocio, la misma clave no sería un reintento.
    const peticion = {
      usuario_id: dueno.usuario_id,
      endpoint: 'POST /dueno/promo/programa',
      clave,
      cuerpo: { negocio_id: dueno.negocio_id, ...programa },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeDueno(tx, peticion);
      if (guardada !== null) return esquemaProgramaCambiado.parse(guardada);

      await bloquearNegocio(tx, dueno.negocio_id);
      const respuesta = await versionNuevaDelPrograma(tx, dueno.negocio_id, programa);
      await guardarRespuestaDeDueno(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /** `POST /dueno/promo/condicion`: desde ahora, firmada por el dueño (INV-7). */
  async cambiarCondicion(
    dueno: DuenoQuePide,
    clave: string,
    condicion: CondicionNueva,
  ): Promise<CondicionCambiada> {
    const peticion = {
      usuario_id: dueno.usuario_id,
      endpoint: 'POST /dueno/promo/condicion',
      clave,
      cuerpo: { negocio_id: dueno.negocio_id, ...condicion },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeDueno(tx, peticion);
      if (guardada !== null) return esquemaCondicionCambiada.parse(guardada);

      await bloquearNegocio(tx, dueno.negocio_id);
      const respuesta = await condicionNueva(tx, dueno.negocio_id, condicion, {
        tipo: 'negocio',
        usuario_id: dueno.usuario_id,
      });
      await guardarRespuestaDeDueno(tx, peticion, respuesta);
      return respuesta;
    });
  }
}
