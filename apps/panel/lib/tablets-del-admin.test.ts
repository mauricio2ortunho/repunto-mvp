import { describe, expect, it } from 'vitest';
import type { FichaDelNegocio, TabletDelAdmin } from '@repunto/contratos';

import {
  DIAS_SIN_SELLOS_PARA_ALERTA,
  haceCuanto,
  saludDeTablet,
  tabletsDelLocal,
  textoDeRevocada,
} from './tablets-del-admin';

const AHORA = new Date('2026-11-07T16:00:00.000Z');
const LOCAL = '11111111-1111-4111-8111-000000000001';
const OTRO = '11111111-1111-4111-8111-000000000002';

function hace(ms: number): string {
  return new Date(AHORA.getTime() - ms).toISOString();
}
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

function tablet(cambios: Partial<TabletDelAdmin> = {}): TabletDelAdmin {
  return {
    id: '22222222-2222-4222-8222-000000000001',
    local_id: LOCAL,
    nombre: 'Caja 1',
    vinculada_el: hace(30 * DIA),
    revocada_el: null,
    ultimo_sello: hace(2 * HORA),
    ultimo_intento: hace(2 * HORA),
    ultimo_rechazo: null,
    ...cambios,
  };
}

describe('haceCuanto', () => {
  it.each([
    [10_000, 'hace un momento'],
    [5 * MIN, 'hace 5 min'],
    [3 * HORA + 20 * MIN, 'hace 3 h'],
    [DIA + HORA, 'ayer'],
    [12 * DIA, 'hace 12 días'],
  ])('%i ms atras es "%s"', (ms, texto) => {
    expect(haceCuanto(hace(ms), AHORA)).toBe(texto);
  });

  it('un instante del futuro (reloj adelantado) es "hace un momento"', () => {
    expect(haceCuanto(new Date(AHORA.getTime() + HORA).toISOString(), AHORA)).toBe(
      'hace un momento',
    );
  });
});

describe('saludDeTablet', () => {
  it('una que sello hace poco no preocupa', () => {
    expect(saludDeTablet(tablet(), AHORA)).toEqual({
      texto: 'Último sello hace 2 h',
      alerta: null,
    });
  });

  it('recien vinculada y sin sellos todavia no preocupa', () => {
    const t = tablet({ vinculada_el: hace(2 * DIA), ultimo_sello: null });
    expect(saludDeTablet(t, AHORA)).toEqual({ texto: 'Todavía no selló', alerta: null });
  });

  it(`a los ${DIAS_SIN_SELLOS_PARA_ALERTA} dias sin sellar avisa que puede estar abandonada`, () => {
    const t = tablet({ ultimo_sello: hace(DIAS_SIN_SELLOS_PARA_ALERTA * DIA) });
    expect(saludDeTablet(t, AHORA).alerta).toBe(
      `Lleva ${DIAS_SIN_SELLOS_PARA_ALERTA} días sin sellar: puede que no la estén usando.`,
    );
  });

  it('un dia antes, no', () => {
    const t = tablet({ ultimo_sello: hace((DIAS_SIN_SELLOS_PARA_ALERTA - 1) * DIA) });
    expect(saludDeTablet(t, AHORA).alerta).toBeNull();
  });

  it('vinculada hace mucho y nunca uso: lo dice asi', () => {
    const t = tablet({ vinculada_el: hace(10 * DIA), ultimo_sello: null });
    expect(saludDeTablet(t, AHORA).alerta).toBe(
      'Vinculada hace 10 días y nunca selló: puede que no la estén usando.',
    );
  });

  it('si la intentan usar y la caja rechaza, muestra lo que vio el cajero', () => {
    const t = tablet({
      ultimo_sello: hace(9 * DIA),
      ultimo_rechazo: 'PROMO_NO_CONFIGURADA',
    });
    expect(saludDeTablet(t, AHORA).alerta).toMatch(
      /^Lleva 9 días sin sellar\. Lo último que le rechazó la caja: "Falta configurar la promo/,
    );
  });

  it('un codigo desconocido no rompe: queda el aviso de abandono', () => {
    const t = tablet({ ultimo_sello: hace(9 * DIA), ultimo_rechazo: 'ALGO_NUEVO' });
    expect(saludDeTablet(t, AHORA).alerta).toBe(
      'Lleva 9 días sin sellar: puede que no la estén usando.',
    );
  });
});

describe('tabletsDelLocal', () => {
  it('separa activas y revocadas, solo de ese local', () => {
    const activa = tablet();
    const revocada = tablet({ id: 'r', revocada_el: hace(DIA) });
    const ajena = tablet({ id: 'a', local_id: OTRO });
    const ficha = { tablets: [activa, revocada, ajena] } as FichaDelNegocio;

    expect(tabletsDelLocal(ficha, LOCAL)).toEqual({
      activas: [activa],
      revocadas: [revocada],
    });
  });
});

describe('textoDeRevocada', () => {
  it('nombre y fecha', () => {
    const t = tablet({ revocada_el: hace(DIA) });
    expect(textoDeRevocada(t, () => '6 nov 2026, 12:00')).toBe(
      'Caja 1, revocada el 6 nov 2026, 12:00',
    );
  });
});
