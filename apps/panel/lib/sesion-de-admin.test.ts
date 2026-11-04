import { describe, expect, it } from 'vitest';

import { type AlmacenDeSesion, crearSesionDeAdmin } from './sesion-de-admin';

function almacen(): AlmacenDeSesion & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
  };
}

describe('sesion del admin', () => {
  it('guarda, lee y olvida el token', () => {
    const a = almacen();
    const sesion = crearSesionDeAdmin(a);

    expect(sesion.token()).toBeNull();
    sesion.guardar('token-del-admin');
    expect(crearSesionDeAdmin(a).token()).toBe('token-del-admin');
    sesion.olvidar();
    expect(sesion.token()).toBeNull();
  });

  it('no usa la clave de la tablet: cada credencial queda con lo suyo', () => {
    const a = almacen();
    a.setItem('repunto:caja:token', 'token-de-la-tablet');

    expect(crearSesionDeAdmin(a).token()).toBeNull();
  });

  it('sin almacenamiento, la sesion vive en memoria', () => {
    const roto: AlmacenDeSesion = {
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
    const sesion = crearSesionDeAdmin(roto);

    sesion.guardar('t');
    expect(sesion.token()).toBe('t');
    sesion.olvidar();
    expect(sesion.token()).toBeNull();
  });
});
