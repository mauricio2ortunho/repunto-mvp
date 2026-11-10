import { describe, expect, it } from 'vitest';

import { ACEPTA, medidasAchicadas, tipoDeRespaldo } from './imagen';

describe('medidasAchicadas', () => {
  it('lleva el lado más largo al máximo y conserva la proporción', () => {
    expect(medidasAchicadas(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasAchicadas(1000, 2000, 512)).toEqual({ ancho: 256, alto: 512 });
  });

  it('una imagen chica no se agranda', () => {
    expect(medidasAchicadas(300, 200, 512)).toEqual({ ancho: 300, alto: 200 });
  });

  it('una tira muy fina no queda en cero', () => {
    expect(medidasAchicadas(10000, 2, 512)).toEqual({ ancho: 512, alto: 1 });
  });
});

describe('formatos', () => {
  it('se ofrecen los que la api acepta, sin SVG', () => {
    expect(ACEPTA).toBe('image/png,image/jpeg,image/webp');
  });

  it('sin WebP: el logo en PNG por la transparencia, la portada en JPG', () => {
    expect(tipoDeRespaldo('logo')).toBe('image/png');
    expect(tipoDeRespaldo('portada')).toBe('image/jpeg');
  });
});
