import { Inject, Injectable } from '@nestjs/common';
import {
  type DatosDePersona,
  type EstadoDePersona,
  type PersonaCreada,
  type PersonaNueva,
  type PinPuesto,
  type PersonaBorrada,
  esquemaEstadoDePersona,
  esquemaPersonaBorrada,
  esquemaPersonaCreada,
  esquemaPinPuesto,
} from '@repunto/contratos';
import { normalizarTelefono, rechazo } from '@repunto/dominio';

import { errorDeApi, errorDeRechazo } from '../caja/errores-http';
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

  /**
   * `POST .../personas/:persona/datos`. Nombre, rol, telefono y la lista
   * completa de sus locales. Sacarle un local da de baja esa asignacion, no
   * la borra: sus turnos viejos la referencian (INV-17). La tablet de ese
   * local deja de aceptarla al instante (LOCAL_NO_AUTORIZADO).
   */
  async actualizar(
    negocioId: string,
    personaId: string,
    datos: DatosDePersona,
  ): Promise<void> {
    const telefono = telefonoNormalizado(datos.telefono);

    await this.prisma.$transaction(async (tx) => {
      await bloquearNegocio(tx, negocioId);
      const actual = await leerPersona(tx, negocioId, personaId);
      if ((actual.rol === 'dueno') !== (datos.rol === 'dueno')) {
        throw errorDeRechazo(rechazo('ROL_NO_CAMBIABLE'), null);
      }
      await exigirLocalesDelNegocio(tx, negocioId, datos.locales);
      // Un dado de baja no choca: el indice es solo entre los activos.
      if (actual.activo) await exigirNombreLibre(tx, negocioId, datos.nombre, personaId);
      if (telefono !== null) await exigirTelefonoLibre(tx, telefono, personaId);

      await tx.$executeRaw`
        UPDATE usuario_negocio
        SET nombre = ${datos.nombre}, rol = ${datos.rol}::rol_usuario,
            telefono = ${telefono}
        WHERE id = ${personaId}::uuid`;
      await tx.$executeRaw`
        UPDATE usuario_local SET activo = (local_id = ANY(${datos.locales}::uuid[]))
        WHERE usuario_id = ${personaId}::uuid`;
      if (datos.locales.length > 0) {
        await tx.$executeRaw`
          INSERT INTO usuario_local (usuario_id, local_id, negocio_id)
          SELECT ${personaId}::uuid, l, ${negocioId}::uuid
          FROM unnest(${datos.locales}::uuid[]) AS l
          ON CONFLICT (usuario_id, local_id) DO UPDATE SET activo = true`;
      }
    });
  }

  /**
   * Dar de baja. Sale de la lista de la tablet y, si tenia el turno abierto,
   * la caja lo rechaza en el proximo sello (TURNO_CERRADO). Sus sellos de
   * antes siguen firmados con su nombre. Al dueno se le borra el telefono:
   * es unico en la plataforma, y de baja no lo usa
   * (usuario_negocio_dueno_con_telefono_chk solo lo exige al activo).
   *
   * Al dueno tambien se le cierran las sesiones del panel y se le vencen los
   * codigos sin usar. El guard ya lo frena por estar de baja; esto es para
   * que reactivarlo no le devuelva una sesion vieja ni un codigo olvidado.
   */
  async darDeBaja(negocioId: string, personaId: string): Promise<EstadoDePersona> {
    await this.prisma.$transaction(async (tx) => {
      await bloquearNegocio(tx, negocioId);
      await leerPersona(tx, negocioId, personaId);
      await tx.$executeRaw`
        UPDATE usuario_negocio
        SET activo = false,
            telefono = CASE WHEN rol = 'dueno' THEN NULL ELSE telefono END
        WHERE id = ${personaId}::uuid`;
      await tx.$executeRaw`
        UPDATE sesion_dueno SET revocada_el = now()
        WHERE usuario_id = ${personaId}::uuid AND revocada_el IS NULL`;
      await tx.$executeRaw`
        UPDATE entrada_dueno SET expira_el = now()
        WHERE usuario_id = ${personaId}::uuid AND usado_el IS NULL
          AND expira_el > now()`;
    });
    return esquemaEstadoDePersona.parse({ activo: false });
  }

  /**
   * Reactivar. Choca si mientras tanto otro activo tomo su nombre. El dueno
   * trae su telefono, que se le libero al darlo de baja; los demas no llevan.
   */
  async reactivar(
    negocioId: string,
    personaId: string,
    tipeado: string | null,
  ): Promise<EstadoDePersona> {
    const telefono = telefonoNormalizado(tipeado);
    await this.prisma.$transaction(async (tx) => {
      await bloquearNegocio(tx, negocioId);
      const actual = await leerPersona(tx, negocioId, personaId);
      const esDueno = actual.rol === 'dueno';
      if (esDueno !== (telefono !== null)) throw errorDeApi('PETICION_INVALIDA');
      if (!actual.activo)
        await exigirNombreLibre(tx, negocioId, actual.nombre, personaId);
      if (telefono !== null) await exigirTelefonoLibre(tx, telefono, personaId);
      await tx.$executeRaw`
        UPDATE usuario_negocio
        SET activo = true, telefono = COALESCE(${telefono}, telefono)
        WHERE id = ${personaId}::uuid`;
    });
    return esquemaEstadoDePersona.parse({ activo: true });
  }

  /**
   * Borrar a alguien cargado por error. Solo sin historia: si abrio un turno,
   * escribio una condicion o vinculo una tablet, lo que hizo esta firmado con
   * su nombre y borrarlo lo dejaria sin firma (INV-17). Las FK RESTRICT lo
   * impedirian igual; revisarlo antes deja contestar PERSONA_CON_HISTORIA.
   * Sus asignaciones a locales se van con ella: sin turnos, no son historia.
   * Tambien sus codigos y sesiones del panel: son credenciales, no historia.
   */
  async borrar(negocioId: string, personaId: string): Promise<PersonaBorrada> {
    await this.prisma.$transaction(async (tx) => {
      await bloquearNegocio(tx, negocioId);
      await leerPersona(tx, negocioId, personaId);
      if (await tieneHistoria(tx, personaId)) {
        throw errorDeRechazo(rechazo('PERSONA_CON_HISTORIA'), null);
      }
      await tx.$executeRaw`DELETE FROM sesion_dueno WHERE usuario_id = ${personaId}::uuid`;
      await tx.$executeRaw`DELETE FROM entrada_dueno WHERE usuario_id = ${personaId}::uuid`;
      await tx.$executeRaw`
        DELETE FROM peticion_idempotente_dueno WHERE usuario_id = ${personaId}::uuid`;
      await tx.$executeRaw`DELETE FROM usuario_local WHERE usuario_id = ${personaId}::uuid`;
      await tx.$executeRaw`DELETE FROM usuario_negocio WHERE id = ${personaId}::uuid`;
    });
    return esquemaPersonaBorrada.parse({ borrada: true });
  }

  /** Cual falta: un negocio que no existe es NEGOCIO_NO_ENCONTRADO. */
  private async personaNoEncontrada(negocioId: string): Promise<Error> {
    const negocios = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM negocio WHERE id = ${negocioId}::uuid`;
    if (negocios.length === 0) return negocioNoEncontrado();
    return errorDeRechazo(rechazo('PERSONA_NO_ENCONTRADA'), null);
  }
}

/**
 * Lo que queda firmado con su nombre: un turno (y con el, cada sello, canje y
 * anulacion), una condicion o una tablet vinculada. Son las tres tablas que
 * apuntan a usuario_negocio o a usuario_local, ademas de usuario_local. La
 * ficha hace la misma pregunta (negocios.service, con_historia).
 */
async function tieneHistoria(tx: Transaccion, personaId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ con_historia: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM turno_caja t WHERE t.usuario_id = ${personaId}::uuid)
      OR EXISTS (SELECT 1 FROM condicion_sello c WHERE c.usuario_id = ${personaId}::uuid)
      OR EXISTS (SELECT 1 FROM vinculacion_pendiente v
                 WHERE v.creado_por_usuario_id = ${personaId}::uuid)
    ) AS con_historia`;
  return filas[0]?.con_historia ?? true;
}

/** La persona, tomada para esta transaccion, o PERSONA_NO_ENCONTRADA. */
async function leerPersona(
  tx: Transaccion,
  negocioId: string,
  personaId: string,
): Promise<{ rol: string; activo: boolean; nombre: string }> {
  const filas = await tx.$queryRaw<{ rol: string; activo: boolean; nombre: string }[]>`
    SELECT rol::text AS rol, activo, nombre FROM usuario_negocio
    WHERE id = ${personaId}::uuid AND negocio_id = ${negocioId}::uuid
    FOR UPDATE`;
  const persona = filas[0];
  if (persona === undefined) throw errorDeRechazo(rechazo('PERSONA_NO_ENCONTRADA'), null);
  return persona;
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
