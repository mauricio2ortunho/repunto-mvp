import { describe, expect, it } from 'vitest';

import {
  DESFASE_LA_PAZ_MINUTOS,
  ZONA_HORARIA,
  diaEnLaPaz,
  diasDelMes,
  finDelDia,
  finDelDiaEnLaPaz,
  sumarMesesCalendario,
} from './tiempo';

describe('La Paz', () => {
  it('es UTC-4 sin horario de verano', () => {
    expect(ZONA_HORARIA).toBe('America/La_Paz');
    expect(DESFASE_LA_PAZ_MINUTOS).toBe(-240);
  });
});

describe('diaEnLaPaz', () => {
  it.each([
    ['mediodia, mismo dia en las dos zonas', '2026-01-15T16:00:00.000Z', 2026, 1, 15],
    [
      '23:59 en La Paz, ya es el dia siguiente en UTC',
      '2026-02-01T03:59:00.000Z',
      2026,
      1,
      31,
    ],
    ['00:00 en La Paz', '2026-02-01T04:00:00.000Z', 2026, 2, 1],
    ['ultimo instante del dia en La Paz', '2026-02-01T03:59:59.999Z', 2026, 1, 31],
  ])('%s', (_caso, iso, anio, mes, dia) => {
    expect(diaEnLaPaz(new Date(iso))).toEqual({ anio, mes, dia });
  });
});

describe('finDelDia', () => {
  it('termina a las 23:59:59.999 de La Paz, que en UTC es 03:59:59.999 del dia siguiente', () => {
    expect(finDelDia({ anio: 2026, mes: 2, dia: 28 }).toISOString()).toBe(
      '2026-03-01T03:59:59.999Z',
    );
  });

  it('un sello a las 23:59 hora La Paz vence al final de ESE dia, no del siguiente', () => {
    const sello = new Date('2026-02-01T03:59:00.000Z'); // 31/1 a las 23:59 en La Paz
    expect(finDelDiaEnLaPaz(sello).toISOString()).toBe('2026-02-01T03:59:59.999Z');
  });
});

describe('sumarMesesCalendario', () => {
  it.each([
    ['mes calendario, no 30 dias', 2026, 1, 15, 1, { anio: 2026, mes: 2, dia: 15 }],
    [
      '31 de enero cae en el 28 de febrero',
      2026,
      1,
      31,
      1,
      { anio: 2026, mes: 2, dia: 28 },
    ],
    ['en año bisiesto, cae en el 29', 2028, 1, 31, 1, { anio: 2028, mes: 2, dia: 29 }],
    [
      '31 de marzo cae en el 30 de abril',
      2026,
      3,
      31,
      1,
      { anio: 2026, mes: 4, dia: 30 },
    ],
    ['cruza el año', 2026, 12, 15, 1, { anio: 2027, mes: 1, dia: 15 }],
    ['varios meses', 2026, 11, 30, 3, { anio: 2027, mes: 2, dia: 28 }],
  ])('%s', (_caso, anio, mes, dia, meses, esperado) => {
    expect(sumarMesesCalendario({ anio, mes, dia }, meses)).toEqual(esperado);
  });
});

describe('diasDelMes', () => {
  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])('%i-%i tiene %i dias', (anio, mes, dias) => {
    expect(diasDelMes(anio, mes)).toBe(dias);
  });
});
