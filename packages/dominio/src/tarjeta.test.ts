import { describe, expect, it } from 'vitest';

import { AHORA, PROGRAMA, unaTarjeta, unosSellos } from './pruebas/escenario';
import {
  estaCompleta,
  estaVencida,
  faltanPara,
  ordenadosPorFecha,
  progresoDe,
  ultimoSelloDe,
  vencimientoDesde,
} from './tarjeta';

const HORA = 3_600_000;

describe('progresoDe · INV-10', () => {
  it('cuenta los sellos no anulados', () => {
    expect(progresoDe(unosSellos(4))).toBe(4);
  });

  it('no cuenta los anulados', () => {
    expect(progresoDe(unosSellos(4, { anulados: 3 }))).toBe(4);
  });

  it('una tarjeta sin sellos esta en cero', () => {
    expect(progresoDe([])).toBe(0);
  });
});

describe('estaCompleta y faltanPara', () => {
  it.each([
    [9, false, 1],
    [10, true, 0],
    [11, true, 0],
  ])('con %i sellos sobre 10: completa=%s, faltan=%i', (progreso, completa, faltan) => {
    expect(estaCompleta(progreso, PROGRAMA)).toBe(completa);
    expect(faltanPara(progreso, PROGRAMA)).toBe(faltan);
  });
});

describe('estaVencida', () => {
  it('una tarjeta sin vencimiento no vence nunca', () => {
    expect(estaVencida(unaTarjeta({ vence_el: null }), AHORA)).toBe(false);
  });

  it('el ultimo instante del dia de vencimiento todavia vale', () => {
    const vence_el = new Date('2026-09-19T03:59:59.999Z');
    expect(estaVencida(unaTarjeta({ vence_el }), vence_el)).toBe(false);
  });

  it('un milisegundo despues, vencio', () => {
    const vence_el = new Date('2026-09-19T03:59:59.999Z');
    expect(estaVencida(unaTarjeta({ vence_el }), new Date(vence_el.getTime() + 1))).toBe(
      true,
    );
  });
});

describe('vencimientoDesde · INV-13', () => {
  it.each([
    ['15 de enero', '2026-01-15T18:00:00.000Z', '2026-02-16T03:59:59.999Z'],
    [
      '31 de enero, recorta a febrero',
      '2026-01-31T18:00:00.000Z',
      '2026-03-01T03:59:59.999Z',
    ],
    [
      '23:59 del 31 de enero en La Paz',
      '2026-02-01T03:59:00.000Z',
      '2026-03-01T03:59:59.999Z',
    ],
    [
      '31 de marzo, recorta a abril',
      '2026-03-31T18:00:00.000Z',
      '2026-05-01T03:59:59.999Z',
    ],
  ])('%s', (_caso, desde, esperado) => {
    expect(vencimientoDesde(new Date(desde), 1)?.toISOString()).toBe(esperado);
  });

  it('sin vigencia, no vence', () => {
    expect(vencimientoDesde(AHORA, null)).toBeNull();
  });

  it('respeta vigencias de mas de un mes', () => {
    expect(vencimientoDesde(new Date('2026-01-31T18:00:00.000Z'), 3)?.toISOString()).toBe(
      '2026-05-01T03:59:59.999Z',
    );
  });
});

describe('ultimoSelloDe y ordenadosPorFecha', () => {
  it('el ultimo es el mas reciente no anulado', () => {
    const sellos = unosSellos(3);
    expect(ultimoSelloDe(sellos)?.id).toBe('sello-3');
  });

  it('ignora los anulados, aunque sean los mas nuevos', () => {
    const sellos = unosSellos(2, { anulados: 2 });
    expect(ultimoSelloDe(sellos)?.id).toBe('sello-2');
  });

  it('sin sellos no hay ultimo', () => {
    expect(ultimoSelloDe([])).toBeNull();
    expect(ultimoSelloDe(unosSellos(0, { anulados: 2 }))).toBeNull();
  });

  it('ordena del mas viejo al mas nuevo, con desempate estable', () => {
    const mismoInstante = new Date(AHORA.getTime() - HORA);
    const sellos = [
      { id: 'sello-b', tarjeta_id: 't', creado_el: mismoInstante, anulado: false },
      { id: 'sello-a', tarjeta_id: 't', creado_el: mismoInstante, anulado: false },
    ];
    expect(ordenadosPorFecha(sellos).map((sello) => sello.id)).toEqual([
      'sello-a',
      'sello-b',
    ]);
  });
});
