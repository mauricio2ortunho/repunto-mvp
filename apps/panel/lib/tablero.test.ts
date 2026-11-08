import { describe, expect, it } from 'vitest';
import type { NegocioEnElTablero, TableroDelPiloto } from '@repunto/contratos';

import { localesQuePreocupan, totales } from './tablero';

const AHORA = '2026-11-07T16:00:00.000Z';
const hace = (dias: number) =>
  new Date(Date.parse(AHORA) - dias * 86_400_000).toISOString();

function negocio(cambios: Partial<NegocioEnElTablero> = {}): NegocioEnElTablero {
  return {
    id: '11111111-1111-4111-8111-000000000001',
    nombre: 'Cafe',
    estado: 'activo',
    sellos_semana: 10,
    sellos_mes: 40,
    canjes_mes: 2,
    clientes_activos: 25,
    clientes_nuevos_del_mes: 5,
    tarjetas_abiertas: 20,
    locales: [],
    ...cambios,
  };
}

function tablero(negocios: NegocioEnElTablero[]): TableroDelPiloto {
  return {
    generado_el: AHORA,
    inicio_del_mes: '2026-11-01T04:00:00.000Z',
    ventanas: {
      semana_dias: 7,
      mes_dias: 30,
      cliente_activo_dias: 60,
      local_sin_sellos_dias: 7,
    },
    negocios,
  };
}

const local = (nombre: string, ultimo_sello: string | null, tablets_activas = 1) => ({
  id: '22222222-2222-4222-8222-000000000001',
  nombre,
  ultimo_sello,
  tablets_activas,
});

describe('totales', () => {
  it('suma los negocios activos y deja afuera los suspendidos', () => {
    const t = tablero([
      negocio(),
      negocio({
        sellos_semana: 3,
        clientes_activos: 4,
        clientes_nuevos_del_mes: 1,
        canjes_mes: 0,
      }),
      negocio({ estado: 'suspendido', sellos_semana: 100 }),
    ]);
    expect(totales(t)).toEqual({
      sellos_semana: 13,
      clientes_activos: 29,
      clientes_nuevos_del_mes: 6,
      canjes_mes: 2,
    });
  });

  it('sin negocios, todo en cero', () => {
    expect(totales(tablero([]))).toEqual({
      sellos_semana: 0,
      clientes_activos: 0,
      clientes_nuevos_del_mes: 0,
      canjes_mes: 0,
    });
  });
});

describe('localesQuePreocupan', () => {
  it('sin tablet, nunca sello, o una semana sin sellar; el que sella no', () => {
    const t = tablero([
      negocio({
        locales: [
          local('Sin tablet', hace(1), 0),
          local('Nuevo', null),
          local('Abandonado', hace(9)),
          local('Al limite', hace(7)),
          local('Andando', hace(6)),
        ],
      }),
    ]);
    expect(localesQuePreocupan(t).map((l) => [l.local, l.motivo])).toEqual([
      ['Sin tablet', 'No tiene tablet: no puede sellar.'],
      ['Nuevo', 'Nunca selló.'],
      ['Abandonado', 'Lleva 9 días sin sellar.'],
      ['Al limite', 'Lleva 7 días sin sellar.'],
    ]);
  });

  it('los de un negocio suspendido no preocupan', () => {
    const t = tablero([negocio({ estado: 'suspendido', locales: [local('X', null)] })]);
    expect(localesQuePreocupan(t)).toEqual([]);
  });
});
