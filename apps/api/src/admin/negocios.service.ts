import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  CONDICIONES_EN_LA_FICHA,
  type CondicionCambiada,
  type CondicionNueva,
  type DatosDelLocal,
  type DatosDelNegocio,
  type EstadoDelLocal,
  type EstadoDelNegocio,
  type FichaDelNegocio,
  type LocalCreado,
  type NegocioCreado,
  type NegocioNuevo,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  type ProgramaNuevo,
  esquemaCondicionCambiada,
  esquemaEstadoDelLocal,
  esquemaEstadoDelNegocio,
  esquemaFichaDelNegocio,
  esquemaLocalCreado,
  esquemaNegocioCreado,
  esquemaNegociosDelAdmin,
  esquemaProgramaCambiado,
} from '@repunto/contratos';

import { LARGO_QR_DEL_LOCAL, qrDelLocalDesde, rechazo } from '@repunto/dominio';

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

interface FilaDeLocal {
  id: string;
  nombre: string;
  direccion: string;
  activo: boolean;
  qr_slug: string;
}

interface FilaDePersona {
  id: string;
  nombre: string;
  rol: string;
  telefono: string | null;
  activo: boolean;
  tiene_pin: boolean;
  locales: string[];
  con_historia: boolean;
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

    const locales = await this.prisma.$queryRaw<FilaDeLocal[]>`
      SELECT id, nombre, direccion, activo, qr_slug FROM local
      WHERE negocio_id = ${id}::uuid
      ORDER BY activo DESC, creado_el, id`;

    // Del PIN solo si lo tiene: el hash no sale de aca.
    const personas = await this.prisma.$queryRaw<FilaDePersona[]>`
      SELECT u.id, u.nombre, u.rol::text AS rol, u.telefono, u.activo,
             u.pin_hash IS NOT NULL AS tiene_pin,
             COALESCE((SELECT array_agg(ul.local_id::text ORDER BY ul.creado_el)
                       FROM usuario_local ul
                       WHERE ul.usuario_id = u.id AND ul.activo), '{}') AS locales,
             -- Lo mismo que pregunta el borrado (personas.service, tieneHistoria).
             (EXISTS (SELECT 1 FROM turno_caja t WHERE t.usuario_id = u.id)
              OR EXISTS (SELECT 1 FROM condicion_sello c WHERE c.usuario_id = u.id)
              OR EXISTS (SELECT 1 FROM vinculacion_pendiente v
                         WHERE v.creado_por_usuario_id = u.id)) AS con_historia
      FROM usuario_negocio u
      WHERE u.negocio_id = ${id}::uuid
      ORDER BY u.activo DESC,
               array_position(ARRAY['dueno', 'supervisor', 'cajero'], u.rol::text),
               lower(u.nombre), u.id`;

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
      locales,
      personas,
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

  /**
   * `POST /admin/negocios/:id/locales`: un local nuevo, abierto, con su QR al
   * azar. Abierto y con la promo del negocio, el negocio aparece en "Donde
   * juntar sellos"; para sellar le falta una tablet y alguien que la use.
   */
  async crearLocal(
    adminId: string,
    negocioId: string,
    clave: string,
    datos: DatosDelLocal,
  ): Promise<LocalCreado> {
    // El negocio va en la huella: el mismo local para otro negocio no es un
    // reintento.
    const peticion = {
      admin_id: adminId,
      endpoint: 'POST /admin/negocios/:id/locales',
      clave,
      cuerpo: { negocio_id: negocioId, ...datos },
    };

    return this.prisma.$transaction(async (tx) => {
      const guardada = await reservarIdempotenciaDeAdmin(tx, peticion);
      if (guardada !== null) return esquemaLocalCreado.parse(guardada);

      await bloquearNegocio(tx, negocioId);
      // Con 400 billones de combinaciones no se repite; si alguna vez pasa,
      // local_qr_slug_key lo rechaza y el admin vuelve a tocar.
      const qr = qrDelLocalDesde(randomBytes(LARGO_QR_DEL_LOCAL));
      const filas = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO local (negocio_id, nombre, direccion, qr_slug)
        VALUES (${negocioId}::uuid, ${datos.nombre}, ${datos.direccion}, ${qr})
        RETURNING id`;

      const respuesta = esquemaLocalCreado.parse({ id: filas[0]?.id });
      await guardarRespuestaDeAdmin(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /**
   * `POST /admin/negocios/:id/locales/:local/datos`. Nombre y direccion, al
   * instante; el QR impreso sigue valiendo.
   */
  async actualizarLocal(
    negocioId: string,
    localId: string,
    datos: DatosDelLocal,
  ): Promise<FichaDelNegocio> {
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE local SET nombre = ${datos.nombre}, direccion = ${datos.direccion}
      WHERE id = ${localId}::uuid AND negocio_id = ${negocioId}::uuid`;
    if (cambiadas === 0) throw await this.localNoEncontrado(negocioId);
    return this.ficha(negocioId);
  }

  /**
   * Cerrar o reabrir un local. Cerrado, sus tablets reciben
   * LOCAL_NO_AUTORIZADO, su QR deja de anotar gente y sale de "Donde juntar
   * sellos". No se borra nada: el historial queda (INV-17).
   */
  async cambiarEstadoDelLocal(
    negocioId: string,
    localId: string,
    activo: boolean,
  ): Promise<EstadoDelLocal> {
    const cambiadas = await this.prisma.$executeRaw`
      UPDATE local SET activo = ${activo}
      WHERE id = ${localId}::uuid AND negocio_id = ${negocioId}::uuid`;
    if (cambiadas === 0) throw await this.localNoEncontrado(negocioId);
    return esquemaEstadoDelLocal.parse({ activo });
  }

  /**
   * Cual de los dos falta: un negocio que no existe es NEGOCIO_NO_ENCONTRADO
   * aunque el local tampoco este, como en el resto de la ficha.
   */
  private async localNoEncontrado(negocioId: string): Promise<Error> {
    const negocios = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM negocio WHERE id = ${negocioId}::uuid`;
    if (negocios.length === 0) return negocioNoEncontrado();
    return errorDeRechazo(rechazo('LOCAL_NO_ENCONTRADO'), null);
  }
}

/** Toma el negocio para esta transaccion, o rechaza si no existe. */
export async function bloquearNegocio(tx: Transaccion, id: string): Promise<void> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM negocio WHERE id = ${id}::uuid FOR UPDATE`;
  if (filas.length === 0) throw negocioNoEncontrado();
}

export function negocioNoEncontrado(): Error {
  return errorDeRechazo(rechazo('NEGOCIO_NO_ENCONTRADO'), null);
}
