import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { LocalDelAdmin } from '@repunto/contratos';

import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearNegocio,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * Los locales de un negocio, desde la ficha del admin: agregar, editar,
 * cerrar y reabrir. Lo que importa es lo que pasa afuera del panel: un local
 * cerrado deja de sellar y su QR deja de anotar gente, y uno nuevo anota con
 * un QR que nadie puede adivinar.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function localesDe(api: Api, token: string, negocio: string) {
  const ficha = await api.fichaDelNegocio(token, negocio);
  expect(ficha.estado).toBe(200);
  return ficha.cuerpo['locales'] as LocalDelAdmin[];
}

const CENTRO = { nombre: 'Centro', direccion: 'Calle Junín 45' };
const NINGUNO = '00000000-0000-4000-8000-000000000000';

describe('POST /admin/negocios/:id/locales · agregar un local', () => {
  test('nace abierto, con un QR al azar, y ese QR anota gente', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const creado = await api.crearLocal(token, negocio.id, CENTRO);

    expect(creado.estado).toBe(201);
    const id = String(creado.cuerpo['id']);
    const local = (await localesDe(api, token, negocio.id)).find((l) => l.id === id);
    expect(local).toMatchObject({ ...CENTRO, activo: true });
    // Diez caracteres del alfabeto sin ambiguos: no sale del nombre.
    expect(local?.qr_slug).toMatch(/^[abcdefghjkmnpqrtuvwxyz2346789]{10}$/);

    const registro = await api.registrar({
      qr_slug: local?.qr_slug,
      telefono: '70124521',
      nombre: 'Ana',
    });
    expect(registro.estado).toBe(202);
    expect(await contar(db, 'registro_pendiente', `local_id = '${id}'`)).toBe(1);
  });

  test('dos locales nunca comparten QR', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    await api.crearLocal(token, negocio.id, CENTRO);
    await api.crearLocal(token, negocio.id, { nombre: 'Norte', direccion: 'Av. Banzer' });

    const qrs = (await localesDe(api, token, negocio.id)).map((l) => l.qr_slug);
    expect(new Set(qrs).size).toBe(qrs.length);
  });

  test('aparece en "Dónde juntar sellos" con su nombre y dirección', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    await api.crearLocal(token, negocio.id, CENTRO);

    const directorio = (await api.negocios()).cuerpo as unknown as {
      negocios: { id: string; locales: { nombre: string; direccion: string }[] }[];
    };
    const delNegocio = directorio.negocios.find((n) => n.id === negocio.id);
    expect(delNegocio?.locales).toContainEqual({ ...CENTRO, ubicacion: null });
  });

  test('el reintento con la misma clave no crea dos', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'local');
    const clave = randomUUID();

    const primero = await api.crearLocal(token, negocio.id, CENTRO, clave);
    const segundo = await api.crearLocal(token, negocio.id, CENTRO, clave);

    expect(segundo.estado).toBe(201);
    expect(segundo.cuerpo['id']).toBe(primero.cuerpo['id']);
    expect(await contar(db, 'local')).toBe(antes + 1);
  });

  test('la misma clave para otro negocio no es un reintento', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const clave = randomUUID();

    await api.crearLocal(token, uno.id, CENTRO, clave);
    const respuesta = await api.crearLocal(token, otro.id, CENTRO, clave);

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
  });

  test('sin Idempotency-Key, 400, y no crea nada', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'local');

    const respuesta = await api.crearLocal(token, negocio.id, CENTRO, null);

    expect(respuesta.estado).toBe(400);
    expect(respuesta.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'local')).toBe(antes);
  });

  test('sin nombre o sin dirección, 422; el QR no se puede elegir', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'local');

    for (const cuerpo of [{ nombre: '  ', direccion: 'Calle 1' }, { nombre: 'Centro' }]) {
      const respuesta = await api.crearLocal(token, negocio.id, cuerpo);
      expect(respuesta.estado).toBe(422);
      expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    }
    expect(await contar(db, 'local')).toBe(antes);

    // Un QR mandado de mas se ignora: lo pone la api, siempre al azar.
    await api.crearLocal(token, negocio.id, { ...CENTRO, qr_slug: 'elegido-a-mano' });
    expect(await contar(db, 'local', `qr_slug = 'elegido-a-mano'`)).toBe(0);
    expect(await contar(db, 'local')).toBe(antes + 1);
  });

  test('en un negocio que no existe, 404', async ({ api, db }) => {
    const token = await entrar(api, db);

    const respuesta = await api.crearLocal(token, NINGUNO, CENTRO);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });
});

