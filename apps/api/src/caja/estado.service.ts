import { Inject, Injectable } from '@nestjs/common';
import { type EstadoDeCaja, esquemaEstadoDeCaja } from '@repunto/contratos';
import { type Rol, revisarCajaParaSellar } from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';
import { CAMPOS_DE_CAJA, type FilaDeCaja, cteDeCaja, mapearCaja } from './caja.sql';
import { errorDeApi } from './errores-http';

/**
 * `GET /caja/estado`: con que se dibuja el panel antes de la primera accion.
 *
 * Es el unico endpoint de caja que contesta aunque la caja no pueda operar, y
 * tiene que ser asi: el panel necesita saber que mostrar justamente cuando
 * nadie abrio turno o cuando la tablet fue revocada. En vez de rechazar, trae
 * el estado y el `impedimento`, que decide `revisarCajaParaSellar` con las
 * mismas reglas que rechazan un sello, promo incluida. El panel no vuelve a
 * razonarlo.
 */

interface FilaDeEstado extends FilaDeCaja {
  negocio_detalle: {
    nombre: string;
    color_principal: string;
    logo_url: string | null;
    plantilla_tarjeta: string;
    icono_sello: string;
  } | null;
  local_detalle: { nombre: string } | null;
  usuario_del_turno: { nombre: string; rol: Rol } | null;
  condicion: { texto: string; monto_minimo: string | null } | null;
  programa: { premio: string; sellos_requeridos: number } | null;
}

@Injectable()
export class EstadoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async estado(tokenHash: string): Promise<EstadoDeCaja> {
    const filas = await this.prisma.$queryRaw<FilaDeEstado[]>`
      WITH ${cteDeCaja(tokenHash)}, neg_detalle AS (
        SELECT n.nombre, n.color_principal, n.logo_url, n.plantilla_tarjeta, n.icono_sello
        FROM negocio n JOIN neg ON neg.id = n.id
      ), loc_detalle AS (
        SELECT l.nombre FROM local l JOIN loc ON loc.id = l.id
      ), usuario_del_turno AS (
        SELECT u.nombre, u.rol
        FROM usuario_negocio u JOIN turno ON turno.usuario_id = u.id
      ), cond AS (
        -- ::text a proposito: dentro de un jsonb, un numeric se vuelve numero
        -- JSON y la plata no viaja en coma flotante (CLAUDE.md, seccion 9).
        SELECT c.texto, c.monto_minimo::text AS monto_minimo
        FROM condicion_sello c JOIN neg ON c.negocio_id = neg.id
        WHERE c.vigente_desde <= now()
        ORDER BY c.vigente_desde DESC, c.creado_el DESC
        LIMIT 1
      ), prog AS (
        SELECT p.premio, p.sellos_requeridos
        FROM programa p JOIN neg ON p.negocio_id = neg.id
        WHERE p.vigente
      )
      SELECT ${CAMPOS_DE_CAJA},
             (SELECT to_jsonb(x) FROM neg_detalle x) AS negocio_detalle,
             (SELECT to_jsonb(x) FROM loc_detalle x) AS local_detalle,
             (SELECT to_jsonb(x) FROM usuario_del_turno x) AS usuario_del_turno,
             (SELECT to_jsonb(x) FROM cond x) AS condicion,
             (SELECT to_jsonb(x) FROM prog x) AS programa`;

    const fila = filas[0];
    const caja = mapearCaja(fila);
    if (caja === null || fila === undefined) throw errorDeApi('TOKEN_INVALIDO');
    if (fila.negocio_detalle === null || fila.local_detalle === null) {
      throw new Error('Un dispositivo sin local o sin negocio: la base lo impide.');
    }

    // La promo entra en la revision: sin condicion o sin programa vigente la
    // caja tampoco puede sellar, y el panel no tiene que deducirlo de que el
    // premio venga nulo.
    const revision = revisarCajaParaSellar(caja, {
      condicionVigente: fila.condicion !== null,
      programaVigente: fila.programa !== null,
    });
    const usuario = fila.usuario_del_turno;

    return esquemaEstadoDeCaja.parse({
      negocio: fila.negocio_detalle,
      local: fila.local_detalle,
      turno: usuario === null ? null : { usuario: usuario.nombre, rol: usuario.rol },
      condicion: fila.condicion,
      programa: fila.programa,
      impedimento: revision.valido ? null : revision.codigo,
    });
  }
}
