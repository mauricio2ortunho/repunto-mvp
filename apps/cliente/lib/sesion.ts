import { type Guardado, guardadoDelTelefono } from './almacen';

/**
 * La sesion del cliente en este telefono, y el registro que esta esperando que
 * el cajero lo confirme.
 *
 * El token de sesion lo entrega `GET /registros/mio` UNA sola vez, en el
 * primer pedido despues de la confirmacion. Si se pierde, hoy no hay forma de
 * recuperarlo: el ingreso por codigo de WhatsApp todavia no existe (CLAUDE.md,
 * seccion 15). Por eso se guarda apenas llega, antes de cualquier otra cosa.
 */

const SESION = 'repunto:cliente:sesion';
const REGISTRO = 'repunto:cliente:registro';

/** Lo que hace falta para seguir esperando la confirmacion, o reintentar. */
export interface RegistroEnEspera {
  /** El secreto con el que se pregunta si ya confirmaron. */
  ticket: string;
  /** La Idempotency-Key del envio: el reintento la repite (el ticket se deriva de ella). */
  clave: string;
  qr: string;
  nombre: string;
  /** Lo que el cajero ve en su lista: "terminado en 4521". */
  telefono_final: string;
}

export interface Sesion {
  token(): string | null;
  guardarToken(token: string): void;
  cerrar(): void;
  registro(): RegistroEnEspera | null;
  guardarRegistro(registro: RegistroEnEspera): void;
  olvidarRegistro(): void;
}

export function crearSesion(guardado: Guardado): Sesion {
  return {
    token: () => guardado.leer(SESION),
    guardarToken: (token) => guardado.guardar(SESION, token),
    cerrar: () => guardado.borrar(SESION),
    registro() {
      const crudo = guardado.leer(REGISTRO);
      if (crudo === null) return null;
      try {
        const leido = JSON.parse(crudo) as Partial<RegistroEnEspera>;
        return typeof leido.ticket === 'string' &&
          typeof leido.clave === 'string' &&
          typeof leido.qr === 'string' &&
          typeof leido.nombre === 'string' &&
          typeof leido.telefono_final === 'string'
          ? (leido as RegistroEnEspera)
          : null;
      } catch {
        return null;
      }
    },
    guardarRegistro: (registro) => guardado.guardar(REGISTRO, JSON.stringify(registro)),
    olvidarRegistro: () => guardado.borrar(REGISTRO),
  };
}

let sesion: Sesion | null = null;

export function sesionDelTelefono(): Sesion {
  sesion ??= crearSesion(guardadoDelTelefono());
  return sesion;
}
