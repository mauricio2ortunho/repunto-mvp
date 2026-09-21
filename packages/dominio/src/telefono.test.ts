import { describe, expect, it } from 'vitest';

import { normalizarTelefono, ultimosCuatro } from './telefono';

describe('normalizarTelefono · INV-20', () => {
  it.each([
    ['ocho digitos pelados', '70123456', '+59170123456'],
    ['empezando en 6', '61234567', '+59161234567'],
    ['con el pais adelante', '59170123456', '+59170123456'],
    ['ya en E.164', '+59170123456', '+59170123456'],
    ['con espacios y guion', '+591 7012-3456', '+59170123456'],
    ['con parentesis y puntos', '(591) 7012.3456', '+59170123456'],
    ['con un cero adelante, como para marcar', '070123456', '+59170123456'],
    ['de otro pais, si trae su prefijo', '+12025550143', '+12025550143'],
  ])('%s', (_caso, tipeado, esperado) => {
    expect(normalizarTelefono(tipeado)).toBe(esperado);
  });

  it.each([
    ['vacio', ''],
    ['solo espacios', '   '],
    ['muy corto', '7012'],
    ['muy largo', '7012345678'],
    ['no empieza en 6 ni en 7', '41234567'],
    ['con letras', '7012345a'],
    ['un mas y nada', '+'],
    ['un pais que no existe', '+0123456789'],
    ['sin prefijo y de otro pais', '2025550143'],
  ])('rechaza: %s', (_caso, tipeado) => {
    expect(normalizarTelefono(tipeado)).toBeNull();
  });

  it('lo que devuelve siempre pasa el CHECK de la base', () => {
    const e164 = /^\+[1-9][0-9]{7,14}$/;
    for (const tipeado of ['70123456', '59170123456', '+591 7012 3456']) {
      expect(normalizarTelefono(tipeado) ?? '').toMatch(e164);
    }
  });
});

describe('ultimosCuatro', () => {
  it('es lo unico del telefono que se muestra en caja', () => {
    expect(ultimosCuatro('+59170124521')).toBe('4521');
  });
});
