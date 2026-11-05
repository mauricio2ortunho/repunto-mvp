import { describe, expect } from 'vitest';
import type { PersonaDelAdmin } from '@repunto/contratos';

import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearNegocio,
  type NegocioDePrueba,
  telefono,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * Editar, dar de baja y reactivar a una persona desde la ficha del admin. Lo
 * que importa es la tablet: sacarle un local o darla de baja la frena al
 * instante, aunque haya dejado el turno abierto, y no toca lo que ya hizo.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function persona(api: Api, token: string, negocio: string, id: string) {
  const ficha = await api.fichaDelNegocio(token, negocio);
  return (ficha.cuerpo['personas'] as PersonaDelAdmin[]).find((p) => p.id === id);
}

async function idsEnLaTablet(api: Api, negocio: NegocioDePrueba): Promise<string[]> {
  const usuarios = (await api.usuariosDeCaja(negocio.token)).cuerpo['usuarios'] as {
    id: string;
  }[];
  return usuarios.map((u) => u.id);
}

/** El cajero del escenario, con PIN, para que aparezca en la tablet. */
async function cajeroConPin(api: Api, token: string, negocio: NegocioDePrueba) {
  await api.ponerPin(token, negocio.id, negocio.cajero, { pin: '4821' });
}

const comoCajero = (negocio: NegocioDePrueba, cambio: Record<string, unknown> = {}) => ({
  nombre: 'cajero de prueba',
  rol: 'cajero',
  telefono: null,
  locales: [negocio.local],
  ...cambio,
});

describe('POST .../personas/:persona/datos · editar', () => {
  test('de cajero a supervisor: cambia lo que puede hacer, no lo que hizo', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { rol: 'supervisor', nombre: 'Ana Pérez' }),
    );

    expect(respuesta.estado).toBe(200);
    expect(await persona(api, token, negocio.id, negocio.cajero)).toMatchObject({
      nombre: 'Ana Pérez',
      rol: 'supervisor',
    });
  });

  test('el dueño no pasa a cajero, ni un cajero a dueño', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const duenoACajero = await api.datosDePersona(
      token,
      negocio.id,
      negocio.dueno,
      comoCajero(negocio, { nombre: 'dueno de prueba' }),
    );
    expect(duenoACajero.estado).toBe(422);
    expect(duenoACajero.cuerpo['codigo']).toBe('ROL_NO_CAMBIABLE');

    const cajeroADueno = await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { rol: 'dueno', telefono: telefono(), locales: [] }),
    );
    expect(cajeroADueno.cuerpo['codigo']).toBe('ROL_NO_CAMBIABLE');
    expect(await persona(api, token, negocio.id, negocio.cajero)).toMatchObject({
      rol: 'cajero',
    });
  });

  test('sacarle el local: su tablet lo deja de aceptar aunque tenga el turno abierto', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await cajeroConPin(api, token, negocio);
    const cliente = await crearClienteEnCaja(db);

    await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { locales: [negocio.otroLocal] }),
    );

    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(sello.cuerpo['codigo']).toBe('LOCAL_NO_AUTORIZADO');
    expect(await idsEnLaTablet(api, negocio)).not.toContain(negocio.cajero);
    expect(await persona(api, token, negocio.id, negocio.cajero)).toMatchObject({
      locales: [negocio.otroLocal],
    });
  });

  test('devolverle el local reactiva la misma asignación, sin duplicarla', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await cajeroConPin(api, token, negocio);

    await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { locales: [negocio.otroLocal] }),
    );
    await api.datosDePersona(token, negocio.id, negocio.cajero, comoCajero(negocio));

    expect(await idsEnLaTablet(api, negocio)).toContain(negocio.cajero);
    expect(await contar(db, 'usuario_local', `usuario_id = '${negocio.cajero}'`)).toBe(2);
    expect(
      await contar(db, 'usuario_local', `usuario_id = '${negocio.cajero}' AND activo`),
    ).toBe(1);
  });

  test('el nombre de otro activo, 409; el propio con otras mayúsculas, sí', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const ajeno = await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { nombre: 'Supervisor de prueba' }),
    );
    expect(ajeno.estado).toBe(409);
    expect(ajeno.cuerpo['codigo']).toBe('NOMBRE_REPETIDO');

    const propio = await api.datosDePersona(
      token,
      negocio.id,
      negocio.cajero,
      comoCajero(negocio, { nombre: 'Cajero de Prueba' }),
    );
    expect(propio.estado).toBe(200);
  });

  test('el teléfono de otro, 409; el propio, sí', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const { telefono: suyo } = await db
      .query<{ telefono: string }>('SELECT telefono FROM usuario_negocio WHERE id = $1', [
        negocio.dueno,
      ])
      .then((r) => r.rows[0] ?? { telefono: '' });
    const { telefono: ajeno } = await db
      .query<{ telefono: string }>('SELECT telefono FROM usuario_negocio WHERE id = $1', [
        otro.dueno,
      ])
      .then((r) => r.rows[0] ?? { telefono: '' });
    const dueno = (tel: string) => ({
      nombre: 'dueno de prueba',
      rol: 'dueno',
      telefono: tel,
      locales: [],
    });

    const conAjeno = await api.datosDePersona(
      token,
      negocio.id,
      negocio.dueno,
      dueno(ajeno),
    );
    expect(conAjeno.estado).toBe(409);
    expect(conAjeno.cuerpo['codigo']).toBe('TELEFONO_EN_USO');

    const conSuyo = await api.datosDePersona(
      token,
      negocio.id,
      negocio.dueno,
      dueno(suyo),
    );
    expect(conSuyo.estado).toBe(200);
  });

  test('una persona de otro negocio, 404, y no la toca', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');

    const respuesta = await api.datosDePersona(
      token,
      uno.id,
      otro.cajero,
      comoCajero(uno, { nombre: 'Cambiado' }),
    );

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');
    expect(await contar(db, 'usuario_negocio', `nombre = 'Cambiado'`)).toBe(0);
  });
});