describe('POST .../locales/:local/datos · editar un local', () => {
  test('cambia nombre y dirección, y el QR sigue siendo el mismo', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = (await localesDe(api, token, negocio.id)).find(
      (l) => l.id === negocio.local,
    );

    const respuesta = await api.datosDelLocal(token, negocio.id, negocio.local, CENTRO);

    expect(respuesta.estado).toBe(200);
    const locales = respuesta.cuerpo['locales'] as LocalDelAdmin[];
    expect(locales.find((l) => l.id === negocio.local)).toEqual({
      ...antes,
      ...CENTRO,
    });
  });

  test('un local de otro negocio, 404, y no lo toca', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');

    const respuesta = await api.datosDelLocal(token, uno.id, otro.local, CENTRO);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'local', `direccion = '${CENTRO.direccion}'`)).toBe(0);
  });

  test('en un negocio que no existe, NEGOCIO_NO_ENCONTRADO', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.datosDelLocal(token, NINGUNO, negocio.local, CENTRO);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });
});

describe('POST .../locales/:local/cierre y /reapertura', () => {
  test('cerrado, su tablet no sella; reabierto, vuelve a sellar', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const cierre = await api.cerrarLocal(token, negocio.id, negocio.local);
    expect(cierre.estado).toBe(200);
    expect(cierre.cuerpo).toEqual({ activo: false });

    const rechazado = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(rechazado.estado).toBe(403);
    expect(rechazado.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');

    const reapertura = await api.reabrirLocal(token, negocio.id, negocio.local);
    expect(reapertura.cuerpo).toEqual({ activo: true });

    const sellado = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(sellado.estado).toBe(200);
  });

  test('cerrado, su QR no anota a nadie', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const local = (await localesDe(api, token, negocio.id)).find(
      (l) => l.id === negocio.local,
    );

    await api.cerrarLocal(token, negocio.id, negocio.local);
    await api.registrar({ qr_slug: local?.qr_slug, telefono: '70124521', nombre: 'Ana' });

    expect(await contar(db, 'registro_pendiente')).toBe(0);
  });

  test('en la ficha queda al final, cerrado, y no cuenta como abierto', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    await api.cerrarLocal(token, negocio.id, negocio.local);

    const ficha = await api.fichaDelNegocio(token, negocio.id);
    expect(ficha.cuerpo['locales_activos']).toBe(1);
    const locales = ficha.cuerpo['locales'] as LocalDelAdmin[];
    expect(locales.map((l) => [l.id, l.activo])).toEqual([
      [negocio.otroLocal, true],
      [negocio.local, false],
    ]);
  });

  test('cerrar los dos lo saca de "Dónde juntar sellos"', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    await api.cerrarLocal(token, negocio.id, negocio.local);
    await api.cerrarLocal(token, negocio.id, negocio.otroLocal);

    const directorio = (await api.negocios()).cuerpo as unknown as {
      negocios: { id: string }[];
    };
    expect(directorio.negocios.map((n) => n.id)).not.toContain(negocio.id);
  });

  test('cerrar dos veces no falla: queda cerrado', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    await api.cerrarLocal(token, negocio.id, negocio.local);
    const otra = await api.cerrarLocal(token, negocio.id, negocio.local);

    expect(otra.estado).toBe(200);
    expect(otra.cuerpo).toEqual({ activo: false });
  });

  test('un local de otro negocio, 404, y sigue abierto', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');

    const respuesta = await api.cerrarLocal(token, uno.id, otro.local);

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'local', `id = '${otro.local}' AND activo`)).toBe(1);
  });
});

describe('/admin/negocios/:id/locales · solo con la sesion del admin', () => {
  test('sin token o con el de una tablet, 401, y no toca nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'local');

    for (const token of [undefined, negocio.token]) {
      expect((await api.crearLocal(token, negocio.id, CENTRO)).estado).toBe(401);
    }
    expect((await api.cerrarLocal(negocio.token, negocio.id, negocio.local)).estado).toBe(
      401,
    );
    expect(await contar(db, 'local')).toBe(antes);
    expect(await contar(db, 'local', 'activo')).toBe(antes);
  });
});

