import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { una } from '../base';
import {
  type NegocioDePrueba,
  crearClienteEnCaja,
  crearNegocio,
  crearRegistro,
  crearSellos,
  crearTarjeta,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * El alta del cliente en el mostrador, de punta a punta: el cliente escanea el
 * QR, el cajero lo ve aparecer en su lista y lo confirma.
 */

async function qrDe(db: Db, negocio: NegocioDePrueba): Promise<string> {
  const { qr_slug } = await una<{ qr_slug: string }>(
    db,
    'SELECT qr_slug FROM local WHERE id = $1',
    [negocio.local],
  );
  return qr_slug;
}

async function registrarse(
  api: Api,
  qr: string,
  tel: string,
  nombre = 'Juan',
  clave: string = randomUUID(),
): Promise<string> {
  const respuesta = await api.registrar({ qr_slug: qr, telefono: tel, nombre }, clave);
  expect(respuesta.estado).toBe(202);
  return String(respuesta.cuerpo['ticket']);
}

/** El id del unico registro que el cajero ve en su lista. */
async function elRegistroDeLaLista(api: Api, negocio: NegocioDePrueba): Promise<string> {
  const lista = await api.registros(negocio.token);
  const registros = lista.cuerpo['registros'] as { id: string }[];
  expect(registros).toHaveLength(1);
  return registros[0]?.id ?? '';
}

describe('POST /registros · el cliente se anota desde su teléfono', () => {
  test('queda pendiente y el cajero lo ve en su lista', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);

    await registrarse(api, qr, '70124521', 'Ana');

    const lista = await api.registros(negocio.token);
    expect(lista.estado).toBe(200);
    const registros = lista.cuerpo['registros'] as { nombre: string; id: string }[];
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ nombre: 'Ana', telefono_final: '4521' });
  });

  test('la lista no muestra el teléfono entero', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await registrarse(api, await qrDe(db, negocio), '70124521');

    const lista = await api.registros(negocio.token);

    expect(JSON.stringify(lista.cuerpo)).not.toContain('70124521');
    expect(JSON.stringify(lista.cuerpo)).toContain('4521');
  });

  test('INV-20 · normaliza el teléfono a E.164 antes de guardarlo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await registrarse(api, await qrDe(db, negocio), '(591) 7012-4521');

    const { telefono: guardado } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM registro_pendiente',
    );
    expect(guardado).toBe('+59170124521');
  });

  test('TELEFONO_INVALIDO cuando no hay forma de entender el número', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);

    const respuesta = await api.registrar({
      qr_slug: await qrDe(db, negocio),
      telefono: '4321',
      nombre: 'Juan',
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('TELEFONO_INVALIDO');
    expect(await contar(db, 'registro_pendiente')).toBe(0);
  });

  test('un QR que no es de ningún local no registra nada', async ({ api, db }) => {
    await crearNegocio(db);

    const respuesta = await api.registrar({
      qr_slug: 'qr-que-no-existe',
      telefono: '70124521',
      nombre: 'Juan',
    });

    expect(respuesta.estado).toBe(422);
    expect(await contar(db, 'registro_pendiente')).toBe(0);
  });

  test('el reintento del mismo equipo recibe el mismo ticket y no duplica la fila', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const clave = randomUUID();

    // La respuesta se perdio en el wifi del local y la app reintenta.
    const primero = await registrarse(api, qr, '70124521', 'Juan', clave);
    const segundo = await registrarse(api, qr, '70124521', 'Juan', clave);

    expect(segundo).toBe(primero);
    expect(await contar(db, 'registro_pendiente')).toBe(1);
    expect((await api.miRegistro(primero)).cuerpo['estado']).toBe('pendiente');
  });

  test('la misma clave con otro nombre no es un reintento', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const clave = randomUUID();
    await registrarse(api, qr, '70124521', 'Juan', clave);

    const otra = await api.registrar(
      { qr_slug: qr, telefono: '70124521', nombre: 'Juan Carlos' },
      clave,
    );

    expect(otra.estado).toBe(422);
    expect(otra.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
  });

  test('sin Idempotency-Key no registra: el ticket se deriva de ella', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const cuerpo = { qr_slug: qr, telefono: '70124521', nombre: 'Juan' };

    const sinClave = await api.registrar(cuerpo, null);
    // Una clave corta se adivina, y con ella y el telefono se recalcula el
    // ticket de otro.
    const corta = await api.registrar(cuerpo, 'clave-corta-12345');

    expect(sinClave.estado).toBe(400);
    expect(sinClave.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(corta.estado).toBe(400);
    expect(await contar(db, 'registro_pendiente')).toBe(0);
  });

  test('hay tope de pendientes por local, y el que no entra no se entera', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);

    for (let i = 0; i < 21; i += 1) {
      await registrarse(api, qr, `701${String(i).padStart(5, '0')}`);
    }

    // La respuesta fue 202 las 21 veces; la lista se cortó en 20.
    expect(await contar(db, 'registro_pendiente')).toBe(20);
  });

  test('la lista trae ETag y el panel que no cambió recibe 304', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await registrarse(api, await qrDe(db, negocio), '70124521');

    const primera = await api.registros(negocio.token);
    const etiqueta = primera.cabeceras['etag'] ?? '';
    const segunda = await api.registros(negocio.token, etiqueta);

    expect(etiqueta).not.toBe('');
    expect(segunda.estado).toBe(304);
  });

  test('sin token de tablet no se puede mirar la lista', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await registrarse(api, await qrDe(db, negocio), '70124521');

    expect((await api.registros('no-soy-una-tablet')).estado).toBe(401);
  });

  test('una tablet revocada ya no ve la lista: son nombres de clientes', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await registrarse(api, await qrDe(db, negocio), '70124521', 'Ana');
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.registros(negocio.token);

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
    expect(JSON.stringify(respuesta.cuerpo)).not.toContain('Ana');
  });

  test('la tablet de un local dado de baja tampoco', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await crearRegistro(db, negocio.local);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.local]);

    const respuesta = await api.registros(negocio.token);

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');
  });
});

