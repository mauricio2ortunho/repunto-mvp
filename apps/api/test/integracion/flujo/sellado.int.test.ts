import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import {
  type ClienteDePrueba,
  type NegocioDePrueba,
  codigoDe,
  crearClienteEnCaja,
  crearNegocio,
  crearSello,
  crearSellos,
  crearTarjeta,
  crearTarjetaVencida,
} from '../escenario';
import { type Db, contar, test } from './base';

/**
 * El flujo del sellado por HTTP, con un caso por cada codigo de error que
 * puede devolver.
 *
 * Todo entra por la puerta de verdad: cabecera Authorization con el token de
 * la tablet, Idempotency-Key, y el cuerpo con el codigo y nada mas.
 */

const UNA_HORA = 3_600_000;

/** El del programa que crea `crearNegocio`. */
const HORAS_ENTRE_SELLOS = 4;

/**
 * La hora de La Paz, calculada a mano.
 *
 * A proposito no usa `Intl` con `America/La_Paz`: seria la misma herramienta
 * que usa la API, y el test estaria comprobando la implementacion contra si
 * misma. La Paz es UTC-4 todo el año, sin horario de verano (CLAUDE.md,
 * seccion 2), asi que restar cuatro horas es exacto.
 */
function horaEnLaPaz(instante: Date): string {
  return horaUtc(new Date(instante.getTime() - 4 * UNA_HORA));
}

function horaUtc(instante: Date): string {
  const hh = String(instante.getUTCHours()).padStart(2, '0');
  const mm = String(instante.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function caja(
  db: Db,
): Promise<{ negocio: NegocioDePrueba; cliente: ClienteDePrueba }> {
  const negocio = await crearNegocio(db);
  const cliente = await crearClienteEnCaja(db);
  return { negocio, cliente };
}

describe('POST /caja/sellos · el camino feliz', () => {
  test('sella, abre la tarjeta y le dice al cajero que cantar', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toEqual({
      nombre: 'Juan',
      progreso: 1,
      faltan: 9,
      completa: false,
      premio: 'Un cafe',
      sello_id: expect.any(String),
    });
    expect(await contar(db, 'sello')).toBe(1);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });

  test('el primer sello arranca el reloj y fija el vencimiento (INV-12, INV-13)', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });

    const { rows } = await db.query<{ reloj_desde: Date | null; vence_el: Date | null }>(
      'SELECT reloj_desde, vence_el FROM tarjeta',
    );
    expect(rows[0]?.reloj_desde).not.toBeNull();
    expect(rows[0]?.vence_el).not.toBeNull();
  });

  test('el local sale del dispositivo, aunque el cuerpo diga otra cosa (INV-1, INV-2)', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);

    await api.sellar({
      token: negocio.token,
      cuerpo: {
        codigo: codigoDe(cliente),
        local_id: negocio.otroLocal,
        negocio_id: randomUUID(),
      },
    });

    const { rows } = await db.query<{ local_id: string; turno_id: string }>(
      'SELECT local_id, turno_id FROM sello',
    );
    expect(rows[0]?.local_id).toBe(negocio.local);
    expect(rows[0]?.turno_id).toBe(negocio.turno);
  });

  test('registra el consumo del codigo antes de sellar (INV-9, INV-19)', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });

    expect(await contar(db, 'codigo_usado')).toBe(1);
  });
});

