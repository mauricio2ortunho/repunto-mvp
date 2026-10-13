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

/**
 * Los estados en que el cliente ve una tarjeta suya.
 *
 * Repetidos a proposito de `ESTADOS_PARA_EL_CLIENTE` de `@repunto/dominio`,
 * que es quien los decide: la app los necesita para dibujar y contratos no
 * puede importar dominio (CLAUDE.md, seccion 3). Un test en `apps/api` falla
 * si dejan de coincidir.
 */
export const ESTADOS_DE_TARJETA_DEL_CLIENTE = [
  'completa',
  'en_curso',
  'congelada',
  'vencida',
  'canjeada',
] as const;

export type EstadoDeTarjetaDelCliente = (typeof ESTADOS_DE_TARJETA_DEL_CLIENTE)[number];

/**
 * Como se ve el negocio en la tarjeta (especificacion, seccion 9). Los valores
 * de diseño viajan como texto: la app los lee con `iconoDeSelloDe` y
 * `plantillaDeTarjetaDe`, que caen en el de por defecto si no los conoce.
 */
export const esquemaMarcaDelNegocio = z.object({
  nombre: z.string(),
  /** Hex `#RRGGBB`. El texto encima se elige con `colorDeTextoSobre`. */
  color_principal: z.string(),
  /** Nulo mientras el dueño no lo entrega: se dibuja la inicial del nombre. */
  logo_url: z.string().nullable(),
  portada_url: z.string().nullable(),
  plantilla_tarjeta: z.string(),
  icono_sello: z.string(),
});

export type MarcaDelNegocio = z.infer<typeof esquemaMarcaDelNegocio>;

/** Una tarjeta del cliente, como aparece en su lista. */
export const esquemaTarjetaDelCliente = z.object({
  id: z.uuid(),
  negocio: esquemaMarcaDelNegocio,
  /** Lo decide la api: la app no lo recalcula. */
  estado: z.enum(ESTADOS_DE_TARJETA_DEL_CLIENTE),
  /** Sellos no anulados (INV-10). */
  progreso: z.int().nonnegative(),
  /** Los del programa de ESTA tarjeta, no los del vigente (INV-6). */
  sellos_requeridos: z.int().positive(),
  faltan: z.int().nonnegative(),
  premio: z.string(),
  /**
   * Fin del dia en La Paz en que vence, en UTC. Para mostrarlo, formatear con
   * `timeZone: 'America/La_Paz'`, nunca con la zona del telefono. Nulo si la
   * tarjeta todavia no tiene sellos (INV-12) o si el programa no vence.
   */
  vence_el: z.iso.datetime().nullable(),
});

export type TarjetaDelCliente = z.infer<typeof esquemaTarjetaDelCliente>;

/**
 * `GET /mis/tarjetas`. Una por negocio: la que esta en curso, o la ultima si ya
 * no hay ninguna activa —asi un negocio no desaparece cuando la tarjeta vence—.
 *
 * Vienen ya ordenadas "por cercania a completarse" (especificacion, seccion
 * 10): primero las completas, despues las que menos sellos les faltan, al
 * final las congeladas y las vencidas. La app respeta el orden.
 */
export const esquemaMisTarjetas = z.object({
  tarjetas: z.array(esquemaTarjetaDelCliente),
});

export type MisTarjetas = z.infer<typeof esquemaMisTarjetas>;

/**
 * `GET /mis/tarjetas/:id`: la tarjeta con todo lo que el detalle muestra. La
 * tarjeta completa no es otra pantalla: es este mismo detalle con
 * `estado: 'completa'` (especificacion, seccion 10).
 */
export const esquemaDetalleDeTarjeta = esquemaTarjetaDelCliente.extend({
  /**
   * El instante del servidor. La cuenta regresiva del vencimiento se mide
   * contra esto y no contra el reloj del telefono, como en `/mi/codigo`.
   */
  ahora: z.iso.datetime(),
  /** La condicion vigente del negocio (INV-7, INV-8). Nula si no hay ninguna. */
  condicion: z
    .object({
      texto: z.string(),
      /** Decimal como texto: la plata no viaja en coma flotante. */
      monto_minimo: z.string().nullable(),
    })
    .nullable(),
  /**
   * Donde se entrega el premio cuando el negocio no lo entrega en cualquier
   * sucursal: el local donde se abrio la tarjeta. Nulo, en cualquiera.
   */
  canje_en: z.string().nullable(),
  /**
   * Los sellos que cuentan, del mas reciente al mas viejo, con su local. Los
   * anulados no aparecen. Los que pasaron de una tarjeta canjeada conservan
   * su fecha y su local de origen (INV-15).
   */
  sellos: z.array(z.object({ fecha: z.iso.datetime(), local: z.string() })),
});

export type DetalleDeTarjeta = z.infer<typeof esquemaDetalleDeTarjeta>;
