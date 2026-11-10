import { describe, expect, it } from 'vitest';

import {
  LIMITES_DEL_LOCAL,
  LIMITES_DEL_NEGOCIO,
  esquemaDatosDelLocal,
  esquemaPersonaNueva,
  esquemaPinNuevo,
  esquemaNegocioNuevo,
  type NegocioNuevo,
} from './admin';

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
    ['un icono que no existe', con({ icono_sello: 'cupcake' })],
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

describe('esquemaDatosDelLocal', () => {
  const local = { nombre: 'Equipetrol', direccion: 'Av. San Martín 123' };

  it('acepta nombre y dirección, sin espacios de más', () => {
    expect(
      esquemaDatosDelLocal.parse({ nombre: ' Centro ', direccion: local.direccion }),
    ).toEqual({ nombre: 'Centro', direccion: local.direccion, ubicacion: null });
  });

  it('pide los dos, no vacíos ni más largos que el límite', () => {
    for (const cuerpo of [
      { nombre: local.nombre },
      { direccion: local.direccion },
      { ...local, nombre: '   ' },
      { ...local, nombre: 'x'.repeat(LIMITES_DEL_LOCAL.nombre + 1) },
      { ...local, direccion: 'x'.repeat(LIMITES_DEL_LOCAL.direccion + 1) },
    ]) {
      expect(esquemaDatosDelLocal.safeParse(cuerpo).success).toBe(false);
    }
  });

  it('el QR no viaja: lo pone la api', () => {
    expect(esquemaDatosDelLocal.parse({ ...local, qr_slug: 'elegido' })).toEqual({
      ...local,
      ubicacion: null,
    });
  });
});

describe('esquemaPersonaNueva', () => {
  const LOCAL = '11111111-1111-4111-8111-111111111111';
  const cajera = { nombre: 'Ana', rol: 'cajero', telefono: null, locales: [LOCAL] };
  const duena = { nombre: 'Rocío', rol: 'dueno', telefono: '70012345', locales: [] };

  it('acepta una cajera con local y un dueño con teléfono y sin locales', () => {
    expect(esquemaPersonaNueva.safeParse(cajera).success).toBe(true);
    expect(esquemaPersonaNueva.safeParse(duena).success).toBe(true);
  });

  it('el dueño necesita teléfono; supervisor y cajero no lo llevan', () => {
    expect(esquemaPersonaNueva.safeParse({ ...duena, telefono: null }).success).toBe(
      false,
    );
    expect(
      esquemaPersonaNueva.safeParse({ ...cajera, telefono: '70012345' }).success,
    ).toBe(false);
  });

  it('supervisor y cajero tienen que estar en algún local, sin repetir', () => {
    expect(esquemaPersonaNueva.safeParse({ ...cajera, locales: [] }).success).toBe(false);
    expect(
      esquemaPersonaNueva.safeParse({ ...cajera, rol: 'supervisor', locales: [] })
        .success,
    ).toBe(false);
    expect(
      esquemaPersonaNueva.safeParse({ ...cajera, locales: [LOCAL, LOCAL] }).success,
    ).toBe(false);
  });

  it('el PIN no viaja en el alta', () => {
    expect(esquemaPersonaNueva.parse({ ...cajera, pin: '1234' })).not.toHaveProperty(
      'pin',
    );
  });
});

describe('esquemaPinNuevo', () => {
  it('son cuatro dígitos, ni más ni menos', () => {
    expect(esquemaPinNuevo.safeParse({ pin: '0042' }).success).toBe(true);
    for (const pin of ['123', '12345', '12a4', ' 1234']) {
      expect(esquemaPinNuevo.safeParse({ pin }).success).toBe(false);
    }
  });
});
