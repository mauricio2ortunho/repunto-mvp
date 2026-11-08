import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import {
  DIAS_DE_SESION_DE_DUENO,
  HORAS_DE_ENTRADA_DE_DUENO,
  formatearCodigoDeVinculacion,
} from '@repunto/dominio';

import { una } from '../base';
import {
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearEntradaDeDueno,
  crearNegocio,
} from '../escenario';
import { TOPE_DE_ENTRADA_DE_DUENO_POR_IP } from '../../../src/dueno/sesion.service';
import { type Api, type Db, contar, test } from './base';

/**
 * Entrar al panel del dueño. Mientras no haya WhatsApp, el admin genera el
 * código desde la ficha y se lo pasa; el dueño lo canjea por una sesión que
 * vence a los DIAS_DE_SESION_DE_DUENO sin usarse. Y los guards por rol: la
 * sesión del dueño abre solo /dueno, y ninguna otra credencial lo abre.
 */

const NINGUNO = '00000000-0000-4000-8000-000000000000';

async function entrarComoAdmin(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function entrarComoDueno(api: Api, db: Db, dueno: string): Promise<string> {
  const { codigo } = await crearEntradaDeDueno(db, dueno);
  const respuesta = await api.entrarComoDueno({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

describe('POST /admin/negocios/:id/personas/:persona/entrada · el admin genera el codigo', () => {
  test('el codigo sirve para entrar, vence a las 24 horas y lo firma el admin', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db, 'Cafe del Dueno');

    const generado = await api.entradaDelDuenoComoAdmin(admin, negocio.id, negocio.dueno);

    expect(generado.estado).toBe(201);
    const codigo = String(generado.cuerpo['codigo']);
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const fila = await una<{ horas: number; firmado: boolean }>(
      db,
      `SELECT round(extract(epoch FROM expira_el - creado_el) / 3600)::int AS horas,
              creado_por_admin_id IS NOT NULL AS firmado
       FROM entrada_dueno`,
    );
    expect(fila).toEqual({ horas: HORAS_DE_ENTRADA_DE_DUENO, firmado: true });

    const entrada = await api.entrarComoDueno({ codigo });
    expect(entrada.estado).toBe(200);
    const yo = await api.duenoActual(String(entrada.cuerpo['token']));
    expect(yo.estado).toBe(200);
    expect(yo.cuerpo).toEqual({
      nombre: expect.any(String),
      negocio: { nombre: 'Cafe del Dueno', estado: 'activo' },
    });
  });

  test('el reintento con la misma clave devuelve el mismo codigo', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    const clave = randomUUID();

    const primera = await api.entradaDelDuenoComoAdmin(
      admin,
      negocio.id,
      negocio.dueno,
      clave,
    );
    const segunda = await api.entradaDelDuenoComoAdmin(
      admin,
      negocio.id,
      negocio.dueno,
      clave,
    );

    expect(segunda.estado).toBe(201);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'entrada_dueno')).toBe(1);
  });

  test('sin Idempotency-Key se rechaza', async ({ api, db }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.entradaDelDuenoComoAdmin(
      admin,
      negocio.id,
      negocio.dueno,
      null,
    );

    expect(respuesta.estado).toBe(400);
    expect(await contar(db, 'entrada_dueno')).toBe(0);
  });

  test('a un cajero o un supervisor no: entran con su PIN', async ({ api, db }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);

    for (const persona of [negocio.cajero, negocio.supervisor]) {
      const respuesta = await api.entradaDelDuenoComoAdmin(admin, negocio.id, persona);
      expect(respuesta.estado).toBe(409);
      expect(respuesta.cuerpo['codigo']).toBe('PANEL_SOLO_DEL_DUENO');
    }
    expect(await contar(db, 'entrada_dueno')).toBe(0);
  });

  test('a un dueno dado de baja no', async ({ api, db }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    expect((await api.darDeBaja(admin, negocio.id, negocio.dueno)).estado).toBe(200);

    const respuesta = await api.entradaDelDuenoComoAdmin(
      admin,
      negocio.id,
      negocio.dueno,
    );

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('PANEL_SOLO_DEL_DUENO');
  });

  test('el dueno de otro negocio, o uno que no existe, no se encuentra', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);

    const cruzado = await api.entradaDelDuenoComoAdmin(admin, negocio.id, otro.dueno);
    const inexistente = await api.entradaDelDuenoComoAdmin(admin, NINGUNO, otro.dueno);

    expect(cruzado.estado).toBe(404);
    expect(cruzado.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');
    expect(inexistente.estado).toBe(404);
    expect(inexistente.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });

  test('sin sesion de admin, 401: ni el dueno se genera su propio codigo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const dueno = await entrarComoDueno(api, db, negocio.dueno);

    for (const token of [undefined, dueno, negocio.token]) {
      const respuesta = await api.entradaDelDuenoComoAdmin(
        token,
        negocio.id,
        negocio.dueno,
      );
      expect(respuesta.estado).toBe(401);
    }
  });
});

