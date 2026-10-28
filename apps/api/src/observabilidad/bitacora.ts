import { Inject, Injectable } from '@nestjs/common';

import type { AccionDeCaja } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { resultadoDelError } from './codigo.interceptor';
import { contextoActual } from './contexto';

/** Lo que la tarea nocturna conserva de la bitacora. */
export const DIAS_DE_BITACORA = 90;

/**
 * La bitacora de la caja (`intento_caja`): una fila por cada intento de
 * sellar, canjear, anular, confirmar o descartar, tambien los rechazados.
 *
 * Se escribe despues de resolver el pedido, FUERA de su transaccion, como los
 * topes: un rechazo la deshace entera, y una fila escrita adentro se iria con
 * ella. Los ids salen del contexto del pedido, que cada servicio fue
 * anotando a medida que leia.
 *
 * Que la bitacora falle no puede tumbar el pedido: el sello ya se otorgo, o
 * el rechazo ya se decidio. Se avisa en el log y se sigue.
 */
@Injectable()
export class BitacoraDeCaja {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async registrar<T>(accion: AccionDeCaja, operar: () => Promise<T>): Promise<T> {
    let resultado: T;
    try {
      resultado = await operar();
    } catch (error) {
      await this.escribir(accion, resultadoDelError(error));
      throw error;
    }
    await this.escribir(accion, 'ok');
    return resultado;
  }

  private async escribir(accion: AccionDeCaja, resultado: string): Promise<void> {
    const contexto = contextoActual();
    const c = contexto?.campos;
    // Sin tablet resuelta —token que no existe, tope antes de leer— no hay de
    // quien registrar nada: eso lo cuentan los topes y el log del pedido.
    if (
      contexto === undefined ||
      c?.dispositivo_id === undefined ||
      c.local_id === undefined
    ) {
      return;
    }
    try {
      await this.prisma.$executeRaw`
        INSERT INTO intento_caja
          (request_id, accion, resultado, dispositivo_id, local_id, turno_id,
           cliente_id, tarjeta_id, sello_id, registro_id)
        VALUES (${contexto.request_id}::uuid, ${accion}::accion_de_caja, ${resultado},
                ${c.dispositivo_id}::uuid, ${c.local_id}::uuid, ${c.turno_id ?? null}::uuid,
                ${c.cliente_id ?? null}::uuid, ${c.tarjeta_id ?? null}::uuid,
                ${c.sello_id ?? null}::uuid, ${c.registro_id ?? null}::uuid)`;
    } catch (error) {
      console.error(
        JSON.stringify({
          nivel: 'error',
          request_id: contexto.request_id,
          mensaje: 'No se pudo escribir la bitacora de la caja.',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
