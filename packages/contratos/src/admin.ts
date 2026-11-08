import { z } from 'zod';

import { ICONOS_DE_SELLO, PLANTILLAS_DE_TARJETA, RUBROS_DE_NEGOCIO } from './diseno';
import { FORMATO_DEL_PIN } from './turno';

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

// ---------------------------------------------------------------------------
// Locales
// ---------------------------------------------------------------------------

export const LIMITES_DEL_LOCAL = {
  nombre: 60,
  direccion: 160,
} as const;

/**
 * `POST /admin/negocios/:id/locales` (con Idempotency-Key) y
 * `POST /admin/negocios/:id/locales/:local/datos`. El QR no se elige: lo pone
 * la api, al azar, porque es lo unico que impide anotarse desde la casa.
 */
export const esquemaDatosDelLocal = z.object({
  nombre: texto(LIMITES_DEL_LOCAL.nombre),
  direccion: texto(LIMITES_DEL_LOCAL.direccion),
});

export type DatosDelLocal = z.infer<typeof esquemaDatosDelLocal>;

export const esquemaLocalCreado = z.object({ id: z.uuid() });

export type LocalCreado = z.infer<typeof esquemaLocalCreado>;

/**
 * Un local en la ficha. El `qr_slug` viaja solo hasta aca, al admin, que es
 * quien imprime el cartel: la app del cliente nunca lo recibe.
 */
export const esquemaLocalDelAdmin = z.object({
  id: z.uuid(),
  nombre: z.string(),
  direccion: z.string(),
  activo: z.boolean(),
  qr_slug: z.string(),
});

export type LocalDelAdmin = z.infer<typeof esquemaLocalDelAdmin>;

/** `POST .../locales/:local/cierre` y `/reapertura`. */
export const esquemaEstadoDelLocal = z.object({
  activo: z.boolean(),
});

export type EstadoDelLocal = z.infer<typeof esquemaEstadoDelLocal>;

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

/** Quien trabaja en un negocio. El orden es el de la lista de la ficha. */
export const ROLES_DE_PERSONA = ['dueno', 'supervisor', 'cajero'] as const;

export type RolDePersona = (typeof ROLES_DE_PERSONA)[number];

export const LIMITES_DE_PERSONA = {
  /** Lo que entra en un boton de la lista de la tablet. */
  nombre: 40,
  /** Lo tipeado, antes de normalizar: espacios, guiones, el +591. */
  telefono: 30,
} as const;

/**
 * `POST /admin/negocios/:id/personas`, con Idempotency-Key. Sin PIN: la
 * clave guarda una huella del cuerpo, y la de un PIN de cuatro digitos se
 * revierte probando las diez mil combinaciones (lo mismo que abrir turno). El
 * PIN va despues, en `.../personas/:persona/pin`.
 *
 * Solo el dueno tiene telefono: entra a su panel con el. Supervisor y cajero
 * entran con su nombre y su PIN en la tablet, y tienen que estar en al menos
 * un local, o no aparecen en ninguna. El telefono va tal cual se tipeo: lo
 * normaliza la api (INV-20).
 */
export const esquemaPersonaNueva = z
  .object({
    nombre: texto(LIMITES_DE_PERSONA.nombre),
    rol: z.enum(ROLES_DE_PERSONA),
    telefono: z.string().trim().min(1).max(LIMITES_DE_PERSONA.telefono).nullable(),
    locales: z.array(z.uuid()).max(50),
  })
  .superRefine((p, ctx) => {
    if (p.rol === 'dueno' && p.telefono === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['telefono'],
        message: 'El dueño entra con su teléfono.',
      });
    }
    if (p.rol !== 'dueno' && p.telefono !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['telefono'],
        message: 'Solo el dueño tiene teléfono.',
      });
    }
    if (p.rol !== 'dueno' && p.locales.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['locales'],
        message: 'Tiene que estar en un local.',
      });
    }
    if (new Set(p.locales).size !== p.locales.length) {
      ctx.addIssue({ code: 'custom', path: ['locales'], message: 'Locales repetidos.' });
    }
  });

export type PersonaNueva = z.infer<typeof esquemaPersonaNueva>;

/**
 * `POST .../personas/:persona/datos`: lo mismo que el alta, menos el PIN.
 * Los locales son la lista completa: el que no esta, se le saca. El rol
 * cambia entre supervisor y cajero; el dueno no pasa a ninguno de los dos
 * (ROL_NO_CAMBIABLE).
 */
export const esquemaDatosDePersona = esquemaPersonaNueva;

export type DatosDePersona = PersonaNueva;

/** `POST .../personas/:persona/baja` y `/reactivacion`. */
export const esquemaEstadoDePersona = z.object({ activo: z.boolean() });

export type EstadoDePersona = z.infer<typeof esquemaEstadoDePersona>;

