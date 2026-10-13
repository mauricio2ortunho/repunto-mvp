import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRASTE_MINIMO, contrasteEntre, esColorHex } from '@repunto/contratos';

/**
 * La guardia de la paleta. Lee tokens.css, resuelve cada rol como lo haria
 * el navegador -en la raiz y dentro de cada superficie- y exige contraste
 * minimo en cada par fondo/texto que usa la caja.
 *
 * Cambiar un color de la paleta y correr los tests dice si algo quedo
 * ilegible, y donde, antes de verlo en una tablet.
 */

const css = readFileSync(
  fileURLToPath(new URL('./tokens.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function declaraciones(selector: RegExp): Map<string, string> {
  const bloque = selector.exec(css)?.[1];
  if (bloque === undefined) throw new Error(`No esta el bloque ${selector}`);
  return new Map(
    [...bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const raiz = declaraciones(/:root\s*\{([^}]*)\}/);
/** Las superficies con colores propios. 'marca' no: su color llega de la API. */
const SUPERFICIES = [...css.matchAll(/\[data-superficie='([\w-]+)'\]/g)]
  .map((m) => m[1]!)
  .filter((n) => n !== 'marca');

const superficie = (nombre: string) =>
  declaraciones(new RegExp(`\\[data-superficie='${nombre}'\\]\\s*\\{([^}]*)\\}`));

/** El valor computado en la raiz: var() se resuelve contra la raiz. */
function enRaiz(nombre: string, vistos: string[] = []): string {
  if (vistos.includes(nombre))
    throw new Error(`Ciclo: ${[...vistos, nombre].join(' -> ')}`);
  const valor = raiz.get(nombre);
  if (valor === undefined) throw new Error(`No existe ${nombre}`);
  return valor.replace(/var\((--[\w-]+)\)/g, (_, v: string) =>
    enRaiz(v, [...vistos, nombre]),
  );
}

/**
 * Dentro de una superficie: lo que la superficie redefine se resuelve ahi;
 * lo que no, se hereda ya computado de la raiz. Igual que en CSS.
 */
function enSuperficie(
  decl: Map<string, string>,
  nombre: string,
  vistos: string[] = [],
): string {
  const valor = decl.get(nombre);
  if (valor === undefined) return enRaiz(nombre);
  if (vistos.includes(nombre))
    throw new Error(`Ciclo: ${[...vistos, nombre].join(' -> ')}`);
  return valor.replace(/var\((--[\w-]+)\)/g, (_, v: string) =>
    enSuperficie(decl, v, [...vistos, nombre]),
  );
}

type Resolver = (nombre: string) => string;

/** Con la misma funcion que usan las apps para el color de cada negocio. */
function medir(resolver: Resolver, frente: string, fondo: string): number {
  const a = resolver(frente);
  const b = resolver(fondo);
  for (const [token, valor] of [
    [frente, a],
    [fondo, b],
  ] as const) {
    if (!esColorHex(valor))
      throw new Error(`${token} = ${valor}: tiene que ser #RRGGBB opaco`);
  }
  return contrasteEntre(a, b);
}

/** [texto o figura, fondo, minimo]. 4.5 es texto; 3 es figura (sellos, barras). */
type Par = readonly [string, string, number];

const TEXTO = CONTRASTE_MINIMO;
/** WCAG 1.4.11: lo que no es texto (un sello, una barra) pide 3. */
const FIGURA = 3;

const PARES_DE_LA_CAJA: Par[] = [
  ['--c-texto', '--c-fondo', TEXTO],
  ['--c-texto', '--c-superficie', TEXTO],
  ['--c-texto-suave', '--c-fondo', TEXTO],
  ['--c-texto-suave', '--c-superficie', TEXTO],
  ['--c-sobre-accion', '--c-accion', TEXTO],
  ['--c-accion-presionada', '--c-superficie', TEXTO],
  ['--c-acento', '--c-superficie', TEXTO],
  ['--c-sello', '--c-superficie', FIGURA],
  ['--c-sobre-sello', '--c-sello', FIGURA],
  ['--c-sobre-alerta', '--c-alerta', TEXTO],
  ['--c-texto', '--c-alerta-velo', TEXTO],
  ['--c-sobre-enfasis', '--c-enfasis', TEXTO],
  ['--c-sobre-premio-velo', '--c-premio-velo', TEXTO],
  ['--c-premio-borde', '--c-premio-velo', FIGURA],
  ['--c-alerta', '--c-superficie', TEXTO],
];

/** Lo que va directo sobre el fondo de cada superficie. */
const PARES_DE_SUPERFICIE: Par[] = [
  ['--c-texto', '--c-fondo', TEXTO],
  ['--c-texto-suave', '--c-fondo', TEXTO],
  ['--c-sobre-accion', '--c-accion', TEXTO],
  ['--c-accion', '--c-fondo', FIGURA],
  ['--c-acento', '--c-fondo', FIGURA],
  ['--c-sello', '--c-fondo', FIGURA],
  ['--c-texto', '--c-superficie', TEXTO],
];

function revisar(resolver: Resolver, pares: Par[]): string[] {
  return pares.flatMap(([frente, fondo, minimo]) => {
    const c = medir(resolver, frente, fondo);
    return c >= minimo
      ? []
      : [`${frente} sobre ${fondo}: ${c.toFixed(2)} (minimo ${minimo})`];
  });
}

describe('la paleta se lee', () => {
  it('en la caja', () => {
    expect(revisar((n) => enRaiz(n), PARES_DE_LA_CAJA)).toEqual([]);
  });

  it('hay superficies que revisar', () => {
    expect(SUPERFICIES.length).toBeGreaterThan(0);
  });

  for (const nombre of SUPERFICIES) {
    it(`sobre la superficie '${nombre}'`, () => {
      const decl = superficie(nombre);
      expect(revisar((n) => enSuperficie(decl, n), PARES_DE_SUPERFICIE)).toEqual([]);
    });
  }

  it('una superficie que cambia --c-accion cambia tambien --c-sobre-accion', () => {
    for (const nombre of SUPERFICIES) {
      const decl = superficie(nombre);
      if (decl.has('--c-accion')) expect(decl.has('--c-sobre-accion'), nombre).toBe(true);
    }
  });
});
