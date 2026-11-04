import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { NegocioNuevo } from '@repunto/contratos';

import { una } from '../base';
import {
  abrirTurno,
  asignar,
  codigoDe,
  crearClienteEnCaja,
  crearDispositivo,
  crearEntradaDeAdmin,
  crearLocal,
  crearNegocio,
  crearUsuario,
} from '../escenario';
import { nuevoToken } from '../../../src/seguridad/token';
import { type Api, type Db, contar, test } from './base';

/**
 * El alta de un negocio desde el panel de administracion: el negocio, su
 * promo y su condicion, todo junto y una sola vez aunque el boton se toque
 * dos veces. Y la lista que ve el admin.
 */

async function entrar(api: Api, db: Db): Promise<{ token: string; admin: string }> {
  const { codigo, admin } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return { token: String(respuesta.cuerpo['token']), admin };
}

function alta(cambio: Partial<NegocioNuevo> = {}): NegocioNuevo {
  return {
    nombre: 'Café Aroma',
    categoria: 'cafe',
    color_principal: '#7A3E1D',
    icono_sello: 'cafe',
    plantilla_tarjeta: 'clasica',
    canje_cualquier_local: true,
    programa: {
      sellos_requeridos: 8,
      premio: 'Un café gratis',
      vigencia_meses: 1,
      horas_entre_sellos: 4,
      pide_monto: false,
    },
    condicion: { texto: 'Cualquier bebida caliente', monto_minimo: '15.50' },
    ...cambio,
  };
}

describe('POST /admin/negocios · el alta', () => {
  test('crea el negocio, la version 1 de su promo y la condicion firmada por el admin', async ({
    api,
    db,
  }) => {
    const { token, admin } = await entrar(api, db);

    const respuesta = await api.crearNegocioComoAdmin(token, alta(), randomUUID());

    expect(respuesta.estado).toBe(201);
    const id = String(respuesta.cuerpo['id']);
    expect(
      await una(
        db,
        `SELECT nombre, categoria, color_principal, icono_sello, plantilla_tarjeta,
                canje_cualquier_local, estado::text
         FROM negocio WHERE id = $1`,
        [id],
      ),
    ).toEqual({
      nombre: 'Café Aroma',
      categoria: 'cafe',
      color_principal: '#7A3E1D',
      icono_sello: 'cafe',
      plantilla_tarjeta: 'clasica',
      canje_cualquier_local: true,
      estado: 'activo',
    });
    expect(
      await una(
        db,
        `SELECT version, sellos_requeridos, premio, vigencia_meses,
                horas_entre_sellos, pide_monto, vigente
         FROM programa WHERE negocio_id = $1`,
        [id],
      ),
    ).toEqual({
      version: 1,
      sellos_requeridos: 8,
      premio: 'Un café gratis',
      vigencia_meses: 1,
      horas_entre_sellos: 4,
      pide_monto: false,
      vigente: true,
    });
    expect(
      await una(
        db,
        `SELECT texto, monto_minimo::text, usuario_id, creado_por_admin_id,
                vigente_desde <= now() AS vigente
         FROM condicion_sello WHERE negocio_id = $1`,
        [id],
      ),
    ).toEqual({
      texto: 'Cualquier bebida caliente',
      monto_minimo: '15.50',
      usuario_id: null,
      creado_por_admin_id: admin,
      vigente: true,
    });
  });

  test('una tarjeta que no vence y sin monto minimo', async ({ api, db }) => {
    const { token } = await entrar(api, db);
    const pedido = alta();

    const respuesta = await api.crearNegocioComoAdmin(
      token,
      {
        ...pedido,
        programa: { ...pedido.programa, vigencia_meses: null },
        condicion: { texto: 'Un corte', monto_minimo: null },
      },
      randomUUID(),
    );

    expect(respuesta.estado).toBe(201);
    const id = String(respuesta.cuerpo['id']);
    expect(
      await una(
        db,
        `SELECT p.vigencia_meses, c.monto_minimo
         FROM programa p JOIN condicion_sello c ON c.negocio_id = p.negocio_id
         WHERE p.negocio_id = $1`,
        [id],
      ),
    ).toEqual({ vigencia_meses: null, monto_minimo: null });
  });

  test('con un local, una tablet y un cajero, ya sella con la condicion del admin', async ({
    api,
    db,
  }) => {
    const { token: tokenDeAdmin } = await entrar(api, db);
    const creado = await api.crearNegocioComoAdmin(tokenDeAdmin, alta(), randomUUID());
    const negocio = String(creado.cuerpo['id']);

    const local = await crearLocal(db, negocio, 'Equipetrol');
    const cajero = await crearUsuario(db, negocio, 'cajero', null);
    await asignar(db, cajero, local, negocio);
    const tokenDeTablet = nuevoToken();
    const dispositivo = await crearDispositivo(db, local, tokenDeTablet);
    await abrirTurno(db, dispositivo, cajero, local);
    const cliente = await crearClienteEnCaja(db);

    const sello = await api.sellar({
      token: tokenDeTablet,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(sello.estado).toBe(200);
    expect(sello.cuerpo).toMatchObject({ progreso: 1, faltan: 7 });
    expect(
      await una(
        db,
        `SELECT c.creado_por_admin_id IS NOT NULL AS del_admin
         FROM sello s JOIN condicion_sello c ON c.id = s.condicion_id
         WHERE s.negocio_id = $1`,
        [negocio],
      ),
    ).toEqual({ del_admin: true });
  });

  test('sin locales todavia no aparece en "Donde juntar sellos"; con uno, si', async ({
    api,
    db,
  }) => {
    const { token } = await entrar(api, db);
    const creado = await api.crearNegocioComoAdmin(token, alta(), randomUUID());
    const id = String(creado.cuerpo['id']);

    expect((await api.negocios()).cuerpo).toEqual({ negocios: [] });

    await crearLocal(db, id, 'Centro');
    const directorio = await api.negocios();
    expect(directorio.cuerpo['negocios']).toMatchObject([
      { id, nombre: 'Café Aroma', premio: 'Un café gratis', sellos_requeridos: 8 },
    ]);
  });

  test('el doble toque crea un solo negocio y responde lo mismo', async ({ api, db }) => {
    const { token } = await entrar(api, db);
    const clave = randomUUID();

    const primera = await api.crearNegocioComoAdmin(token, alta(), clave);
    const segunda = await api.crearNegocioComoAdmin(token, alta(), clave);

    expect(segunda.estado).toBe(201);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'negocio')).toBe(1);
    expect(await contar(db, 'programa')).toBe(1);
    expect(await contar(db, 'condicion_sello')).toBe(1);
  });

  test('la misma clave con otro cuerpo no es un reintento', async ({ api, db }) => {
    const { token } = await entrar(api, db);
    const clave = randomUUID();
    await api.crearNegocioComoAdmin(token, alta(), clave);

    const otra = await api.crearNegocioComoAdmin(
      token,
      alta({ nombre: 'Otro negocio' }),
      clave,
    );

    expect(otra.estado).toBe(422);
    expect(otra.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
    expect(await contar(db, 'negocio')).toBe(1);
  });

  test('sin Idempotency-Key no crea nada', async ({ api, db }) => {
    const { token } = await entrar(api, db);

    const respuesta = await api.crearNegocioComoAdmin(token, alta());

    expect(respuesta.estado).toBe(400);
    expect(respuesta.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'negocio')).toBe(0);
  });

  test('un cuerpo invalido no crea nada', async ({ api, db }) => {
    const { token } = await entrar(api, db);

    const respuesta = await api.crearNegocioComoAdmin(
      token,
      alta({ categoria: 'ferreteria' as NegocioNuevo['categoria'] }),
      randomUUID(),
    );

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    expect(await contar(db, 'negocio')).toBe(0);
  });
});

