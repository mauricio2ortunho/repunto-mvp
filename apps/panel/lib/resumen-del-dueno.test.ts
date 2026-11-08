import { describe, expect, it } from 'vitest';
import type { ResumenDelDueno } from '@repunto/contratos';

import {
  localesParaElDueno,
  pieDeVolvieron,
  porcentaje,
  textoDeFrecuencia,
} from './resumen-del-dueno';

const AHORA = '2026-11-08T16:00:00.000Z';
const HORA = 3_600_000;
const haceHoras = (h: number) => new Date(Date.parse(AHORA) - h * HORA).toISOString();

function resumen(locales: ResumenDelDueno['locales']): ResumenDelDueno {
  return {
    generado_el: AHORA,
    inicio_del_mes: '2026-11-01T04:00:00.000Z',
    ventanas: {
      semana_dias: 7,
      mes_dias: 30,
      cliente_activo_dias: 60,
      enfriado_dias: 30,
      sellos_para_enfriado: 3,
      local_sin_sellos_dias: 7,
    },
    clientes: {
      con_sellos: 0,
      activos: 0,
      nuevos_del_mes: 0,
      volvieron: 0,
      enfriados: 0,
    },
    visitas: {
      sellos_semana: 0,
      sellos_mes: 0,
      regresos_mes: 0,
      dias_entre_visitas: null,
    },
    premios: { canjes_mes: 0, tarjetas_abiertas: 0, listas_para_canjear: 0 },
    locales,
  };
}

const ID = '11111111-1111-4111-8111-000000000001';

describe('porcentaje', () => {
  it('redondeado, sobre los que tienen sellos', () => {
    expect(porcentaje(2, 3)).toBe('67 %');
    expect(porcentaje(0, 4)).toBe('0 %');
  });

  it('sin clientes no hay porcentaje: no es un cero', () => {
    expect(porcentaje(0, 0)).toBeNull();
  });
});

describe('pieDeVolvieron', () => {
  const clientes = { activos: 0, nuevos_del_mes: 0, enfriados: 0 };

  it('el porcentaje sobre los que tienen sellos', () => {
    expect(pieDeVolvieron({ ...clientes, con_sellos: 3, volvieron: 2 })).toBe(
      '67 % de tus 3 clientes',
    );
  });

  it('con un solo cliente, en singular', () => {
    expect(pieDeVolvieron({ ...clientes, con_sellos: 1, volvieron: 1 })).toBe(
      'De tu único cliente con sellos',
    );
  });

  it('sin clientes, lo dice', () => {
    expect(pieDeVolvieron({ ...clientes, con_sellos: 0, volvieron: 0 })).toBe(
      'Todavía nadie juntó sellos.',
    );
  });
});

describe('textoDeFrecuencia', () => {
  it('se dice como se dice', () => {
    expect(textoDeFrecuencia(6.4)).toBe('cada 6 días');
    expect(textoDeFrecuencia(1.2)).toBe('cada día');
    expect(textoDeFrecuencia(0.2)).toBe('el mismo día');
  });

  it('si nadie volvió todavía, no hay frecuencia', () => {
    expect(textoDeFrecuencia(null)).toBeNull();
  });
});

describe('localesParaElDueno', () => {
  it('cada local con sus sellos de la semana y su último sello', () => {
    const [local] = localesParaElDueno(
      resumen([
        {
          id: ID,
          nombre: 'Equipetrol',
          sellos_semana: 9,
          ultimo_sello: haceHoras(2),
          tablets_activas: 1,
        },
      ]),
    );
    expect(local).toEqual({
      id: ID,
      nombre: 'Equipetrol',
      detalle: '9 sellos en 7 días · último sello hace 2 h',
      alerta: null,
    });
  });

  it('avisa lo mismo que el tablero del piloto', () => {
    const locales = localesParaElDueno(
      resumen([
        {
          id: ID,
          nombre: 'Sin tablet',
          sellos_semana: 0,
          ultimo_sello: null,
          tablets_activas: 0,
        },
        {
          id: ID,
          nombre: 'Nuevo',
          sellos_semana: 0,
          ultimo_sello: null,
          tablets_activas: 1,
        },
        {
          id: ID,
          nombre: 'Quieto',
          sellos_semana: 0,
          ultimo_sello: haceHoras(9 * 24),
          tablets_activas: 1,
        },
      ]),
    );
    expect(locales.map((l) => [l.nombre, l.detalle, l.alerta])).toEqual([
      [
        'Sin tablet',
        '0 sellos en 7 días · todavía no selló',
        'No tiene tablet: no puede sellar.',
      ],
      ['Nuevo', '0 sellos en 7 días · todavía no selló', 'Nunca selló.'],
      [
        'Quieto',
        '0 sellos en 7 días · último sello hace 9 días',
        'Lleva 9 días sin sellar.',
      ],
    ]);
  });

  it('un sello, en singular', () => {
    const [local] = localesParaElDueno(
      resumen([
        {
          id: ID,
          nombre: 'Centro',
          sellos_semana: 1,
          ultimo_sello: haceHoras(30),
          tablets_activas: 1,
        },
      ]),
    );
    expect(local?.detalle).toBe('1 sello en 7 días · último sello ayer');
  });
});
