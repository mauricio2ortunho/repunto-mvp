import { Inject, Injectable } from '@nestjs/common';
import {
  CONDICIONES_EN_LA_FICHA,
  type CondicionCambiada,
  type CondicionNueva,
  type DatosDelNegocio,
  type EstadoDelNegocio,
  type FichaDelNegocio,
  type NegocioCreado,
  type NegocioNuevo,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  type ProgramaNuevo,
  esquemaCondicionCambiada,
  esquemaEstadoDelNegocio,
  esquemaFichaDelNegocio,
  esquemaNegocioCreado,
  esquemaNegociosDelAdmin,
  esquemaProgramaCambiado,
} from '@repunto/contratos';

import { rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import type { Transaccion } from '../caja/lectura';
import { PrismaService } from '../prisma/prisma.service';
import { guardarRespuestaDeAdmin, reservarIdempotenciaDeAdmin } from './idempotencia';

interface FilaDeNegocio {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  color_principal: string;
  logo_url: string | null;
  icono_sello: string;
  plantilla_tarjeta: string;
  locales_activos: number;
  programa: unknown;
  condicion: unknown;
  creado_el: Date;
}

interface FilaDeFicha {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  color_principal: string;
  logo_url: string | null;
  icono_sello: string;
  plantilla_tarjeta: string;
  canje_cualquier_local: boolean;
  creado_el: Date;
  locales_activos: number;
  tarjetas_en_curso: number;
  version: number | null;
  sellos_requeridos: number | null;
  premio: string | null;
  vigencia_meses: number | null;
  horas_entre_sellos: number | null;
  pide_monto: boolean | null;
  programa_desde: Date | null;
}

interface FilaDeCondicion {
  texto: string;
  monto_minimo: string | null;
  vigente_desde: Date;
  autor_del_negocio: string | null;
}

/**
 * Los negocios, vistos por el admin de plataforma. Su alcance es la
 * plataforma entera: no hay negocio que salga de su token, y por eso es el
 * unico que elige negocio (CLAUDE.md, INV-1 vale para quien opera DENTRO de
 * un negocio).
 */
@Injectable()
export class NegociosDeAdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** `GET /admin/negocios`: todos, suspendidos incluidos, los nuevos primero. */
  async listar(): Promise<NegociosDelAdmin> {
    const filas = await this.prisma.$queryRaw<FilaDeNegocio[]>`
      SELECT n.id, n.nombre, n.categoria, n.estado::text AS estado,
             n.color_principal, n.logo_url, n.icono_sello, n.plantilla_tarjeta,
             (SELECT count(*)::int FROM local l
              WHERE l.negocio_id = n.id AND l.activo) AS locales_activos,
             (SELECT jsonb_build_object('sellos_requeridos', p.sellos_requeridos,
                                        'premio', p.premio)
              FROM programa p WHERE p.negocio_id = n.id AND p.vigente) AS programa,
             -- La misma eleccion que la caja (ctePromoYTarjeta).
             (SELECT jsonb_build_object('texto', c.texto)
              FROM condicion_sello c
              WHERE c.negocio_id = n.id AND c.vigente_desde <= now()
              ORDER BY c.vigente_desde DESC, c.creado_el DESC
              LIMIT 1) AS condicion,
             n.creado_el
      FROM negocio n
      ORDER BY n.creado_el DESC, n.id`;

    return esquemaNegociosDelAdmin.parse({
      negocios: filas.map((f) => ({ ...f, creado_el: f.creado_el.toISOString() })),
    });
  }

  /**
   * `POST /admin/negocios`. El negocio, la version 1 de su promo y su primera
   * condicion, en una sola transaccion: o queda listo para sellar en cuanto
   * tenga un local y una tablet, o no queda nada.
   */
  async crear(
    adminId: string,
    clave: string,
    alta: NegocioNuevo,
  ): Promise<NegocioCreado> {
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios',
      clave,
      cuerpo: alta,
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaNegocioCreado.parse(guardada);

      const negocios = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO negocio (nombre, categoria, color_principal, icono_sello,
                             plantilla_tarjeta, canje_cualquier_local)
        VALUES (${alta.nombre}, ${alta.categoria}, ${alta.color_principal},
                ${alta.icono_sello}, ${alta.plantilla_tarjeta},
                ${alta.canje_cualquier_local})
        RETURNING id`;
      const negocio = negocios[0];
      if (negocio === undefined)
        throw new Error('El INSERT del negocio no devolvio fila.');

      const { programa, condicion } = alta;
      await tx.$executeRaw`
        INSERT INTO programa (negocio_id, version, sellos_requeridos, premio,
                              vigencia_meses, horas_entre_sellos, pide_monto, vigente)
        VALUES (${negocio.id}::uuid, 1, ${programa.sellos_requeridos},
                ${programa.premio}, ${programa.vigencia_meses},
                ${programa.horas_entre_sellos}, ${programa.pide_monto}, true)`;

      // Firmada por el admin: todavia no hay nadie del negocio
      // (condicion_sello_un_solo_autor_chk).
      await tx.$executeRaw`
        INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde,
                                     creado_por_admin_id)
        VALUES (${negocio.id}::uuid, ${condicion.texto},
                ${condicion.monto_minimo}::numeric, now(), ${adminId}::uuid)`;

      const respuesta = esquemaNegocioCreado.parse({ id: negocio.id });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /** `GET /admin/negocios/:id`. */
  async ficha(id: string): Promise<FichaDelNegocio> {
    const filas = await this.prisma.$queryRaw<FilaDeFicha[]>`
      SELECT n.id, n.nombre, n.categoria, n.estado::text AS estado,
             n.color_principal, n.logo_url, n.icono_sello, n.plantilla_tarjeta,
             n.canje_cualquier_local, n.creado_el,
             (SELECT count(*)::int FROM local l
              WHERE l.negocio_id = n.id AND l.activo) AS locales_activos,
             (SELECT count(*)::int FROM tarjeta t
              WHERE t.negocio_id = n.id AND t.estado = 'activa') AS tarjetas_en_curso,
             p.version, p.sellos_requeridos, p.premio, p.vigencia_meses,
             p.horas_entre_sellos, p.pide_monto, p.creado_el AS programa_desde
      FROM negocio n
      LEFT JOIN programa p ON p.negocio_id = n.id AND p.vigente
      WHERE n.id = ${id}::uuid`;
    const f = filas[0];
    if (f === undefined) throw negocioNoEncontrado();

    // La misma eleccion de vigente que la caja (ctePromoYTarjeta).
    const condiciones = await this.prisma.$queryRaw<FilaDeCondicion[]>`
      SELECT c.texto, c.monto_minimo::text AS monto_minimo, c.vigente_desde,
             u.nombre AS autor_del_negocio
      FROM condicion_sello c
      LEFT JOIN usuario_negocio u ON u.id = c.usuario_id
      WHERE c.negocio_id = ${id}::uuid AND c.vigente_desde <= now()
      ORDER BY c.vigente_desde DESC, c.creado_el DESC
      LIMIT ${CONDICIONES_EN_LA_FICHA}`;

    return esquemaFichaDelNegocio.parse({
      id: f.id,
      nombre: f.nombre,
      categoria: f.categoria,
      estado: f.estado,
      color_principal: f.color_principal,
      logo_url: f.logo_url,
      icono_sello: f.icono_sello,
      plantilla_tarjeta: f.plantilla_tarjeta,
      canje_cualquier_local: f.canje_cualquier_local,
      creado_el: f.creado_el.toISOString(),
      locales_activos: f.locales_activos,
      tarjetas_en_curso: f.tarjetas_en_curso,
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
              desde: f.programa_desde?.toISOString(),
            },
      condiciones: condiciones.map((c) => ({
        texto: c.texto,
        monto_minimo: c.monto_minimo,
        vigente_desde: c.vigente_desde.toISOString(),
        autor:
          c.autor_del_negocio === null
            ? { tipo: 'administracion' }
            : { tipo: 'negocio', nombre: c.autor_del_negocio },
      })),
    });
  }

  /**
   * `POST /admin/negocios/:id/datos`. El diseno no se versiona: aplica a todas
   * las tarjetas al instante. El mismo cuerpo deja lo mismo, asi que el
   * reintento no necesita clave.
   */
  async actualizarDatos(id: string, datos: DatosDelNegocio): Promise<FichaDelNegocio> {
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE negocio SET
        nombre = ${datos.nombre},
        categoria = ${datos.categoria},
        color_principal = ${datos.color_principal},
        icono_sello = ${datos.icono_sello},
        plantilla_tarjeta = ${datos.plantilla_tarjeta},
        canje_cualquier_local = ${datos.canje_cualquier_local}
      WHERE id = ${id}::uuid`;
    if (cambiadas === 0) throw negocioNoEncontrado();
    return this.ficha(id);
  }

  /**
   * `POST /admin/negocios/:id/programa`: una version nueva de la promo
   * (INV-5). La vigente deja de serlo y nace la siguiente; las tarjetas en
   * curso siguen con la suya (INV-6). Lo sostiene la base: el indice
   * programa_una_vigente_por_negocio y el trigger programa_inmutable.
   */
  async cambiarPrograma(
    adminId: string,
    id: string,
    clave: string,
    programa: ProgramaNuevo,
  ): Promise<ProgramaCambiado> {
    // El negocio va en la huella: la misma clave y la misma promo para otro
    // negocio no es un reintento.
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios/:id/programa',
      clave,
      cuerpo: { negocio_id: id, ...programa },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaProgramaCambiado.parse(guardada);

      // Dos cambios a la vez sobre el mismo negocio se ordenan aca: el
      // segundo ve la version que dejo el primero.
      await bloquearNegocio(tx, id);

      await tx.$executeRaw`
        UPDATE programa SET vigente = false
        WHERE negocio_id = ${id}::uuid AND vigente`;
      const versiones = await tx.$queryRaw<{ version: number }[]>`
        INSERT INTO programa (negocio_id, version, sellos_requeridos, premio,
                              vigencia_meses, horas_entre_sellos, pide_monto, vigente)
        SELECT ${id}::uuid, COALESCE(max(version), 0) + 1, ${programa.sellos_requeridos},
               ${programa.premio}, ${programa.vigencia_meses},
               ${programa.horas_entre_sellos}, ${programa.pide_monto}, true
        FROM programa WHERE negocio_id = ${id}::uuid
        RETURNING version`;
      const enCurso = await tx.$queryRaw<{ cuantas: number }[]>`
        SELECT count(*)::int AS cuantas FROM tarjeta
        WHERE negocio_id = ${id}::uuid AND estado = 'activa'`;

      const respuesta = esquemaProgramaCambiado.parse({
        version: versiones[0]?.version,
        tarjetas_en_curso: enCurso[0]?.cuantas,
      });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /**
   * `POST /admin/negocios/:id/condicion`: una condicion nueva, firmada por el
   * admin, que aplica desde ahora (INV-7). Nunca invalida un sello ya dado.
   */
  async cambiarCondicion(
    adminId: string,
    id: string,
    clave: string,
    condicion: CondicionNueva,
  ): Promise<CondicionCambiada> {
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios/:id/condicion',
      clave,
      cuerpo: { negocio_id: id, ...condicion },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaCondicionCambiada.parse(guardada);

      await bloquearNegocio(tx, id);
      const filas = await tx.$queryRaw<{ vigente_desde: Date }[]>`
        INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde,
                                     creado_por_admin_id)
        VALUES (${id}::uuid, ${condicion.texto}, ${condicion.monto_minimo}::numeric,
                now(), ${adminId}::uuid)
        RETURNING vigente_desde`;

      const respuesta = esquemaCondicionCambiada.parse({
        vigente_desde: filas[0]?.vigente_desde.toISOString(),
      });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /**
   * Suspender o reactivar. Suspendido, la caja rechaza con NEGOCIO_SUSPENDIDO
   * y el negocio sale de "Donde juntar sellos". El reloj de vencimiento de
   * las tarjetas sigue corriendo: congelarlo es una decision abierta.
   */
  async cambiarEstado(
    id: string,
    estado: EstadoDelNegocio['estado'],
  ): Promise<EstadoDelNegocio> {
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE negocio SET estado = ${estado}::estado_negocio WHERE id = ${id}::uuid`;
    if (cambiadas === 0) throw negocioNoEncontrado();
    return esquemaEstadoDelNegocio.parse({ estado });
  }
}

/** Toma el negocio para esta transaccion, o rechaza si no existe. */
async function bloquearNegocio(tx: Transaccion, id: string): Promise<void> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM negocio WHERE id = ${id}::uuid FOR UPDATE`;
  if (filas.length === 0) throw negocioNoEncontrado();
}

function negocioNoEncontrado(): Error {
  return errorDeRechazo(rechazo('NEGOCIO_NO_ENCONTRADO'), null);
}
