import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { una } from '../base';
import {
  type ClienteDePrueba,
  type NegocioDePrueba,
  asignar,
  codigoDe,
  conTurnoDe,
  crearClienteEnCaja,
  crearNegocio,
  crearSello,
  crearSellos,
  crearTarjeta,
} from '../escenario';
import { type Db, contar, test } from './base';

/**
 * Deshacer un sello. Lo que se prueba acá, sobre todo, es de dónde sale el
 * permiso: del rol del turno, que vive en la base, y no de nada que la tablet
 * pueda mandar.
 */

interface Caso {
  negocio: NegocioDePrueba;
  cliente: ClienteDePrueba;
  tarjeta: string;
  sello: string;
}

/** Una tarjeta con tres sellos viejos y uno recién hecho por el cajero. */
async function conUnSelloReciente(db: Db): Promise<Caso> {
  const negocio = await crearNegocio(db);
  const cliente = await crearClienteEnCaja(db);
  const tarjeta = await crearTarjeta(db, cliente.id, negocio);
  await crearSellos(db, tarjeta, negocio, 2);
  const sello = await crearSello(db, tarjeta, negocio);
  return { negocio, cliente, tarjeta, sello };
}

async function atrasarSello(db: Db, sello: string, minutos: number): Promise<void> {
  await db.query(
    `UPDATE sello SET creado_el = now() - make_interval(mins => $2::int) WHERE id = $1`,
    [sello, minutos],
  );
}

describe('POST /caja/sellos/:id/anulacion · el cajero', () => {
  test('deshace su último sello y la tarjeta queda con uno menos', async ({
    api,
    db,
  }) => {
    const { negocio, sello } = await conUnSelloReciente(db);

    const respuesta = await api.anular(negocio.token, sello);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({ nombre: 'Juan', progreso: 2, faltan: 8 });
  });

  test('INV-17 · marca, no borra, y deja el turno desde el que se anuló', async ({
    api,
    db,
  }) => {
    const { negocio, sello } = await conUnSelloReciente(db);

    await api.anular(negocio.token, sello);

    expect(await contar(db, 'sello')).toBe(3);
    const anulado = await una<{
      anulado: boolean;
      anulado_el: Date | null;
      anulado_turno_id: string | null;
    }>(db, 'SELECT anulado, anulado_el, anulado_turno_id FROM sello WHERE id = $1', [
      sello,
    ]);
    expect(anulado.anulado).toBe(true);
    expect(anulado.anulado_el).not.toBeNull();
    expect(anulado.anulado_turno_id).toBe(negocio.turno);
  });

  test('a los seis minutos ya no puede', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await atrasarSello(db, sello, 6);

    const respuesta = await api.anular(negocio.token, sello);

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('ANULACION_NO_PERMITIDA');
    expect(respuesta.cuerpo['mensaje']).toContain('supervisor');
  });

  test('no puede deshacer uno suyo que ya no es el último', async ({ api, db }) => {
    const { negocio, tarjeta, sello } = await conUnSelloReciente(db);
    await crearSello(db, tarjeta, negocio);

    expect((await api.anular(negocio.token, sello)).estado).toBe(403);
  });

  test('no puede deshacer el sello de otro cajero', async ({ api, db }) => {
    const { negocio, tarjeta } = await conUnSelloReciente(db);
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);
    const ajeno = await crearSello(db, tarjeta, conSupervisor);
    // Desde el negocio con el turno del supervisor: el anterior ya está cerrado.
    const conCajero = await conTurnoDe(db, conSupervisor, negocio.cajero);

    expect((await api.anular(conCajero.token, ajeno)).estado).toBe(403);
  });
});