describe('POST /registros · nadie se queda con el registro de otro', () => {
  test('otro equipo con el mismo teléfono recibe REGISTRO_EN_CURSO y no toca nada', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const deAna = await registrarse(api, qr, '70124521', 'Ana');

    // Alguien que conoce el teléfono de Ana lo anota desde su casa: el QR está
    // impreso en el mostrador.
    const ajeno = await api.registrar({
      qr_slug: qr,
      telefono: '70124521',
      nombre: 'Ana',
    });

    expect(ajeno.estado).toBe(409);
    expect(ajeno.cuerpo['codigo']).toBe('REGISTRO_EN_CURSO');
    expect(ajeno.cuerpo['ticket']).toBeUndefined();
    expect(await contar(db, 'registro_pendiente')).toBe(1);
    expect((await api.miRegistro(deAna)).cuerpo['estado']).toBe('pendiente');
  });

  test('el cajero confirma a Ana y la sesión es de Ana, no del que se coló', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const deAna = await registrarse(api, qr, '70124521', 'Ana');
    const ajeno = await api.registrar({
      qr_slug: qr,
      telefono: '70124521',
      nombre: 'Ana',
    });
    expect(ajeno.estado).toBe(409);

    await api.confirmar(negocio.token, await elRegistroDeLaLista(api, negocio), false);
    const estado = await api.miRegistro(deAna);

    expect(estado.cuerpo['estado']).toBe('confirmado');
    expect(typeof estado.cuerpo['token']).toBe('string');
  });

  test('un registro vencido sí se retoma: su dueño ya no está esperando', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const viejo = await registrarse(api, qr, '70124521', 'Ana');
    await db.query(
      `UPDATE registro_pendiente
       SET creado_el = now() - interval '2 hours', expira_el = now() - interval '1 hour'`,
    );

    const nuevo = await registrarse(api, qr, '70124521', 'Ana María');

    expect(nuevo).not.toBe(viejo);
    expect(await contar(db, 'registro_pendiente')).toBe(1);
    expect((await api.miRegistro(nuevo)).cuerpo['estado']).toBe('pendiente');
    // Y vuelve a la lista del cajero como recién llegado, con su nombre nuevo.
    const lista = await api.registros(negocio.token);
    expect(lista.cuerpo['registros']).toEqual([
      expect.objectContaining({ nombre: 'Ana María', telefono_final: '4521' }),
    ]);
  });

  test('dos equipos a la vez con el mismo teléfono: uno solo se queda', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const cuerpo = { qr_slug: qr, telefono: '70124521', nombre: 'Ana' };

    const respuestas = await Promise.all([api.registrar(cuerpo), api.registrar(cuerpo)]);

    expect(respuestas.map((r) => r.estado).sort()).toEqual([202, 409]);
    expect(await contar(db, 'registro_pendiente')).toBe(1);
  });

  test('el doble toque simultáneo del mismo equipo da el mismo ticket', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const qr = await qrDe(db, negocio);
    const cuerpo = { qr_slug: qr, telefono: '70124521', nombre: 'Ana' };
    const clave = randomUUID();

    const [a, b] = await Promise.all([
      api.registrar(cuerpo, clave),
      api.registrar(cuerpo, clave),
    ]);

    expect([a.estado, b.estado]).toEqual([202, 202]);
    expect(a.cuerpo['ticket']).toBe(b.cuerpo['ticket']);
    expect(await contar(db, 'registro_pendiente')).toBe(1);
  });
});

