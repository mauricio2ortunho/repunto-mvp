import { describe, expect } from 'vitest';

import { VENTANA_SEGUNDOS } from '@repunto/dominio';

import { codigoDe, crearClienteEnCaja, crearNegocio } from '../escenario';
import { test } from './base';

/**
 * `GET /mi/codigo`: lo que el cliente muestra en caja.
 *
 * Las tres condiciones que tiene que cumplir, cada una con su test:
 *  - devuelve solo el codigo del cliente del token;
 *  - no acepta un identificador de cliente en la peticion, ni el propio;
 *  - devuelve la ventana actual y la siguiente, con su vencimiento.
 *
 * Y la cuarta, que no es negociable: la semilla no sale del servidor.
 */

interface CuerpoDeCodigos {
  codigos: { codigo: string; vence_el: string }[];
}

describe('GET /mi/codigo', () => {
  test('devuelve la ventana actual y la siguiente, con su vencimiento', async ({
    api,
    db,
  }) => {
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.miCodigo(cliente.token);

    expect(respuesta.estado).toBe(200);
    const { codigos } = respuesta.cuerpo as unknown as CuerpoDeCodigos;
    expect(codigos).toHaveLength(2);
    expect(codigos[0]?.codigo).toBe(codigoDe(cliente));
    expect(codigos[0]?.codigo).not.toBe(codigos[1]?.codigo);

    const primero = new Date(codigos[0]?.vence_el ?? '').getTime();
    const segundo = new Date(codigos[1]?.vence_el ?? '').getTime();
    expect(segundo - primero).toBe(VENTANA_SEGUNDOS * 1000);
  });

  test('el codigo que devuelve es el que el cajero puede sellar', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const mio = await api.miCodigo(cliente.token);
    const { codigos } = mio.cuerpo as unknown as CuerpoDeCodigos;
    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigos[0]?.codigo },
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['progreso']).toBe(1);
  });

  test('cada token devuelve el codigo de SU cliente', async ({ api, db }) => {
    const juan = await crearClienteEnCaja(db, 'Juan');
    const ana = await crearClienteEnCaja(db, 'Ana');

    const deJuan = (await api.miCodigo(juan.token)).cuerpo as unknown as CuerpoDeCodigos;
    const deAna = (await api.miCodigo(ana.token)).cuerpo as unknown as CuerpoDeCodigos;

    expect(deJuan.codigos[0]?.codigo).toContain(juan.codigo_publico);
    expect(deAna.codigos[0]?.codigo).toContain(ana.codigo_publico);
  });

  test('no acepta un identificador de cliente, ni siquiera el propio', async ({
    api,
    db,
  }) => {
    const juan = await crearClienteEnCaja(db, 'Juan');
    const ana = await crearClienteEnCaja(db, 'Ana');

    // Pedir el de Ana con el token de Juan: el parametro no existe y se ignora.
    const respuesta = await api.miCodigo(juan.token, `?cliente_id=${ana.id}`);

    const { codigos } = respuesta.cuerpo as unknown as CuerpoDeCodigos;
    expect(codigos[0]?.codigo).toContain(juan.codigo_publico);
    expect(codigos[0]?.codigo).not.toContain(ana.codigo_publico);
  });

  test('la semilla no sale del servidor', async ({ api, db }) => {
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.miCodigo(cliente.token);

    expect(JSON.stringify(respuesta.cuerpo)).not.toContain(cliente.semilla);
  });

  test('sin token, 401', async ({ api, db }) => {
    await crearClienteEnCaja(db);

    const respuesta = await api.miCodigo();

    expect(respuesta.estado).toBe(401);
  });

  test('con un token que no es de nadie, 401', async ({ api, db }) => {
    await crearClienteEnCaja(db);

    const respuesta = await api.miCodigo('no-soy-nadie');

    expect(respuesta.estado).toBe(401);
  });

  test('hay tope de peticiones por cliente', async ({ api, db }) => {
    const cliente = await crearClienteEnCaja(db);

    let ultima = await api.miCodigo(cliente.token);
    for (let i = 0; i < 125 && ultima.estado === 200; i += 1) {
      ultima = await api.miCodigo(cliente.token);
    }

    expect(ultima.estado).toBe(429);
    expect(ultima.cuerpo['codigo']).toBe('TOPE_SUPERADO');

    // El tope es por cliente: el de al lado sigue pudiendo pedir el suyo.
    const otro = await crearClienteEnCaja(db, 'Ana');
    expect((await api.miCodigo(otro.token)).estado).toBe(200);
  });
});