describe('POST /caja/sellos/:id/anulacion · el supervisor y el dueño', () => {
  test('el supervisor anula un sello viejo de otro cajero', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await atrasarSello(db, sello, 600);
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);

    const respuesta = await api.anular(conSupervisor.token, sello);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['progreso']).toBe(2);
  });

  test('el dueño con turno abierto puede lo mismo', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await atrasarSello(db, sello, 600);
    await asignar(db, negocio.dueno, negocio.local, negocio.id);
    const conDueno = await conTurnoDe(db, negocio, negocio.dueno);

    expect((await api.anular(conDueno.token, sello)).estado).toBe(200);
  });
});

describe('POST /caja/sellos/:id/anulacion · lo que no se anula nunca', () => {
  test('SELLO_YA_ANULADO la segunda vez', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await api.anular(negocio.token, sello);

    const respuesta = await api.anular(negocio.token, sello);

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('SELLO_YA_ANULADO');
  });

  test('SELLO_YA_CANJEADO cuando el premio ya se entregó', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    const sellos = await crearSellos(db, tarjeta, negocio, 10);
    await api.canjear({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);

    const respuesta = await api.anular(conSupervisor.token, sellos[0] ?? '');

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('SELLO_YA_CANJEADO');
  });

  test('SELLO_NO_ENCONTRADO cuando el sello es de otra sucursal', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    // Un sello del otro local, con el turno del supervisor de allá.
    const enOtroLocal = await crearSello(db, tarjeta, {
      ...negocio,
      local: negocio.otroLocal,
      turno: negocio.turnoOtroLocal,
    });

    const respuesta = await api.anular(negocio.token, enOtroLocal);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('SELLO_NO_ENCONTRADO');
  });

  test('SELLO_NO_ENCONTRADO cuando no existe', async ({ api, db }) => {
    const { negocio } = await conUnSelloReciente(db);

    expect((await api.anular(negocio.token, randomUUID())).estado).toBe(404);
  });

  test('con la tablet revocada, ni el supervisor', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    expect((await api.anular(negocio.token, sello)).estado).toBe(403);
  });

  test('el doble toque anula una sola vez y responde lo mismo', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    const clave = randomUUID();

    const primera = await api.anular(negocio.token, sello, clave);
    const segunda = await api.anular(negocio.token, sello, clave);

    expect(primera.estado).toBe(200);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'sello', 'anulado')).toBe(1);
  });
});

describe('GET /caja/sellos/recientes', () => {
  test('el cajero ve los suyos del turno, con el nombre del cliente', async ({
    api,
    db,
  }) => {
    const { negocio, sello } = await conUnSelloReciente(db);

    const respuesta = await api.sellosRecientes(negocio.token);

    expect(respuesta.estado).toBe(200);
    const sellos = respuesta.cuerpo['sellos'] as { id: string; nombre: string }[];
    expect(sellos).toHaveLength(3);
    expect(sellos[0]?.id).toBe(sello);
    expect(sellos[0]?.nombre).toBe('Juan');
  });

  test('el cajero nuevo no ve los sellos del turno anterior', async ({ api, db }) => {
    const { negocio } = await conUnSelloReciente(db);
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);
    const conCajero = await conTurnoDe(db, conSupervisor, negocio.cajero);

    const respuesta = await api.sellosRecientes(conCajero.token);

    expect(respuesta.cuerpo['sellos']).toHaveLength(0);
  });

  test('el supervisor ve las últimas 24 horas del local', async ({ api, db }) => {
    const { negocio, sello } = await conUnSelloReciente(db);
    await atrasarSello(db, sello, 60);
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);

    const respuesta = await api.sellosRecientes(conSupervisor.token);

    const sellos = respuesta.cuerpo['sellos'] as { id: string }[];
    expect(sellos.map((fila) => fila.id)).toContain(sello);
  });

  test('sin token, 401', async ({ api, db }) => {
    await crearNegocio(db);

    expect((await api.sellosRecientes('no-soy-una-tablet')).estado).toBe(401);
  });

  test('una tablet revocada ya no ve los sellos', async ({ api, db }) => {
    const { negocio } = await conUnSelloReciente(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.sellosRecientes(negocio.token);

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
    expect(respuesta.cuerpo['sellos']).toBeUndefined();
  });
});