describe('POST /dueno/sesion · el dueno canjea su codigo', () => {
  test('recibe su sesion; la base guarda el hash y marca el codigo usado', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { id, codigo } = await crearEntradaDeDueno(db, negocio.dueno);

    const respuesta = await api.entrarComoDueno({ codigo });

    expect(respuesta.estado).toBe(200);
    const token = String(respuesta.cuerpo['token']);
    const sesion = await una<{ token_hash: string; usado: boolean; usuario: string }>(
      db,
      `SELECT s.token_hash, e.usado_el IS NOT NULL AS usado, s.usuario_id AS usuario
       FROM sesion_dueno s JOIN entrada_dueno e ON e.id = s.entrada_id
       WHERE e.id = $1`,
      [id],
    );
    expect(sesion.token_hash).not.toBe(token);
    expect(sesion.usado).toBe(true);
    expect(sesion.usuario).toBe(negocio.dueno);
  });

  test('se acepta como se dicte: minusculas, con guion o con espacios', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearEntradaDeDueno(db, negocio.dueno);

    const respuesta = await api.entrarComoDueno({
      codigo: ` ${formatearCodigoDeVinculacion(codigo).toLowerCase()} `,
    });

    expect(respuesta.estado).toBe(200);
  });

  test('un codigo ya usado no abre otra sesion', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearEntradaDeDueno(db, negocio.dueno);
    await api.entrarComoDueno({ codigo });

    const segunda = await api.entrarComoDueno({ codigo });

    expect(segunda.estado).toBe(422);
    expect(segunda.cuerpo['codigo']).toBe('ENTRADA_INVALIDA');
  });

  test('vencido, inexistente, de un dueno de baja o del admin: el mismo rechazo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    const vencido = await crearEntradaDeDueno(db, negocio.dueno, { horas: -1 });
    const deBaja = await crearEntradaDeDueno(db, otro.dueno);
    await db.query('UPDATE usuario_negocio SET activo = false WHERE id = $1', [
      otro.dueno,
    ]);
    // Uno del panel de administracion no abre el del dueno: otra tabla.
    const delAdmin = await crearEntradaDeAdmin(db);

    for (const codigo of [
      vencido.codigo,
      deBaja.codigo,
      delAdmin.codigo,
      'ABCD-EFGH',
      'corto',
    ]) {
      const respuesta = await api.entrarComoDueno({ codigo });
      expect(respuesta.estado).toBe(422);
      expect(respuesta.cuerpo['codigo']).toBe('ENTRADA_INVALIDA');
    }
    expect(await contar(db, 'sesion_dueno')).toBe(0);
  });

  test('tiene tope por IP: probar codigos al azar se frena', async ({ api, db }) => {
    void db;
    for (let i = 0; i < TOPE_DE_ENTRADA_DE_DUENO_POR_IP; i += 1) {
      await api.entrarComoDueno({ codigo: 'ABCD-EFGH' });
    }

    const pasada = await api.entrarComoDueno({ codigo: 'ABCD-EFGH' });

    expect(pasada.estado).toBe(429);
    expect(pasada.cuerpo['codigo']).toBe('TOPE_SUPERADO');
  });
});

