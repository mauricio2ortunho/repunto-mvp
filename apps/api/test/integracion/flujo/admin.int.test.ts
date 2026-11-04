import { describe, expect } from 'vitest';

import { DIAS_DE_SESION_DE_ADMIN, formatearCodigoDeVinculacion } from '@repunto/dominio';

import { una } from '../base';
import { crearClienteEnCaja, crearEntradaDeAdmin, crearNegocio } from '../escenario';
import { TOPE_DE_ENTRADA_DE_ADMIN_POR_IP } from '../../../src/admin/sesion.service';
import { type Api, type Db, test } from './base';

/**
 * Entrar al panel de administracion: el codigo de un solo uso se canjea por
 * una sesion que vence a los DIAS_DE_SESION_DE_ADMIN sin usarse. Y los
 * guards por rol: la sesion del admin no abre la caja ni la app del cliente,
 * y las de ellos no abren /admin.
 */

async function entrar(api: Api, db: Db): Promise<{ token: string; admin: string }> {
  const { codigo, admin } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return { token: String(respuesta.cuerpo['token']), admin };
}

describe('POST /admin/sesion · el admin canjea su codigo', () => {
  test('con el codigo vigente recibe su sesion, y /admin/yo lo reconoce', async ({
    api,
    db,
  }) => {
    const { id, codigo } = await crearEntradaDeAdmin(db);

    const respuesta = await api.entrarComoAdmin({ codigo });

    expect(respuesta.estado).toBe(200);
    const token = String(respuesta.cuerpo['token']);
    const yo = await api.adminActual(token);
    expect(yo.estado).toBe(200);
    expect(yo.cuerpo).toEqual({ nombre: 'Admin' });

    const sesion = await una<{ token_hash: string; usado: boolean }>(
      db,
      `SELECT s.token_hash, e.usado_el IS NOT NULL AS usado
       FROM sesion_admin s JOIN entrada_admin e ON e.id = s.entrada_id
       WHERE e.id = $1`,
      [id],
    );
    // La base guarda el hash, nunca el token.
    expect(sesion.token_hash).not.toBe(token);
    expect(sesion.usado).toBe(true);
  });

  test('se acepta como se dicte: minusculas, con guion o con espacios', async ({
    api,
    db,
  }) => {
    const { codigo } = await crearEntradaDeAdmin(db);

    const respuesta = await api.entrarComoAdmin({
      codigo: ` ${formatearCodigoDeVinculacion(codigo).toLowerCase()} `,
    });

    expect(respuesta.estado).toBe(200);
  });

  test('un codigo ya usado no abre otra sesion', async ({ api, db }) => {
    const { codigo } = await crearEntradaDeAdmin(db);
    await api.entrarComoAdmin({ codigo });

    const segunda = await api.entrarComoAdmin({ codigo });

    expect(segunda.estado).toBe(422);
    expect(segunda.cuerpo['codigo']).toBe('ENTRADA_INVALIDA');
  });

  test('vencido, inexistente o de un admin dado de baja: el mismo rechazo', async ({
    api,
    db,
  }) => {
    const vencido = await crearEntradaDeAdmin(db, { minutos: -1 });
    const deBaja = await crearEntradaDeAdmin(db);
    await db.query('UPDATE admin_plataforma SET activo = false WHERE id = $1', [
      deBaja.admin,
    ]);

    for (const codigo of [vencido.codigo, deBaja.codigo, 'ABCD-EFGH', 'corto']) {
      const respuesta = await api.entrarComoAdmin({ codigo });
      expect(respuesta.estado).toBe(422);
      expect(respuesta.cuerpo['codigo']).toBe('ENTRADA_INVALIDA');
    }
    expect((await db.query('SELECT 1 FROM sesion_admin')).rowCount).toBe(0);
  });

  // Pide `db` aunque no la use: es lo que vacia la base al terminar, y el
  // tope deja sus filas en tope_peticion.
  test('tiene tope por IP: probar codigos al azar se frena', async ({ api, db }) => {
    void db;
    for (let i = 0; i < TOPE_DE_ENTRADA_DE_ADMIN_POR_IP; i += 1) {
      await api.entrarComoAdmin({ codigo: 'ABCD-EFGH' });
    }

    const pasada = await api.entrarComoAdmin({ codigo: 'ABCD-EFGH' });

    expect(pasada.estado).toBe(429);
    expect(pasada.cuerpo['codigo']).toBe('TOPE_SUPERADO');
  });
});

describe('la sesion del admin', () => {
  test('sin token, o con uno que no existe, 401', async ({ api, db }) => {
    void db;
    expect((await api.adminActual()).estado).toBe(401);
    expect((await api.adminActual('no-existe-'.repeat(4))).estado).toBe(401);
  });

  test(`vence a los ${DIAS_DE_SESION_DE_ADMIN} dias sin usarse`, async ({ api, db }) => {
    const { token } = await entrar(api, db);
    await db.query(
      `UPDATE sesion_admin SET ultimo_acceso = now() - make_interval(days => $1::int)`,
      [DIAS_DE_SESION_DE_ADMIN],
    );

    expect((await api.adminActual(token)).estado).toBe(401);
  });

  test('cada pedido la renueva: el vencimiento se cuenta desde el ultimo uso', async ({
    api,
    db,
  }) => {
    const { token } = await entrar(api, db);
    await db.query(
      `UPDATE sesion_admin SET ultimo_acceso = now() - make_interval(days => $1::int)
                                               + interval '1 hour'`,
      [DIAS_DE_SESION_DE_ADMIN],
    );

    expect((await api.adminActual(token)).estado).toBe(200);
    const { recien } = await una<{ recien: boolean }>(
      db,
      `SELECT ultimo_acceso > now() - interval '1 minute' AS recien FROM sesion_admin`,
    );
    expect(recien).toBe(true);
  });

  test('cerrar la sesion la revoca al instante, sin borrarla', async ({ api, db }) => {
    const { token } = await entrar(api, db);

    const cierre = await api.cerrarSesionDeAdmin(token);

    expect(cierre.estado).toBe(204);
    expect((await api.adminActual(token)).estado).toBe(401);
    const { revocada } = await una<{ revocada: boolean }>(
      db,
      'SELECT revocada_el IS NOT NULL AS revocada FROM sesion_admin',
    );
    expect(revocada).toBe(true);
  });

  test('dar de baja al admin corta sus sesiones abiertas', async ({ api, db }) => {
    const { token, admin } = await entrar(api, db);
    await db.query('UPDATE admin_plataforma SET activo = false WHERE id = $1', [admin]);

    expect((await api.adminActual(token)).estado).toBe(401);
  });
});

describe('guards por rol: cada credencial abre solo lo suyo', () => {
  test('la sesion del admin no abre la caja ni la app del cliente', async ({
    api,
    db,
  }) => {
    const { token } = await entrar(api, db);

    expect((await api.estadoDeCaja(token)).estado).toBe(401);
    expect((await api.misTarjetas(token)).estado).toBe(401);
  });

  test('ni la tablet ni el cliente entran a /admin', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    expect((await api.adminActual(negocio.token)).estado).toBe(401);
    expect((await api.adminActual(cliente.token)).estado).toBe(401);
    expect((await api.cerrarSesionDeAdmin(negocio.token)).estado).toBe(401);
  });
});
