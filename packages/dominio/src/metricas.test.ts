import { describe, expect, it } from 'vitest';

import { inicioDelMesEnLaPaz } from './metricas';

describe('inicioDelMesEnLaPaz', () => {
  it('a mitad de mes, la 00:00 del dia 1 en La Paz, que son las 04:00 UTC', () => {
    expect(inicioDelMesEnLaPaz(new Date('2026-11-07T16:00:00Z')).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('el 1 a las 00:30 de La Paz ya es el mes nuevo', () => {
    expect(inicioDelMesEnLaPaz(new Date('2026-11-01T04:30:00Z')).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('el 31 a las 23:59 de La Paz sigue siendo el mes viejo, aunque en UTC ya sea el 1', () => {
    expect(inicioDelMesEnLaPaz(new Date('2026-11-01T03:59:00Z')).toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    );
  });

  it('en enero, el mes empieza en el año nuevo', () => {
    expect(inicioDelMesEnLaPaz(new Date('2027-01-15T12:00:00Z')).toISOString()).toBe(
      '2027-01-01T04:00:00.000Z',
    );
  });
});
