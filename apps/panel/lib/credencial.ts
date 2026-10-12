import { tokenDeEntorno } from './configuracion';

/**
 * El token de esta tablet, guardado en la tablet.
 *
 * Cada tablet tiene el suyo y la sesion vive en el equipo: el turno, y con el
 * la auditoria de quien sello que, sale de este token. El cliente HTTP lo lee
 * siempre de aca.
 *
 * Mientras no exista la vinculacion, el almacenamiento vacio se llena con la
 * variable de entorno. Uno ya guardado nunca se pisa: cuando la vinculacion
 * exista, escribe con `guardar` y la variable deja de importar.
 */

const CLAVE = 'repunto:caja:token';

/** Lo minimo de `localStorage` que hace falta. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export interface Credencial {
  token(): string | null;
  guardar(token: string): void;
}

/**
 * `localStorage` puede no estar (servidor) o tirar error (navegacion privada,
 * datos bloqueados). En ese caso el token vive en memoria hasta que se cierre
 * la pagina: la caja sigue andando, aunque no recuerde la sesion.
 */
export function crearCredencial(almacen: Almacen | null, deEntorno: string | null): Credencial {
  let enMemoria: string | null = null;

  const leer = (): string | null => {
    try {
      return almacen?.getItem(CLAVE) || enMemoria;
    } catch {
      return enMemoria;
    }
  };

  const guardar = (token: string) => {
    enMemoria = token;
    try {
      almacen?.setItem(CLAVE, token);
    } catch {
      // Queda en memoria.
    }
  };

  return {
    token() {
      const guardado = leer();
      if (guardado !== null) return guardado;
      if (deEntorno === null) return null;
      guardar(deEntorno);
      return deEntorno;
    },
    guardar,
  };
}

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let credencial: Credencial | null = null;

/** La credencial de esta tablet. Se crea en el primer uso, ya en el navegador. */
export function credencialDeLaTablet(): Credencial {
  credencial ??= crearCredencial(almacenDelNavegador(), tokenDeEntorno);
  return credencial;
}