describe('La ubicacion de un local en el mapa', () => {
  const PLAZA = { latitud: -17.783312, longitud: -63.182104 };

  test('se marca al agregarlo y la ven el admin y el directorio', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const creado = await api.crearLocal(token, negocio.id, {
      ...CENTRO,
      ubicacion: PLAZA,
    });

    expect(creado.estado).toBe(201);
    const id = String(creado.cuerpo['id']);
    const local = (await localesDe(api, token, negocio.id)).find((l) => l.id === id);
    expect(local?.ubicacion).toEqual(PLAZA);
    const directorio = (await api.negocios()).cuerpo['negocios'] as {
      id: string;
      locales: { direccion: string; ubicacion: unknown }[];
    }[];
    const delNegocio = directorio.find((n) => n.id === negocio.id);
    expect(delNegocio?.locales.find((l) => l.direccion === CENTRO.direccion)).toEqual({
      ...CENTRO,
      ubicacion: PLAZA,
    });
  });

  test('sin ubicacion, el local queda sin marcar', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const id = String((await api.crearLocal(token, negocio.id, CENTRO)).cuerpo['id']);

    const local = (await localesDe(api, token, negocio.id)).find((l) => l.id === id);
    expect(local?.ubicacion).toBeNull();
  });

  test('editar la cambia, y con null la quita', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otra = { latitud: -17.7601, longitud: -63.1979 };

    await api.datosDelLocal(token, negocio.id, negocio.local, {
      ...CENTRO,
      ubicacion: PLAZA,
    });
    const cambiada = await api.datosDelLocal(token, negocio.id, negocio.local, {
      ...CENTRO,
      ubicacion: otra,
    });
    const ubicacionDe = (r: typeof cambiada) =>
      (r.cuerpo['locales'] as LocalDelAdmin[]).find((l) => l.id === negocio.local)
        ?.ubicacion;
    expect(ubicacionDe(cambiada)).toEqual(otra);

    const quitada = await api.datosDelLocal(token, negocio.id, negocio.local, {
      ...CENTRO,
      ubicacion: null,
    });
    expect(ubicacionDe(quitada)).toBeNull();
  });

  test('una coordenada fuera del planeta no entra', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.crearLocal(token, negocio.id, {
      ...CENTRO,
      ubicacion: { latitud: -117.7, longitud: -63.1 },
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    expect(await contar(db, 'local', `direccion = '${CENTRO.direccion}'`)).toBe(0);
  });
});

describe('POST .../locales/:local/qr · cambiar el QR', () => {
  test('el QR nuevo anota y el viejo ya no', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const viejo = (await localesDe(api, token, negocio.id)).find(
      (l) => l.id === negocio.local,
    )?.qr_slug;

    const cambiado = await api.cambiarQr(token, negocio.id, negocio.local);

    expect(cambiado.estado).toBe(200);
    const nuevo = String(cambiado.cuerpo['qr_slug']);
    expect(nuevo).toMatch(/^[abcdefghjkmnpqrtuvwxyz2346789]{10}$/);
    expect(nuevo).not.toBe(viejo);
    const enLaFicha = (await localesDe(api, token, negocio.id)).find(
      (l) => l.id === negocio.local,
    );
    expect(enLaFicha?.qr_slug).toBe(nuevo);

    await api.registrar({ qr_slug: viejo, telefono: '70124521', nombre: 'Ana' });
    expect(await contar(db, 'registro_pendiente')).toBe(0);
    const conElNuevo = await api.registrar({
      qr_slug: nuevo,
      telefono: '70124521',
      nombre: 'Ana',
    });
    expect(conElNuevo.estado).toBe(202);
    expect(await contar(db, 'registro_pendiente', `local_id = '${negocio.local}'`)).toBe(
      1,
    );
  });

  test('un local de otro negocio no esta, y no se toca', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const antes = await db.query<{ qr_slug: string }>(
      'SELECT qr_slug FROM local WHERE id = $1',
      [otro.local],
    );

    const cambiado = await api.cambiarQr(token, uno.id, otro.local);

    expect(cambiado.estado).toBe(404);
    expect(cambiado.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    const despues = await db.query<{ qr_slug: string }>(
      'SELECT qr_slug FROM local WHERE id = $1',
      [otro.local],
    );
    expect(despues.rows[0]?.qr_slug).toBe(antes.rows[0]?.qr_slug);
  });

  test('sin sesion de admin no cambia nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    const cambiado = await api.cambiarQr(undefined, negocio.id, negocio.local);

    expect(cambiado.estado).toBe(401);
  });
});
