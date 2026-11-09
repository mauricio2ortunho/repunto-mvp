import { z } from 'zod';

import {
  esquemaCondicionDelHistorial,
  esquemaLocalDelAdmin,
  esquemaPersonaDelAdmin,
  esquemaPersonaNueva,
  esquemaProgramaVigente,
  esquemaTabletDelAdmin,
} from './admin';

/**
 * El panel del dueño (apps/panel, /dueno). Entra desde su celular con un
 * código de un solo uso; todo lo demás sale de su sesión, nunca del pedido
 * (INV-1): ningún endpoint de /dueno recibe el id de su negocio.
 */

/**
 * `POST /dueno/sesion`, público: el celular todavía no tiene credencial. Lo
 * tipeado va tal cual; la api lo normaliza y decide. Tiene tope por IP.
 */
export const esquemaEntrarComoDuenoPeticion = z.object({
  codigo: z.string().min(1).max(32),
});

export type EntrarComoDuenoPeticion = z.infer<typeof esquemaEntrarComoDuenoPeticion>;

/**
 * El token de la sesión. Se entrega UNA sola vez: la base guarda solo su
 * hash. El panel lo guarda y lo manda en cada pedido de /dueno.
 */
export const esquemaEntrarComoDuenoRespuesta = z.object({
  token: z.string().min(32),
});

export type EntrarComoDuenoRespuesta = z.infer<typeof esquemaEntrarComoDuenoRespuesta>;

/**
 * `GET /dueno/yo`: quién es y de qué negocio. El panel lo pide al abrir: si
 * responde 401, la sesión venció o la revocaron, y vuelve a /dueno/entrar.
 */
export const esquemaDuenoActual = z.object({
  nombre: z.string(),
  negocio: z.object({
    nombre: z.string(),
    estado: z.enum(['activo', 'suspendido']),
  }),
});

export type DuenoActual = z.infer<typeof esquemaDuenoActual>;

/**
 * `POST /admin/negocios/:id/personas/:persona/entrada`, con Idempotency-Key:
 * el código que el admin le pasa al dueño para que entre a su panel. Sirve
 * una vez y vence a las HORAS_DE_ENTRADA_DE_DUENO.
 */
export const esquemaEntradaDelDueno = z.object({
  /** Ya formateado para dictarlo o copiarlo: ABCD-EFGH. */
  codigo: z.string(),
  expira_el: z.iso.datetime(),
});

export type EntradaDelDueno = z.infer<typeof esquemaEntradaDelDueno>;

/**
 * `GET /dueno/promo`: la promo vigente y la condición del sello, con lo que
 * hace falta para cambiarlas sabiendo qué pasa. Cambiarlas usa los mismos
 * cuerpos que el admin (`esquemaProgramaNuevo`, `esquemaCondicionNueva`),
 * sin el negocio: sale de la sesión.
 */
export const esquemaPromoDelDueno = z.object({
  /** null si todavía no tiene: la caja no sella hasta que la haya. */
  programa: esquemaProgramaVigente.nullable(),
  /** Siguen con la versión con la que empezaron (INV-6). */
  tarjetas_en_curso: z.int().nonnegative(),
  /** La vigente primero, y las últimas anteriores. */
  condiciones: z.array(esquemaCondicionDelHistorial),
});

export type PromoDelDueno = z.infer<typeof esquemaPromoDelDueno>;

/**
 * `GET /dueno/negocio`: sus locales, su equipo y sus tablets, igual que en
 * la ficha del admin. Los ids de la ruta y del cuerpo (el local a editar,
 * los locales de un cajero) nombran cosas de su negocio; el negocio sale
 * igual de la sesión, y la api rechaza lo que no sea de él.
 */
export const esquemaNegocioDelDueno = z.object({
  /** Lo que lleva el cartel del QR. Cambiarlo es del admin. */
  marca: z.object({
    nombre: z.string(),
    color_principal: z.string(),
    logo_url: z.string().nullable(),
  }),
  /** Los abiertos primero. El dueño los edita; abrir y cerrar, el admin. */
  locales: z.array(esquemaLocalDelAdmin),
  /** Los dueños también, para que se vea quién es quién; no los edita. */
  personas: z.array(esquemaPersonaDelAdmin),
  tablets: z.array(esquemaTabletDelAdmin),
});

export type NegocioDelDueno = z.infer<typeof esquemaNegocioDelDueno>;

/**
 * `POST /dueno/personas` (con Idempotency-Key) y
 * `.../personas/:persona/datos`: el mismo cuerpo que en la ficha del admin,
 * sin dueños. A un dueño lo carga el admin: entra al panel con su teléfono
 * y ve todo el negocio.
 */
export const esquemaPersonaDelEquipo = esquemaPersonaNueva.refine(
  (p) => p.rol !== 'dueno',
  {
    path: ['rol'],
    message: 'Al dueño lo carga Repunto.',
  },
);

/** Cuántos clientes trae la lista, los de visita más reciente primero. */
export const CLIENTES_EN_LA_LISTA = 1000;

const cantidad = z.int().nonnegative();

/**
 * Un cliente del negocio del dueño. Solo su historia acá: el mismo cliente en
 * otro negocio no se ve. Un sello anulado no cuenta.
 */
export const esquemaClienteDelDueno = z.object({
  nombre: z.string(),
  /** Completo, en E.164 (INV-20): el dueño ve a sus clientes. */
  telefono: z.string(),
  /** En toda su historia en el negocio. */
  sellos: cantidad,
  /** Null si tiene tarjeta pero ningún sello todavía. */
  primer_sello: z.iso.datetime().nullable(),
  ultimo_sello: z.iso.datetime().nullable(),
  /** Premios entregados. */
  premios: cantidad,
  /** La tarjeta en curso; null si no tiene una activa. */
  tarjeta: z
    .object({
      sellos: cantidad,
      /** Los que pide SU programa, que puede no ser el vigente (INV-6). */
      sellos_requeridos: z.int().positive(),
      /** Null mientras no tenga sellos (INV-12) o si el programa no vence. */
      vence_el: z.iso.datetime().nullable(),
    })
    .nullable(),
  /** Las definiciones de la sección 6 de CLAUDE.md, las mismas del resumen. */
  activo: z.boolean(),
  enfriado: z.boolean(),
  nuevo_del_mes: z.boolean(),
});

export type ClienteDelDueno = z.infer<typeof esquemaClienteDelDueno>;

/** `GET /dueno/clientes`: sus clientes, los de visita más reciente primero. */
export const esquemaClientesDelDueno = z.object({
  generado_el: z.iso.datetime(),
  /** Todos los que tienen tarjeta en el negocio, aunque la lista traiga menos. */
  total: cantidad,
  ventanas: z.object({
    cliente_activo_dias: z.int().positive(),
    enfriado_dias: z.int().positive(),
    sellos_para_enfriado: z.int().positive(),
  }),
  clientes: z.array(esquemaClienteDelDueno).max(CLIENTES_EN_LA_LISTA),
});

export type ClientesDelDueno = z.infer<typeof esquemaClientesDelDueno>;
