import { describe, expect, it } from 'vitest';

import { autorParaElDueno, tarjetasEnCurso } from './promo-del-dueno';

const CONDICION = {
  texto: 'Cualquier capuchino',
  monto_minimo: null,
  vigente_desde: '2026-11-04T12:00:00.000Z',
};

describe('autorParaElDueno', () => {
  it('la del alta la escribió Repunto', () => {
    expect(autorParaElDueno({ ...CONDICION, autor: { tipo: 'administracion' } })).toBe(
      'Repunto',
    );
  });

  it('la de alguien del negocio, con su nombre', () => {
    expect(
      autorParaElDueno({ ...CONDICION, autor: { tipo: 'negocio', nombre: 'Lucía' } }),
    ).toBe('Lucía');
  });
});

describe('tarjetasEnCurso', () => {
  it('en singular, en plural y ninguna', () => {
    expect(tarjetasEnCurso(1)).toBe('1 tarjeta en curso.');
    expect(tarjetasEnCurso(3)).toBe('3 tarjetas en curso.');
    expect(tarjetasEnCurso(0)).toBe('Ninguna tarjeta en curso.');
  });
});
