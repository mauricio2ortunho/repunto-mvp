import { randomUUID } from 'node:crypto';

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

describe('GET /mis/tarjetas/:id', () => {
  async function selloEnElCentro(
    db: Db,
    tarjeta: string,
    negocio: NegocioDePrueba,
    haceHoras: number,
  ): Promise<void> {
    await db.query(
      `INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id, creado_el)
       VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6::int))`,
      [
        tarjeta,
        negocio.id,
        negocio.otroLocal,
        negocio.turnoOtroLocal,
        negocio.condicion,
        haceHoras,
      ],
    );
  }

  test('trae lo de la lista, la condición, el historial y la hora del servidor', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await selloEnElCentro(db, tarjeta, negocio, 48);
    await crearSello(db, tarjeta, negocio, 24);

    const respuesta = await api.miTarjeta(cliente.token, tarjeta);
    const [enLaLista] = tarjetasDe(await api.misTarjetas(cliente.token));

    expect(respuesta.estado).toBe(200);
    // La misma tarjeta se calcula igual en las dos pantallas.
    expect(respuesta.cuerpo).toMatchObject({ ...enLaLista });
    expect(respuesta.cuerpo).toMatchObject({
      condicion: { texto: 'Cualquier capuchino', monto_minimo: null },
      canje_en: null,
    });
    const sellos = respuesta.cuerpo['sellos'] as { fecha: string; local: string }[];
    // Del mas reciente al mas viejo, cada uno con su local.
    expect(sellos.map((s) => s.local)).toEqual(['Equipetrol', 'Centro']);
    expect(sellos[0]?.fecha).toMatch(/Z$/);
    expect(typeof respuesta.cuerpo['ahora']).toBe('string');
  });

  test('los sellos anulados no aparecen en el historial', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    const sellos = await crearSellos(db, tarjeta, negocio, 2);
    await anular(db, sellos[1] ?? '', negocio);

    const respuesta = await api.miTarjeta(cliente.token, tarjeta);

    expect(respuesta.cuerpo['progreso']).toBe(1);
    expect(respuesta.cuerpo['sellos']).toHaveLength(1);
  });

  test('si el premio se entrega solo donde se abrió la tarjeta, dice dónde', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await db.query('UPDATE negocio SET canje_cualquier_local = false WHERE id = $1', [
      negocio.id,
    ]);

    const respuesta = await api.miTarjeta(cliente.token, tarjeta);

    expect(respuesta.cuerpo['canje_en']).toBe('Equipetrol');
  });

  test('el monto mínimo de la condición viaja como texto, no como número', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await db.query(
      `INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde, usuario_id)
       VALUES ($1, 'Compra mayor a 30', 30, now(), $2)`,
      [negocio.id, negocio.dueno],
    );

    const respuesta = await api.miTarjeta(cliente.token, tarjeta);

    expect(respuesta.cuerpo['condicion']).toEqual({
      texto: 'Compra mayor a 30',
      monto_minimo: '30.00',
    });
  });

  test('una tarjeta ya canjeada también se puede ver', async ({ api, db }) => {
    // La app puede tenerla abierta justo cuando el cajero entrega el premio.
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 10);
    await crearCanje(db, tarjeta, negocio);
    await db.query("UPDATE tarjeta SET estado = 'canjeada' WHERE id = $1", [tarjeta]);

    const respuesta = await api.miTarjeta(cliente.token, tarjeta);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['estado']).toBe('canjeada');
  });

  test('la de otro cliente da 404, exactamente igual que una que no existe', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const juan = await crearClienteEnCaja(db, 'Juan');
    const ana = await crearClienteEnCaja(db, 'Ana');
    const deAna = await crearTarjeta(db, ana.id, negocio);

    const ajena = await api.miTarjeta(juan.token, deAna);
    const inexistente = await api.miTarjeta(juan.token, randomUUID());

    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo['codigo']).toBe('TARJETA_NO_ENCONTRADA');
    // Si se distinguieran, probando ids se sabria cuales existen.
    expect(inexistente.estado).toBe(ajena.estado);
    expect(inexistente.cuerpo).toEqual(ajena.cuerpo);
  });

  test('un id que no es un uuid es una petición inválida, no un 500', async ({
    api,
    db,
  }) => {
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.miTarjeta(cliente.token, 'no-soy-un-uuid');

    expect(respuesta.estado).toBe(422);
  });

  test('sin token, 401', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);

    expect((await api.miTarjeta(undefined, tarjeta)).estado).toBe(401);
  });
});
