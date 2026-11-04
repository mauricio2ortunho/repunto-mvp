import { describe, expect, it } from 'vitest';

import { LIMITES_DEL_NEGOCIO, esquemaNegocioNuevo, type NegocioNuevo } from './admin';

const valido: NegocioNuevo = {
  nombre: 'Café Aroma',
  categoria: 'cafe',
  color_principal: '#7A3E1D',
  icono_sello: 'cafe',
  plantilla_tarjeta: 'clasica',
  canje_cualquier_local: true,
  programa: {
    sellos_requeridos: 10,
    premio: 'Un café gratis',
    vigencia_meses: 1,
    horas_entre_sellos: 4,
    pide_monto: false,
  },
  condicion: { texto: 'Cualquier bebida', monto_minimo: null },
};

function con(cambio: Record<string, unknown>): Record<string, unknown> {
  return { ...valido, ...cambio };
}

function conPrograma(cambio: Record<string, unknown>): Record<string, unknown> {
  return { ...valido, programa: { ...valido.programa, ...cambio } };
}

describe('esquemaNegocioNuevo', () => {
  it('acepta un alta completa', () => {
    expect(esquemaNegocioNuevo.safeParse(valido).success).toBe(true);
  });

  it('recorta los espacios del nombre, el premio y la condicion', () => {
    const r = esquemaNegocioNuevo.parse({
      ...valido,
      nombre: '  Café Aroma ',
      programa: { ...valido.programa, premio: ' Un café ' },
      condicion: { texto: ' Un capuchino ', monto_minimo: null },
    });
    expect([r.nombre, r.programa.premio, r.condicion.texto]).toEqual([
      'Café Aroma',
      'Un café',
      'Un capuchino',
    ]);
  });

  it.each([
    ['un nombre vacio', con({ nombre: '   ' })],
    ['un nombre demasiado largo', con({ nombre: 'x'.repeat(61) })],
    ['un rubro fuera de la lista', con({ categoria: 'ferreteria' })],
    ['un color que no es #RRGGBB', con({ color_principal: 'rojo' })],
    ['un icono que no existe', con({ icono_sello: 'logo' })],
    ['una plantilla que no existe', con({ plantilla_tarjeta: 'neon' })],
    ['cero sellos', conPrograma({ sellos_requeridos: 0 })],
    ['mas sellos de los que se dibujan', conPrograma({ sellos_requeridos: 31 })],
    ['sellos con decimales', conPrograma({ sellos_requeridos: 9.5 })],
    ['un premio vacio', conPrograma({ premio: '' })],
    ['cero meses de vigencia', conPrograma({ vigencia_meses: 0 })],
    ['horas negativas', conPrograma({ horas_entre_sellos: -1 })],
    ['mas de una semana entre sellos', conPrograma({ horas_entre_sellos: 169 })],
    ['una condicion vacia', con({ condicion: { texto: '', monto_minimo: null } })],
    [
      'un monto con tres decimales',
      con({ condicion: { texto: 'x', monto_minimo: '5.123' } }),
    ],
    ['un monto negativo', con({ condicion: { texto: 'x', monto_minimo: '-5' } })],
    ['un monto como numero', con({ condicion: { texto: 'x', monto_minimo: 50 } })],
    ['sin condicion', con({ condicion: undefined })],
    ['sin programa', con({ programa: undefined })],
  ])('rechaza %s', (_, cuerpo) => {
    expect(esquemaNegocioNuevo.safeParse(cuerpo).success).toBe(false);
  });

  it('acepta una tarjeta que no vence y un monto minimo con centavos', () => {
    const r = esquemaNegocioNuevo.safeParse({
      ...conPrograma({ vigencia_meses: null }),
      condicion: { texto: 'Compra mayor a 50', monto_minimo: '49.90' },
    });
    expect(r.success).toBe(true);
  });

  it('el maximo de sellos es el que dibuja la tarjeta', () => {
    expect(LIMITES_DEL_NEGOCIO.sellosRequeridos.maximo).toBe(30);
  });
});
