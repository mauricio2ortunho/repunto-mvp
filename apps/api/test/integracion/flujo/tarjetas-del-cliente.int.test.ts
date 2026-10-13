import { describe, expect } from 'vitest';

import {
  type NegocioDePrueba,
  crearCanje,
  crearClienteEnCaja,
  crearNegocio,
  crearSello,
  crearSellos,
  crearTarjeta,
  crearTarjetaVencida,
} from '../escenario';
import { type Db, type Respuesta, test } from './base';

/**
 * `GET /mis/tarjetas`: las tarjetas del cliente, como las ve en su telefono.
 *
 * El estado y el orden los prueba el dominio sin base. Aca se prueba lo que
 * solo se ve con la base de verdad: que la consulta junte el programa de la
 * tarjeta y no el vigente, que cuente los sellos no anulados, que elija una
 * por negocio, y que cada token vea solo lo suyo.
 */

interface Tarjeta {
  id: string;
  negocio: {
    nombre: string;
    color_principal: string;
    logo_url: string | null;
    portada_url: string | null;
    plantilla_tarjeta: string;
    icono_sello: string;
  };
  estado: string;
  progreso: number;
  sellos_requeridos: number;
  faltan: number;
  premio: string;
  vence_el: string | null;
}

function tarjetasDe(respuesta: Respuesta): Tarjeta[] {
  expect(respuesta.estado).toBe(200);
  return (respuesta.cuerpo as unknown as { tarjetas: Tarjeta[] }).tarjetas;
}

async function anular(db: Db, sello: string, negocio: NegocioDePrueba): Promise<void> {
  await db.query(
    `UPDATE sello SET anulado = true, anulado_el = now(), anulado_turno_id = $2
     WHERE id = $1`,
    [sello, negocio.turno],
  );
}

