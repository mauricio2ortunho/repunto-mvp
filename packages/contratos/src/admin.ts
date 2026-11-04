import { z } from 'zod';

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
