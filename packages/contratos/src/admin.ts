import { z } from 'zod';

import { ICONOS_DE_SELLO, PLANTILLAS_DE_TARJETA, RUBROS_DE_NEGOCIO } from './diseno';

/**
 * El panel de administracion (apps/panel, /admin). Lo usa el admin de
 * plataforma: nosotros.
 */

/**
 * `POST /admin/sesion`, publico: el equipo todavia no tiene credencial. Lo
 * tipeado va tal cual; la api lo normaliza y decide. Tiene tope por IP.
 */
export const esquemaEntrarComoAdminPeticion = z.object({
  codigo: z.string().min(1).max(32),
});

export type EntrarComoAdminPeticion = z.infer<typeof esquemaEntrarComoAdminPeticion>;

/**
 * El token de la sesion. Se entrega UNA sola vez: la base guarda solo su
 * hash. El panel lo guarda y lo manda en cada pedido de /admin.
 */
export const esquemaEntrarComoAdminRespuesta = z.object({
  token: z.string().min(32),
});

export type EntrarComoAdminRespuesta = z.infer<typeof esquemaEntrarComoAdminRespuesta>;

/**
 * `GET /admin/yo`: quien es el admin de esta sesion. El panel lo pide al
 * abrir: si responde 401, la sesion vencio o la revocaron, y vuelve a
 * /admin/entrar.
 */
export const esquemaAdminActual = z.object({
  nombre: z.string(),
});

export type AdminActual = z.infer<typeof esquemaAdminActual>;

// ---------------------------------------------------------------------------
// Negocios
// ---------------------------------------------------------------------------

/**
 * Los bordes de lo que se puede cargar en el alta. No son reglas del negocio
 * —esas las cuida la base: mas de cero sellos, horas no negativas—, son los
 * de un formulario sensato, y el panel los usa para los campos.
 */
export const LIMITES_DEL_NEGOCIO = {
  nombre: 60,
  premio: 120,
  condicion: 160,
  /** Mas casilleros que esto no se dibujan como tarjeta (Sellos, de ui). */
  sellosRequeridos: { minimo: 1, maximo: 30 },
  vigenciaMeses: { minimo: 1, maximo: 12 },
  /** Una semana. */
  horasEntreSellos: { minimo: 0, maximo: 168 },
} as const;

const texto = (maximo: number) => z.string().trim().min(1).max(maximo);

/** Bolivianos con hasta dos decimales, como texto: nunca un float. */
const MONTO = /^\d{1,10}(\.\d{1,2})?$/;

const esquemaApariencia = z.object({
  nombre: texto(LIMITES_DEL_NEGOCIO.nombre),
  categoria: z.enum(RUBROS_DE_NEGOCIO),
  color_principal: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icono_sello: z.enum(ICONOS_DE_SELLO),
  plantilla_tarjeta: z.enum(PLANTILLAS_DE_TARJETA),
  canje_cualquier_local: z.boolean(),
});

/**
 * `POST /admin/negocios/:id/datos`: nombre, rubro, apariencia y donde se
 * canjea. No se versiona (especificacion, seccion 9): aplica a todas las
 * tarjetas al instante.
 */
export const esquemaDatosDelNegocio = esquemaApariencia;

export type DatosDelNegocio = z.infer<typeof esquemaDatosDelNegocio>;

const { sellosRequeridos, vigenciaMeses, horasEntreSellos } = LIMITES_DEL_NEGOCIO;

export const esquemaProgramaNuevo = z.object({
  sellos_requeridos: z.int().min(sellosRequeridos.minimo).max(sellosRequeridos.maximo),
  premio: texto(LIMITES_DEL_NEGOCIO.premio),
  /** null: la tarjeta no vence. */
  vigencia_meses: z.int().min(vigenciaMeses.minimo).max(vigenciaMeses.maximo).nullable(),
  horas_entre_sellos: z.int().min(horasEntreSellos.minimo).max(horasEntreSellos.maximo),
  pide_monto: z.boolean(),
});

export type ProgramaNuevo = z.infer<typeof esquemaProgramaNuevo>;

export const esquemaCondicionNueva = z.object({
  texto: texto(LIMITES_DEL_NEGOCIO.condicion),
  /** Referencia para el cajero, en bolivianos. null: sin monto minimo. */
  monto_minimo: z.string().regex(MONTO).nullable(),
});

export type CondicionNueva = z.infer<typeof esquemaCondicionNueva>;

/**
 * `POST /admin/negocios`, con Idempotency-Key. Todo junto: un negocio sin
 * promo o sin condicion le contesta PROMO_NO_CONFIGURADA a la caja, asi que
 * no se crea a medias. La condicion queda firmada por el admin.
 */
