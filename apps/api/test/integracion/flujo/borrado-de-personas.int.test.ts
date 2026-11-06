import { describe, expect } from 'vitest';
import type { PersonaDelAdmin } from '@repunto/contratos';

import { crearEntradaDeAdmin, crearNegocio, telefono } from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * Lo que se puede sacar del todo y lo que no. Quien tiene historia (abrio un
 * turno, escribio una condicion, vinculo una tablet) se da de baja y nunca se
 * borra: lo que hizo esta firmado con su nombre (INV-17). Quien se cargo por
 * error, sin historia, se borra. Y el dueno de baja libera su telefono, que
 * es unico en toda la plataforma.
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function personas(api: Api, token: string, negocio: string) {
  const ficha = await api.fichaDelNegocio(token, negocio);
  return ficha.cuerpo['personas'] as PersonaDelAdmin[];
}

async function telefonoDe(db: Db, id: string): Promise<string | null> {
  const { rows } = await db.query<{ telefono: string | null }>(
    'SELECT telefono FROM usuario_negocio WHERE id = $1',
    [id],
  );
  return rows[0]?.telefono ?? null;
}

describe('el dueño de baja libera su teléfono', () => {
  test('dado de baja queda sin teléfono, y ese número se puede cargar en otro negocio', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const suyo = await telefonoDe(db, negocio.dueno);

    await api.darDeBaja(token, negocio.id, negocio.dueno);

    expect(await telefonoDe(db, negocio.dueno)).toBeNull();
    const enOtro = await api.crearPersona(token, otro.id, {
      nombre: 'La misma persona',
      rol: 'dueno',
      telefono: suyo,
      locales: [],
    });
    expect(enOtro.estado).toBe(201);
  });

  test('un cajero dado de baja no tiene teléfono que liberar', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const baja = await api.darDeBaja(token, negocio.id, negocio.cajero);

    expect(baja.estado).toBe(200);
    expect(await telefonoDe(db, negocio.cajero)).toBeNull();
  });

  test('al reactivarlo trae su teléfono; sin él, 422; con uno ocupado, 409', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const ajeno = await telefonoDe(db, otro.dueno);
    await api.darDeBaja(token, negocio.id, negocio.dueno);

    const sinTelefono = await api.reactivarPersona(token, negocio.id, negocio.dueno);
    expect(sinTelefono.estado).toBe(422);

    const ocupado = await api.reactivarPersona(token, negocio.id, negocio.dueno, {
      telefono: ajeno,
    });
    expect(ocupado.estado).toBe(409);
    expect(ocupado.cuerpo['codigo']).toBe('TELEFONO_EN_USO');

    const nuevo = `6${String(Date.now()).slice(-7)}`;
    const reactivado = await api.reactivarPersona(token, negocio.id, negocio.dueno, {
      telefono: nuevo,
    });
    expect(reactivado.estado).toBe(200);
    expect(await telefonoDe(db, negocio.dueno)).toBe(`+591${nuevo}`);
  });

  test('a un cajero no se le pasa teléfono al reactivarlo', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await api.darDeBaja(token, negocio.id, negocio.cajero);

    const respuesta = await api.reactivarPersona(token, negocio.id, negocio.cajero, {
      telefono: telefono(),
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
  });
});

describe('POST .../personas/:persona/borrado', () => {
  test('alguien cargado por error se borra, y su nombre queda libre', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const creada = await api.crearPersona(token, negocio.id, {
      nombre: 'Error de carga',
      rol: 'cajero',
      telefono: null,
      locales: [negocio.local, negocio.otroLocal],
    });
    const id = String(creada.cuerpo['id']);
    expect(
      (await personas(api, token, negocio.id)).find((p) => p.id === id),
    ).toMatchObject({ con_historia: false });

    const borrado = await api.borrarPersona(token, negocio.id, id);

    expect(borrado.estado).toBe(200);
    expect(borrado.cuerpo).toEqual({ borrada: true });
    expect((await personas(api, token, negocio.id)).map((p) => p.id)).not.toContain(id);
    expect(await contar(db, 'usuario_local', `usuario_id = '${id}'`)).toBe(0);
    const otraVez = await api.crearPersona(token, negocio.id, {
      nombre: 'Error de carga',
      rol: 'cajero',
      telefono: null,
      locales: [negocio.local],
    });
    expect(otraVez.estado).toBe(201);
  });

  test('quien abrió un turno no se borra: 409, y sigue ahí', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    // El cajero del escenario tiene su turno abierto en la tablet de `local`.
    expect(
      (await personas(api, token, negocio.id)).find((p) => p.id === negocio.cajero),
    ).toMatchObject({ con_historia: true });

    const respuesta = await api.borrarPersona(token, negocio.id, negocio.cajero);

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('PERSONA_CON_HISTORIA');
    expect(await contar(db, 'usuario_negocio', `id = '${negocio.cajero}'`)).toBe(1);
  });

  test('quien escribió una condición tampoco, aunque esté de baja', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    // La condicion del escenario la firmo el dueno.
    await api.darDeBaja(token, negocio.id, negocio.dueno);

    const respuesta = await api.borrarPersona(token, negocio.id, negocio.dueno);

    expect(respuesta.cuerpo['codigo']).toBe('PERSONA_CON_HISTORIA');
  });

  test('una persona de otro negocio, 404; sin sesión de admin, 401', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const antes = await contar(db, 'usuario_negocio');

    const ajena = await api.borrarPersona(token, uno.id, otro.cajero);
    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');
    for (const sinAdmin of [undefined, uno.token]) {
      expect((await api.borrarPersona(sinAdmin, uno.id, uno.cajero)).estado).toBe(401);
    }
    expect(await contar(db, 'usuario_negocio')).toBe(antes);
  });
});
