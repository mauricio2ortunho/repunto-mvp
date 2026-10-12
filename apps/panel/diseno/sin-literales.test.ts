import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * La guardia de los tokens. Si alguien escribe un color o un tamano de letra
 * a mano en un componente, este test falla y dice donde. Asi cambiar la
 * paleta o la escala sigue siendo cambiar un solo archivo.
 */

const PANEL = fileURLToPath(new URL('..', import.meta.url));
const CARPETAS = ['app', 'diseno', 'lib'];
/** Donde los literales SI van: la definicion de los tokens. */
const PERMITIDOS = new Set(['diseno/tokens.css']);

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(css|tsx?)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const fuentes = CARPETAS.flatMap((c) => archivos(join(PANEL, c)))
  // En Windows `relative` devuelve `diseno\\tokens.css`: se normaliza a `/`.
  .map((ruta) => ({
    nombre: relative(PANEL, ruta).split(sep).join('/'),
    lineas: readFileSync(ruta, 'utf8').split(/\r?\n/),
  }))
  .filter((f) => !PERMITIDOS.has(f.nombre));

function buscar(patron: RegExp, soloCss = false): string[] {
  return fuentes
    .filter((f) => !soloCss || f.nombre.endsWith('.css'))
    .flatMap((f) =>
      f.lineas.flatMap((linea, i) => (patron.test(linea) ? [`${f.nombre}:${i + 1}  ${linea.trim()}`] : [])),
    );
}

describe('los tokens son la unica fuente de diseno', () => {
  it('se revisan archivos de verdad', () => {
    expect(fuentes.length).toBeGreaterThan(10);
  });

  it('ningun color literal fuera de tokens.css', () => {
    expect(buscar(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i)).toEqual([]);
  });

  it('ningun tamano de letra literal fuera de tokens.css', () => {
    expect(buscar(/font-size:(?!\s*var\()/, true)).toEqual([]);
  });

  it('ninguna familia tipografica fuera de tokens.css', () => {
    expect(buscar(/font-family:(?!\s*var\()/, true)).toEqual([]);
  });
});
