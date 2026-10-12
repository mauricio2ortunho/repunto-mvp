import { describe, expect } from 'vitest';

import { nuevoToken } from '../../../src/seguridad/token';
import type { Db } from '../base';
import {
  abrirTurno,
  asignar,
  cerrarTurno,
  conTurnoDe,
  crearClienteEnCaja,
  crearDispositivo,
  crearLocal,
  crearNegocio,
  crearUsuario,
  codigoDe,
} from '../escenario';
import { test } from './base';

/**
 * `GET /caja/estado`: con que se dibuja el panel antes de la primera accion.
 *
 * Lo que se prueba acá, sobre todo, es que conteste cuando la caja NO puede
 * operar: es cuando el panel más necesita saber qué mostrar.
 */

interface Estado {
  negocio: { nombre: string; color_principal: string; icono_sello: string };
  local: { nombre: string };
  turno: { usuario: string; rol: string } | null;
  condicion: { texto: string; monto_minimo: string | null } | null;
  programa: { premio: string; sellos_requeridos: number } | null;
  impedimento: string | null;
}

/**
 * Un negocio con programa pero sin condición vigente, y el token de su tablet.
 *
 * No sale de `crearNegocio`, que siempre inserta una: `condicion_sello` solo
 * acepta inserciones —el trigger `condicion_sello_solo_insercion` sostiene
 * INV-7— así que no hay forma de sacarle la condición después.
 */
async function negocioSinCondicion(db: Db): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
     VALUES ('Sin condicion', 'cafe', '#1A2B3C', 'clasica', 'cafe') RETURNING id`,
  );
  const negocio = rows[0]?.id;
  if (negocio === undefined) throw new Error('No se creo el negocio de prueba.');

  const local = await crearLocal(db, negocio, 'Equipetrol');
  const cajero = await crearUsuario(db, negocio, 'cajero', null);
  await asignar(db, cajero, local, negocio);

  const token = nuevoToken();
  const dispositivo = await crearDispositivo(db, local, token);
  await abrirTurno(db, dispositivo, cajero, local);

  await db.query(
    `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
     VALUES ($1, 1, 10, 'Un cafe', 4, true)`,
    [negocio],
  );
  return token;
}

describe('GET /caja/estado', () => {
  test('trae la marca, el local, el turno, la condición y el premio', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);

    const respuesta = await api.estadoDeCaja(negocio.token);

    expect(respuesta.estado).toBe(200);
    const estado = respuesta.cuerpo as unknown as Estado;
    expect(estado.negocio).toMatchObject({
      nombre: 'Negocio de prueba',
      color_principal: '#1A2B3C',
      icono_sello: 'cafe',
    });
    expect(estado.local.nombre).toBe('Equipetrol');
    expect(estado.turno).toEqual({ usuario: 'cajero de prueba', rol: 'cajero' });
    expect(estado.condicion?.texto).toBe('Cualquier capuchino');
    expect(estado.programa).toEqual({ premio: 'Un cafe', sellos_requeridos: 10 });
    expect(estado.impedimento).toBeNull();
  });

  test('el rol sale del turno: con el supervisor adentro, lo dice', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const conSupervisor = await conTurnoDe(db, negocio, negocio.supervisor);

    const estado = (await api.estadoDeCaja(conSupervisor.token))
      .cuerpo as unknown as Estado;

    expect(estado.turno).toEqual({
      usuario: 'supervisor de prueba',
      rol: 'supervisor',
    });
  });

  test('sin turno abierto contesta igual, y dice por qué no se puede operar', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await cerrarTurno(db, negocio.turno);

    const respuesta = await api.estadoDeCaja(negocio.token);

    expect(respuesta.estado).toBe(200);
    const estado = respuesta.cuerpo as unknown as Estado;
    expect(estado.turno).toBeNull();
    expect(estado.impedimento).toBe('TURNO_CERRADO');
    // Y aun así trae con qué dibujar la pantalla.
    expect(estado.negocio.nombre).toBe('Negocio de prueba');
    expect(estado.programa?.premio).toBe('Un cafe');
  });

  test('con la tablet revocada lo dice, en lugar de rechazar', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.estadoDeCaja(negocio.token);

    expect(respuesta.estado).toBe(200);
    expect((respuesta.cuerpo as unknown as Estado).impedimento).toBe(
      'DISPOSITIVO_REVOCADO',
    );
  });

  test('con el negocio suspendido, lo mismo', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query("UPDATE negocio SET estado = 'suspendido' WHERE id = $1", [
      negocio.id,
    ]);

    expect(
      ((await api.estadoDeCaja(negocio.token)).cuerpo as unknown as Estado).impedimento,
    ).toBe('NEGOCIO_SUSPENDIDO');
  });

  test('sin programa vigente, el premio viene nulo y la caja no puede sellar', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);

    const estado = (await api.estadoDeCaja(negocio.token)).cuerpo as unknown as Estado;

    expect(estado.programa).toBeNull();
    // No alcanza con el premio nulo: sellar rechaza con este mismo codigo, y
    // el panel no tiene por que deducirlo.
    expect(estado.impedimento).toBe('PROMO_NO_CONFIGURADA');
  });

  test('sin condición vigente, lo mismo', async ({ api, db }) => {
    const token = await negocioSinCondicion(db);

    const estado = (await api.estadoDeCaja(token)).cuerpo as unknown as Estado;

    expect(estado.condicion).toBeNull();
    expect(estado.impedimento).toBe('PROMO_NO_CONFIGURADA');
    // Y trae igual con qué dibujar: el premio está configurado.
    expect(estado.programa?.premio).toBe('Un cafe');
  });

  test('la condición es la vigente más reciente (INV-7)', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query(
      `INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde, usuario_id)
       VALUES ($1, 'Compra mayor a 30', 30, now(), $2)`,
      [negocio.id, negocio.dueno],
    );

    const estado = (await api.estadoDeCaja(negocio.token)).cuerpo as unknown as Estado;

    expect(estado.condicion?.texto).toBe('Compra mayor a 30');
    // Decimal como texto: la plata no viaja en coma flotante.
    expect(estado.condicion?.monto_minimo).toBe('30.00');
  });

  test('sin token de tablet, 401', async ({ api, db }) => {
    await crearNegocio(db);

    expect((await api.estadoDeCaja('no-soy-una-tablet')).estado).toBe(401);
  });
});

describe('el sello dice su propio id', () => {
  test('y con ese id se lo puede deshacer sin pedir la lista de recientes', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const sellado = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    const selloId = String(sellado.cuerpo['sello_id']);
    const anulado = await api.anular(negocio.token, selloId);

    expect(sellado.estado).toBe(200);
    expect(selloId).toMatch(/^[0-9a-f-]{36}$/);
    expect(anulado.estado).toBe(200);
    expect(anulado.cuerpo['progreso']).toBe(0);
  });

  test('confirmar y sellar también lo trae; solo confirmar, no', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
       VALUES ($1, '+59170000055', 'Pedro', 'hash-de-prueba', now() + interval '30 minutes')
       RETURNING id`,
      [negocio.local],
    );
    const conSello = await api.confirmar(negocio.token, rows[0]?.id ?? '', true);

    const { rows: otro } = await db.query<{ id: string }>(
      `INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
       VALUES ($1, '+59170000056', 'Lucia', 'otro-hash', now() + interval '30 minutes')
       RETURNING id`,
      [negocio.local],
    );
    const sinSello = await api.confirmar(negocio.token, otro[0]?.id ?? '', false);

    expect(conSello.cuerpo['sello_id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(sinSello.cuerpo['sello_id']).toBeNull();
  });
});
