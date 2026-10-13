import { z } from 'zod';

/**
 * Contrato de `GET /mi/codigo`.
 *
 * El codigo lo calcula el servidor, no el telefono: la PWA no importa
 * `dominio` (CLAUDE.md, seccion 3) y, sobre todo, la semilla no sale del
 * servidor en ninguna circunstancia.
 *
 * La peticion no lleva ningun identificador de cliente, ni siquiera el propio:
 * el cliente sale del token de sesion.
 */
export const esquemaCodigoDelCliente = z.object({
  /**
   * El instante del servidor al armar la respuesta, en UTC.
   *
   * La cuenta regresiva se calcula contra esto y no contra el reloj del
   * telefono, que puede estar corrido minutos: lo que falta es
   * `vence_el - ahora`, y desde que llego la respuesta se descuenta con un
   * reloj monotono (`performance.now()`), que no salta si el usuario cambia la
   * hora. Con el reloj del telefono, un equipo atrasado mostraria un codigo
   * vencido como vigente.
   */
  ahora: z.iso.datetime(),
  /**
   * La ventana actual y la siguiente, en ese orden. Con las dos, la app
   * aguanta un minuto sin volver a pedir, que es lo que dura una fila.
   */
  codigos: z
    .array(
      z.object({
        /** `K7Q4M-418329`. */
        codigo: z.string(),
        /**
         * Cuando deja de ser el codigo actual, en UTC: es lo que mide la
         * cuenta regresiva. La caja lo sigue aceptando 30 segundos mas, como
         * ventana anterior, asi que el codigo que el cajero esta tipeando
         * cuando la cuenta llega a cero todavia sirve.
         */
        vence_el: z.iso.datetime(),
      }),
    )
    .length(2),
});

export type CodigoDelCliente = z.infer<typeof esquemaCodigoDelCliente>;

/**
 * `POST /registros`: el cliente escanea el QR impreso del mostrador y escribe
 * su telefono y su nombre en su propio equipo.
 *
 * El `qr_slug` es la credencial: no es un identificador de alcance que el
 * cliente pueda inventar, es lo que esta impreso en el local. Este endpoint es
 * el unico publico de la caja, y por eso tiene tope por telefono y por IP.
 */
export const esquemaRegistroPeticion = z.object({
  qr_slug: z.string().min(1).max(120),
  /** Como lo escriba: se normaliza a E.164 en el borde (INV-20). */
  telefono: z.string().min(1).max(30),
  nombre: z.string().min(1).max(80),
});

export type RegistroPeticion = z.infer<typeof esquemaRegistroPeticion>;

export const esquemaRegistroRespuesta = z.object({
  estado: z.literal('pendiente'),
  /**
   * Secreto opaco que la PWA guarda para volver a preguntar. Va en la
   * respuesta y nunca en la URL: en la URL terminaria en los logs.
   */
  ticket: z.string().min(1),
});

export type RegistroRespuesta = z.infer<typeof esquemaRegistroRespuesta>;

/**
 * `GET /registros/mio`, con el ticket como credencial. Es como el telefono del
 * cliente se entera de que el cajero lo confirmo.
 *
 * La sesion se entrega SOLO si esta confirmacion creo la cuenta. Si el
 * telefono ya era de alguien, la confirmacion presencial no alcanza: un equipo
 * desconocido que quiere entrar a una cuenta que ya existe verifica el
 * telefono por codigo (especificacion, seccion 3). Si no fuera asi, cualquiera
 * en la fila podria escribir el telefono de otro, dejar que el cajero confirme
 * un nombre razonable, y llevarse la cuenta ajena entera.
 */
export const esquemaEstadoDelRegistro = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('pendiente') }),
  /** Nadie lo confirmo dentro de la media hora: hay que escanear de nuevo. */
  z.object({ estado: z.literal('vencido') }),
  z.object({ estado: z.literal('descartado') }),
  z.object({
    estado: z.literal('confirmado'),
    /** Token de sesion. Viene una sola vez: en el primer pedido despues de
     * confirmar. Si la PWA lo pierde, se entra por codigo. */
    token: z.string().min(1).optional(),
  }),
  z.object({ estado: z.literal('verificacion_requerida') }),
]);

export type EstadoDelRegistro = z.infer<typeof esquemaEstadoDelRegistro>;
