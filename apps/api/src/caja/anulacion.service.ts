import { Inject, Injectable } from '@nestjs/common';
import {
  type AnularRespuesta,
  type SellosRecientes,
  esquemaAnularRespuesta,
  esquemaSellosRecientes,
} from '@repunto/contratos';
import { decidirAnulacion, rechazo } from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';
import { cteDeCaja } from './caja.sql';
import { errorDeApi, errorDeRechazo } from './errores-http';
import { guardarRespuesta, reservarIdempotencia } from './idempotencia';
import { leerEstadoParaAnulacion } from './lectura-anulacion';

/**
 * Deshacer un sello (especificacion funcional, seccion 5).
 *
 * Quien puede que lo decide el dominio con el ROL DEL TURNO, que sale de la
 * base: el cajero deshace su ultimo sello dentro de cinco minutos, el
 * supervisor y el dueño cualquiera de su local.
 */

/** Cuantas horas hacia atras ve el supervisor. Un dia de trabajo y algo mas. */
const HORAS_RECIENTES = 24;

const SELLOS_RECIENTES = 50;

interface FilaDeSelloReciente {
  id: string;
  nombre: string;
  cajero: string;
  creado_el: Date;
  anulado: boolean;
}

@Injectable()
export class AnulacionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async anular(
    tokenHash: string,
    clave: string,
    selloId: string,
  ): Promise<AnularRespuesta> {
    return this.prisma.$transaction(async (tx) => {
      const estado = await leerEstadoParaAnulacion(tx, tokenHash, selloId);
      if (estado === null) throw errorDeApi('TOKEN_INVALIDO');

      const peticion = {
        dispositivo_id: estado.dispositivo.id,
        endpoint: 'POST /caja/sellos/anulacion',
        clave,
        cuerpo: { selloId },
      };
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return esquemaAnularRespuesta.parse(guardada);

      const decision = decidirAnulacion({
        ahora: estado.ahora,
        negocio: estado.negocio,
        local: estado.local,
        dispositivo: estado.dispositivo,
        turno: estado.turno,
        asignacion: estado.asignacion,
        sello: estado.sello,
        ultimoSelloDelUsuario: estado.ultimoSelloDelUsuario,
        tarjeta: estado.tarjeta,
        nombreDelCliente: estado.nombreDelCliente,
        programaDeLaTarjeta: estado.programaDeLaTarjeta,
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      // Marca, nunca borra (INV-17). Las tres columnas van juntas, como exige
      // sello_anulacion_completa_chk. Cero filas: alguien lo anulo en el medio.
      const anulados = await tx.$executeRaw`
        UPDATE sello
        SET anulado = true, anulado_el = now(),
            anulado_turno_id = ${decision.efecto.anulado_turno_id}::uuid
        WHERE id = ${decision.efecto.sello_id}::uuid AND NOT anulado`;
      if (anulados === 0) throw errorDeRechazo(rechazo('SELLO_YA_ANULADO'), null);

      const respuesta = esquemaAnularRespuesta.parse(decision.efecto.aviso);
      await guardarRespuesta(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /**
   * De donde saca el supervisor cual anular.
   *
   * Acotado en tiempo y en cantidad, y por rol: el supervisor y el dueño ven
   * las ultimas 24 horas de su local; el cajero, solo los suyos del turno
   * abierto. Un cajero nunca ve la base de clientes.
   */
  async recientes(tokenHash: string): Promise<SellosRecientes> {
    const filas = await this.prisma.$queryRaw<FilaDeSelloReciente[]>`
      WITH ${cteDeCaja(tokenHash)}
      SELECT s.id, c.nombre, u.nombre AS cajero, s.creado_el, s.anulado
      FROM sello s
      JOIN turno ON true
      JOIN turno_caja otorgado ON otorgado.id = s.turno_id
      JOIN usuario_negocio u ON u.id = otorgado.usuario_id
      JOIN tarjeta t ON t.id = s.tarjeta_id
      JOIN cliente c ON c.id = t.cliente_id
      WHERE s.local_id = turno.local_id
        AND CASE
              WHEN turno.rol = 'cajero' THEN s.turno_id = turno.id
              ELSE s.creado_el > now() - make_interval(hours => ${HORAS_RECIENTES})
            END
      ORDER BY s.creado_el DESC
      LIMIT ${SELLOS_RECIENTES}`;

    if (filas.length === 0) await this.exigirDispositivo(tokenHash);

    return esquemaSellosRecientes.parse({
      sellos: filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        cajero: fila.cajero,
        creado_el: fila.creado_el.toISOString(),
        anulado: fila.anulado,
      })),
    });
  }

  private async exigirDispositivo(tokenHash: string): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM dispositivo_caja WHERE token_hash = ${tokenHash}`;
    if (filas.length === 0) throw errorDeApi('TOKEN_INVALIDO');
  }
}
