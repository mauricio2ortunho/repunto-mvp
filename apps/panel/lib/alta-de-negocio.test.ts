import { describe, expect, it } from 'vitest';

import {
  BORRADOR_INICIAL,
  type Borrador,
  promoEnTexto,
  revisar,
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
