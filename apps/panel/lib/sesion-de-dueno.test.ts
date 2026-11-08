import { describe, expect, it } from 'vitest';

import { crearSesionDeAdmin } from './sesion-de-admin';
import { crearSesionDeDueno } from './sesion-de-dueno';

function almacen() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

describe('sesion del dueno', () => {
  it('guarda, lee y olvida el token', () => {
    const a = almacen();
    const sesion = crearSesionDeDueno(a);

    expect(sesion.token()).toBeNull();
    sesion.guardar('token-del-dueno');
    expect(crearSesionDeDueno(a).token()).toBe('token-del-dueno');
    sesion.olvidar();
    expect(sesion.token()).toBeNull();
  });

  it('no se cruza con la del admin ni con la de la tablet', () => {
    const a = almacen();
    a.setItem('repunto:caja:token', 'token-de-la-tablet');
    crearSesionDeAdmin(a).guardar('token-del-admin');

    expect(crearSesionDeDueno(a).token()).toBeNull();
    crearSesionDeDueno(a).guardar('token-del-dueno');
    crearSesionDeDueno(a).olvidar();

    expect(crearSesionDeAdmin(a).token()).toBe('token-del-admin');
    expect(a.getItem('repunto:caja:token')).toBe('token-de-la-tablet');
  });
});
