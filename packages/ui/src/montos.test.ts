import { describe, expect, it } from 'vitest';

import { esMontoCero, formatearBolivianos } from './montos';

describe('montos en bolivianos', () => {
  it('se formatean desde el texto, sin coma flotante', () => {
    expect(formatearBolivianos('30.00')).toBe('Bs 30');
    expect(formatearBolivianos('25.5')).toBe('Bs 25,50');
    expect(formatearBolivianos('1500.75')).toBe('Bs 1.500,75');
    expect(formatearBolivianos('007')).toBe('Bs 7');
  });

  it('lo que no tiene forma de monto se muestra tal cual', () => {
    expect(formatearBolivianos('treinta')).toBe('Bs treinta');
  });

  it('un monto minimo de cero no es condicion', () => {
    expect(esMontoCero('0.00')).toBe(true);
    expect(esMontoCero('0')).toBe(true);
    expect(esMontoCero('0.50')).toBe(false);
  });
});