describe('POST /caja/sellos · un caso por cada codigo de error', () => {
  test('CODIGO_INVALIDO cuando lo tipeado no tiene forma de codigo', async ({
    api,
    db,
  }) => {
    const { negocio } = await caja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: '418329' },
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_INVALIDO');
    expect(await contar(db, 'sello')).toBe(0);
  });

  test('CODIGO_INVALIDO, el mismo, cuando el prefijo no es de nadie', async ({
    api,
    db,
  }) => {
    const { negocio } = await caja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: 'ZZZZZ-000000' },
    });

    // Identico al caso anterior: distinguirlos permitiria enumerar clientes.
    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_INVALIDO');
  });

  test('CODIGO_INVALIDO cuando el TOTP es de otro cliente', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const otro = await crearClienteEnCaja(db, 'Ana');

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: `${cliente.codigo_publico}-${codigoDe(otro).slice(-6)}` },
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_INVALIDO');
  });

  test('CODIGO_YA_USADO cuando la misma ventana entra dos veces', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const codigo = codigoDe(cliente);
    await api.sellar({ token: negocio.token, cuerpo: { codigo } });

    // Otra clave de idempotencia: es otra peticion, no un reintento.
    const respuesta = await api.sellar({ token: negocio.token, cuerpo: { codigo } });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_YA_USADO');
    expect(await contar(db, 'sello')).toBe(1);
  });

  test('DEMASIADO_PRONTO, y el mensaje dice a que hora puede volver', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSello(db, tarjeta, negocio);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('DEMASIADO_PRONTO');
    expect(respuesta.cuerpo['mensaje']).toMatch(/volver a sellar a las \d\d:\d\d/);
  });

  test('y esa hora es la de La Paz, no la del servidor', async ({ api, db }) => {
    // El test de arriba solo mira la FORMA de la hora, asi que pasa igual si
    // la API la escribe en UTC. Este mira el valor.
    //
    // Hay que elegir el instante con cuidado: en los datos de demo el
    // intervalo entre sellos es de 4 horas y La Paz es UTC-4, asi que la hora
    // del mensaje coincide con la hora UTC del sello anterior y los dos
    // errores se ven iguales. Fijando el sello a una hora conocida, no.
    const { negocio, cliente } = await caja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);

    const selloHecho = new Date(Date.now() - UNA_HORA);
    await db.query(
      `INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id, creado_el)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tarjeta,
        negocio.id,
        negocio.local,
        negocio.turno,
        negocio.condicion,
        selloHecho.toISOString(),
      ],
    );
    const puedeSellarDesde = new Date(
      selloHecho.getTime() + HORAS_ENTRE_SELLOS * UNA_HORA,
    );

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.cuerpo['codigo']).toBe('DEMASIADO_PRONTO');
    expect(respuesta.cuerpo['mensaje']).toContain(
      `a las ${horaEnLaPaz(puedeSellarDesde)}`,
    );
    // Y dicho al reves, que es como se veria el error: nunca la hora UTC.
    expect(respuesta.cuerpo['mensaje']).not.toContain(
      `a las ${horaUtc(puedeSellarDesde)}`,
    );
  });

  test('TARJETA_COMPLETA cuando ya llego al premio', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 10);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('TARJETA_COMPLETA');
    expect(respuesta.cuerpo['mensaje']).toContain('entregáselo');
  });

  test('LOCAL_NO_AUTORIZADO cuando al cajero le dieron de baja la asignacion', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await db.query(
      'UPDATE usuario_local SET activo = false WHERE usuario_id = $1 AND local_id = $2',
      [negocio.cajero, negocio.local],
    );

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');
  });

  test('LOCAL_NO_AUTORIZADO cuando el local esta dado de baja', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.local]);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');
  });

  test('DISPOSITIVO_REVOCADO, y no un 401: el dueño acaba de revocarla', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
  });

  test('NEGOCIO_SUSPENDIDO congela las tarjetas', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    await db.query("UPDATE negocio SET estado = 'suspendido' WHERE id = $1", [
      negocio.id,
    ]);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_SUSPENDIDO');
  });

  test('TURNO_CERRADO cuando nadie tiene turno abierto en la tablet', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await db.query('UPDATE turno_caja SET cerrado_el = now() WHERE id = $1', [
      negocio.turno,
    ]);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('TURNO_CERRADO');
    expect(respuesta.cuerpo['mensaje']).toContain('PIN');
  });

  test('PROMO_NO_CONFIGURADA le dice al cajero que avise al dueño', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('PROMO_NO_CONFIGURADA');
    expect(respuesta.cuerpo['mensaje']).toContain('dueño');
  });
});

describe('POST /caja/sellos · la tarjeta vencida no traba al cajero', () => {
  test('la cierra, abre una nueva y sella ahi', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const vencida = await crearTarjetaVencida(db, cliente.id, negocio);
    await crearSellos(db, vencida, negocio, 3);

    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['progreso']).toBe(1);

    const { rows } = await db.query<{ id: string; estado: string }>(
      'SELECT id, estado FROM tarjeta ORDER BY creado_el',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: vencida, estado: 'vencida' });
    expect(rows[1]?.estado).toBe('activa');
    // Los sellos viejos se quedan en la vencida: no se arrastran.
    expect(await contar(db, 'sello', `tarjeta_id = '${vencida}'`)).toBe(3);
  });
});

describe('POST /caja/sellos · credencial e idempotencia', () => {
  test('sin cabecera Authorization, 401 y no se toca nada', async ({ api, db }) => {
    const { cliente } = await caja(db);

    const respuesta = await api.sellar({ cuerpo: { codigo: codigoDe(cliente) } });

    expect(respuesta.estado).toBe(401);
    expect(respuesta.cuerpo['codigo']).toBe('TOKEN_INVALIDO');
    expect(await contar(db, 'sello')).toBe(0);
  });

  test('con un token que no es de ninguna tablet, 401', async ({ api, db }) => {
    const { cliente } = await caja(db);

    const respuesta = await api.sellar({
      token: 'no-soy-una-tablet',
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(401);
  });

  test('sin Idempotency-Key, 400: el doble toque del cajero crearia dos sellos', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      clave: undefined,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(400);
    expect(respuesta.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'sello')).toBe(0);
  });

  test('una Idempotency-Key de mas de 200 caracteres es un 400, no un 500', async ({
    api,
    db,
  }) => {
    // La base la rechaza con peticion_idempotente_clave_razonable_chk; sin el
    // chequeo en el borde, ese rechazo volvia como error del servidor.
    const { negocio, cliente } = await caja(db);

    const respuesta = await api.sellar({
      token: negocio.token,
      clave: 'x'.repeat(201),
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(400);
    expect(respuesta.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
  });

  test('el doble toque con la misma clave devuelve lo mismo y sella una sola vez', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    const llamada = {
      token: negocio.token,
      clave: randomUUID(),
      cuerpo: { codigo: codigoDe(cliente) },
    };

    const primera = await api.sellar(llamada);
    const segunda = await api.sellar(llamada);

    expect(primera.estado).toBe(200);
    expect(segunda.estado).toBe(200);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'sello')).toBe(1);
  });

  test('la misma clave con otro cuerpo se rechaza en lugar de mentir', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await caja(db);
    const otro = await crearClienteEnCaja(db, 'Ana');
    const clave = randomUUID();

    await api.sellar({
      token: negocio.token,
      clave,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    const respuesta = await api.sellar({
      token: negocio.token,
      clave,
      cuerpo: { codigo: codigoDe(otro) },
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
    expect(await contar(db, 'sello')).toBe(1);
  });

  test('un rechazo no se cachea: el reintento vuelve a decidir', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const clave = randomUUID();
    await db.query("UPDATE negocio SET estado = 'suspendido' WHERE id = $1", [
      negocio.id,
    ]);

    const rechazada = await api.sellar({
      token: negocio.token,
      clave,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    await db.query("UPDATE negocio SET estado = 'activo' WHERE id = $1", [negocio.id]);
    const segunda = await api.sellar({
      token: negocio.token,
      clave,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(rechazada.estado).toBe(403);
    expect(segunda.estado).toBe(200);
    expect(await contar(db, 'peticion_idempotente')).toBe(1);
  });

  test('cada tablet tiene su propio espacio de claves', async ({ api, db }) => {
    const { negocio, cliente } = await caja(db);
    const otroNegocio = await crearNegocio(db, 'Pollos B');
    const otroCliente = await crearClienteEnCaja(db, 'Ana');
    const clave = randomUUID();

    const primera = await api.sellar({
      token: negocio.token,
      clave,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    // La misma clave, otra tablet: es otra peticion, no un reintento.
    const segunda = await api.sellar({
      token: otroNegocio.token,
      clave,
      cuerpo: { codigo: codigoDe(otroCliente) },
    });

    expect(primera.estado).toBe(200);
    expect(segunda.estado).toBe(200);
    expect(await contar(db, 'sello')).toBe(2);
  });
});
