import { describe, expect } from 'vitest';
import type { ClienteDelDueno, ClientesDelDueno } from '@repunto/contratos';

import { una } from '../base';
import {
  crearCanje,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearEntradaDeDueno,
  crearNegocio,
  crearSello,
  crearTarjeta,
} from '../escenario';
import { type Api, type Db, test } from './base';

/**
 * La lista de clientes del dueño: los que tienen tarjeta en SU negocio, con
 * el teléfono completo y las mismas definiciones que el resumen (activo,
 * enfriado, nuevo del mes). Un sello anulado no cuenta, y la historia del
 * cliente en otro negocio no se ve.
 */

async function entrarComoDueno(api: Api, db: Db, dueno: string): Promise<string> {
  const { codigo } = await crearEntradaDeDueno(db, dueno);
  const respuesta = await api.entrarComoDueno({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function telefonoDe(db: Db, cliente: string): Promise<string> {
  return (
    await una<{ telefono: string }>(db, 'SELECT telefono FROM cliente WHERE id = $1', [
      cliente,
    ])
  ).telefono;
}

const DIA = 24;

describe('GET /dueno/clientes', () => {
  test('sus clientes con su historia acá, los de visita más reciente primero', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');

    // Ana: un sello ahora y otro anulado. Nueva del mes, activa.
    const ana = await crearClienteEnCaja(db, 'Ana');
    const tarjetaDeAna = await crearTarjeta(db, ana.id, negocio);
    await crearSello(db, tarjetaDeAna, negocio);
    const anulado = await crearSello(db, tarjetaDeAna, negocio, 2);
    await db.query(
      `UPDATE sello SET anulado = true, anulado_el = now(), anulado_turno_id = $2
       WHERE id = $1`,
      [anulado, negocio.turno],
    );
    // Ana también junta en otro negocio: eso no se ve acá.
    await crearSello(db, await crearTarjeta(db, ana.id, otro), otro);

    // Beto: canjeó una tarjeta de 2 sellos hace 5 días; no tiene otra.
    const beto = await crearClienteEnCaja(db, 'Beto');
    const canjeada = await crearTarjeta(db, beto.id, negocio);
    await crearSello(db, canjeada, negocio, 6 * DIA);
    await crearSello(db, canjeada, negocio, 5 * DIA);
    await db.query(`UPDATE tarjeta SET estado = 'canjeada' WHERE id = $1`, [canjeada]);
    await crearCanje(db, canjeada, negocio);

    // Carla: tres sellos hace 50, 49 y 48 días. Dejó de venir.
    const carla = await crearClienteEnCaja(db, 'Carla');
    const tarjetaDeCarla = await crearTarjeta(db, carla.id, negocio);
    for (const dias of [50, 49, 48]) {
      await crearSello(db, tarjetaDeCarla, negocio, dias * DIA);
    }

    // Dani: tarjeta sin sellos.
    const dani = await crearClienteEnCaja(db, 'Dani');
    await crearTarjeta(db, dani.id, negocio);

    // Eva: solo del otro negocio.
    const eva = await crearClienteEnCaja(db, 'Eva');
    await crearSello(db, await crearTarjeta(db, eva.id, otro), otro);

    const token = await entrarComoDueno(api, db, negocio.dueno);
    const respuesta = await api.clientesDelDueno(token);

    expect(respuesta.estado).toBe(200);
    const lista = respuesta.cuerpo as unknown as ClientesDelDueno;
    expect(lista.total).toBe(4);
    expect(lista.clientes.map((c) => c.nombre)).toEqual(['Ana', 'Beto', 'Carla', 'Dani']);
    const de = (nombre: string) =>
      lista.clientes.find((c) => c.nombre === nombre) as ClienteDelDueno;

    expect(de('Ana')).toMatchObject({
      telefono: await telefonoDe(db, ana.id),
      sellos: 1,
      premios: 0,
      tarjeta: { sellos: 1, sellos_requeridos: 10 },
      activo: true,
      enfriado: false,
      nuevo_del_mes: true,
    });
    expect(de('Beto')).toMatchObject({
      sellos: 2,
      premios: 1,
      tarjeta: null,
      activo: true,
    });
    expect(de('Carla')).toMatchObject({
      sellos: 3,
      tarjeta: { sellos: 3 },
      activo: true,
      enfriado: true,
      nuevo_del_mes: false,
    });
    expect(de('Dani')).toEqual({
      nombre: 'Dani',
      telefono: await telefonoDe(db, dani.id),
      sellos: 0,
      primer_sello: null,
      ultimo_sello: null,
      premios: 0,
      tarjeta: { sellos: 0, sellos_requeridos: 10, vence_el: null },
      activo: false,
      enfriado: false,
      nuevo_del_mes: false,
    });
    expect(JSON.stringify(lista)).not.toContain(await telefonoDe(db, eva.id));
  });

  test('cuenta igual que el resumen: los que dejaron de venir son los mismos', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    for (const nombre of ['Uno', 'Dos']) {
      const cliente = await crearClienteEnCaja(db, nombre);
      const tarjeta = await crearTarjeta(db, cliente.id, negocio);
      for (const dias of [45, 40, 35]) await crearSello(db, tarjeta, negocio, dias * DIA);
    }
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const lista = (await api.clientesDelDueno(token))
      .cuerpo as unknown as ClientesDelDueno;
    const resumen = (await api.resumenDelDueno(token)).cuerpo as {
      clientes: { enfriados: number; activos: number };
    };

    expect(lista.clientes.filter((c) => c.enfriado)).toHaveLength(
      resumen.clientes.enfriados,
    );
    expect(lista.clientes.filter((c) => c.activo)).toHaveLength(resumen.clientes.activos);
  });

  test('INV-1 · cada dueño ve solo los suyos', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const cliente = await crearClienteEnCaja(db, 'Del otro');
    await crearSello(db, await crearTarjeta(db, cliente.id, otro), otro);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const lista = (await api.clientesDelDueno(token))
      .cuerpo as unknown as ClientesDelDueno;

    expect(lista.total).toBe(0);
    expect(lista.clientes).toEqual([]);
  });

  test('sin sesión de dueño, 401: ni el admin, ni la tablet, ni el cliente', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const { codigo } = await crearEntradaDeAdmin(db);
    const admin = String((await api.entrarComoAdmin({ codigo })).cuerpo['token']);

    for (const token of [undefined, admin, negocio.token, cliente.token]) {
      expect((await api.clientesDelDueno(token)).estado).toBe(401);
    }
  });
});
