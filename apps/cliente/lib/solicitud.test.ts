import { describe, expect, it } from 'vitest';

import { SOLICITUD_VACIA, revisarSolicitud } from './solicitud';

const completa = {
  nombre_negocio: '  Pollos Ana ',
  categoria: 'restaurante',
  contacto: 'Ana',
  telefono: '7001 2345',
  mensaje: '',
};

describe('revisarSolicitud', () => {
  it('vacía, dice qué falta en cada campo obligatorio', () => {
    const r = revisarSolicitud(SOLICITUD_VACIA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.problemas).sort()).toEqual([
      'categoria',
      'contacto',
      'nombre_negocio',
      'telefono',
    ]);
  });

  it('completa, manda el texto limpio y sin mensaje si quedó vacío', () => {
    expect(revisarSolicitud(completa)).toEqual({
      ok: true,
      cuerpo: {
        nombre_negocio: 'Pollos Ana',
        categoria: 'restaurante',
        contacto: 'Ana',
        telefono: '7001 2345',
        mensaje: null,
      },
    });
  });

  it('un rubro que no existe no se manda', () => {
    const r = revisarSolicitud({ ...completa, categoria: 'casino' });
    expect(r.ok).toBe(false);
  });
});
