import {
  CONDICIONES_EN_LA_FICHA,
  type CondicionCambiada,
  type CondicionDelHistorial,
  type CondicionNueva,
  type ProgramaCambiado,
  type ProgramaNuevo,
  esquemaCondicionCambiada,
  esquemaCondicionDelHistorial,
  esquemaProgramaCambiado,
} from '@repunto/contratos';

import type { Transaccion } from '../caja/lectura';

/**
 * La promo y la condición del sello de un negocio: lo que hacen igual el
 * admin desde la ficha y el dueño desde su panel. Quién pide y con qué
 * idempotencia lo resuelve cada uno; acá solo lo que se escribe.
 *
 * Cada función espera la transacción con el negocio ya tomado (FOR UPDATE):
 * dos cambios a la vez sobre el mismo negocio se ordenan ahí.
 */

/**
 * Una versión nueva de la promo (INV-5). La vigente deja de serlo y nace la
 * siguiente; las tarjetas en curso siguen con la suya (INV-6). Lo sostiene
 * la base: el índice programa_una_vigente_por_negocio y el trigger
 * programa_inmutable.
 */
export async function versionNuevaDelPrograma(
  tx: Transaccion,
  negocioId: string,
  programa: ProgramaNuevo,
): Promise<ProgramaCambiado> {
  await tx.$executeRaw`
    UPDATE programa SET vigente = false
    WHERE negocio_id = ${negocioId}::uuid AND vigente`;
  const versiones = await tx.$queryRaw<{ version: number }[]>`
    INSERT INTO programa (negocio_id, version, sellos_requeridos, premio,
                          vigencia_meses, horas_entre_sellos, pide_monto, vigente)
    SELECT ${negocioId}::uuid, COALESCE(max(version), 0) + 1, ${programa.sellos_requeridos},
           ${programa.premio}, ${programa.vigencia_meses},
           ${programa.horas_entre_sellos}, ${programa.pide_monto}, true
    FROM programa WHERE negocio_id = ${negocioId}::uuid
    RETURNING version`;
  const enCurso = await tx.$queryRaw<{ cuantas: number }[]>`
    SELECT count(*)::int AS cuantas FROM tarjeta
    WHERE negocio_id = ${negocioId}::uuid AND estado = 'activa'`;

  return esquemaProgramaCambiado.parse({
    version: versiones[0]?.version,
    tarjetas_en_curso: enCurso[0]?.cuantas,
  });
}

/** Quién firma la condición: un admin, o alguien del negocio. */
export type AutorDeCondicion =
  { tipo: 'administracion'; admin_id: string } | { tipo: 'negocio'; usuario_id: string };

/**
 * Una condición nueva, desde ahora (INV-7). Nunca invalida un sello ya dado.
 * La de alguien del negocio apunta con `(usuario_id, negocio_id)` a
 * `usuario_negocio`: nadie escribe la condición de otra marca.
 */
export async function condicionNueva(
  tx: Transaccion,
  negocioId: string,
  condicion: CondicionNueva,
  autor: AutorDeCondicion,
): Promise<CondicionCambiada> {
  const adminId = autor.tipo === 'administracion' ? autor.admin_id : null;
  const usuarioId = autor.tipo === 'negocio' ? autor.usuario_id : null;
  const filas = await tx.$queryRaw<{ vigente_desde: Date }[]>`
    INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde,
                                 creado_por_admin_id, usuario_id)
    VALUES (${negocioId}::uuid, ${condicion.texto}, ${condicion.monto_minimo}::numeric,
            now(), ${adminId}::uuid, ${usuarioId}::uuid)
    RETURNING vigente_desde`;

  return esquemaCondicionCambiada.parse({
    vigente_desde: filas[0]?.vigente_desde.toISOString(),
  });
}

interface FilaDeCondicion {
  texto: string;
  monto_minimo: string | null;
  vigente_desde: Date;
  autor_del_negocio: string | null;
}

/**
 * La vigente primero y las últimas anteriores. La misma elección de vigente
 * que la caja (ctePromoYTarjeta): una programada para después todavía no es.
 */
export async function condicionesRecientes(
  db: Pick<Transaccion, '$queryRaw'>,
  negocioId: string,
): Promise<CondicionDelHistorial[]> {
  const filas = await db.$queryRaw<FilaDeCondicion[]>`
    SELECT c.texto, c.monto_minimo::text AS monto_minimo, c.vigente_desde,
           u.nombre AS autor_del_negocio
    FROM condicion_sello c
    LEFT JOIN usuario_negocio u ON u.id = c.usuario_id
    WHERE c.negocio_id = ${negocioId}::uuid AND c.vigente_desde <= now()
    ORDER BY c.vigente_desde DESC, c.creado_el DESC
    LIMIT ${CONDICIONES_EN_LA_FICHA}`;
  return filas.map((c) =>
    esquemaCondicionDelHistorial.parse({
      texto: c.texto,
      monto_minimo: c.monto_minimo,
      vigente_desde: c.vigente_desde.toISOString(),
      autor:
        c.autor_del_negocio === null
          ? { tipo: 'administracion' }
          : { tipo: 'negocio', nombre: c.autor_del_negocio },
    }),
  );
}
