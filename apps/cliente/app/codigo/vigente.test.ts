import { describe, expect, it } from 'vitest';

import { codigoVigente, partesDelCodigo } from './vigente';

const DATOS = {
  ahora: '2026-10-12T21:02:10.000Z',
  codigos: [
    { codigo: 'JUAN2-111111', vence_el: '2026-10-12T21:02:29.999Z' },
    { codigo: 'JUAN2-222222', vence_el: '2026-10-12T21:02:59.999Z' },
  ],
};

describe('codigoVigente', () => {
  it('muestra el primero mientras no venza, con lo que le queda', () => {
    const vigente = codigoVigente(DATOS, Date.parse('2026-10-12T21:02:10.000Z'));
    expect(vigente).toMatchObject({
      tipo: 'mostrar',
      codigo: 'JUAN2-111111',
      pedirMas: false,
    });
    if (vigente.tipo !== 'mostrar') return;
    expect(Math.round(vigente.restanteMs / 1000)).toBe(20);
  });

  it('cuando vence el primero pasa al segundo y avisa que hay que pedir mas', () => {
    expect(codigoVigente(DATOS, Date.parse('2026-10-12T21:02:35.000Z'))).toMatchObject({
      tipo: 'mostrar',
      codigo: 'JUAN2-222222',
      pedirMas: true,
    });
  });

  it('con los dos vencidos no muestra uno viejo', () => {
    // Sin conexion, un codigo viejo en pantalla es peor que ninguno: el cajero
    // lo tipea y la caja lo rechaza.
    expect(codigoVigente(DATOS, Date.parse('2026-10-12T21:03:05.000Z'))).toEqual({
      tipo: 'vencidos',
    });
  });

  it('la barra va de lleno a vacio en la ventana de 30 segundos', () => {
    const recien = codigoVigente(DATOS, Date.parse('2026-10-12T21:02:00.000Z'));
    const casi = codigoVigente(DATOS, Date.parse('2026-10-12T21:02:28.500Z'));
    if (recien.tipo !== 'mostrar' || casi.tipo !== 'mostrar') throw new Error('vencido');
    expect(recien.fraccion).toBeCloseTo(1, 1);
    expect(casi.fraccion).toBeLessThan(0.06);
  });
});

describe('partesDelCodigo', () => {
  it('separa el prefijo y agrupa los digitos de a tres', () => {
    expect(partesDelCodigo('K7Q4M-418329')).toEqual({
      prefijo: 'K7Q4M',
      digitos: '418 329',
    });
  });
});
