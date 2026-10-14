import type { Esquema } from './api/http';
import { type Guardado, guardadoDelTelefono } from './almacen';

/**
 * Lo ultimo que se vio, para mostrarlo sin conexion: "las tarjetas y el
 * progreso deben verse sin conexion" (especificacion, seccion 10).
 *
 * Se valida con el esquema al leer: lo guardado por una version anterior de
 * la app, o roto, se descarta en lugar de romper la pantalla.
 */

export interface Ultimo {
  leer<T>(clave: string, esquema: Esquema<T>): T | null;
  guardar(clave: string, valor: unknown): void;
  /** Al cerrar la sesion: lo de un cliente no se le muestra al siguiente. */
  olvidarTodo(): void;
}

const PREFIJO = 'repunto:cliente:ultimo:';

export function crearUltimo(guardado: Guardado): Ultimo {
  const claves = new Set<string>();
  return {
    leer(clave, esquema) {
      const crudo = guardado.leer(PREFIJO + clave);
      if (crudo === null) return null;
      try {
        const valido = esquema.safeParse(JSON.parse(crudo));
        return valido.success ? valido.data : null;
      } catch {
        return null;
      }
    },
    guardar(clave, valor) {
      claves.add(clave);
      guardado.guardar(PREFIJO + clave, JSON.stringify(valor));
    },
    olvidarTodo() {
      for (const clave of claves) guardado.borrar(PREFIJO + clave);
      claves.clear();
      guardado.borrar(`${PREFIJO}tarjetas`);
    },
  };
}

let ultimo: Ultimo | null = null;

export function ultimoDelTelefono(): Ultimo {
  ultimo ??= crearUltimo(guardadoDelTelefono());
  return ultimo;
}