/**
 * El cuerpo de `.../reactivacion`. Al dueno, dado de baja, se le borro el
 * telefono para liberarlo: reactivado tiene que traer uno. Los demas no
 * llevan.
 */
export const esquemaReactivacionDePersona = z.object({
  telefono: z
    .string()
    .trim()
    .min(1)
    .max(LIMITES_DE_PERSONA.telefono)
    .nullable()
    .default(null),
});

export type ReactivacionDePersona = z.input<typeof esquemaReactivacionDePersona>;

/**
 * `POST .../personas/:persona/borrado`: solo sin historia
 * (PERSONA_CON_HISTORIA si la tiene). Libera el nombre y el telefono.
 */
export const esquemaPersonaBorrada = z.object({ borrada: z.literal(true) });

export type PersonaBorrada = z.infer<typeof esquemaPersonaBorrada>;

export const esquemaPersonaCreada = z.object({ id: z.uuid() });

export type PersonaCreada = z.infer<typeof esquemaPersonaCreada>;

/**
 * `POST .../personas/:persona/pin`: poner o cambiar el PIN. Sin clave: poner
 * dos veces el mismo PIN deja lo mismo. La api lo guarda hasheado y no lo
 * devuelve nunca.
 */
export const esquemaPinNuevo = z.object({
  pin: z.string().regex(FORMATO_DEL_PIN),
});

export type PinNuevo = z.infer<typeof esquemaPinNuevo>;

export const esquemaPinPuesto = z.object({ tiene_pin: z.literal(true) });

export type PinPuesto = z.infer<typeof esquemaPinPuesto>;

/**
 * Una persona en la ficha. Del PIN solo se sabe si lo tiene: sin PIN no
 * aparece en la tablet, y la tablet no lo explica. `locales` son los que
 * tiene asignados hoy.
 */
export const esquemaPersonaDelAdmin = z.object({
  id: z.uuid(),
  nombre: z.string(),
  rol: z.enum(ROLES_DE_PERSONA),
  telefono: z.string().nullable(),
  activo: z.boolean(),
  tiene_pin: z.boolean(),
  locales: z.array(z.uuid()),
  /**
   * Si ya hizo algo que queda firmado: abrio un turno, escribio una
   * condicion o vinculo una tablet. Con historia se da de baja; sin ella,
   * cargada por error, se puede borrar.
   */
  con_historia: z.boolean(),
});

export type PersonaDelAdmin = z.infer<typeof esquemaPersonaDelAdmin>;

// ---------------------------------------------------------------------------
// Tablets

/**
 * Una tablet de la caja en la ficha, con su salud: cuando sello por ultima
 * vez y cuando intento algo, segun la bitacora (CLAUDE.md, seccion 8). Un
 * local que no sella es un local donde el sistema se abandono; si intenta y
 * no sella, algo lo rechaza, y `ultimo_rechazo` dice que.
 */
export const esquemaTabletDelAdmin = z.object({
  id: z.uuid(),
  local_id: z.uuid(),
  /** Caja 1, Caja 2...: el nombre con que se vinculo. */
  nombre: z.string(),
  vinculada_el: z.iso.datetime(),
  revocada_el: z.iso.datetime().nullable(),
  ultimo_sello: z.iso.datetime().nullable(),
  ultimo_intento: z.iso.datetime().nullable(),
  /** El codigo del ultimo intento rechazado, si hubo alguno. */
  ultimo_rechazo: z.string().nullable(),
});

export type TabletDelAdmin = z.infer<typeof esquemaTabletDelAdmin>;

/**
 * `POST /admin/negocios/:id/locales/:local/vinculacion`, con
 * Idempotency-Key: el codigo para vincular una tablet nueva a ese local. Se
 * dicta o se tipea en la tablet, en /vincular. Sirve una vez y vence.
 */
export const esquemaCodigoDeVinculacion = z.object({
  /** Ya formateado para leerlo en voz alta: ABCD-EFGH. */
  codigo: z.string(),
  expira_el: z.iso.datetime(),
});

export type CodigoDeVinculacion = z.infer<typeof esquemaCodigoDeVinculacion>;

/**
 * `POST /admin/negocios/:id/tablets/:tablet/revocacion`. Deja de servir en el
 * pedido siguiente; la fila queda, porque sus turnos y sellos la nombran
 * (INV-17). Revocar una ya revocada devuelve la fecha de entonces.
 */
export const esquemaTabletRevocada = z.object({
  revocada_el: z.iso.datetime(),
});

export type TabletRevocada = z.infer<typeof esquemaTabletRevocada>;

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
    /** Los abiertos primero; cerrados tambien, con su historial. */
    locales: z.array(esquemaLocalDelAdmin),
    /** Los activos primero, por rol y por nombre; los dados de baja tambien. */
    personas: z.array(esquemaPersonaDelAdmin),
    /** Las activas primero, de todos los locales; las revocadas tambien. */
    tablets: z.array(esquemaTabletDelAdmin),
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
