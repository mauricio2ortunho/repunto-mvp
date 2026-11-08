import { randomBytes } from 'node:crypto';

import type {
  DatosDelLocal,
  QrCambiado,
  LocalDelAdmin,
  PersonaDelAdmin,
  TabletDelAdmin,
} from '@repunto/contratos';
import {
  esquemaLocalDelAdmin,
  esquemaPersonaDelAdmin,
  esquemaQrCambiado,
  esquemaTabletDelAdmin,
} from '@repunto/contratos';
import { LARGO_QR_DEL_LOCAL, qrDelLocalDesde } from '@repunto/dominio';

import type { Transaccion } from '../caja/lectura';

/**
 * Los locales, las personas y las tablets de un negocio, como los ven la
 * ficha del admin y el panel del dueño. Lo mismo para los dos: cada uno
 * decide después qué deja tocar.
 */

interface FilaDeLocal {
  id: string;
  nombre: string;
  direccion: string;
  activo: boolean;
  qr_slug: string;
  latitud: number | null;
  longitud: number | null;
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

interface FilaDeTablet {
  id: string;
  local_id: string;
  nombre: string;
  vinculado_el: Date;
  revocado_el: Date | null;
  ultimo_sello: Date | null;
  ultimo_intento: Date | null;
  ultimo_rechazo: string | null;
}

export interface LocalesPersonasYTablets {
  /** Los abiertos primero; cerrados también, con su historial. */
  locales: LocalDelAdmin[];
  /** Los activos primero, por rol y por nombre; los dados de baja también. */
  personas: PersonaDelAdmin[];
  /** Las activas primero, de todos los locales; las revocadas también. */
  tablets: TabletDelAdmin[];
}

type Lector = Pick<Transaccion, '$queryRaw'>;

export async function localesPersonasYTablets(
  db: Lector,
  negocioId: string,
): Promise<LocalesPersonasYTablets> {
  const locales = await db.$queryRaw<FilaDeLocal[]>`
    SELECT id, nombre, direccion, activo, qr_slug,
           latitud::float8 AS latitud, longitud::float8 AS longitud
    FROM local
    WHERE negocio_id = ${negocioId}::uuid
    ORDER BY activo DESC, creado_el, id`;

  // Del PIN solo si lo tiene: el hash no sale de aca.
  const personas = await db.$queryRaw<FilaDePersona[]>`
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
    WHERE u.negocio_id = ${negocioId}::uuid
    ORDER BY u.activo DESC,
             array_position(ARRAY['dueno', 'supervisor', 'cajero'], u.rol::text),
             lower(u.nombre), u.id`;

  // La salud de cada tablet (CLAUDE.md, seccion 8), lo mismo que
  // `pnpm tablets salud`: el ultimo sello sale de los turnos de la tablet;
  // el ultimo intento y el ultimo rechazo, de la bitacora.
  const tablets = await db.$queryRaw<FilaDeTablet[]>`
    SELECT d.id, d.local_id, d.nombre, d.vinculado_el, d.revocado_el,
           (SELECT max(s.creado_el) FROM sello s
              JOIN turno_caja t ON t.id = s.turno_id
             WHERE t.dispositivo_id = d.id) AS ultimo_sello,
           (SELECT max(i.creado_el) FROM intento_caja i
             WHERE i.dispositivo_id = d.id) AS ultimo_intento,
           (SELECT i.resultado FROM intento_caja i
             WHERE i.dispositivo_id = d.id AND i.resultado <> 'ok'
             ORDER BY i.creado_el DESC LIMIT 1) AS ultimo_rechazo
    FROM dispositivo_caja d
    JOIN local l ON l.id = d.local_id
    WHERE l.negocio_id = ${negocioId}::uuid
    ORDER BY d.revocado_el IS NOT NULL, d.vinculado_el, d.id`;
  const iso = (fecha: Date | null) => fecha?.toISOString() ?? null;

  return {
    locales: locales.map(({ latitud, longitud, ...l }) =>
      esquemaLocalDelAdmin.parse({
        ...l,
        ubicacion: latitud === null || longitud === null ? null : { latitud, longitud },
      }),
    ),
    personas: personas.map((p) => esquemaPersonaDelAdmin.parse(p)),
    tablets: tablets.map((t) =>
      esquemaTabletDelAdmin.parse({
        id: t.id,
        local_id: t.local_id,
        nombre: t.nombre,
        vinculada_el: t.vinculado_el.toISOString(),
        revocada_el: iso(t.revocado_el),
        ultimo_sello: iso(t.ultimo_sello),
        ultimo_intento: iso(t.ultimo_intento),
        ultimo_rechazo: t.ultimo_rechazo,
      }),
    ),
  };
}

/**
 * Nombre, direccion y ubicacion, al instante; el QR impreso sigue valiendo.
 * False si el local no existe o es de otro negocio: quien llama decide como
 * decirlo.
 */
export async function guardarDatosDelLocal(
  db: Pick<Transaccion, '$executeRaw'>,
  negocioId: string,
  localId: string,
  datos: DatosDelLocal,
): Promise<boolean> {
  const cambiadas = await db.$executeRaw`
    UPDATE local SET nombre = ${datos.nombre}, direccion = ${datos.direccion},
      latitud = ${datos.ubicacion?.latitud ?? null}::numeric,
      longitud = ${datos.ubicacion?.longitud ?? null}::numeric
    WHERE id = ${localId}::uuid AND negocio_id = ${negocioId}::uuid`;
  return cambiadas > 0;
}

/**
 * Un QR nuevo al azar. El viejo deja de anotar en el pedido siguiente,
 * porque el alta busca el local por su QR. Los registros que ya estaban
 * esperando siguen: apuntan al local, no al QR. Null si el local no existe
 * o es de otro negocio.
 */
export async function qrNuevoDelLocal(
  db: Pick<Transaccion, '$queryRaw'>,
  negocioId: string,
  localId: string,
): Promise<QrCambiado | null> {
  const qr = qrDelLocalDesde(randomBytes(LARGO_QR_DEL_LOCAL));
  const filas = await db.$queryRaw<{ qr_slug: string }[]>`
    UPDATE local SET qr_slug = ${qr}
    WHERE id = ${localId}::uuid AND negocio_id = ${negocioId}::uuid
    RETURNING qr_slug`;
  const fila = filas[0];
  return fila === undefined ? null : esquemaQrCambiado.parse(fila);
}
