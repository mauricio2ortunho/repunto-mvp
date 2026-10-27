import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * El candado que impide dos corridas a la vez. En la base y no en memoria
 * porque cada invocacion puede ser otro proceso (CLAUDE.md, seccion 2).
 */
const CANDADO = 'repunto:tarea-nocturna';

/**
 * Lo que sirve solo un rato: un codigo rotativo vale 60 segundos, un
 * reintento llega en segundos y la ventana de tope mas larga es una hora.
 * Pasado un dia no queda nada que proteger.
 */
const HORAS_DE_RETENCION = 24;

/** Holgado para la noche de un piloto, y debajo del maxDuration de Vercel. */
const TIEMPO_MAXIMO_MS = 12_000;

export type ResultadoDeLaNoche =
  | {
      estado: 'hecho';
      vencidas: number;
      purgadas: {
        codigo_usado: number;
        peticion_idempotente: number;
        tope_peticion: number;
      };
    }
  | { estado: 'en-curso' };

/**
 * Los trabajos programados de CLAUDE.md, seccion 7, que hoy corren una vez por
 * noche: vencer tarjetas y purgar lo que ya no protege nada.
 *
 * Correr dos veces no cambia el resultado: cada sentencia toca solo lo que
 * todavia cumple su condicion. Por eso un reintento de Vercel, o una corrida a
 * mano, son inofensivos.
 */
@Injectable()
export class TareasService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async nocturna(): Promise<ResultadoDeLaNoche> {
    return this.prisma.$transaction(
      async (tx) => {
        // De transaccion y no de sesion: se suelta solo al terminar, y es el
        // unico que funciona detras del pooler en modo transaccion.
        const candado = await tx.$queryRaw<{ tomado: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${CANDADO})) AS tomado`;
        if (candado[0]?.tomado !== true) return { estado: 'en-curso' };

        // La misma regla que estaVencida del dominio, con el mismo reloj que
        // el sellado: el de la base. Un sello que llega a la vez cierra la
        // misma tarjeta con WHERE estado = 'activa', asi que el que llega
        // segundo no hace nada (concurrencia.int.test.ts).
        const vencidas = await tx.$executeRaw`
          UPDATE tarjeta SET estado = 'vencida'
          WHERE estado = 'activa' AND vence_el < now()`;

        const corte = Prisma.sql`now() - make_interval(hours => ${HORAS_DE_RETENCION}::int)`;
        const codigoUsado = await tx.$executeRaw`
          DELETE FROM codigo_usado WHERE creado_el < ${corte}`;
        const peticionIdempotente = await tx.$executeRaw`
          DELETE FROM peticion_idempotente WHERE creado_el < ${corte}`;
        // Por ventana y no por creado_el: la fila se crea al primer pedido
        // de la hora y se sigue sumando hasta que la ventana termina.
        const topePeticion = await tx.$executeRaw`
          DELETE FROM tope_peticion WHERE ventana < ${corte}`;

        return {
          estado: 'hecho',
          vencidas,
          purgadas: {
            codigo_usado: codigoUsado,
            peticion_idempotente: peticionIdempotente,
            tope_peticion: topePeticion,
          },
        };
      },
      { timeout: TIEMPO_MAXIMO_MS },
    );
  }
}
