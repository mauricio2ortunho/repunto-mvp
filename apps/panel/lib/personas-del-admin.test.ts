import { describe, expect, it } from 'vitest';
import type { FichaDelNegocio, PersonaDelAdmin } from '@repunto/contratos';

import {
  type BorradorDePersona,
  PERSONA_VACIA,
  avisoDePersona,
  borradorDesdePersona,
  localesParaElegir,
  rolesPosibles,
  localesDe,
  revisarPersona,
  revisarPin,
  telefonoParaVer,
} from './personas-del-admin';

const LOCAL = '11111111-1111-4111-8111-111111111111';
const CERRADO = '22222222-2222-4222-8222-222222222222';

const cajera: BorradorDePersona = {
  ...PERSONA_VACIA,
  nombre: ' Ana ',
  rol: 'cajero',
  locales: [LOCAL],
  pin: '4821',
  pinOtraVez: '4821',
};

describe('revisarPersona', () => {
  it('una cajera: sin teléfono, con su local y su PIN aparte', () => {
    expect(revisarPersona({ ...cajera, telefono: '70012345' })).toEqual({
      ok: true,
      peticion: { nombre: 'Ana', rol: 'cajero', telefono: null, locales: [LOCAL] },
      pin: '4821',
    });
  });

  it('un dueño: con teléfono, sin locales y sin PIN', () => {
    const r = revisarPersona({
      ...PERSONA_VACIA,
      nombre: 'Rocío',
      rol: 'dueno',
      telefono: ' 7001 2345 ',
    });
    expect(r).toEqual({
      ok: true,
      peticion: { nombre: 'Rocío', rol: 'dueno', telefono: '7001 2345', locales: [] },
      pin: null,
    });
  });

  it('vacío: marca nombre y rol', () => {
    const r = revisarPersona(PERSONA_VACIA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.problemas).sort()).toEqual(['nombre', 'rol']);
  });

  it('dueño sin teléfono; cajero sin local ni PIN', () => {
    const dueno = revisarPersona({ ...PERSONA_VACIA, nombre: 'R', rol: 'dueno' });
    expect(dueno.ok ? null : Object.keys(dueno.problemas)).toEqual(['telefono']);

    const sinNada = revisarPersona({ ...cajera, locales: [], pin: '', pinOtraVez: '' });
    expect(sinNada.ok ? null : Object.keys(sinNada.problemas).sort()).toEqual([
      'locales',
      'pin',
    ]);
  });
});

describe('revisarPin', () => {
  it('cuatro números, escritos igual dos veces', () => {
    expect(revisarPin({ pin: '0042', pinOtraVez: '0042' }, true)).toEqual({
      ok: true,
      pin: '0042',
    });
    expect(revisarPin({ pin: '0042', pinOtraVez: '0043' }, true)).toEqual({
      ok: false,
      problemas: { pinOtraVez: 'No coincide con el primero.' },
    });
    expect(revisarPin({ pin: '42', pinOtraVez: '42' }, true).ok).toBe(false);
  });

  it('vacío: obligatorio para quien atiende la caja, opcional para el dueño', () => {
    expect(revisarPin({ pin: '', pinOtraVez: '' }, true).ok).toBe(false);
    expect(revisarPin({ pin: '', pinOtraVez: '' }, false)).toEqual({
      ok: true,
      pin: null,
    });
  });
});

describe('cómo se muestra', () => {
  const persona = (cambio: Partial<PersonaDelAdmin>): PersonaDelAdmin => ({
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Ana',
    rol: 'cajero',
    telefono: null,
    activo: true,
    tiene_pin: true,
    locales: [LOCAL],
    con_historia: true,
    ...cambio,
  });
  const ficha = {
    locales: [
      { id: LOCAL, nombre: 'Centro', direccion: 'x', activo: true, qr_slug: 'a' },
      { id: CERRADO, nombre: 'Norte', direccion: 'y', activo: false, qr_slug: 'b' },
    ],
  } as FichaDelNegocio;

  it('el teléfono boliviano, en dos grupos de cuatro', () => {
    expect(telefonoParaVer('+59170012345')).toBe('7001 2345');
    expect(telefonoParaVer('+5491123456789')).toBe('+5491123456789');
  });

  it('sus locales por nombre, marcando el cerrado', () => {
    expect(localesDe(persona({ locales: [LOCAL, CERRADO] }), ficha)).toBe(
      'Centro, Norte (cerrado)',
    );
    expect(localesDe(persona({ locales: [] }), ficha)).toBe('Sin local');
  });

  it('avisa lo que le falta para aparecer en la tablet', () => {
    expect(avisoDePersona(persona({}))).toBeNull();
    expect(avisoDePersona(persona({ tiene_pin: false }))).toContain('Sin PIN');
    expect(avisoDePersona(persona({ locales: [] }))).toContain('Sin local');
    // Un dueño que no atiende la caja no necesita PIN ni local.
    expect(
      avisoDePersona(persona({ rol: 'dueno', locales: [], tiene_pin: false })),
    ).toBeNull();
    // Ni aunque tenga un local: vincular una tablet desde su panel lo asigna.
    expect(avisoDePersona(persona({ rol: 'dueno', tiene_pin: false }))).toBeNull();
    expect(avisoDePersona(persona({ activo: false, tiene_pin: false }))).toBeNull();
  });
});

describe('editar', () => {
  const ana: PersonaDelAdmin = {
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Ana',
    rol: 'cajero',
    telefono: null,
    activo: true,
    tiene_pin: true,
    locales: [CERRADO],
    con_historia: true,
  };

  it('al editar no se pide PIN', () => {
    const b = { ...borradorDesdePersona(ana) };
    expect(revisarPersona(b, { conPin: false })).toEqual({
      ok: true,
      peticion: { nombre: 'Ana', rol: 'cajero', telefono: null, locales: [CERRADO] },
      pin: null,
    });
  });

  it('el dueño sigue dueño; los demás, entre supervisor y cajero', () => {
    expect(rolesPosibles(null)).toEqual(['dueno', 'supervisor', 'cajero']);
    expect(rolesPosibles(ana)).toEqual(['supervisor', 'cajero']);
    expect(rolesPosibles({ ...ana, rol: 'dueno' })).toEqual(['dueno']);
  });

  it('al dueño, en su panel, no le ofrece cargar dueños', () => {
    expect(rolesPosibles(null, false)).toEqual(['supervisor', 'cajero']);
    expect(rolesPosibles(ana, false)).toEqual(['supervisor', 'cajero']);
  });

  it('ofrece los abiertos y los cerrados que ya tiene', () => {
    const ficha = {
      locales: [
        { id: LOCAL, nombre: 'Centro', direccion: 'x', activo: true, qr_slug: 'a' },
        { id: CERRADO, nombre: 'Norte', direccion: 'y', activo: false, qr_slug: 'b' },
      ],
    } as FichaDelNegocio;
    expect(localesParaElegir(ficha, []).map((l) => l.id)).toEqual([LOCAL]);
    expect(localesParaElegir(ficha, [CERRADO]).map((l) => l.id)).toEqual([
      LOCAL,
      CERRADO,
    ]);
  });

  it('el teléfono del dueño vuelve como se lo ve', () => {
    expect(
      borradorDesdePersona({ ...ana, rol: 'dueno', telefono: '+59170012345' }).telefono,
    ).toBe('7001 2345');
  });
});
