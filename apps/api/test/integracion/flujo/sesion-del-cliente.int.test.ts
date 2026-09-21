import { describe, expect } from 'vitest';

import { una } from '../base';
import { crearClienteEnCaja, crearNegocio, crearRegistro } from '../escenario';
import { contar, test } from './base';

/**
 * Como el teléfono del cliente se entera de que el cajero lo confirmó, y —lo
 * más importante de esta tanda— cuándo NO se lleva una sesión.
 *
 * La confirmación presencial autentica a alguien NUEVO. Sobre una cuenta que
 * ya existía no alcanza: si alcanzara, cualquiera en la fila podría escribir
 * el teléfono de otro, dejar que el cajero confirme un nombre razonable y
 * llevarse la cuenta ajena con todas sus tarjetas y su código para sellar y
 * canjear (especificación funcional, sección 3).
 */

describe('GET /registros/mio · cliente nuevo', () => {
  test('pendiente mientras el cajero no lo confirme', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { ticket } = await crearRegistro(db, negocio.local);

    const respuesta = await api.miRegistro(ticket);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toEqual({ estado: 'pendiente' });
  });

  test('al confirmarlo entrega la sesión, y esa sesión sirve', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id, ticket } = await crearRegistro(db, negocio.local);
    await api.confirmar(negocio.token, id, false);

    const respuesta = await api.miRegistro(ticket);

    expect(respuesta.cuerpo['estado']).toBe('confirmado');
    const token = String(respuesta.cuerpo['token']);
    expect(token.length).toBeGreaterThan(20);
    expect((await api.miCodigo(token)).estado).toBe(200);
  });

  test('la sesión se entrega una sola vez', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id, ticket } = await crearRegistro(db, negocio.local);
    await api.confirmar(negocio.token, id, false);

    const primera = await api.miRegistro(ticket);
    const segunda = await api.miRegistro(ticket);

    expect(primera.cuerpo['token']).toBeTypeOf('string');
    expect(segunda.cuerpo).toEqual({ estado: 'confirmado' });
    expect(await contar(db, 'dispositivo_cliente')).toBe(1);
  });

  test('la sesión queda marcada como presencial, para poder revocarla después', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id, ticket } = await crearRegistro(db, negocio.local);
    await api.confirmar(negocio.token, id, false);
    await api.miRegistro(ticket);

    const sesion = await una<{ origen: string }>(
      db,
      'SELECT origen FROM dispositivo_cliente',
    );
    expect(sesion.origen).toBe('presencial');
  });
});

describe('GET /registros/mio · el teléfono ya tenía cuenta', () => {
  test('no entrega sesión: hay que verificar el teléfono por código', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const victima = await crearClienteEnCaja(db, 'Juan');
    const { telefono } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM cliente WHERE id = $1',
      [victima.id],
    );
    // Alguien en la fila escribe el teléfono de otro.
    const { id, ticket } = await crearRegistro(db, negocio.local, { telefono });
    // El cajero ve un nombre razonable y confirma.
    const confirmado = await api.confirmar(negocio.token, id, true);
    expect(confirmado.estado).toBe(200);

    const respuesta = await api.miRegistro(ticket);

    expect(respuesta.cuerpo).toEqual({ estado: 'verificacion_requerida' });
    expect(respuesta.cuerpo['token']).toBeUndefined();
    // La cuenta de Juan sigue teniendo una sola sesión: la suya.
    expect(await contar(db, 'dispositivo_cliente')).toBe(1);
    const sesion = await una<{ token_hash: string }>(
      db,
      'SELECT token_hash FROM dispositivo_cliente',
    );
    expect(sesion.token_hash).not.toBe('');
  });

  test('la tarjeta sí se abre y el sello sí se otorga: el cliente estaba ahí', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db, 'Juan');
    const { telefono } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM cliente WHERE id = $1',
      [cliente.id],
    );
    const { id } = await crearRegistro(db, negocio.local, { telefono });

    await api.confirmar(negocio.token, id, true);

    expect(await contar(db, 'tarjeta')).toBe(1);
    expect(await contar(db, 'sello')).toBe(1);
  });
});

describe('GET /registros/mio · lo demás', () => {
  test('descartado cuando el cajero lo sacó de la lista', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id, ticket } = await crearRegistro(db, negocio.local);
    await api.descartar(negocio.token, id);

    expect((await api.miRegistro(ticket)).cuerpo).toEqual({ estado: 'descartado' });
  });

  test('vencido cuando pasó la media hora y nadie lo confirmó', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { ticket, id } = await crearRegistro(db, negocio.local);
    await db.query(
      `UPDATE registro_pendiente
       SET creado_el = now() - interval '2 hours', expira_el = now() - interval '1 hour'
       WHERE id = $1`,
      [id],
    );

    expect((await api.miRegistro(ticket)).cuerpo).toEqual({ estado: 'vencido' });
  });

  test('un ticket que no es de nadie da 401', async ({ api, db }) => {
    await crearNegocio(db);

    expect((await api.miRegistro('no-soy-un-ticket')).estado).toBe(401);
  });

  test('sin ticket, 401', async ({ api, db }) => {
    await crearNegocio(db);

    expect((await api.miRegistro()).estado).toBe(401);
  });
});
