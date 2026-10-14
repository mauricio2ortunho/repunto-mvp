process.env['TZ'] = 'Pacific/Kiritimati'; // las fechas tienen que salir en La Paz igual

import { describe, expect, it } from 'vitest';

import { ESTADOS_DE_TARJETA_DEL_CLIENTE } from '@repunto/contratos';

import { explicacionDeEstado, tituloDeEstado, vencimientoDe } from './frases';

describe('tituloDeEstado', () => {
  it('cuenta lo que falta, en singular y en plural', () => {
    expect(tituloDeEstado({ estado: 'en_curso', faltan: 1 })).toBe('Te falta 1 sello');
    expect(tituloDeEstado({ estado: 'en_curso', faltan: 6 })).toBe('Te faltan 6 sellos');
  });

  it('cada estado tiene titulo y explicacion', () => {
    for (const estado of ESTADOS_DE_TARJETA_DEL_CLIENTE) {
      expect(tituloDeEstado({ estado, faltan: 3 }).length, estado).toBeGreaterThan(5);
      expect(explicacionDeEstado(estado).length, estado).toBeGreaterThan(10);
    }
  });
});

describe('vencimientoDe', () => {
  // Mediodia del 12 de octubre en La Paz.
  const AHORA = Date.parse('2026-10-12T16:00:00Z');

  it('sin sellos no vence: no se dice nada (INV-12)', () => {
    expect(vencimientoDe({ estado: 'en_curso', vence_el: null }, AHORA)).toBeNull();
  });

  it('esta noche, mañana, o la fecha con los dias que quedan', () => {
    expect(
      vencimientoDe({ estado: 'en_curso', vence_el: '2026-10-13T03:59:59.999Z' }, AHORA),
    ).toBe('Vence hoy');
    expect(
      vencimientoDe({ estado: 'en_curso', vence_el: '2026-10-14T03:59:59.999Z' }, AHORA),
    ).toBe('Vence mañana');
    expect(
      vencimientoDe({ estado: 'completa', vence_el: '2026-11-13T03:59:59.999Z' }, AHORA),
    ).toBe('Vence el 12 de noviembre · quedan 31 días');
  });

  it('en una vencida, canjeada o congelada ya no importa', () => {
    const vence_el = '2026-11-13T03:59:59.999Z';
    expect(vencimientoDe({ estado: 'vencida', vence_el }, AHORA)).toBeNull();
    expect(vencimientoDe({ estado: 'canjeada', vence_el }, AHORA)).toBeNull();
    expect(vencimientoDe({ estado: 'congelada', vence_el }, AHORA)).toBeNull();
  });
});
