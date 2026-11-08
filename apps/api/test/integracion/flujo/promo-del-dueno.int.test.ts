import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { ProgramaNuevo } from '@repunto/contratos';

import { una } from '../base';
import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearEntradaDeDueno,
  crearNegocio,
  crearUsuario,
  type NegocioDePrueba,
  telefono,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * El dueño cambia su promo y su condición desde su panel. Las reglas son las
 * mismas que cuando lo hace el admin (versión nueva, desde ahora); lo que
 * se prueba acá es lo propio del dueño: el negocio sale de la sesión y nunca
 * del pedido (INV-1), y la condición queda firmada con su nombre.
 */

async function entrarComoDueno(api: Api, db: Db, dueno: string): Promise<string> {
  const { codigo } = await crearEntradaDeDueno(db, dueno);
  const respuesta = await api.entrarComoDueno({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function entrarComoAdmin(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

const PROMO_NUEVA: ProgramaNuevo = {
  sellos_requeridos: 6,
  premio: 'Una medialuna',
  vigencia_meses: null,
  horas_entre_sellos: 0,
  pide_monto: true,
};

const CONDICION_NUEVA = { texto: 'Una torta entera', monto_minimo: '80' };

async function sellar(
  api: Api,
  negocio: NegocioDePrueba,
  cliente: Parameters<typeof codigoDe>[0],
) {
  return api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });
}

async function versiones(db: Db, negocio: string) {
  return una(
    db,
    `SELECT array_agg(version ORDER BY version) AS versiones,
            array_agg(vigente ORDER BY version) AS vigentes
     FROM programa WHERE negocio_id = $1`,
    [negocio],
  );
}

describe('GET /dueno/promo', () => {
  test('la promo vigente, las tarjetas en curso y quien escribio cada condicion', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await crearNegocio(db, 'Otro');
    await sellar(api, negocio, await crearClienteEnCaja(db, 'Ana'));
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.promoDelDueno(token);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({
      programa: { version: 1, sellos_requeridos: 10, premio: 'Un cafe' },
      tarjetas_en_curso: 1,
      condiciones: [
        {
          texto: 'Cualquier capuchino',
          autor: { tipo: 'negocio', nombre: 'dueno de prueba' },
        },
      ],
    });
  });

  test('sin sesion, 401 en las tres rutas', async ({ api }) => {
    for (const respuesta of [
      await api.promoDelDueno(),
      await api.cambiarProgramaComoDueno(undefined, PROMO_NUEVA),
      await api.cambiarCondicionComoDueno(undefined, CONDICION_NUEVA),
    ]) {
      expect(respuesta.estado).toBe(401);
    }
  });

  test('un dueno dado de baja ya no ve ni cambia la promo', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await api.darDeBaja(await entrarComoAdmin(api, db), negocio.id, negocio.dueno);

    expect((await api.promoDelDueno(token)).estado).toBe(401);
    expect((await api.cambiarProgramaComoDueno(token, PROMO_NUEVA)).estado).toBe(401);
    expect(await contar(db, 'programa')).toBe(1);
  });
});

describe('POST /dueno/promo/programa', () => {
  test('INV-5 e INV-6 · nace la version 2; la tarjeta en curso sigue con la 1', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await sellar(api, negocio, await crearClienteEnCaja(db, 'Ana'));
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarProgramaComoDueno(token, PROMO_NUEVA);

    expect(respuesta.estado).toBe(201);
    expect(respuesta.cuerpo).toEqual({ version: 2, tarjetas_en_curso: 1 });
    expect(await versiones(db, negocio.id)).toEqual({
      versiones: [1, 2],
      vigentes: [false, true],
    });
    const juan = await sellar(api, negocio, await crearClienteEnCaja(db, 'Juan'));
    expect(juan.cuerpo).toMatchObject({ progreso: 1, faltan: 5 });
    const ana = await una(
      db,
      `SELECT p.version FROM tarjeta t
       JOIN cliente c ON c.id = t.cliente_id JOIN programa p ON p.id = t.programa_id
       WHERE c.nombre = 'Ana'`,
    );
    expect(ana).toEqual({ version: 1 });
  });

  test('INV-1 · un negocio_id en el cuerpo no se lee: cambia solo el suyo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarProgramaComoDueno(token, {
      ...PROMO_NUEVA,
      negocio_id: otro.id,
    });

    expect(respuesta.estado).toBe(201);
    expect(await versiones(db, negocio.id)).toMatchObject({ versiones: [1, 2] });
    expect(await versiones(db, otro.id)).toEqual({ versiones: [1], vigentes: [true] });
  });

  test('el doble toque crea una sola version', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const clave = randomUUID();

    const primera = await api.cambiarProgramaComoDueno(token, PROMO_NUEVA, clave);
    const segunda = await api.cambiarProgramaComoDueno(token, PROMO_NUEVA, clave);

    expect(segunda.estado).toBe(201);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'programa')).toBe(2);
  });

  test('la misma clave con otra promo no es un reintento', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const clave = randomUUID();
    await api.cambiarProgramaComoDueno(token, PROMO_NUEVA, clave);

    const respuesta = await api.cambiarProgramaComoDueno(
      token,
      { ...PROMO_NUEVA, premio: 'Dos medialunas' },
      clave,
    );

    expect(respuesta.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
    expect(await contar(db, 'programa')).toBe(2);
  });

  test('sin Idempotency-Key no cambia nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarProgramaComoDueno(token, PROMO_NUEVA, null);

    expect(respuesta.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'programa')).toBe(1);
  });

  test('cero sellos no es una promo, y no queda nada guardado', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarProgramaComoDueno(token, {
      ...PROMO_NUEVA,
      sellos_requeridos: 0,
    });

    expect(respuesta.estado).toBe(422);
    expect(await contar(db, 'programa')).toBe(1);
    expect(await contar(db, 'peticion_idempotente_dueno')).toBe(0);
  });

  test('con el negocio suspendido tambien: queda lista para cuando se reactive', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await db.query(`UPDATE negocio SET estado = 'suspendido' WHERE id = $1`, [
      negocio.id,
    ]);

    const respuesta = await api.cambiarProgramaComoDueno(token, PROMO_NUEVA);

    expect(respuesta.estado).toBe(201);
  });
});

