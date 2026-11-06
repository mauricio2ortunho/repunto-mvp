import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { PersonaDelAdmin } from '@repunto/contratos';

import {
  crearEntradaDeAdmin,
  crearNegocio,
  type NegocioDePrueba,
  telefono,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * Las personas de un negocio, desde la ficha del admin. Lo que importa es
 * la tablet: quien tiene PIN y local aparece en su lista y abre turno; quien
 * no, no. Y que el nombre, que es lo que se toca en la tablet, no se repita.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function personasDe(api: Api, token: string, negocio: string) {
  const ficha = await api.fichaDelNegocio(token, negocio);
  expect(ficha.estado).toBe(200);
  return ficha.cuerpo['personas'] as PersonaDelAdmin[];
}

const cajera = (negocio: NegocioDePrueba) => ({
  nombre: 'Ana',
  rol: 'cajero',
  telefono: null,
  locales: [negocio.local],
});

/** La tablet de `local` queda sin turno, lista para que alguien abra. */
async function cerrarTurnos(db: Db, negocio: NegocioDePrueba): Promise<void> {
  await db.query(
    'UPDATE turno_caja SET cerrado_el = now() WHERE dispositivo_id = $1 AND cerrado_el IS NULL',
    [negocio.dispositivo],
  );
}

const NINGUNO = '00000000-0000-4000-8000-000000000000';

describe('POST /admin/negocios/:id/personas · agregar una persona', () => {
  test('una cajera con local y PIN aparece en su tablet y abre turno', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const creada = await api.crearPersona(token, negocio.id, cajera(negocio));
    expect(creada.estado).toBe(201);
    const id = String(creada.cuerpo['id']);

    const sinPin = (await personasDe(api, token, negocio.id)).find((p) => p.id === id);
    expect(sinPin).toEqual({
      id,
      nombre: 'Ana',
      rol: 'cajero',
      telefono: null,
      activo: true,
      tiene_pin: false,
      locales: [negocio.local],
      con_historia: false,
    });
    // Sin PIN no aparece en la tablet: no tendria con que confirmar.
    const antes = (await api.usuariosDeCaja(negocio.token)).cuerpo['usuarios'] as {
      id: string;
    }[];
    expect(antes.map((u) => u.id)).not.toContain(id);

    const pin = await api.ponerPin(token, negocio.id, id, { pin: '4821' });
    expect(pin.estado).toBe(200);
    expect(pin.cuerpo).toEqual({ tiene_pin: true });

    const despues = (await api.usuariosDeCaja(negocio.token)).cuerpo['usuarios'] as {
      id: string;
    }[];
    expect(despues.map((u) => u.id)).toContain(id);

    await cerrarTurnos(db, negocio);
    const turno = await api.abrirTurno(negocio.token, { usuario_id: id, pin: '4821' });
    expect(turno.estado).toBe(200);
    expect(turno.cuerpo['turno']).toEqual({ usuario: 'Ana', rol: 'cajero' });
  });

  test('no aparece en la tablet de un local donde no está', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const creada = await api.crearPersona(token, negocio.id, {
      ...cajera(negocio),
      locales: [negocio.otroLocal],
    });
    const id = String(creada.cuerpo['id']);
    await api.ponerPin(token, negocio.id, id, { pin: '4821' });

    const usuarios = (await api.usuariosDeCaja(negocio.token)).cuerpo['usuarios'] as {
      id: string;
    }[];
    expect(usuarios.map((u) => u.id)).not.toContain(id);
  });

  test('el dueño guarda el teléfono normalizado y puede no tener locales', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    // Uno que ningun otro test genera: telefono() empieza siempre con 7.
    const tipeado = `6${String(Date.now()).slice(-7)}`;

    const creada = await api.crearPersona(token, negocio.id, {
      nombre: 'Rocío',
      rol: 'dueno',
      telefono: `${tipeado.slice(0, 4)} ${tipeado.slice(4)}`,
      locales: [],
    });

    expect(creada.estado).toBe(201);
    const duena = (await personasDe(api, token, negocio.id)).find(
      (p) => p.id === creada.cuerpo['id'],
    );
    expect(duena).toMatchObject({
      rol: 'dueno',
      telefono: `+591${tipeado}`,
      locales: [],
    });
  });

  test('un teléfono que no se entiende, 422; uno de otra persona, 409', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const ocupado = telefono();
    await api.crearPersona(token, otro.id, {
      nombre: 'Dueña del otro',
      rol: 'dueno',
      telefono: ocupado,
      locales: [],
    });
    const antes = await contar(db, 'usuario_negocio');

    const invalido = await api.crearPersona(token, negocio.id, {
      nombre: 'Rocío',
      rol: 'dueno',
      telefono: '123',
      locales: [],
    });
    expect(invalido.estado).toBe(422);
    expect(invalido.cuerpo['codigo']).toBe('TELEFONO_INVALIDO');

    const enUso = await api.crearPersona(token, negocio.id, {
      nombre: 'Rocío',
      rol: 'dueno',
      telefono: ocupado,
      locales: [],
    });
    expect(enUso.estado).toBe(409);
    expect(enUso.cuerpo['codigo']).toBe('TELEFONO_EN_USO');
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });

  test('el mismo nombre que otro activo, aunque cambien las mayúsculas, 409', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'usuario_negocio');

    // El escenario ya tiene a "cajero de prueba".
    const respuesta = await api.crearPersona(token, negocio.id, {
      ...cajera(negocio),
      nombre: 'Cajero De Prueba',
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('NOMBRE_REPETIDO');
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });

  test('el nombre de alguien dado de baja se puede volver a usar', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await db.query('UPDATE usuario_negocio SET activo = false WHERE id = $1', [
      negocio.cajero,
    ]);

    const respuesta = await api.crearPersona(token, negocio.id, {
      ...cajera(negocio),
      nombre: 'cajero de prueba',
    });

    expect(respuesta.estado).toBe(201);
  });

  test('el mismo nombre en otro negocio no choca', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');

    expect((await api.crearPersona(token, uno.id, cajera(uno))).estado).toBe(201);
    expect((await api.crearPersona(token, otro.id, cajera(otro))).estado).toBe(201);
  });

  test('un local de otro negocio, 404, y no crea a nadie', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const antes = await contar(db, 'usuario_negocio');

    const respuesta = await api.crearPersona(token, uno.id, {
      ...cajera(uno),
      locales: [otro.local],
    });

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });

  test('las reglas del rol: cajero sin local, cajero con teléfono, dueño sin teléfono', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'usuario_negocio');

    for (const cuerpo of [
      { ...cajera(negocio), locales: [] },
      { ...cajera(negocio), telefono: telefono() },
      { ...cajera(negocio), rol: 'dueno' },
      { ...cajera(negocio), locales: [negocio.local, negocio.local] },
      { ...cajera(negocio), rol: 'admin' },
    ]) {
      const respuesta = await api.crearPersona(token, negocio.id, cuerpo);
      expect(respuesta.estado).toBe(422);
      expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    }
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });

  test('el reintento con la misma clave no crea dos; sin clave, 400', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'usuario_negocio');
    const clave = randomUUID();

    const primero = await api.crearPersona(token, negocio.id, cajera(negocio), clave);
    const segundo = await api.crearPersona(token, negocio.id, cajera(negocio), clave);

    expect(segundo.estado).toBe(201);
    expect(segundo.cuerpo['id']).toBe(primero.cuerpo['id']);
    expect(await contar(db, 'usuario_negocio')).toBe(antes + 1);

    const sinClave = await api.crearPersona(token, negocio.id, cajera(negocio), null);
    expect(sinClave.estado).toBe(400);
    expect(sinClave.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
  });

  test('en un negocio que no existe, 404', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.crearPersona(token, NINGUNO, cajera(negocio));

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });
});

