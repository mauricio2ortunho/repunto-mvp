import { describe, expect, it } from 'vitest';

import { type Almacen, crearGuardado } from './almacen';
import { type RegistroEnEspera, crearSesion } from './sesion';

function almacen(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (c) => datos.get(c) ?? null,
    setItem: (c, v) => void datos.set(c, v),
    removeItem: (c) => void datos.delete(c),
  };
}

const REGISTRO: RegistroEnEspera = {
  ticket: 'ticket',
  clave: '0b6f0c1e-9f4a-4c4e-8a51-7d3c2b1a0f9e',
  qr: 'demo-equipetrol',
  nombre: 'Ana',
  telefono_final: '4521',
};

describe('la sesion del telefono', () => {
  it('guarda el token y lo devuelve', () => {
    const sesion = crearSesion(crearGuardado(almacen()));
    sesion.guardarToken('abc');
    expect(sesion.token()).toBe('abc');
  });

  it('cerrar la sesion la olvida', () => {
    const sesion = crearSesion(crearGuardado(almacen()));
    sesion.guardarToken('abc');
    sesion.cerrar();
    expect(sesion.token()).toBeNull();
  });

  it('el registro en espera sobrevive a recargar la pagina', () => {
    const afuera = almacen();
    crearSesion(crearGuardado(afuera)).guardarRegistro(REGISTRO);

    // Otra instancia sobre el mismo almacen: es la pagina recargada.
    expect(crearSesion(crearGuardado(afuera)).registro()).toEqual(REGISTRO);
  });

  it('un registro guardado roto se descarta en lugar de romper la app', () => {
    const afuera = almacen();
    afuera.datos.set('repunto:cliente:registro', '{"ticket": 1}');
    expect(crearSesion(crearGuardado(afuera)).registro()).toBeNull();

    afuera.datos.set('repunto:cliente:registro', 'no es json');
    expect(crearSesion(crearGuardado(afuera)).registro()).toBeNull();
  });

  it('con el almacenamiento bloqueado, la sesion vive en memoria', () => {
    const roto: Almacen = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    const sesion = crearSesion(crearGuardado(roto));

    sesion.guardarToken('abc');

    expect(sesion.token()).toBe('abc');
  });
});
