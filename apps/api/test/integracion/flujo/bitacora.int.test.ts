import { afterEach, describe, expect, vi } from 'vitest';

import { una } from '../base';
import {
  type NegocioDePrueba,
  cerrarTurno,
  codigoDe,
  crearCliente,
  crearClienteEnCaja,
  crearNegocio,
  crearRegistro,
  crearSello,
  crearSellos,
  crearTarjeta,
} from '../escenario';
import { type Db, type Respuesta, contar, test } from './base';

/**
 * El log de cada pedido y la bitacora de la caja (CLAUDE.md, seccion 8): que
 * se pueda responder "que paso con el sello de Juan el martes", rechazos
 * incluidos, sin depender de los logs de Vercel, que duran una hora.
 */

interface Intento {
  request_id: string;
  accion: string;
  resultado: string;
  dispositivo_id: string;
  local_id: string;
  turno_id: string | null;
  cliente_id: string | null;
  tarjeta_id: string | null;
  sello_id: string | null;
  registro_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requestIdDe(respuesta: Respuesta): string {
  return respuesta.cabeceras['x-request-id'] ?? '';
}

/** El unico intento que dejo ese pedido. */
async function intentoDe(db: Db, respuesta: Respuesta): Promise<Intento> {
  expect(
    await contar(db, 'intento_caja', `request_id = '${requestIdDe(respuesta)}'`),
  ).toBe(1);
  return una<Intento>(db, 'SELECT * FROM intento_caja WHERE request_id = $1', [
    requestIdDe(respuesta),
  ]);
}

function deLaCaja(negocio: NegocioDePrueba) {
  return {
    dispositivo_id: negocio.dispositivo,
    local_id: negocio.local,
    turno_id: negocio.turno,
  };
}

describe('X-Request-Id', () => {
  test('cada pedido trae el suyo, distinto, tambien los rechazados', async ({ api }) => {
    const respuestas = await Promise.all([
      api.estadoDeCaja(),
      api.estadoDeCaja(),
      api.sellar({ token: 'no-existe', cuerpo: { codigo: 'x' } }),
    ]);
    const ids = respuestas.map(requestIdDe);
    expect(ids.every((id) => UUID.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('Bitacora · sellar', () => {
  test('un sello otorgado queda con tablet, local, turno, cliente y sello', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
    expect(await intentoDe(db, respuesta)).toMatchObject({
      accion: 'sello',
      resultado: 'ok',
      ...deLaCaja(negocio),
      cliente_id: cliente.id,
      sello_id: respuesta.cuerpo['sello_id'],
    });
  });

  test('un sello sobre una tarjeta en curso anota la tarjeta', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 2);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect((await intentoDe(db, respuesta)).tarjeta_id).toBe(tarjeta);
  });

  test('el rechazo tambien queda, con su codigo, aunque la transaccion se deshizo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const codigo = codigoDe(cliente);
    await api.sellar({ token: negocio.token, cuerpo: { codigo } });

    const otraVez = await api.sellar({ token: negocio.token, cuerpo: { codigo } });

    expect(otraVez.cuerpo['codigo']).toBe('CODIGO_YA_USADO');
    expect(await intentoDe(db, otraVez)).toMatchObject({
      accion: 'sello',
      resultado: 'CODIGO_YA_USADO',
      ...deLaCaja(negocio),
      cliente_id: cliente.id,
      sello_id: null,
    });
    expect(await contar(db, 'sello')).toBe(1);
  });

  test('un codigo que no es de nadie queda sin cliente', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: 'KKKKK-000000' },
    });

    expect(await intentoDe(db, respuesta)).toMatchObject({
      resultado: 'CODIGO_INVALIDO',
      cliente_id: null,
    });
  });

  test('sin turno abierto queda TURNO_CERRADO, sin turno', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await cerrarTurno(db, negocio.turno);
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(await intentoDe(db, respuesta)).toMatchObject({
      resultado: 'TURNO_CERRADO',
      turno_id: null,
      cliente_id: cliente.id,
    });
  });

  test('un token que no es de ninguna tablet no deja nada', async ({ api, db }) => {
    await crearNegocio(db);
    await api.sellar({ token: 'no-existe', cuerpo: { codigo: 'KKKKK-000000' } });
    expect(await contar(db, 'intento_caja')).toBe(0);
  });
});

