import { z } from 'zod';

/**
 * Contratos del turno de caja: quien puede abrirlo, abrirlo con PIN y
 * cerrarlo (CLAUDE.md, seccion 5).
 *
 * Abrir y cerrar responden el `EstadoDeCaja` entero, el mismo de
 * `GET /caja/estado`: el panel no hace un segundo viaje para saber como quedo
 * la caja.
 */

/** `GET /caja/usuarios`: una persona de la lista que el cajero toca. */
export const esquemaUsuarioDeCaja = z.object({
  id: z.uuid(),
  nombre: z.string().min(1),
  rol: z.enum(['dueno', 'supervisor', 'cajero']),
});

export type UsuarioDeCaja = z.infer<typeof esquemaUsuarioDeCaja>;

/**
 * Solo quienes pueden abrir turno en ESA tablet: activos, asignados a su
 * local y con PIN puesto. Un nombre sin PIN seria un callejon sin salida.
 * Ordenada por nombre.
 */
export const esquemaUsuariosDeCaja = z.object({
  usuarios: z.array(esquemaUsuarioDeCaja),
});

export type UsuariosDeCaja = z.infer<typeof esquemaUsuariosDeCaja>;

/** Cuatro digitos. Es lo que se valida en el borde; el resto lo decide la api. */
export const FORMATO_DEL_PIN = /^\d{4}$/;

/**
 * `POST /caja/turnos`. Sin Idempotency-Key, al reves que sellar y canjear: la
 * clave guarda un hash del cuerpo, y el hash de un PIN de cuatro digitos se
 * revierte probando las diez mil combinaciones. El doble toque lo cubre la
 * api: si el turno abierto ya es de ese usuario, devuelve ese mismo.
 */
export const esquemaAbrirTurnoPeticion = z.object({
  usuario_id: z.uuid(),
  pin: z.string().regex(FORMATO_DEL_PIN),
});

export type AbrirTurnoPeticion = z.infer<typeof esquemaAbrirTurnoPeticion>;
