import type { NegocioDelDirectorio } from '@repunto/contratos';
import { describe, expect, it } from 'vitest';

import { agruparPorRubro, promoDe } from './directorio';

function negocio(id: string, categoria: string): NegocioDelDirectorio {
  return {
    id,
    nombre: `Negocio ${id}`,
    categoria,
    color_principal: '#2E5D4B',
    logo_url: null,
    portada_url: null,
    plantilla_tarjeta: 'clasica',
    icono_sello: 'cafe',
    premio: 'Un cafe',
    sellos_requeridos: 10,
    locales: [{ nombre: 'Centro', direccion: 'Calle Sucre 45', ubicacion: null }],
  };
}

describe('agruparPorRubro', () => {
  it('agrupa por rubro, en el orden de la lista, y respeta el orden de los negocios', () => {
    // Asi llegan de la api: por categoria en orden alfabetico, 'otro' antes
    // que 'panaderia'.
    const rubros = agruparPorRubro(
      [
        negocio('a', 'cafe'),
        negocio('b', 'cafe'),
        negocio('x', 'otro'),
        negocio('c', 'panaderia'),
      ],
      new Set(),
    );

    expect(rubros.map((r) => [r.titulo, r.negocios.map((n) => n.negocio.id)])).toEqual([
      ['Cafeterías', ['a', 'b']],
      ['Panaderías y pastelerías', ['c']],
      ['Otros', ['x']],
    ]);
  });

  it('marca solo los negocios donde el cliente ya tiene tarjeta', () => {
    const [rubro] = agruparPorRubro(
      [negocio('a', 'cafe'), negocio('b', 'cafe')],
      new Set(['b']),
    );

    expect(rubro?.negocios.map((n) => n.tieneTarjeta)).toEqual([false, true]);
  });

  it('sin negocios, ningun rubro', () => {
    expect(agruparPorRubro([], new Set())).toEqual([]);
  });

  it('un rubro que la app no conoce va a "Otros", junto con los de "otro"', () => {
    const rubros = agruparPorRubro(
      [negocio('a', 'otro'), negocio('b', 'veterinaria')],
      new Set(),
    );

    expect(rubros.map((r) => [r.titulo, r.negocios.map((n) => n.negocio.id)])).toEqual([
      ['Otros', ['a', 'b']],
    ]);
  });
});

describe('promoDe', () => {
  it('dice cuantos sellos y que premio', () => {
    expect(promoDe({ sellos_requeridos: 10, premio: 'Un café gratis' })).toBe(
      '10 sellos → Un café gratis',
    );
    expect(promoDe({ sellos_requeridos: 1, premio: 'Un postre' })).toBe(
      '1 sello → Un postre',
    );
  });
});
