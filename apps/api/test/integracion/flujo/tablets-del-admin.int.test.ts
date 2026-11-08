import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { TabletDelAdmin } from '@repunto/contratos';

import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearNegocio,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * Las tablets desde la ficha del admin: verlas con su salud, generar el
 * codigo para vincular una y revocar una perdida. Lo que importa es lo que
 * pasa en la caja: el codigo vincula de verdad, y la revocada deja de operar.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function tabletsDe(api: Api, token: string, negocio: string) {
  const ficha = await api.fichaDelNegocio(token, negocio);
  expect(ficha.estado).toBe(200);
  return ficha.cuerpo['tablets'] as TabletDelAdmin[];
}

const NINGUNO = '00000000-0000-4000-8000-000000000000';

describe('GET /admin/negocios/:id · las tablets en la ficha', () => {
  test('trae las del negocio con su ultimo sello y su ultimo rechazo', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(sello.estado).toBe(200);
    const rechazado = await api.sellar({
      token: negocio.tokenOtroLocal,
      cuerpo: { codigo: 'AAAAA-000000' },
    });
    expect(rechazado.estado).toBe(422);

    const tablets = await tabletsDe(api, token, negocio.id);

    expect(tablets.map((t) => t.id).sort()).toEqual(
      [negocio.dispositivo, negocio.dispositivoOtroLocal].sort(),
    );
    expect(tablets.map((t) => t.id)).not.toContain(otro.dispositivo);
    const principal = tablets.find((t) => t.id === negocio.dispositivo);
    expect(principal).toMatchObject({
      local_id: negocio.local,
      nombre: 'Caja 1',
      revocada_el: null,
      ultimo_rechazo: null,
    });
    expect(principal?.ultimo_sello).not.toBeNull();
    expect(principal?.ultimo_intento).not.toBeNull();
    const segunda = tablets.find((t) => t.id === negocio.dispositivoOtroLocal);
    expect(segunda).toMatchObject({
      local_id: negocio.otroLocal,
      ultimo_sello: null,
      ultimo_rechazo: 'CODIGO_INVALIDO',
    });
  });
});

describe('POST /admin/negocios/:id/locales/:local/vinculacion · vincular una tablet', () => {
  test('el codigo vincula una tablet nueva en ese local, firmada por el admin', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const generado = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.local,
    );

    expect(generado.estado).toBe(201);
    const codigo = String(generado.cuerpo['codigo']);
    expect(codigo).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const minutos =
      (Date.parse(String(generado.cuerpo['expira_el'])) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);
    expect(
      await contar(
        db,
        'vinculacion_pendiente',
        `local_id = '${negocio.local}' AND creado_por_admin_id IS NOT NULL`,
      ),
    ).toBe(1);

    const vinculada = await api.vincular({ codigo });
    expect(vinculada.estado).toBe(200);

    const nueva = (await tabletsDe(api, token, negocio.id)).find(
      (t) => t.id !== negocio.dispositivo && t.id !== negocio.dispositivoOtroLocal,
    );
    expect(nueva).toMatchObject({
      local_id: negocio.local,
      nombre: 'Caja 2',
      revocada_el: null,
      ultimo_sello: null,
    });
    const estado = await api.estadoDeCaja(String(vinculada.cuerpo['token']));
    expect(estado.estado).toBe(200);
  });

  test('la misma clave devuelve el mismo codigo; otra clave, otro', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const clave = randomUUID();

    const primero = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.local,
      clave,
    );
    const reintento = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.local,
      clave,
    );
    const otro = await api.codigoDeVinculacionComoAdmin(token, negocio.id, negocio.local);

    expect(reintento.cuerpo).toEqual(primero.cuerpo);
    expect(otro.cuerpo['codigo']).not.toBe(primero.cuerpo['codigo']);
    expect(
      await contar(db, 'vinculacion_pendiente', `local_id = '${negocio.local}'`),
    ).toBe(2);
  });

  test('la misma clave para otro local no es un reintento', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const clave = randomUUID();

    await api.codigoDeVinculacionComoAdmin(token, negocio.id, negocio.local, clave);
    const otro = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.otroLocal,
      clave,
    );

    expect(otro.estado).toBe(422);
    expect(otro.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
  });

  test('un local cerrado no recibe tablets', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    expect((await api.cerrarLocal(token, negocio.id, negocio.local)).estado).toBe(200);

    const generado = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.local,
    );

    expect(generado.estado).toBe(409);
    expect(generado.cuerpo['codigo']).toBe('LOCAL_CERRADO');
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
  });

  test('un local de otro negocio no esta', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);

    const generado = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      otro.local,
    );

    expect(generado.estado).toBe(404);
    expect(generado.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
  });

  test('un negocio que no existe es NEGOCIO_NO_ENCONTRADO', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const generado = await api.codigoDeVinculacionComoAdmin(
      token,
      NINGUNO,
      negocio.local,
    );

    expect(generado.estado).toBe(404);
    expect(generado.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });

  test('sin Idempotency-Key no genera nada', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const generado = await api.codigoDeVinculacionComoAdmin(
      token,
      negocio.id,
      negocio.local,
      null,
    );

    expect(generado.estado).toBe(400);
    expect(generado.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
  });

  test('sin sesion de admin no genera nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    const generado = await api.codigoDeVinculacionComoAdmin(
      undefined,
      negocio.id,
      negocio.local,
    );

    expect(generado.estado).toBe(401);
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
  });
});

describe('POST /admin/negocios/:id/tablets/:tablet/revocacion · revocar', () => {
  test('la revocada deja de operar en el pedido siguiente y queda en la ficha', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const revocada = await api.revocarTablet(token, negocio.id, negocio.dispositivo);

    expect(revocada.estado).toBe(200);
    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(sello.estado).toBe(403);
    expect(sello.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
    const tablet = (await tabletsDe(api, token, negocio.id)).find(
      (t) => t.id === negocio.dispositivo,
    );
    expect(tablet?.revocada_el).toBe(revocada.cuerpo['revocada_el']);
    // La otra tablet sigue andando.
    const otra = await api.estadoDeCaja(negocio.tokenOtroLocal);
    expect(otra.estado).toBe(200);
  });

  test('revocar dos veces devuelve la fecha de la primera', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const primera = await api.revocarTablet(token, negocio.id, negocio.dispositivo);
    const segunda = await api.revocarTablet(token, negocio.id, negocio.dispositivo);

    expect(segunda.estado).toBe(200);
    expect(segunda.cuerpo['revocada_el']).toBe(primera.cuerpo['revocada_el']);
  });

  test('una tablet de otro negocio no esta, y no se toca', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);

    const revocada = await api.revocarTablet(token, negocio.id, otro.dispositivo);

    expect(revocada.estado).toBe(404);
    expect(revocada.cuerpo['codigo']).toBe('TABLET_NO_ENCONTRADA');
    expect(
      await contar(
        db,
        'dispositivo_caja',
        `id = '${otro.dispositivo}' AND revocado_el IS NULL`,
      ),
    ).toBe(1);
  });

  test('un negocio que no existe es NEGOCIO_NO_ENCONTRADO', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const revocada = await api.revocarTablet(token, NINGUNO, negocio.dispositivo);

    expect(revocada.estado).toBe(404);
    expect(revocada.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });

  test('sin sesion de admin no revoca', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    const revocada = await api.revocarTablet(undefined, negocio.id, negocio.dispositivo);

    expect(revocada.estado).toBe(401);
    expect(
      await contar(
        db,
        'dispositivo_caja',
        `id = '${negocio.dispositivo}' AND revocado_el IS NULL`,
      ),
    ).toBe(1);
  });
});
