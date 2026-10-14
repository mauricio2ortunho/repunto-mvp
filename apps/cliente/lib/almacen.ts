/**
 * Lo que la app guarda en el telefono.
 *
 * `localStorage` puede no estar (en el servidor) o tirar error (navegacion
 * privada, datos bloqueados). En ese caso lo guardado vive en memoria hasta
 * que se cierre la pagina: la app sigue andando, aunque no recuerde nada.
 */

/** Lo minimo de `localStorage` que hace falta. Los tests pasan uno propio. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface Guardado {
  leer(clave: string): string | null;
  guardar(clave: string, valor: string): void;
  borrar(clave: string): void;
}

export function crearGuardado(almacen: Almacen | null): Guardado {
  const enMemoria = new Map<string, string>();
  return {
    leer(clave) {
      try {
        return almacen?.getItem(clave) ?? enMemoria.get(clave) ?? null;
      } catch {
        return enMemoria.get(clave) ?? null;
      }
    },
    guardar(clave, valor) {
      enMemoria.set(clave, valor);
      try {
        almacen?.setItem(clave, valor);
      } catch {
        // Queda en memoria.
      }
    },
    borrar(clave) {
      enMemoria.delete(clave);
      try {
        almacen?.removeItem(clave);
      } catch {
        // No habia nada que borrar afuera.
      }
    },
  };
}

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let guardado: Guardado | null = null;

/** El del navegador. Se crea en el primer uso, ya en el cliente. */
export function guardadoDelTelefono(): Guardado {
  guardado ??= crearGuardado(almacenDelNavegador());
  return guardado;
}