describe('la sesion del dueno', () => {
  test('sin token, o con uno que no existe, 401', async ({ api, db }) => {
    void db;
    expect((await api.duenoActual()).estado).toBe(401);
    expect((await api.duenoActual('no-existe-'.repeat(4))).estado).toBe(401);
  });

  test(`vence a los ${DIAS_DE_SESION_DE_DUENO} dias sin usarse`, async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await db.query(
      `UPDATE sesion_dueno SET ultimo_acceso = now() - make_interval(days => $1::int)`,
      [DIAS_DE_SESION_DE_DUENO],
    );

    expect((await api.duenoActual(token)).estado).toBe(401);
  });

  test('cada pedido la renueva: el vencimiento se cuenta desde el ultimo uso', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await db.query(
      `UPDATE sesion_dueno SET ultimo_acceso = now() - make_interval(days => $1::int)
                                               + interval '1 hour'`,
      [DIAS_DE_SESION_DE_DUENO],
    );

    expect((await api.duenoActual(token)).estado).toBe(200);
    const { recien } = await una<{ recien: boolean }>(
      db,
      `SELECT ultimo_acceso > now() - interval '1 minute' AS recien FROM sesion_dueno`,
    );
    expect(recien).toBe(true);
  });

  test('cerrar la sesion la revoca al instante, sin borrarla', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const cierre = await api.cerrarSesionDeDueno(token);

    expect(cierre.estado).toBe(204);
    expect((await api.duenoActual(token)).estado).toBe(401);
    expect(await contar(db, 'sesion_dueno', 'revocada_el IS NOT NULL')).toBe(1);
  });

  test('con el negocio suspendido sigue entrando, y lo ve', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await db.query(`UPDATE negocio SET estado = 'suspendido' WHERE id = $1`, [
      negocio.id,
    ]);

    const yo = await api.duenoActual(token);

    expect(yo.estado).toBe(200);
    expect(yo.cuerpo['negocio']).toMatchObject({ estado: 'suspendido' });
  });
});

describe('dar de baja, reactivar y borrar al dueno', () => {
  test('la baja le cierra el panel, y reactivarlo no le devuelve nada viejo', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const pendiente = await crearEntradaDeDueno(db, negocio.dueno);
    const { telefono } = await una<{ telefono: string }>(
      db,
      'SELECT telefono FROM usuario_negocio WHERE id = $1',
      [negocio.dueno],
    );

    expect((await api.darDeBaja(admin, negocio.id, negocio.dueno)).estado).toBe(200);
    expect((await api.duenoActual(token)).estado).toBe(401);

    const reactivado = await api.reactivarPersona(admin, negocio.id, negocio.dueno, {
      telefono,
    });
    expect(reactivado.estado).toBe(200);
    // Ni la sesion de antes ni el codigo que no habia usado.
    expect((await api.duenoActual(token)).estado).toBe(401);
    const viejo = await api.entrarComoDueno({ codigo: pendiente.codigo });
    expect(viejo.cuerpo['codigo']).toBe('ENTRADA_INVALIDA');
    // Uno nuevo si.
    const nuevo = await api.entradaDelDuenoComoAdmin(admin, negocio.id, negocio.dueno);
    expect(nuevo.estado).toBe(201);
    const entrada = await api.entrarComoDueno({ codigo: nuevo.cuerpo['codigo'] });
    expect(entrada.estado).toBe(200);
  });

  test('borrar a un dueno cargado por error se lleva sus codigos y sesiones', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    const creado = await api.crearPersona(admin, negocio.id, {
      nombre: 'Dueno por error',
      rol: 'dueno',
      telefono: '+59171234567',
      locales: [],
    });
    expect(creado.estado).toBe(201);
    const persona = String(creado.cuerpo['id']);
    await entrarComoDueno(api, db, persona);
    await crearEntradaDeDueno(db, persona);

    const borrado = await api.borrarPersona(admin, negocio.id, persona);

    expect(borrado.estado).toBe(200);
    expect(await contar(db, 'entrada_dueno')).toBe(0);
    expect(await contar(db, 'sesion_dueno')).toBe(0);
  });
});

describe('guards por rol: la sesion del dueno abre solo /dueno', () => {
  test('no abre /admin, la caja ni la app del cliente', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    expect((await api.adminActual(token)).estado).toBe(401);
    expect((await api.estadoDeCaja(token)).estado).toBe(401);
    expect((await api.misTarjetas(token)).estado).toBe(401);
  });

  test('ni el admin, ni la tablet, ni el cliente entran a /dueno', async ({
    api,
    db,
  }) => {
    const admin = await entrarComoAdmin(api, db);
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    for (const token of [admin, negocio.token, cliente.token]) {
      expect((await api.duenoActual(token)).estado).toBe(401);
      expect((await api.cerrarSesionDeDueno(token)).estado).toBe(401);
    }
  });
});
