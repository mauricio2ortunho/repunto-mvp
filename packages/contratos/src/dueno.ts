import { z } from 'zod';

import { esquemaCondicionDelHistorial, esquemaProgramaVigente } from './admin';

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
