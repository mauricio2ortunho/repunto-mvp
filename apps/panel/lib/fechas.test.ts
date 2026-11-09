import { describe, expect, it } from 'vitest';

import { fecha, fechaYHora } from './fechas';

describe('fechaYHora', () => {
  it('muestra la hora de La Paz, cuatro horas menos que UTC', () => {
    expect(fechaYHora('2026-11-04T12:00:00.000Z')).toContain('08:00');
  });

  it('un instante de madrugada en UTC cae el dia anterior en La Paz', () => {
    expect(fechaYHora('2026-11-05T02:30:00.000Z')).toMatch(/^4 .*22:30$/);
  });
});

describe('fecha', () => {
  it('es el día de La Paz: el fin del día allá ya es el siguiente en UTC', () => {
    // 23:59:59.999 del 12 de diciembre en La Paz.
    expect(fecha('2026-12-13T03:59:59.999Z')).toMatch(/^12 dic/);
  });
});
