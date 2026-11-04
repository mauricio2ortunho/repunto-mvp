import { describe, expect, it } from 'vitest';
import type { NegocioDelAdmin } from '@repunto/contratos';

import { avisosDelNegocio, localesEnTexto } from './negocios-del-admin';

const listo: NegocioDelAdmin = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Café Aroma',
  categoria: 'cafe',
  estado: 'activo',
  color_principal: '#7A3E1D',
  logo_url: null,
  icono_sello: 'cafe',
  plantilla_tarjeta: 'clasica',
  locales_activos: 1,
  programa: { sellos_requeridos: 10, premio: 'Un café' },
  condicion: { texto: 'Cualquier bebida' },
  creado_el: '2026-11-04T12:00:00.000Z',
};

describe('avisosDelNegocio', () => {
  it('un negocio con promo, condicion y un local abierto no tiene avisos', () => {
    expect(avisosDelNegocio(listo)).toEqual([]);
  });

  it('recien dado de alta, le falta solo el local', () => {
    const avisos = avisosDelNegocio({ ...listo, locales_activos: 0 });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Dónde juntar sellos');
  });

  it('cargado a mano sin promo ni condicion, avisa las dos cosas', () => {
    expect(avisosDelNegocio({ ...listo, programa: null, condicion: null })).toHaveLength(
      2,
    );
  });
});

describe('localesEnTexto', () => {
  it('cuenta en singular y plural', () => {
    expect([0, 1, 3].map(localesEnTexto)).toEqual([
      'Sin locales',
      '1 local',
      '3 locales',
    ]);
  });
});
