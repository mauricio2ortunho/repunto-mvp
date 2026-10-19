import type { UsuarioDeCaja } from '@repunto/contratos';
import type { CodigoDeError } from '../../lib/api/http';

/**
 * Abrir turno como maquina de estados, sin React adentro para poder probarla.
 *
 * Dos pasos: la lista de nombres y el PIN de quien se eligio. El nombre
 * identifica y el PIN confirma (CLAUDE.md, seccion 5). El PIN sale solo al
 * completar los cuatro digitos: el cajero no busca un boton de "Entrar".
 *
 * Quien cuenta los intentos y bloquea es la api. Aca no se cuenta nada: se
 * muestra lo que la api contesta.
 */

export const LARGO_DEL_PIN = 4;

export type Apertura =
  | { paso: 'lista'; aviso: string | null }
  | {
      paso: 'pin';
      usuario: UsuarioDeCaja;
      pin: string;
      enviando: boolean;
      aviso: string | null;
    };

export type EventoDeApertura =
  | { tipo: 'eligio'; usuario: UsuarioDeCaja }
  /** El valor entero del PIN tal como quedo: el teclado manda el texto, no la tecla. */
  | { tipo: 'tecleo'; pin: string }
  | { tipo: 'envio' }
  | { tipo: 'fallo'; codigo: CodigoDeError | null; mensaje: string }
  /** Volver a la lista, para elegir a otra persona. */
  | { tipo: 'volvio' };

export const aperturaInicial: Apertura = { paso: 'lista', aviso: null };

export function reducirApertura(e: Apertura, ev: EventoDeApertura): Apertura {
  switch (ev.tipo) {
    case 'eligio':
      return { paso: 'pin', usuario: ev.usuario, pin: '', enviando: false, aviso: null };

    case 'tecleo':
      if (e.paso !== 'pin' || e.enviando) return e;
      // El aviso del intento anterior se va en cuanto empieza el siguiente.
      return {
        ...e,
        pin: ev.pin.replace(/\D/g, '').slice(0, LARGO_DEL_PIN),
        aviso: null,
      };

    case 'envio':
      if (e.paso !== 'pin') return e;
      return { ...e, enviando: true };

    case 'fallo':
      // Esa persona ya no puede abrir turno aca: de vuelta a la lista, que se
      // vuelve a pedir y ya no la va a traer.
      if (ev.codigo === 'USUARIO_NO_HABILITADO')
        return { paso: 'lista', aviso: ev.mensaje };
      if (e.paso !== 'pin') return { ...e, aviso: ev.mensaje };
      // El PIN se borra siempre: el siguiente intento empieza de cero.
      return { ...e, pin: '', enviando: false, aviso: ev.mensaje };

    case 'volvio':
      return aperturaInicial;
  }
}

/** El PIN esta completo y todavia no salio: es el momento de mandarlo. */
export function hayQueEnviar(e: Apertura): boolean {
  return e.paso === 'pin' && !e.enviando && e.pin.length === LARGO_DEL_PIN;
}
