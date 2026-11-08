import { describe, expect, it } from 'vitest';

import {
  enlaceDelMapa,
  enlaceParaLlegar,
  leerUbicacion,
  textoDeUbicacion,
} from './ubicacion';

const PLAZA = { latitud: -17.783312, longitud: -63.182104 };

describe('leerUbicacion', () => {
  it.each([
    ['-17.783312, -63.182104', 'como lo copia Google Maps'],
    ['  -17.783312,-63.182104  ', 'sin espacio y con espacios alrededor'],
    ['-17.783312 -63.182104', 'separadas por espacio'],
    ['(-17.783312, -63.182104)', 'entre parentesis'],
    ['-17,783312 -63,182104', 'con coma decimal'],
    ['-17,783312; -63,182104', 'con coma decimal y punto y coma'],
    [
      'https://www.google.com/maps/place/Plaza+24+de+Septiembre/@-17.7834,-63.1822,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-17.783312!4d-63.182104',
      'enlace de un lugar: manda el pin, no el centro',
    ],
    ['https://www.google.com/maps/@-17.783312,-63.182104,18z', 'enlace con el centro'],
    ['https://www.google.com/maps?q=-17.783312,-63.182104', 'enlace con q='],
    [
      'https://www.google.com/maps/search/?api=1&query=-17.783312%2C-63.182104',
      'enlace de busqueda con la coma escapada',
    ],
  ])('lee %s (%s)', (texto) => {
    expect(leerUbicacion(texto)).toEqual({ ok: true, ubicacion: PLAZA });
  });

  it('redondea a seis decimales', () => {
    expect(leerUbicacion('-17.78331249, -63.18210449')).toEqual({
      ok: true,
      ubicacion: PLAZA,
    });
  });

  it('vacia', () => {
    expect(leerUbicacion('   ')).toEqual({ ok: false, motivo: 'vacia' });
  });

  it.each(['https://maps.app.goo.gl/AbCdEf123', 'https://goo.gl/maps/xyz'])(
    'un enlace corto no trae las coordenadas: %s',
    (texto) => {
      expect(leerUbicacion(texto)).toEqual({ ok: false, motivo: 'enlace_corto' });
    },
  );

  it.each(['Av. San Martín 200', 'https://www.google.com/maps/place/Algo', '-17.78'])(
    'ilegible: %s',
    (texto) => {
      expect(leerUbicacion(texto)).toEqual({ ok: false, motivo: 'ilegible' });
    },
  );

  it('fuera de rango', () => {
    expect(leerUbicacion('-117.7, -63.1')).toEqual({
      ok: false,
      motivo: 'fuera_de_rango',
    });
    expect(leerUbicacion('-17.7, -263.1')).toEqual({
      ok: false,
      motivo: 'fuera_de_rango',
    });
  });
});

describe('enlaces', () => {
  it('texto para volver a editarla, que se vuelve a leer igual', () => {
    expect(textoDeUbicacion(PLAZA)).toBe('-17.783312, -63.182104');
    expect(leerUbicacion(textoDeUbicacion(PLAZA))).toEqual({
      ok: true,
      ubicacion: PLAZA,
    });
  });

  it('el mapa pone el pin en el punto', () => {
    expect(enlaceDelMapa(PLAZA)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-17.783312,-63.182104',
    );
  });

  it('como llegar va al punto marcado', () => {
    expect(enlaceParaLlegar({ ubicacion: PLAZA, direccion: 'Calle Junín 45' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-17.783312,-63.182104',
    );
  });

  it('sin punto marcado, busca la direccion en Santa Cruz', () => {
    const enlace = enlaceParaLlegar({ ubicacion: null, direccion: 'Calle Junín 45' });
    expect(enlace.startsWith('https://www.google.com/maps/dir/?api=1&destination=')).toBe(
      true,
    );
    expect(decodeURIComponent(enlace.split('destination=')[1] ?? '')).toBe(
      'Calle Junín 45, Santa Cruz de la Sierra, Bolivia',
    );
  });
});
