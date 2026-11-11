import { z } from 'zod';

import { LIMITES_DEL_NEGOCIO } from './admin';
import { RUBROS_DE_NEGOCIO } from './diseno';

/**
 * La solicitud de negocio: alguien pide sumar su negocio desde la app del
 * cliente, y el admin la resuelve desde su panel. No crea nada sola: aprobar
 * es dar de alta el negocio, como siempre (especificación, sección 1).
 */

export const LIMITES_DE_SOLICITUD = {
  nombreNegocio: LIMITES_DEL_NEGOCIO.nombre,
  contacto: 60,
  /** Lo tipeado, antes de normalizar: espacios, guiones, el +591. */
  telefono: 30,
  mensaje: 500,
  motivo: 300,
} as const;

/**
 * Cuántas solicitudes por teléfono por día y por conexión por hora. Por
 * teléfono es el freno fino; por IP, la red para quien automatiza.
 */
export const TOPES_DE_SOLICITUD = { porTelefonoPorDia: 3, porIpPorHora: 10 } as const;

const texto = (maximo: number) => z.string().trim().min(1).max(maximo);

/** Opcional: vacío es lo mismo que no escribirlo. */
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullable()
    .default(null)
    .transform((v) => (v === '' ? null : v));

/**
 * `POST /solicitudes`, público: todavía no hay cuenta de nada. El teléfono va
 * tal cual se tipeó: lo normaliza la api (INV-20). Responde siempre lo mismo,
 * haya o no otra pendiente de ese teléfono.
 */
export const esquemaSolicitudNueva = z.object({
  nombre_negocio: texto(LIMITES_DE_SOLICITUD.nombreNegocio),
  categoria: z.enum(RUBROS_DE_NEGOCIO),
  contacto: texto(LIMITES_DE_SOLICITUD.contacto),
  telefono: texto(LIMITES_DE_SOLICITUD.telefono),
  mensaje: textoOpcional(LIMITES_DE_SOLICITUD.mensaje),
});

export type SolicitudNueva = z.input<typeof esquemaSolicitudNueva>;

export const esquemaSolicitudRecibida = z.object({ recibida: z.literal(true) });

export type SolicitudRecibida = z.infer<typeof esquemaSolicitudRecibida>;

export const ESTADOS_DE_SOLICITUD = ['pendiente', 'aprobada', 'rechazada'] as const;

export type EstadoDeSolicitud = (typeof ESTADOS_DE_SOLICITUD)[number];

/** Una solicitud, como la ve el admin. */
export const esquemaSolicitudDelAdmin = z.object({
  id: z.uuid(),
  nombre_negocio: z.string(),
  /** Como texto suelto: un rubro que este panel no conoce no lo rompe. */
  categoria: z.string(),
  contacto: z.string(),
  /** E.164. */
  telefono: z.string(),
  mensaje: z.string().nullable(),
  estado: z.enum(ESTADOS_DE_SOLICITUD),
  motivo_rechazo: z.string().nullable(),
  /** El negocio que se dio de alta, si se aprobó. */
  negocio_id: z.uuid().nullable(),
  creado_el: z.iso.datetime(),
  resuelta_el: z.iso.datetime().nullable(),
});

export type SolicitudDelAdmin = z.infer<typeof esquemaSolicitudDelAdmin>;

/** Cuántas resueltas trae la lista, además de todas las pendientes. */
export const SOLICITUDES_RESUELTAS_EN_LA_LISTA = 50;

/** `GET /admin/solicitudes`: las pendientes primero, y las últimas resueltas. */
export const esquemaSolicitudesDelAdmin = z.object({
  solicitudes: z.array(esquemaSolicitudDelAdmin),
});

export type SolicitudesDelAdmin = z.infer<typeof esquemaSolicitudesDelAdmin>;

/** `POST /admin/solicitudes/:id/rechazo`: el motivo es opcional. */
export const esquemaRechazoDeSolicitud = z.object({
  motivo: textoOpcional(LIMITES_DE_SOLICITUD.motivo),
});

export type RechazoDeSolicitud = z.input<typeof esquemaRechazoDeSolicitud>;
