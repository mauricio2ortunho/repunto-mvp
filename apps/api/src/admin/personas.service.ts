import { Inject, Injectable } from '@nestjs/common';
import {
  type PersonaCreada,
  type PersonaNueva,
  type PinPuesto,
  esquemaPersonaCreada,
  esquemaPinPuesto,
} from '@repunto/contratos';
import { normalizarTelefono, rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import type { Transaccion } from '../caja/lectura';
import { PrismaService } from '../prisma/prisma.service';
import { hashDePin } from '../seguridad/pin';
import { guardarRespuestaDeAdmin, reservarIdempotenciaDeAdmin } from './idempotencia';
import { bloquearNegocio, negocioNoEncontrado } from './negocios.service';

/**
 * Las personas de un negocio, desde la ficha del admin: dueno, supervisores y
 * cajeros, en que locales trabajan y su PIN.
 *
 * Lo que la base garantiza igual se revisa antes, para contestar con un
 * codigo que el panel sepa explicar: el nombre repetido entre los activos
 * (usuario_negocio_nombre_unico_entre_activos), el telefono de otro
 * (usuario_negocio_telefono_key) y el local de otro negocio
 * (usuario_local_local_mismo_negocio_fkey). Con el negocio bloqueado, la
 * revision del nombre no tiene carrera; la del telefono es global y si
 * alguna vez se cruzan dos altas, la base rechaza la segunda.
 */
@Injectable()
export class PersonasDeAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `POST /admin/negocios/:id/personas`. Sin PIN: va en su propio pedido. */
  async crear(
    adminId: string,
    negocioId: string,
    clave: string,
    persona: PersonaNueva,
  ): Promise<PersonaCreada> {
    const telefono = telefonoNormalizado(persona.telefono);
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios/:id/personas',
      clave,
      cuerpo: { negocio_id: negocioId, ...persona, telefono },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaPersonaCreada.parse(guardada);

      await bloquearNegocio(tx, negocioId);
      await exigirLocalesDelNegocio(tx, negocioId, persona.locales);
      await exigirNombreLibre(tx, negocioId, persona.nombre);
      if (telefono !== null) await exigirTelefonoLibre(tx, telefono);

      const filas = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO usuario_negocio (negocio_id, rol, telefono, nombre)
        VALUES (${negocioId}::uuid, ${persona.rol}::rol_usuario, ${telefono},
                ${persona.nombre})
        RETURNING id`;
      const id = filas[0]?.id;
      if (id === undefined) throw new Error('El INSERT de la persona no devolvio fila.');

      if (persona.locales.length > 0) {
        await tx.$executeRaw`
          INSERT INTO usuario_local (usuario_id, local_id, negocio_id)
          SELECT ${id}::uuid, l, ${negocioId}::uuid
          FROM unnest(${persona.locales}::uuid[]) AS l`;
      }

      const respuesta = esquemaPersonaCreada.parse({ id });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /**
   * `POST .../personas/:persona/pin`: poner o cambiar el PIN. Se guarda
   * hasheado con sal (seguridad/pin.ts) y no se devuelve ni se registra. Un
   * PIN nuevo no levanta un bloqueo en curso: ese se levanta solo al
   * terminar el tramo.
   */
  async ponerPin(negocioId: string, personaId: string, pin: string): Promise<PinPuesto> {
    const hash = await hashDePin(pin);
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE usuario_negocio SET pin_hash = ${hash}
      WHERE id = ${personaId}::uuid AND negocio_id = ${negocioId}::uuid`;
    if (cambiadas === 0) throw await this.personaNoEncontrada(negocioId);
    return esquemaPinPuesto.parse({ tiene_pin: true });
  }

  /** Cual falta: un negocio que no existe es NEGOCIO_NO_ENCONTRADO. */
  private async personaNoEncontrada(negocioId: string): Promise<Error> {
    const negocios = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM negocio WHERE id = ${negocioId}::uuid`;
    if (negocios.length === 0) return negocioNoEncontrado();
    return errorDeRechazo(rechazo('PERSONA_NO_ENCONTRADA'), null);
  }
}

/** En E.164 antes de cualquier consulta (INV-20), o TELEFONO_INVALIDO. */
function telefonoNormalizado(tipeado: string | null): string | null {
  if (tipeado === null) return null;
  const telefono = normalizarTelefono(tipeado);
  if (telefono === null) throw errorDeRechazo(rechazo('TELEFONO_INVALIDO'), null);
  return telefono;
}

async function exigirLocalesDelNegocio(
  tx: Transaccion,
  negocioId: string,
  locales: string[],
): Promise<void> {
  if (locales.length === 0) return;
  const filas = await tx.$queryRaw<{ cuantos: number }[]>`
    SELECT count(*)::int AS cuantos FROM local
    WHERE negocio_id = ${negocioId}::uuid AND id = ANY(${locales}::uuid[])`;
  if (filas[0]?.cuantos !== locales.length) {
    throw errorDeRechazo(rechazo('LOCAL_NO_ENCONTRADO'), null);
  }
}

/** `excepto`: la persona que se esta editando, que no choca consigo misma. */
async function exigirNombreLibre(
  tx: Transaccion,
  negocioId: string,
  nombre: string,
  excepto: string | null = null,
): Promise<void> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM usuario_negocio
    WHERE negocio_id = ${negocioId}::uuid AND activo
      AND lower(nombre) = lower(${nombre})
      AND id IS DISTINCT FROM ${excepto}::uuid`;
  if (filas.length > 0) throw errorDeRechazo(rechazo('NOMBRE_REPETIDO'), null);
}

async function exigirTelefonoLibre(
  tx: Transaccion,
  telefono: string,
  excepto: string | null = null,
): Promise<void> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM usuario_negocio
    WHERE telefono = ${telefono} AND id IS DISTINCT FROM ${excepto}::uuid`;
  if (filas.length > 0) throw errorDeRechazo(rechazo('TELEFONO_EN_USO'), null);
}
