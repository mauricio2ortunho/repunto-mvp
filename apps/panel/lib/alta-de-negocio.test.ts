import { describe, expect, it } from 'vitest';

import type { FichaDelNegocio } from '@repunto/contratos';

import {
  BORRADOR_INICIAL,
  type Borrador,
  borradorDesde,
  promoEnTexto,
  revisar,
  revisarCondicion,
  revisarDatos,
  revisarPrograma,
} from './alta-de-negocio';

const completo: Borrador = {
  ...BORRADOR_INICIAL,
  nombre: ' Café Aroma ',
  categoria: 'cafe',
  premio: 'Un café gratis',
  condicion: 'Cualquier bebida',
};

function problemasDe(b: Borrador): Record<string, string> {
  const r = revisar(b);
  return r.ok ? {} : r.problemas;
}

describe('revisar el alta', () => {
  it('con lo que trae el formulario y lo obligatorio, arma el pedido', () => {
    const r = revisar(completo);
    expect(r).toEqual({
      ok: true,
      peticion: {
        nombre: 'Café Aroma',
        categoria: 'cafe',
        color_principal: BORRADOR_INICIAL.color,
        icono_sello: BORRADOR_INICIAL.icono,
        plantilla_tarjeta: BORRADOR_INICIAL.plantilla,
        canje_cualquier_local: true,
        programa: {
          sellos_requeridos: 10,
          premio: 'Un café gratis',
          vigencia_meses: 1,
          horas_entre_sellos: 4,
          pide_monto: false,
        },
        condicion: { texto: 'Cualquier bebida', monto_minimo: null },
      },
    });
  });

  it('el formulario vacio dice todo lo que falta, campo por campo', () => {
    expect(Object.keys(problemasDe({ ...BORRADOR_INICIAL })).sort()).toEqual([
      'categoria',
      'condicion',
      'nombre',
      'premio',
    ]);
  });

  it('sin vencimiento, la vigencia viaja en null y no se revisa', () => {
    const r = revisar({ ...completo, vence: false, vigenciaMeses: 'cualquier cosa' });
    expect(r.ok && r.peticion.programa.vigencia_meses).toBeNull();
  });

  it('el monto se acepta con coma y viaja con punto', () => {
    const r = revisar({ ...completo, montoMinimo: ' 15,50 ' });
    expect(r.ok && r.peticion.condicion.monto_minimo).toBe('15.50');
  });

  it.each([
    ['sellos', { sellos: '' }],
    ['sellos', { sellos: '0' }],
    ['sellos', { sellos: '31' }],
    ['sellos', { sellos: '9.5' }],
    ['vigenciaMeses', { vigenciaMeses: '0' }],
    ['vigenciaMeses', { vigenciaMeses: '13' }],
    ['horasEntreSellos', { horasEntreSellos: '-1' }],
    ['horasEntreSellos', { horasEntreSellos: '169' }],
    ['montoMinimo', { montoMinimo: '15,555' }],
    ['montoMinimo', { montoMinimo: 'quince' }],
    ['nombre', { nombre: 'x'.repeat(61) }],
    ['color', { color: 'rojo' }],
  ] as const)('marca %s cuando %o', (campo, cambio) => {
    expect(Object.keys(problemasDe({ ...completo, ...cambio }))).toEqual([campo]);
  });

  it('cero horas entre sellos es valido: sin freno', () => {
    expect(revisar({ ...completo, horasEntreSellos: '0' }).ok).toBe(true);
  });
});

describe('promoEnTexto', () => {
  it('dice sellos y premio como en la app', () => {
    expect(promoEnTexto(10, 'Un café')).toBe('10 sellos → Un café');
    expect(promoEnTexto(1, 'Un café')).toBe('1 sello → Un café');
  });
});

describe('cada parte por separado, como la guarda la ficha', () => {
  it('la promo no mira el nombre ni la condicion', () => {
    const r = revisarPrograma({ ...BORRADOR_INICIAL, premio: 'Un pan' });
    expect(r).toEqual({
      ok: true,
      peticion: {
        sellos_requeridos: 10,
        premio: 'Un pan',
        vigencia_meses: 1,
        horas_entre_sellos: 4,
        pide_monto: false,
      },
    });
  });

  it('la condicion no mira la promo', () => {
    const r = revisarCondicion({ ...BORRADOR_INICIAL, condicion: ' Un pan ' });
    expect(r).toEqual({ ok: true, peticion: { texto: 'Un pan', monto_minimo: null } });
  });

  it('los datos solo marcan lo suyo', () => {
    const r = revisarDatos({ ...BORRADOR_INICIAL });
    expect(r.ok ? [] : Object.keys(r.problemas).sort()).toEqual(['categoria', 'nombre']);
  });
});

describe('borradorDesde', () => {
  const ficha: FichaDelNegocio = {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Café Aroma',
    categoria: 'cafe',
    estado: 'activo',
    color_principal: '#7A3E1D',
    logo_url: null,
    icono_sello: 'corazon',
    plantilla_tarjeta: 'moderna',
    canje_cualquier_local: false,
    locales_activos: 1,
    tarjetas_en_curso: 3,
    locales: [],
    personas: [],
    tablets: [],
    creado_el: '2026-11-04T12:00:00.000Z',
    programa: {
      version: 2,
      sellos_requeridos: 8,
      premio: 'Un café',
      vigencia_meses: null,
      horas_entre_sellos: 0,
      pide_monto: true,
      desde: '2026-11-04T12:00:00.000Z',
    },
    condiciones: [
      {
        texto: 'Un capuchino',
        monto_minimo: '15.50',
        vigente_desde: '2026-11-04T12:00:00.000Z',
        autor: { tipo: 'administracion' },
      },
    ],
  };

  it('llena el formulario con lo que el negocio tiene hoy', () => {
    expect(borradorDesde(ficha)).toEqual({
      nombre: 'Café Aroma',
      categoria: 'cafe',
      color: '#7A3E1D',
      icono: 'corazon',
      plantilla: 'moderna',
      canjeCualquierLocal: false,
      sellos: '8',
      premio: 'Un café',
      vence: false,
      vigenciaMeses: '1',
      horasEntreSellos: '0',
      pideMonto: true,
      condicion: 'Un capuchino',
      montoMinimo: '15,50',
    });
  });

  it('lo que se carga de vuelta pasa la revision sin cambios', () => {
    const b = borradorDesde(ficha);
    expect([revisarDatos(b).ok, revisarPrograma(b).ok, revisarCondicion(b).ok]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('un rubro o un icono que este panel no conoce no rompe el formulario', () => {
    const b = borradorDesde({ ...ficha, categoria: 'nuevo', icono_sello: 'logo' });
    expect([b.categoria, b.icono]).toEqual(['otro', 'estrella']);
  });
});