describe('POST /caja/registros/:id/confirmar · cliente nuevo', () => {
  test('solo confirmar crea la cuenta y le abre la tarjeta, sin sello', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local, { nombre: 'Ana' });

    const respuesta = await api.confirmar(negocio.token, id, false);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({
      nombre: 'Ana',
      progreso: 0,
      faltan: 10,
      completa: false,
      sello: false,
    });
    expect(await contar(db, 'cliente')).toBe(1);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
    expect(await contar(db, 'sello')).toBe(0);
  });

  test('confirmar y sellar otorga el sello en el mismo acto', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);

    const respuesta = await api.confirmar(negocio.token, id, true);

    expect(respuesta.cuerpo).toMatchObject({ progreso: 1, faltan: 9, sello: true });
    expect(await contar(db, 'sello')).toBe(1);
    const tarjeta = await una<{ reloj_desde: Date | null }>(
      db,
      'SELECT reloj_desde FROM tarjeta',
    );
    expect(tarjeta.reloj_desde).not.toBeNull();
  });

  test('la cuenta nace con código público válido y semilla cifrada', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);

    await api.confirmar(negocio.token, id, false);

    const cliente = await una<{
      codigo_publico: string;
      semilla_totp: string;
      telefono_verificado: boolean;
    }>(db, 'SELECT codigo_publico, semilla_totp, telefono_verificado FROM cliente');
    expect(cliente.codigo_publico).toMatch(/^[A-HJKMNP-RT-Z2-46-9]{5}$/);
    // Cifrada en reposo: ni la semilla ni nada que se le parezca en claro.
    expect(cliente.semilla_totp).toMatch(/^v1\./);
    // El alta presencial no verifica el teléfono (especificación, sección 3).
    expect(cliente.telefono_verificado).toBe(false);
  });

  test('el registro queda confirmado, con el turno que lo confirmó', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);

    await api.confirmar(negocio.token, id, false);

    const registro = await una<{
      estado: string;
      cliente_creado: boolean;
      resuelto_turno_id: string;
    }>(db, 'SELECT estado, cliente_creado, resuelto_turno_id FROM registro_pendiente');
    expect(registro).toMatchObject({
      estado: 'confirmado',
      cliente_creado: true,
      resuelto_turno_id: negocio.turno,
    });
  });
});

describe('POST /caja/registros/:id/confirmar · cliente que ya existía', () => {
  test('no crea otra cuenta: le abre una tarjeta más', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const otroNegocio = await crearNegocio(db, 'Pollos B');
    const cliente = await crearClienteEnCaja(db, 'Juan');
    const { telefono: tel } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM cliente WHERE id = $1',
      [cliente.id],
    );
    const { id } = await crearRegistro(db, otroNegocio.local, { telefono: tel });

    const respuesta = await api.confirmar(otroNegocio.token, id, false);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['nombre']).toBe('Juan');
    expect(await contar(db, 'cliente')).toBe(1);
    expect(await contar(db, 'tarjeta', `negocio_id = '${otroNegocio.id}'`)).toBe(1);
    const registro = await una<{ cliente_creado: boolean }>(
      db,
      'SELECT cliente_creado FROM registro_pendiente',
    );
    expect(registro.cliente_creado).toBe(false);
    expect(negocio.id).not.toBe(otroNegocio.id);
  });

  test('si ya tiene tarjeta en ese negocio, no abre otra (INV-11)', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 3);
    const { telefono: tel } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM cliente WHERE id = $1',
      [cliente.id],
    );
    const { id } = await crearRegistro(db, negocio.local, { telefono: tel });

    const respuesta = await api.confirmar(negocio.token, id, false);

    expect(respuesta.cuerpo).toMatchObject({ progreso: 3, faltan: 7 });
    expect(await contar(db, 'tarjeta')).toBe(1);
  });
});

