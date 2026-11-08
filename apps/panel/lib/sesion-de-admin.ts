/**
 * La sesion del panel de administracion, guardada en este equipo.
 *
 * Aparte de la credencial de la tablet a proposito: otra clave, y el cliente
 * HTTP la manda solo a /admin. Si el admin abre el panel en una tablet de
 * caja, cada una sigue con lo suyo.
 */

const CLAVE = 'repunto:admin:token';

/** Lo minimo de `localStorage` que hace falta. */
export interface AlmacenDeSesion {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface SesionDeAdmin {
  token(): string | null;
  guardar(token: string): void;
  /** Al salir, o cuando la api dice que la sesion ya no sirve. */
  olvidar(): void;
}

/**
 * `localStorage` puede no estar (servidor) o tirar error (navegacion privada,
 * datos bloqueados). Ahi la sesion vive en memoria hasta cerrar la pagina.
 */
export function crearSesionDeAdmin(almacen: AlmacenDeSesion | null): SesionDeAdmin {
  return crearSesionGuardada(almacen, CLAVE);
}

/**
 * Una sesion guardada bajo su propia clave. La del dueño usa la misma
 * mecanica con otra clave: cada panel queda con lo suyo en el mismo equipo.
 */
export function crearSesionGuardada(
  almacen: AlmacenDeSesion | null,
  clave: string,
): SesionDeAdmin {
  let enMemoria: string | null = null;
  return {
    token() {
      try {
        return almacen?.getItem(clave) || enMemoria;
      } catch {
        return enMemoria;
      }
    },
    guardar(token) {
      enMemoria = token;
      try {
        almacen?.setItem(clave, token);
      } catch {
        // Queda en memoria.
      }
    },
    olvidar() {
      enMemoria = null;
      try {
        almacen?.removeItem(clave);
      } catch {
        // No habia nada que borrar.
      }
    },
  };
}

export function almacenDelNavegador(): AlmacenDeSesion | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let sesion: SesionDeAdmin | null = null;

export function sesionDeAdmin(): SesionDeAdmin {
  sesion ??= crearSesionDeAdmin(almacenDelNavegador());
  return sesion;
}
