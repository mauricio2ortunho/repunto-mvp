import { describe, expect, it } from 'vitest';
import {
  type FichaDelNegocio,
  LIMITES_DEL_LOCAL,
  type LocalDelAdmin,
} from '@repunto/contratos';

import { borradorDeLocal, confirmacionDeCierre, revisarLocal } from './locales-del-admin';

describe('revisarLocal', () => {
  it('manda nombre y dirección sin espacios de más', () => {
    expect(revisarLocal({ nombre: ' Centro ', direccion: ' Calle Junín 45 ' })).toEqual({
      ok: true,
      peticion: { nombre: 'Centro', direccion: 'Calle Junín 45' },
    });
  });

  it('marca cada campo vacío con lo que hay que escribir', () => {
    const r = revisarLocal({ nombre: '  ', direccion: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.problemas).sort()).toEqual(['direccion', 'nombre']);
  });

  it('marca lo que pasa del límite', () => {
    const r = revisarLocal({
      nombre: 'x'.repeat(LIMITES_DEL_LOCAL.nombre + 1),
      direccion: 'x'.repeat(LIMITES_DEL_LOCAL.direccion + 1),
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
    });
  });
});