export const esquemaNegocioNuevo = esquemaApariencia.extend({
  programa: esquemaProgramaNuevo,
  condicion: esquemaCondicionNueva,
});

export type NegocioNuevo = z.infer<typeof esquemaNegocioNuevo>;

export const esquemaNegocioCreado = z.object({ id: z.uuid() });

export type NegocioCreado = z.infer<typeof esquemaNegocioCreado>;

/**
 * Un negocio en la lista del admin. Los valores de diseño vienen como texto
 * suelto, como en la app: uno nuevo que este panel no conoce no la rompe.
 */
export const esquemaNegocioDelAdmin = z.object({
  id: z.uuid(),
  nombre: z.string(),
  categoria: z.string(),
  estado: z.enum(['activo', 'suspendido']),
  color_principal: z.string(),
  logo_url: z.string().nullable(),
  icono_sello: z.string(),
  plantilla_tarjeta: z.string(),
  locales_activos: z.int().nonnegative(),
  /** La version vigente. null en un negocio cargado a mano sin promo. */
  programa: z
    .object({ sellos_requeridos: z.int().positive(), premio: z.string() })
    .nullable(),
  /** La condicion vigente. null si nunca se cargo. */
  condicion: z.object({ texto: z.string() }).nullable(),
  creado_el: z.iso.datetime(),
});

export type NegocioDelAdmin = z.infer<typeof esquemaNegocioDelAdmin>;

/** `GET /admin/negocios`: todos, los mas nuevos primero. */
export const esquemaNegociosDelAdmin = z.object({
  negocios: z.array(esquemaNegocioDelAdmin),
});

export type NegociosDelAdmin = z.infer<typeof esquemaNegociosDelAdmin>;

/**
 * `GET /admin/negocios/:id`: la ficha. Todo lo que el admin puede cambiar, con
 * lo que hace falta para decidir: cuantas tarjetas siguen con la promo
 * actual, y quien cambio la condicion y cuando.
 */
export const esquemaFichaDelNegocio = esquemaNegocioDelAdmin
  .omit({ programa: true, condicion: true })
  .extend({
    canje_cualquier_local: z.boolean(),
    /** La version vigente. */
    programa: z
      .object({
        version: z.int().positive(),
        sellos_requeridos: z.int().positive(),
        premio: z.string(),
        vigencia_meses: z.int().positive().nullable(),
        horas_entre_sellos: z.int().nonnegative(),
        pide_monto: z.boolean(),
        desde: z.iso.datetime(),
      })
      .nullable(),
    /**
     * Tarjetas activas: terminan con la version con la que empezaron
     * (INV-6), asi que un cambio de promo no las toca.
     */
    tarjetas_en_curso: z.int().nonnegative(),
    /** La vigente primero. Las ultimas, no todas. */
    condiciones: z.array(
      z.object({
        texto: z.string(),
        monto_minimo: z.string().nullable(),
        vigente_desde: z.iso.datetime(),
        /** Quien la escribio: alguien del negocio, o nosotros en el alta. */
        autor: z.discriminatedUnion('tipo', [
          z.object({ tipo: z.literal('administracion') }),
          z.object({ tipo: z.literal('negocio'), nombre: z.string() }),
        ]),
      }),
    ),
  });

export type FichaDelNegocio = z.infer<typeof esquemaFichaDelNegocio>;

/** Cuantas condiciones pasadas trae la ficha. */
export const CONDICIONES_EN_LA_FICHA = 10;

/**
 * `POST /admin/negocios/:id/programa`, con Idempotency-Key: una version nueva
 * (INV-5). La anterior deja de ser vigente pero sus tarjetas la conservan.
 */
export const esquemaProgramaCambiado = z.object({
  version: z.int().positive(),
  /** Las que siguen con la version anterior. */
  tarjetas_en_curso: z.int().nonnegative(),
});

export type ProgramaCambiado = z.infer<typeof esquemaProgramaCambiado>;

/**
 * `POST /admin/negocios/:id/condicion`, con Idempotency-Key: una condicion
 * nueva, desde ahora (INV-7). Las anteriores quedan en el historial.
 */
export const esquemaCondicionCambiada = z.object({
  vigente_desde: z.iso.datetime(),
});

export type CondicionCambiada = z.infer<typeof esquemaCondicionCambiada>;

/** `POST /admin/negocios/:id/suspension` y `/reactivacion`. */
export const esquemaEstadoDelNegocio = z.object({
  estado: z.enum(['activo', 'suspendido']),
});

export type EstadoDelNegocio = z.infer<typeof esquemaEstadoDelNegocio>;