describe('GET /admin/negocios · la lista', () => {
  test('todos, suspendidos incluidos, los mas nuevos primero, con promo y condicion', async ({
    api,
    db,
  }) => {
    const { token } = await entrar(api, db);
    // De la semilla de tests: dos locales, promo y condicion cargadas a mano.
    const viejo = await crearNegocio(db, 'Panadería Vieja');
    await db.query(
      `UPDATE negocio SET estado = 'suspendido', creado_el = now() - interval '1 day'
       WHERE id = $1`,
      [viejo.id],
    );
    const creado = await api.crearNegocioComoAdmin(token, alta(), randomUUID());

    const lista = await api.negociosDelAdmin(token);

    expect(lista.estado).toBe(200);
    expect(lista.cuerpo['negocios']).toMatchObject([
      {
        id: creado.cuerpo['id'],
        nombre: 'Café Aroma',
        estado: 'activo',
        categoria: 'cafe',
        locales_activos: 0,
        programa: { sellos_requeridos: 8, premio: 'Un café gratis' },
        condicion: { texto: 'Cualquier bebida caliente' },
      },
      {
        id: viejo.id,
        nombre: 'Panadería Vieja',
        estado: 'suspendido',
        locales_activos: 2,
        programa: { sellos_requeridos: 10, premio: 'Un cafe' },
        condicion: { texto: 'Cualquier capuchino' },
      },
    ]);
  });

  test('un negocio sin promo ni condicion aparece con las dos en null', async ({
    api,
    db,
  }) => {
    const { token } = await entrar(api, db);
    await db.query(
      `INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
       VALUES ('A medias', 'otro', '#FFFFFF', 'clasica', 'estrella')`,
    );

    const lista = await api.negociosDelAdmin(token);

    expect(lista.cuerpo['negocios']).toMatchObject([
      { nombre: 'A medias', programa: null, condicion: null, locales_activos: 0 },
    ]);
  });
});

describe('/admin/negocios · solo con la sesion del admin', () => {
  test('sin token, 401, y no crea nada', async ({ api, db }) => {
    expect((await api.negociosDelAdmin()).estado).toBe(401);
    const alta_ = await api.crearNegocioComoAdmin(undefined, alta(), randomUUID());
    expect(alta_.estado).toBe(401);
    expect(await contar(db, 'negocio')).toBe(0);
  });

  test('el token de una tablet no abre /admin/negocios', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    expect((await api.negociosDelAdmin(negocio.token)).estado).toBe(401);
    const alta_ = await api.crearNegocioComoAdmin(negocio.token, alta(), randomUUID());
    expect(alta_.estado).toBe(401);
    expect(await contar(db, 'negocio')).toBe(1);
  });
});
