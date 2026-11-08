import { Inject, Injectable } from '@nestjs/common';
import {
  type DatosDelLocal,
  type NegocioDelDueno,
  type QrCambiado,
  esquemaNegocioDelDueno,
} from '@repunto/contratos';
import { rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import {
  guardarDatosDelLocal,
  localesPersonasYTablets,
  qrNuevoDelLocal,
} from '../negocio/locales';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Los locales, el equipo y las tablets del dueño. Lo que escribe es lo mismo
 * que la ficha del admin (negocio/); acá queda lo propio del dueño: su
 * negocio sale de la sesión, edita sus locales sin abrirlos ni cerrarlos, y
 * a los dueños no los toca.
 *
 * Con el negocio suspendido puede igual, como con la promo: al reactivarlo
 * todo está como lo quiere.
 */
@Injectable()
export class NegocioDelDuenoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /dueno/negocio`. */
  async negocio(negocioId: string): Promise<NegocioDelDueno> {
    return esquemaNegocioDelDueno.parse(
      await localesPersonasYTablets(this.prisma, negocioId),
    );
  }

  /** `POST /dueno/locales/:local/datos`. */
  async guardarLocal(
    negocioId: string,
    localId: string,
    datos: DatosDelLocal,
  ): Promise<NegocioDelDueno> {
    const cambiado = await guardarDatosDelLocal(this.prisma, negocioId, localId, datos);
    if (!cambiado) throw localNoEncontrado();
    return this.negocio(negocioId);
  }

  /** `POST /dueno/locales/:local/qr`. */
  async cambiarQr(negocioId: string, localId: string): Promise<QrCambiado> {
    const qr = await qrNuevoDelLocal(this.prisma, negocioId, localId);
    if (qr === null) throw localNoEncontrado();
    return qr;
  }

  /**
   * Que la persona sea de su negocio y no sea un dueño. Se mira fuera de la
   * transacción del cambio y alcanza: el rol dueño no cambia nunca
   * (ROL_NO_CAMBIABLE), así que nadie pasa a serlo entre esta lectura y el
   * cambio. Si mientras tanto la borran, el cambio contesta
   * PERSONA_NO_ENCONTRADA.
   */
  async exigirDelEquipo(negocioId: string, personaId: string): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ rol: string }[]>`
      SELECT rol::text AS rol FROM usuario_negocio
      WHERE id = ${personaId}::uuid AND negocio_id = ${negocioId}::uuid`;
    const persona = filas[0];
    if (persona === undefined) {
      throw errorDeRechazo(rechazo('PERSONA_NO_ENCONTRADA'), null);
    }
    if (persona.rol === 'dueno') throw errorDeRechazo(rechazo('DUENO_NO_EDITABLE'), null);
  }
}

function localNoEncontrado(): Error {
  return errorDeRechazo(rechazo('LOCAL_NO_ENCONTRADO'), null);
}
