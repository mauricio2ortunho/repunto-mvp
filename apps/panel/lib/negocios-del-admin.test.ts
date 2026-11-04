import { describe, expect, it } from 'vitest';
import type { NegocioDelAdmin } from '@repunto/contratos';

import {
  autorDe,
  avisoDeTarjetasEnCurso,
  avisosDelNegocio,
  describirPrograma,
  localesEnTexto,
} from './negocios-del-admin';

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

describe('describirPrograma', () => {
  const p = {
    version: 1,
    sellos_requeridos: 10,
    premio: 'Un café',
    vigencia_meses: 1,
    horas_entre_sellos: 4,
    pide_monto: false,
    desde: '2026-11-04T12:00:00.000Z',
  };

  it('la promo del piloto', () => {
    expect(describirPrograma(p)).toEqual([
      'Vence al mes del primer sello',
      '4 horas mínimas entre sellos',
    ]);
  });

  it('sin vencimiento, sin freno y pidiendo monto', () => {
    expect(
      describirPrograma({
        ...p,
        vigencia_meses: null,
        horas_entre_sellos: 0,
        pide_monto: true,
      }),
    ).toEqual([
      'La tarjeta no vence',
      'Sin mínimo entre sellos',
      'Pide el monto de la compra',
    ]);
  });

  it('varios meses y una hora', () => {
    expect(describirPrograma({ ...p, vigencia_meses: 3, horas_entre_sellos: 1 })).toEqual(
      ['Vence a los 3 meses del primer sello', '1 hora mínima entre sellos'],
    );
  });
});

describe('avisoDeTarjetasEnCurso', () => {
  it('dice cuantas siguen con la promo actual', () => {
    expect(avisoDeTarjetasEnCurso(0)).toMatch(/^No hay tarjetas en curso/);
    expect(avisoDeTarjetasEnCurso(1)).toMatch(
      /^1 tarjeta en curso sigue con la promo actual/,
    );
    expect(avisoDeTarjetasEnCurso(12)).toMatch(/^12 tarjetas en curso siguen/);
  });
});

describe('autorDe', () => {
  it('Administracion o el nombre de quien la escribio', () => {
    const base = {
      texto: 'x',
      monto_minimo: null,
      vigente_desde: '2026-11-04T12:00:00.000Z',
    };
    expect(autorDe({ ...base, autor: { tipo: 'administracion' } })).toBe(
      'Administración',
    );
    expect(autorDe({ ...base, autor: { tipo: 'negocio', nombre: 'Marta' } })).toBe(
      'Marta',
    );
  });
});