describe('POST /dueno/promo/condicion', () => {
  test('INV-7 · desde ahora, firmada por el dueno: el sello viejo conserva la suya', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await sellar(api, negocio, await crearClienteEnCaja(db, 'Ana'));
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarCondicionComoDueno(token, CONDICION_NUEVA);
    expect(respuesta.estado).toBe(201);

    await sellar(api, negocio, await crearClienteEnCaja(db, 'Juan'));
    const sellos = await db.query<{ cliente: string; condicion: string }>(
      `SELECT cl.nombre AS cliente, c.texto AS condicion
       FROM sello s JOIN condicion_sello c ON c.id = s.condicion_id
       JOIN tarjeta t ON t.id = s.tarjeta_id JOIN cliente cl ON cl.id = t.cliente_id
       WHERE s.negocio_id = $1 ORDER BY cl.nombre`,
      [negocio.id],
    );
    expect(sellos.rows).toEqual([
      { cliente: 'Ana', condicion: 'Cualquier capuchino' },
      { cliente: 'Juan', condicion: 'Una torta entera' },
    ]);

    const promo = await api.promoDelDueno(token);
    expect(promo.cuerpo['condiciones']).toMatchObject([
      {
        texto: 'Una torta entera',
        monto_minimo: '80.00',
        autor: { tipo: 'negocio', nombre: 'dueno de prueba' },
      },
      { texto: 'Cualquier capuchino' },
    ]);
    expect(
      await una(
        db,
        `SELECT usuario_id, creado_por_admin_id FROM condicion_sello
         WHERE texto = 'Una torta entera'`,
      ),
    ).toEqual({ usuario_id: negocio.dueno, creado_por_admin_id: null });
  });

  test('INV-1 · la condicion va a su negocio aunque el cuerpo nombre otro', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    await api.cambiarCondicionComoDueno(token, {
      ...CONDICION_NUEVA,
      negocio_id: otro.id,
    });

    expect(await contar(db, 'condicion_sello', `negocio_id = '${otro.id}'`)).toBe(1);
    expect(await contar(db, 'condicion_sello', `negocio_id = '${negocio.id}'`)).toBe(2);
  });

  test('el doble toque escribe una sola condicion', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const clave = randomUUID();

    await api.cambiarCondicionComoDueno(token, CONDICION_NUEVA, clave);
    const segunda = await api.cambiarCondicionComoDueno(token, CONDICION_NUEVA, clave);

    expect(segunda.estado).toBe(201);
    expect(await contar(db, 'condicion_sello')).toBe(2);
  });

  test('una condicion vacia no se guarda', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.cambiarCondicionComoDueno(token, {
      texto: '   ',
      monto_minimo: null,
    });

    expect(respuesta.estado).toBe(422);
    expect(await contar(db, 'condicion_sello')).toBe(1);
  });
});

describe('Borrar a un dueno cargado por error', () => {
  test('cambiar la promo no es historia: se borra igual, con sus reintentos guardados', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const segundo = await crearUsuario(db, negocio.id, 'dueno', telefono(), 'Otro dueno');
    const token = await entrarComoDueno(api, db, segundo);
    await api.cambiarProgramaComoDueno(token, PROMO_NUEVA);
    expect(await contar(db, 'peticion_idempotente_dueno')).toBe(1);

    const respuesta = await api.borrarPersona(
      await entrarComoAdmin(api, db),
      negocio.id,
      segundo,
    );

    expect(respuesta.estado).toBe(200);
    expect(await contar(db, 'usuario_negocio', `id = '${segundo}'`)).toBe(0);
    expect(await contar(db, 'peticion_idempotente_dueno')).toBe(0);
    expect(await versiones(db, negocio.id)).toMatchObject({ versiones: [1, 2] });
  });
});