describe('POST .../personas/:persona/baja y /reactivacion', () => {
  test('de baja: sale de la tablet, su turno abierto ya no sella, y lo que hizo queda', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await cajeroConPin(api, token, negocio);
    const cliente = await crearClienteEnCaja(db);
    await api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });
    const sellosAntes = await contar(db, 'sello', 'NOT anulado');

    const baja = await api.darDeBaja(token, negocio.id, negocio.cajero);
    expect(baja.estado).toBe(200);
    expect(baja.cuerpo).toEqual({ activo: false });

    expect(await idsEnLaTablet(api, negocio)).not.toContain(negocio.cajero);
    const otro = await crearClienteEnCaja(db);
    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(otro) },
    });
    expect(sello.cuerpo['codigo']).toBe('TURNO_CERRADO');
    expect(await contar(db, 'sello', 'NOT anulado')).toBe(sellosAntes);
  });

  test('reactivado, vuelve a la tablet', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await cajeroConPin(api, token, negocio);
    await api.darDeBaja(token, negocio.id, negocio.cajero);

    const respuesta = await api.reactivarPersona(token, negocio.id, negocio.cajero);

    expect(respuesta.cuerpo).toEqual({ activo: true });
    expect(await idsEnLaTablet(api, negocio)).toContain(negocio.cajero);
  });

  test('si mientras tanto otro activo tomó su nombre, no se reactiva', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await api.darDeBaja(token, negocio.id, negocio.cajero);
    await api.crearPersona(token, negocio.id, comoCajero(negocio));

    const respuesta = await api.reactivarPersona(token, negocio.id, negocio.cajero);

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('NOMBRE_REPETIDO');
    expect(await persona(api, token, negocio.id, negocio.cajero)).toMatchObject({
      activo: false,
    });
  });

  test('una persona de otro negocio, 404; sin sesión de admin, 401', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');

    const ajena = await api.darDeBaja(token, uno.id, otro.cajero);
    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');

    for (const sinAdmin of [undefined, uno.token]) {
      expect((await api.darDeBaja(sinAdmin, uno.id, uno.cajero)).estado).toBe(401);
    }
    expect(await contar(db, 'usuario_negocio', 'NOT activo')).toBe(0);
  });
});
