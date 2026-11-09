import { describe, expect, it } from 'vitest';
import type { ClienteDelDueno } from '@repunto/contratos';

import {
  clientesQueSeVen,
  cuantosPorFiltro,
  filtroDesde,
  historiaDelCliente,
  tarjetaDelCliente,
  tienePremioParaRetirar,
} from './clientes-del-dueno';

const AHORA = new Date('2026-11-08T16:00:00.000Z');

function cliente(otros: Partial<ClienteDelDueno>): ClienteDelDueno {
  return {
    nombre: 'María Pérez',
    telefono: '+59170012345',
    sellos: 3,
    primer_sello: '2026-10-01T15:00:00.000Z',
    ultimo_sello: '2026-11-03T15:00:00.000Z',
    premios: 0,
    tarjeta: { sellos: 3, sellos_requeridos: 10, vence_el: null },
    activo: true,
    enfriado: false,
    nuevo_del_mes: false,
    ...otros,
  };
}

const maria = cliente({});
const juan = cliente({ nombre: 'Juan', telefono: '+59160009999', enfriado: true });
const lista = [
  maria,
  juan,
  cliente({ nombre: 'Nueva', telefono: '+59171111111', nuevo_del_mes: true }),
  cliente({
    nombre: 'Completa',
    telefono: '+59172222222',
    tarjeta: { sellos: 10, sellos_requeridos: 10, vence_el: null },
  }),
];

describe('filtros', () => {
  it('cada uno muestra los suyos, y cuenta cuántos hay', () => {
    expect(clientesQueSeVen(lista, 'enfriados', '')).toEqual([juan]);
    expect(clientesQueSeVen(lista, 'nuevos', '').map((c) => c.nombre)).toEqual(['Nueva']);
    expect(clientesQueSeVen(lista, 'premio', '').map((c) => c.nombre)).toEqual([
      'Completa',
    ]);
    expect(cuantosPorFiltro(lista)).toEqual({
      todos: 4,
      enfriados: 1,
      nuevos: 1,
      premio: 1,
    });
  });

  it('lo que llega por la dirección: un filtro conocido, o todos', () => {
    expect(filtroDesde('enfriados')).toBe('enfriados');
    expect(filtroDesde('cualquier cosa')).toBe('todos');
    expect(filtroDesde(undefined)).toBe('todos');
  });

  it('premio para retirar: tarjeta activa completa', () => {
    expect(tienePremioParaRetirar(maria)).toBe(false);
    expect(tienePremioParaRetirar(cliente({ tarjeta: null }))).toBe(false);
  });
});

describe('buscar', () => {
  it('por nombre, sin acentos ni mayúsculas', () => {
    expect(clientesQueSeVen(lista, 'todos', 'maria')).toEqual([maria]);
    expect(clientesQueSeVen(lista, 'todos', 'PÉREZ')).toEqual([maria]);
  });

  it('por el teléfono, con tres números o más, con espacios o sin', () => {
    expect(clientesQueSeVen(lista, 'todos', '2345')).toEqual([maria]);
    expect(clientesQueSeVen(lista, 'todos', '7001 2345')).toEqual([maria]);
    // Dos números son demasiado poco: no filtra por teléfono.
    expect(clientesQueSeVen(lista, 'todos', '45')).toEqual([]);
  });

  it('busca dentro del filtro', () => {
    expect(clientesQueSeVen(lista, 'enfriados', 'maria')).toEqual([]);
  });
});

describe('cómo se dice', () => {
  it('su historia', () => {
    expect(historiaDelCliente(maria, AHORA)).toBe('3 sellos · última visita hace 5 días');
    expect(historiaDelCliente(cliente({ sellos: 1, premios: 2 }), AHORA)).toBe(
      '1 sello · última visita hace 5 días · 2 premios',
    );
    expect(historiaDelCliente(cliente({ sellos: 0, ultimo_sello: null }), AHORA)).toBe(
      'Todavía sin sellos',
    );
  });

  it('su tarjeta', () => {
    const conFecha = (vence_el: string) =>
      cliente({ tarjeta: { sellos: 3, sellos_requeridos: 10, vence_el } });
    expect(tarjetaDelCliente(maria, AHORA)).toBe('Tarjeta: 3 de 10');
    expect(tarjetaDelCliente(conFecha('2026-12-04T03:59:59.999Z'), AHORA)).toMatch(
      /^Tarjeta: 3 de 10 · vence el 3 dic/,
    );
    // Pasó la fecha y la tarea nocturna todavía no la marcó vencida.
    expect(tarjetaDelCliente(conFecha('2026-11-07T03:59:59.999Z'), AHORA)).toMatch(
      /venció el 6 nov/,
    );
    expect(tarjetaDelCliente(lista[3] as ClienteDelDueno, AHORA)).toMatch(
      /premio para retirar/,
    );
    expect(tarjetaDelCliente(cliente({ tarjeta: null }), AHORA)).toBeNull();
  });
});
