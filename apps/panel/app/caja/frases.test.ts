import { describe, expect, it } from 'vitest';
import {
  fraseDeAnulacion,
  fraseDeAvance,
  fraseDelAlta,
  fraseDelCanje,
  fraseDelSello,
  haceCuanto,
  primerNombre,
} from './frases';

describe('frases para decir en voz alta', () => {
  it('saluda por el primer nombre', () => {
    expect(primerNombre('  María José  Ortiz ')).toBe('María');
    expect(fraseDelSello({ nombre: 'Juan Pérez', progreso: 7, faltan: 3 })).toBe(
      '¡Listo, Juan! Ya llevás 7 sellos. Te faltan 3 para el premio.',
    );
  });

  it('el primer sello y el ultimo que falta se dicen distinto', () => {
    expect(fraseDeAvance(1, 9)).toBe(
      'Ese es tu primer sello. Te faltan 9 para el premio.',
    );
    expect(fraseDeAvance(9, 1)).toBe(
      'Ya llevás 9 sellos. ¡Te falta uno solo para el premio!',
    );
  });

  it('el alta sin sello dice que ya tiene la tarjeta', () => {
    expect(fraseDelAlta({ nombre: 'Martina', progreso: 0, faltan: 10 })).toBe(
      '¡Listo, Martina! Ya tenés tu tarjeta. Te faltan 10 para el premio.',
    );
  });

  it('el canje menciona los sellos que pasan a la tarjeta nueva solo si hay', () => {
    expect(fraseDelCanje({ nombre: 'Ana', premio: 'Café', sobrantes: 0 })).toBe(
      '¡Acá tenés tu premio, Ana!',
    );
    expect(fraseDelCanje({ nombre: 'Ana', premio: 'Café', sobrantes: 1 })).toBe(
      '¡Acá tenés tu premio, Ana! Y ya arrancás la tarjeta nueva con 1 sello.',
    );
  });

  it('sin nombre no queda una coma colgando', () => {
    expect(fraseDelSello({ nombre: '', progreso: 2, faltan: 8 })).toBe(
      '¡Listo! Ya llevás 2 sellos. Te faltan 8 para el premio.',
    );
  });
});

describe('hace cuanto', () => {
  const ahora = Date.parse('2026-10-10T18:00:00Z');
  it('tolera un reloj adelantado', () => {
    expect(haceCuanto('2026-10-10T18:00:30Z', ahora)).toBe('recién');
  });
  it('minutos y horas', () => {
    expect(haceCuanto('2026-10-10T17:57:00Z', ahora)).toBe('hace 3 min');
    expect(haceCuanto('2026-10-10T16:30:00Z', ahora)).toBe('hace 1 hora');
  });
});

describe('despues de deshacer', () => {
  it('dice como quedo la tarjeta', () => {
    expect(
      fraseDeAnulacion({ nombre: 'Juan', progreso: 7, faltan: 3, completa: false }),
    ).toBe('Quedó con 7 sellos: le faltan 3 para el premio.');
    expect(
      fraseDeAnulacion({ nombre: 'Juan', progreso: 1, faltan: 1, completa: false }),
    ).toBe('Quedó con 1 sello: le falta 1 para el premio.');
  });
});
