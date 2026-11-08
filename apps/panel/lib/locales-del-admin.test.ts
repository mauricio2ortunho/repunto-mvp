import { describe, expect, it } from 'vitest';
import {
  type FichaDelNegocio,
  LIMITES_DEL_LOCAL,
  type LocalDelAdmin,
} from '@repunto/contratos';

import {
  borradorDeLocal,
  confirmacionDeCierre,
  revisarLocal,
  vistaDeUbicacion,
} from './locales-del-admin';

describe('revisarLocal', () => {
  it('manda nombre y dirección sin espacios de más', () => {
    expect(
      revisarLocal({ nombre: ' Centro ', direccion: ' Calle Junín 45 ', ubicacion: ' ' }),
    ).toEqual({
      ok: true,
      peticion: { nombre: 'Centro', direccion: 'Calle Junín 45', ubicacion: null },
    });
  });

  it('marca cada campo vacío con lo que hay que escribir', () => {
    const r = revisarLocal({ nombre: '  ', direccion: '', ubicacion: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.problemas).sort()).toEqual(['direccion', 'nombre']);
  });

  it('marca lo que pasa del límite', () => {
    const r = revisarLocal({
      nombre: 'x'.repeat(LIMITES_DEL_LOCAL.nombre + 1),
      direccion: 'x'.repeat(LIMITES_DEL_LOCAL.direccion + 1),
      ubicacion: '',
    });
    expect(r).toEqual({
      ok: false,
      problemas: {
        nombre: `Hasta ${LIMITES_DEL_LOCAL.nombre} letras.`,
        direccion: `Hasta ${LIMITES_DEL_LOCAL.direccion} letras.`,
      },
    });
  });
});

describe('confirmacionDeCierre', () => {
  const local = (id: string, activo: boolean): LocalDelAdmin => ({
    id,
    nombre: `Local ${id}`,
    direccion: 'Calle 1',
    activo,
    qr_slug: `qr${id}`,
    ubicacion: null,
  });
  const ficha = (locales: LocalDelAdmin[]) => ({ locales }) as FichaDelNegocio;

  it('si quedan otros abiertos, dice solo lo del local', () => {
    const a = local('a', true);
    const aviso = confirmacionDeCierre(ficha([a, local('b', true)]), a);
    expect(aviso).toContain('tablets dejan de sellar');
    expect(aviso).not.toContain('Dónde juntar sellos');
  });

  it('si es el último abierto, avisa que el negocio desaparece del directorio', () => {
    const a = local('a', true);
    expect(confirmacionDeCierre(ficha([a, local('b', false)]), a)).toContain(
      'es el último abierto',
    );
  });

  it('borradorDeLocal toma nombre y dirección, no el QR', () => {
    expect(borradorDeLocal(local('a', true))).toEqual({
      nombre: 'Local a',
      direccion: 'Calle 1',
      ubicacion: '',
    });
  });

  it('borradorDeLocal escribe la ubicación como se vuelve a leer', () => {
    const conPunto = { ...local('a', true), ubicacion: PLAZA };
    expect(borradorDeLocal(conPunto).ubicacion).toBe('-17.783312, -63.182104');
  });
});

const PLAZA = { latitud: -17.783312, longitud: -63.182104 };

describe('la ubicación en revisarLocal', () => {
  const base = { nombre: 'Centro', direccion: 'Calle Junín 45' };

  it('manda la que se pegó', () => {
    expect(revisarLocal({ ...base, ubicacion: '-17.783312, -63.182104' })).toEqual({
      ok: true,
      peticion: { ...base, ubicacion: PLAZA },
    });
  });

  it('un enlace corto explica cómo copiar los números', () => {
    const r = revisarLocal({ ...base, ubicacion: 'https://maps.app.goo.gl/abc' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemas.ubicacion).toMatch(/mantené apretado/);
  });

  it('lo que no se entiende no se manda', () => {
    const r = revisarLocal({ ...base, ubicacion: 'por la plaza' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.problemas)).toEqual(['ubicacion']);
  });
});

describe('vistaDeUbicacion', () => {
  it('con una ubicación leíble, el enlace para revisarla', () => {
    expect(vistaDeUbicacion('-17.783312, -63.182104')).toEqual({
      enlace: 'https://www.google.com/maps/search/?api=1&query=-17.783312,-63.182104',
      aviso: null,
    });
  });

  it('al revés queda fuera de Bolivia, y lo avisa', () => {
    expect(vistaDeUbicacion('-63.182104, -17.783312').aviso).toMatch(/fuera de Bolivia/);
  });

  it('sin nada leíble, nada', () => {
    expect(vistaDeUbicacion('hola')).toEqual({ enlace: null, aviso: null });
  });
});
