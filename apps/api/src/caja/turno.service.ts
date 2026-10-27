import { Inject, Injectable } from '@nestjs/common';
import {
  type AbrirTurnoPeticion,
  type EstadoDeCaja,
  type UsuariosDeCaja,
  esquemaUsuariosDeCaja,
} from '@repunto/contratos';
import { type Rol, MINUTOS_DEL_TRAMO_DE_PIN, decidirApertura } from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';
import { pinCoincide } from '../seguridad/pin';
import { TopeDePeticiones } from '../seguridad/tope';
import { CAMPOS_DE_CAJA, type FilaDeCaja, cteDeCaja, mapearCaja } from './caja.sql';
import { codigoDelError, errorDeApi, errorDeRechazo } from './errores-http';
import { EstadoService } from './estado.service';
import { exigirTablet } from './tablet';

/**
 * El turno de la caja: quien puede abrirlo, abrirlo con PIN y cerrarlo
 * (CLAUDE.md, seccion 5). Quien decide es `decidirApertura`; aca se lee, se
 * verifica el hash y se escribe.
 */

interface FilaDeApertura extends FilaDeCaja {
  usuario: {
    id: string;
    negocio_id: string;
    rol: Rol;
    activo: boolean;
    pin_hash: string | null;
  } | null;
  asignacion_del_usuario: {
    usuario_id: string;
    local_id: string;
    activo: boolean;
  } | null;
}

@Injectable()
export class TurnoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
    @Inject(EstadoService) private readonly estadoDeCaja: EstadoService,
  ) {}

  /** `GET /caja/usuarios`: la lista de nombres que el cajero toca. */
  async usuarios(tokenHash: string): Promise<UsuariosDeCaja> {
    await exigirTablet(this.prisma, tokenHash);
    const filas = await this.prisma.$queryRaw<{ id: string; nombre: string; rol: Rol }[]>`
      SELECT u.id, u.nombre, u.rol
      FROM dispositivo_caja d
      JOIN usuario_local ul ON ul.local_id = d.local_id AND ul.activo
      JOIN usuario_negocio u ON u.id = ul.usuario_id
      WHERE d.token_hash = ${tokenHash} AND u.activo AND u.pin_hash IS NOT NULL
      ORDER BY u.nombre, u.id`;
    return esquemaUsuariosDeCaja.parse({ usuarios: filas });
  }

  /**
   * `POST /caja/turnos`. Responde el estado de la caja ya con el turno.
   *
   * Los PIN equivocados se cuentan FUERA de la transaccion, como los codigos
   * equivocados: el rechazo la deshace entera, y una cuenta escrita adentro se
   * iria con ella.
   */
  async abrir(tokenHash: string, peticion: AbrirTurnoPeticion): Promise<EstadoDeCaja> {
    const clave = `pin-equivocado:${peticion.usuario_id}`;
    const equivocados = await this.tope.cuenta(clave, MINUTOS_DEL_TRAMO_DE_PIN);

    try {
      await this.abrirEnTransaccion(tokenHash, peticion, equivocados);
    } catch (error) {
      if (codigoDelError(error) === 'PIN_INCORRECTO') {
        await this.tope.sumar(clave, MINUTOS_DEL_TRAMO_DE_PIN);
      }
      throw error;
    }
    return this.estadoDeCaja.estado(tokenHash);
  }

  /**
   * `POST /caja/turno/cierre`. Cerrar un turno que no hay no es un error:
   * el doble toque en "Cerrar turno" responde lo mismo las dos veces.
   */
  async cerrar(tokenHash: string): Promise<EstadoDeCaja> {
    await exigirTablet(this.prisma, tokenHash);
    await this.prisma.$executeRaw`
      UPDATE turno_caja t SET cerrado_el = now()
      FROM dispositivo_caja d
      WHERE d.token_hash = ${tokenHash} AND t.dispositivo_id = d.id
        AND t.cerrado_el IS NULL`;
    return this.estadoDeCaja.estado(tokenHash);
  }

  private async abrirEnTransaccion(
    tokenHash: string,
    peticion: AbrirTurnoPeticion,
    equivocados: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // La fila de la tablet bloqueada: dos aperturas a la vez en la misma
      // tablet se ordenan aca, y la segunda ve el turno que abrio la primera.
      // Sin esto chocarian en turno_caja_uno_abierto_por_dispositivo.
      const bloqueada = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM dispositivo_caja WHERE token_hash = ${tokenHash} FOR UPDATE`;
      if (bloqueada.length === 0) throw errorDeApi('TOKEN_INVALIDO');

      const filas = await tx.$queryRaw<FilaDeApertura[]>`
        WITH ${cteDeCaja(tokenHash)}, usu AS (
          SELECT u.id, u.negocio_id, u.rol, u.activo, u.pin_hash
          FROM usuario_negocio u JOIN neg ON u.negocio_id = neg.id
          WHERE u.id = ${peticion.usuario_id}::uuid
        ), asig_usu AS (
          SELECT ul.usuario_id, ul.local_id, ul.activo
          FROM usuario_local ul JOIN usu ON ul.usuario_id = usu.id
          JOIN loc ON ul.local_id = loc.id
        )
        SELECT ${CAMPOS_DE_CAJA},
               (SELECT to_jsonb(x) FROM usu x) AS usuario,
               (SELECT to_jsonb(x) FROM asig_usu x) AS asignacion_del_usuario`;

      const fila = filas[0];
      const caja = mapearCaja(fila);
      if (caja === null || fila === undefined) throw errorDeApi('TOKEN_INVALIDO');

      const usuario = fila.usuario;
      const pinCorrecto =
        usuario?.pin_hash != null && (await pinCoincide(peticion.pin, usuario.pin_hash));

      const decision = decidirApertura({
        ahora: caja.ahora,
        negocio: caja.negocio,
        local: caja.local,
        dispositivo: caja.dispositivo,
        usuario:
          usuario === null
            ? null
            : {
                id: usuario.id,
                negocio_id: usuario.negocio_id,
                rol: usuario.rol,
                activo: usuario.activo,
                tiene_pin: usuario.pin_hash !== null,
              },
        asignacion: fila.asignacion_del_usuario,
        equivocados,
        pinCorrecto,
        turnoAbierto: caja.turno,
      });

      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);
      if (decision.tipo === 'ya_abierto') return;

      const { efecto } = decision;
      if (efecto.cerrar_turno !== null) {
        // GREATEST con la apertura: el ahora de la caja es el now() de esta
        // transaccion, que es cuando EMPEZO. Si espero el candado de la
        // tablet mientras otra apertura abria el turno que ahora cierra, ese
        // turno pudo abrirse un instante despues, y cerrarlo antes de
        // abrirlo lo rechaza turno_caja_cierre_posterior_chk.
        await tx.$executeRaw`
          UPDATE turno_caja
          SET cerrado_el = GREATEST(${efecto.cerrar_turno.cerrado_el}, abierto_el)
          WHERE id = ${efecto.cerrar_turno.id}::uuid AND cerrado_el IS NULL`;
      }
      await tx.$executeRaw`
        INSERT INTO turno_caja (dispositivo_id, usuario_id, local_id, abierto_el)
        VALUES (${efecto.dispositivo_id}::uuid, ${efecto.usuario_id}::uuid,
                ${efecto.local_id}::uuid, now())`;
    });
  }
}