describe('POST /caja/registros/:id · lo que lo frena', () => {
  test('REGISTRO_NO_ENCONTRADO cuando es de otra sucursal', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.otroLocal);

    const respuesta = await api.confirmar(negocio.token, id, false);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('REGISTRO_NO_ENCONTRADO');
  });

  test('REGISTRO_NO_ENCONTRADO cuando ya venció', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local, { minutos: 30 });
    // Tambien se mueve creado_el: la base exige que expira_el sea posterior.
    await db.query(
      `UPDATE registro_pendiente
       SET creado_el = now() - interval '2 hours', expira_el = now() - interval '1 hour'
       WHERE id = $1`,
      [id],
    );

    expect((await api.confirmar(negocio.token, id, false)).estado).toBe(404);
  });

  test('REGISTRO_NO_ENCONTRADO cuando el id no existe', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    expect((await api.confirmar(negocio.token, randomUUID(), false)).estado).toBe(404);
  });

  test('REGISTRO_YA_RESUELTO cuando otro cajero llegó primero', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);
    await api.confirmar(negocio.token, id, false);

    const respuesta = await api.confirmar(negocio.token, id, false);

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('REGISTRO_YA_RESUELTO');
    expect(await contar(db, 'cliente')).toBe(1);
  });

  test('un id que no es un uuid es una petición inválida, no un 500', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);

    expect((await api.confirmar(negocio.token, 'sarasa', false)).estado).toBe(422);
  });

  test('DISPOSITIVO_REVOCADO también frena el alta', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    expect((await api.confirmar(negocio.token, id, false)).estado).toBe(403);
  });

  test('el doble toque del cajero confirma una sola vez', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);
    const clave = randomUUID();

    const primera = await api.confirmar(negocio.token, id, true, clave);
    const segunda = await api.confirmar(negocio.token, id, true, clave);

    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'cliente')).toBe(1);
    expect(await contar(db, 'sello')).toBe(1);
  });
});

describe('POST /caja/registros/:id/descartar', () => {
  test('lo saca de la lista sin crear nada, y queda quién lo descartó', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);

    const respuesta = await api.descartar(negocio.token, id);

    expect(respuesta.estado).toBe(200);
    expect(await contar(db, 'cliente')).toBe(0);
    const registro = await una<{ estado: string; resuelto_turno_id: string }>(
      db,
      'SELECT estado, resuelto_turno_id FROM registro_pendiente',
    );
    expect(registro).toMatchObject({
      estado: 'descartado',
      resuelto_turno_id: negocio.turno,
    });
    expect((await api.registros(negocio.token)).cuerpo['registros']).toHaveLength(0);
  });

  test('descartado no se puede confirmar después', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id } = await crearRegistro(db, negocio.local);
    await api.descartar(negocio.token, id);

    const respuesta = await api.confirmar(negocio.token, id, false);

    expect(respuesta.cuerpo['codigo']).toBe('REGISTRO_YA_RESUELTO');
  });
});

describe('el cliente recién dado de alta puede sellar', () => {
  test('con el código que le da la app', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { id, ticket } = await crearRegistro(db, negocio.local);
    await api.confirmar(negocio.token, id, false);

    const mio = await api.miRegistro(ticket);
    const token = String(mio.cuerpo['token']);
    const codigos = (await api.miCodigo(token)).cuerpo['codigos'] as {
      codigo: string;
    }[];
    const respuesta = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigos[0]?.codigo },
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['progreso']).toBe(1);
  });
});
