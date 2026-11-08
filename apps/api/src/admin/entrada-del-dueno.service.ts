import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type EntradaDelDueno, esquemaEntradaDelDueno } from '@repunto/contratos';
import {
  HORAS_DE_ENTRADA_DE_DUENO,
  LARGO_CODIGO_DE_VINCULACION,
  codigoDeVinculacionDesde,
  formatearCodigoDeVinculacion,
  rechazo,
} from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { guardarRespuestaDeAdmin, reservarIdempotenciaDeAdmin } from './idempotencia';
import { bloquearNegocio } from './negocios.service';

/** Si choca con otro código, se prueba otro. */
const INTENTOS_DE_CODIGO = 5;

/**
 * El código con que el dueño entra a su panel, generado por el admin desde la
 * ficha. Es el reemplazo del mensaje de WhatsApp mientras no exista: el admin
 * se lo pasa por su cuenta. Lo firma el admin (`creado_por_admin_id`).
 */
@Injectable()
export class EntradaDelDuenoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `POST /admin/negocios/:id/personas/:persona/entrada`. */
  async generar(
    adminId: string,
    negocioId: string,
    personaId: string,
    clave: string,
  ): Promise<EntradaDelDueno> {
    // La persona va en la huella: la misma clave para otra no es un reintento.
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios/:id/personas/:persona/entrada',
      clave,
      cuerpo: { negocio_id: negocioId, persona_id: personaId },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaEntradaDelDueno.parse(guardada);

      await bloquearNegocio(tx, negocioId);
      const filas = await tx.$queryRaw<{ rol: string; activo: boolean }[]>`
        SELECT rol::text AS rol, activo FROM usuario_negocio
        WHERE id = ${personaId}::uuid AND negocio_id = ${negocioId}::uuid
        FOR UPDATE`;
      const persona = filas[0];
      if (persona === undefined) {
        throw errorDeRechazo(rechazo('PERSONA_NO_ENCONTRADA'), null);
      }
      // La base lo frena igual (entrada_dueno_usuario_es_dueno_fkey); decirlo
      // antes le da al admin un mensaje que entiende.
      if (persona.rol !== 'dueno' || !persona.activo) {
        throw errorDeRechazo(rechazo('PANEL_SOLO_DEL_DUENO'), null);
      }

      for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento += 1) {
        const codigo = codigoDeVinculacionDesde(randomBytes(LARGO_CODIGO_DE_VINCULACION));
        // Un choque abortaría la transacción: se pregunta antes, y el índice
        // único queda detrás por si dos chocan a la vez.
        const ocupado = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM entrada_dueno WHERE codigo = ${codigo}`;
        if (ocupado.length > 0) continue;

        const insertadas = await tx.$queryRaw<{ expira_el: Date }[]>`
          INSERT INTO entrada_dueno (usuario_id, codigo, expira_el, creado_por_admin_id)
          VALUES (${personaId}::uuid, ${codigo},
                  now() + make_interval(hours => ${HORAS_DE_ENTRADA_DE_DUENO}::int),
                  ${adminId}::uuid)
          RETURNING expira_el`;

        const respuesta = esquemaEntradaDelDueno.parse({
          codigo: formatearCodigoDeVinculacion(codigo),
          expira_el: insertadas[0]?.expira_el.toISOString(),
        });
        await guardarRespuestaDeAdmin(tx, peticion, respuesta);
        return respuesta;
      }
      throw new Error('No se pudo generar un codigo de entrada libre.');
    });
  }
}