describe('Bitacora · canje, anulacion y alta', () => {
  test('un canje queda con su tarjeta', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 10);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
    expect(await intentoDe(db, respuesta)).toMatchObject({
      accion: 'canje',
      resultado: 'ok',
      ...deLaCaja(negocio),
      cliente_id: cliente.id,
      tarjeta_id: tarjeta,
    });
  });

  test('una anulacion queda con el sello, la tarjeta y el cliente', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearCliente(db);
    const tarjeta = await crearTarjeta(db, cliente, negocio);
    const sello = await crearSello(db, tarjeta, negocio);

    const respuesta = await api.anular(negocio.token, sello);

    expect(respuesta.estado).toBe(200);
    expect(await intentoDe(db, respuesta)).toMatchObject({
      accion: 'anulacion',
      resultado: 'ok',
      ...deLaCaja(negocio),
      sello_id: sello,
      tarjeta_id: tarjeta,
      cliente_id: cliente,
    });
  });

  test('anular un sello de otro negocio queda rechazado y sin sus ids', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    const tarjeta = await crearTarjeta(db, await crearCliente(db), otro);
    const ajeno = await crearSello(db, tarjeta, otro);

    const respuesta = await api.anular(negocio.token, ajeno);

    expect(respuesta.estado).not.toBe(200);
    expect(await intentoDe(db, respuesta)).toMatchObject({
      accion: 'anulacion',
      ...deLaCaja(negocio),
      sello_id: null,
      tarjeta_id: null,
      cliente_id: null,
    });
  });

  test('confirmar y descartar un alta quedan con el registro', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const aConfirmar = await crearRegistro(db, negocio.local);
    const aDescartar = await crearRegistro(db, negocio.local);

    const confirmada = await api.confirmar(negocio.token, aConfirmar.id, true);
    const descartada = await api.descartar(negocio.token, aDescartar.id);

    expect(confirmada.estado).toBe(200);
    expect(await intentoDe(db, confirmada)).toMatchObject({
      accion: 'confirmacion',
      resultado: 'ok',
      ...deLaCaja(negocio),
      registro_id: aConfirmar.id,
      sello_id: confirmada.cuerpo['sello_id'],
    });
    expect(await intentoDe(db, descartada)).toMatchObject({
      accion: 'descarte',
      resultado: 'ok',
      registro_id: aDescartar.id,
    });
  });
});

describe('La linea de log del pedido', () => {
  afterEach(() => {
    process.env['LOG_DE_PEDIDOS'] = 'no';
    vi.restoreAllMocks();
  });

  test('lleva el request_id y los ids del sellado, y nunca el codigo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const codigo = codigoDe(cliente);
    const lineas: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((linea: unknown) => {
      lineas.push(String(linea));
    });
    process.env['LOG_DE_PEDIDOS'] = 'si';

    const respuesta = await api.sellar({ token: negocio.token, cuerpo: { codigo } });

    const delPedido = lineas
      .map((linea) => JSON.parse(linea) as Record<string, unknown>)
      .filter((linea) => linea['request_id'] === requestIdDe(respuesta));
    expect(delPedido).toHaveLength(1);
    expect(delPedido[0]).toMatchObject({
      nivel: 'info',
      metodo: 'POST',
      ruta: '/caja/sellos',
      estado: 200,
      ...deLaCaja(negocio),
      cliente_id: cliente.id,
      sello_id: respuesta.cuerpo['sello_id'],
    });
    const todo = lineas.join('\n');
    expect(todo).not.toContain(codigo);
    expect(todo).not.toContain(codigo.split('-')[1]);
    expect(todo).not.toContain(negocio.token);
  });

  test('un rechazo lleva su codigo', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const lineas: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((linea: unknown) => {
      lineas.push(String(linea));
    });
    process.env['LOG_DE_PEDIDOS'] = 'si';

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: 'KKKKK-000000' },
    });

    const linea = lineas
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l['request_id'] === requestIdDe(respuesta));
    expect(linea).toMatchObject({ estado: 422, codigo: 'CODIGO_INVALIDO' });
  });
});