describe('GET /mis/tarjetas', () => {
  test('trae la tarjeta con la marca del negocio, el progreso y el premio', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 3);

    const tarjetas = tarjetasDe(await api.misTarjetas(cliente.token));

    expect(tarjetas).toEqual([
      {
        id: tarjeta,
        negocio: {
          nombre: 'Negocio de prueba',
          color_principal: '#1A2B3C',
          logo_url: null,
          portada_url: null,
          plantilla_tarjeta: 'clasica',
          icono_sello: 'cafe',
        },
        estado: 'en_curso',
        progreso: 3,
        sellos_requeridos: 10,
        faltan: 7,
        premio: 'Un cafe',
        vence_el: null,
      },
    ]);
  });

  test('un cliente sin tarjetas recibe la lista vacía, no un error', async ({
    api,
    db,
  }) => {
    const cliente = await crearClienteEnCaja(db);

    expect(tarjetasDe(await api.misTarjetas(cliente.token))).toEqual([]);
  });

  test('INV-10 · los sellos anulados no cuentan', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    const sellos = await crearSellos(db, tarjeta, negocio, 3);
    await anular(db, sellos[2] ?? '', negocio);

    const [unica] = tarjetasDe(await api.misTarjetas(cliente.token));

    expect(unica?.progreso).toBe(2);
    expect(unica?.faltan).toBe(8);
  });

  test('INV-6 · los sellos que pide son los de su programa, no los del vigente', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 6);
    // El dueño baja el premio a 5 sellos: es una version nueva (INV-5).
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);
    await db.query(
      `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
       VALUES ($1, 2, 5, 'Un cafe chico', 4, true)`,
      [negocio.id],
    );

    const [unica] = tarjetasDe(await api.misTarjetas(cliente.token));

    // Con la regla nueva estaria completa; con la suya le faltan cuatro.
    expect(unica).toMatchObject({
      sellos_requeridos: 10,
      premio: 'Un cafe',
      faltan: 4,
      estado: 'en_curso',
    });
  });

  test('vienen ordenadas: la completa primero, aunque sea de otro negocio', async ({
    api,
    db,
  }) => {
    const cafe = await crearNegocio(db, 'Cafe');
    const panaderia = await crearNegocio(db, 'Panaderia');
    const cliente = await crearClienteEnCaja(db);
    await crearSellos(db, await crearTarjeta(db, cliente.id, cafe), cafe, 3);
    await crearSellos(db, await crearTarjeta(db, cliente.id, panaderia), panaderia, 10);

    const tarjetas = tarjetasDe(await api.misTarjetas(cliente.token));

    expect(tarjetas.map((t) => [t.negocio.nombre, t.estado])).toEqual([
      ['Panaderia', 'completa'],
      ['Cafe', 'en_curso'],
    ]);
  });

  test('vencida por fecha, aunque la base todavía la tenga activa', async ({
    api,
    db,
  }) => {
    // El cron que marca las vencidas no corre: la api no puede confiar en él.
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    await crearTarjetaVencida(db, cliente.id, negocio);

    const [unica] = tarjetasDe(await api.misTarjetas(cliente.token));

    expect(unica?.estado).toBe('vencida');
    expect(unica?.vence_el).not.toBeNull();
  });

  test('con el negocio suspendido, congelada: no desaparece', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    await crearSellos(db, await crearTarjeta(db, cliente.id, negocio), negocio, 10);
    await db.query("UPDATE negocio SET estado = 'suspendido' WHERE id = $1", [
      negocio.id,
    ]);

    const [unica] = tarjetasDe(await api.misTarjetas(cliente.token));

    // Completa, pero con el negocio suspendido tampoco hay premio.
    expect(unica?.estado).toBe('congelada');
  });

  describe('una por negocio', () => {
    test('después del canje aparece la nueva, no la canjeada', async ({ api, db }) => {
      const negocio = await crearNegocio(db);
      const cliente = await crearClienteEnCaja(db);
      const vieja = await crearTarjeta(db, cliente.id, negocio);
      await crearSellos(db, vieja, negocio, 10);
      await crearCanje(db, vieja, negocio);
      await db.query("UPDATE tarjeta SET estado = 'canjeada' WHERE id = $1", [vieja]);
      const nueva = await crearTarjeta(db, cliente.id, negocio);
      await crearSello(db, nueva, negocio);

      const tarjetas = tarjetasDe(await api.misTarjetas(cliente.token));

      expect(tarjetas).toHaveLength(1);
      expect(tarjetas[0]).toMatchObject({ id: nueva, estado: 'en_curso', progreso: 1 });
    });

    test('si ya no tiene ninguna activa, muestra la última: el negocio no desaparece', async ({
      api,
      db,
    }) => {
      const negocio = await crearNegocio(db);
      const cliente = await crearClienteEnCaja(db);
      const tarjeta = await crearTarjetaVencida(db, cliente.id, negocio);
      await db.query("UPDATE tarjeta SET estado = 'vencida' WHERE id = $1", [tarjeta]);

      const tarjetas = tarjetasDe(await api.misTarjetas(cliente.token));

      expect(tarjetas).toHaveLength(1);
      expect(tarjetas[0]).toMatchObject({ id: tarjeta, estado: 'vencida' });
    });
  });

  describe('INV-1 · cada token ve solo lo suyo', () => {
    test('dos clientes, cada uno con su tarjeta', async ({ api, db }) => {
      const negocio = await crearNegocio(db);
      const juan = await crearClienteEnCaja(db, 'Juan');
      const ana = await crearClienteEnCaja(db, 'Ana');
      const deJuan = await crearTarjeta(db, juan.id, negocio);
      const deAna = await crearTarjeta(db, ana.id, negocio);

      expect(tarjetasDe(await api.misTarjetas(juan.token)).map((t) => t.id)).toEqual([
        deJuan,
      ]);
      expect(tarjetasDe(await api.misTarjetas(ana.token)).map((t) => t.id)).toEqual([
        deAna,
      ]);
    });

    test('no acepta un identificador de cliente, ni siquiera en la query', async ({
      api,
      db,
    }) => {
      const negocio = await crearNegocio(db);
      const juan = await crearClienteEnCaja(db, 'Juan');
      const ana = await crearClienteEnCaja(db, 'Ana');
      const deJuan = await crearTarjeta(db, juan.id, negocio);
      await crearTarjeta(db, ana.id, negocio);

      const respuesta = await api.misTarjetas(juan.token, `?cliente_id=${ana.id}`);

      expect(tarjetasDe(respuesta).map((t) => t.id)).toEqual([deJuan]);
    });

    test('sin token, 401', async ({ api, db }) => {
      await crearClienteEnCaja(db);

      expect((await api.misTarjetas()).estado).toBe(401);
    });

    test('con un token que no es de nadie, 401', async ({ api, db }) => {
      await crearClienteEnCaja(db);

      expect((await api.misTarjetas('no-soy-un-telefono')).estado).toBe(401);
    });
  });
});