describe('POST .../personas/:persona/pin · poner o cambiar el PIN', () => {
  test('el PIN nuevo reemplaza al anterior', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await api.ponerPin(token, negocio.id, negocio.cajero, { pin: '1111' });
    await api.ponerPin(token, negocio.id, negocio.cajero, { pin: '2222' });
    await cerrarTurnos(db, negocio);

    const viejo = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: '1111',
    });
    expect(viejo.estado).not.toBe(200);
    const nuevo = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: '2222',
    });
    expect(nuevo.estado).toBe(200);
  });

  test('no se devuelve ni se puede leer: la ficha solo dice si lo tiene', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await api.ponerPin(token, negocio.id, negocio.cajero, { pin: '4821' });

    const crudo = JSON.stringify((await api.fichaDelNegocio(token, negocio.id)).cuerpo);

    expect(crudo).not.toContain('4821');
    expect(crudo).not.toContain('scrypt');
    expect(crudo).not.toContain('pin_hash');
  });

  test('que no sean cuatro dígitos, 422', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    for (const pin of ['123', '12345', 'abcd', '']) {
      const respuesta = await api.ponerPin(token, negocio.id, negocio.cajero, { pin });
      expect(respuesta.estado).toBe(422);
    }
  });

  test('una persona de otro negocio, 404, y su PIN no cambia', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const antes = await contar(db, 'usuario_negocio', 'pin_hash IS NOT NULL');

    const respuesta = await api.ponerPin(token, uno.id, otro.cajero, { pin: '4821' });

    expect(respuesta.estado).toBe(404);
    expect(respuesta.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');
    expect(await contar(db, 'usuario_negocio', 'pin_hash IS NOT NULL')).toBe(antes);
  });
});

describe('/admin/negocios/:id/personas · solo con la sesion del admin', () => {
  test('sin token o con el de una tablet, 401, y no toca nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const antes = await contar(db, 'usuario_negocio');

    for (const token of [undefined, negocio.token]) {
      expect((await api.crearPersona(token, negocio.id, cajera(negocio))).estado).toBe(
        401,
      );
      expect(
        (await api.ponerPin(token, negocio.id, negocio.cajero, { pin: '4821' })).estado,
      ).toBe(401);
    }
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });
});
