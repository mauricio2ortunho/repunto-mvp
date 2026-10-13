import { describe, expect, it } from 'vitest';
import { crearCredencial, type Almacen } from './credencial';

const almacen = (
  inicial: Record<string, string> = {},
): Almacen & { datos: Record<string, string> } => {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => void (datos[k] = v),
  };
};

describe('el token de la tablet', () => {
  it('se lee del almacenamiento de la tablet', () => {
    const a = almacen({ 'repunto:caja:token': 'propio-de-esta-tablet' });
    expect(crearCredencial(a, 'compartido').token()).toBe('propio-de-esta-tablet');
  });

  it('si esta vacio, se llena una vez desde la variable', () => {
    const a = almacen();
    expect(crearCredencial(a, 'compartido').token()).toBe('compartido');
    expect(a.datos['repunto:caja:token']).toBe('compartido');
  });

  it('uno guardado nunca se pisa con la variable', () => {
    const a = almacen();
    const c = crearCredencial(a, 'compartido');
    c.guardar('vinculado');
    expect(crearCredencial(a, 'compartido').token()).toBe('vinculado');
  });

  it('sin almacenamiento ni variable no hay token', () => {
    expect(crearCredencial(null, null).token()).toBeNull();
  });

  it('si el almacenamiento tira error, el token vive en memoria', () => {
    const roto: Almacen = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const c = crearCredencial(roto, 'compartido');
    expect(c.token()).toBe('compartido');
    c.guardar('otro');
    expect(c.token()).toBe('otro');
  });
});
