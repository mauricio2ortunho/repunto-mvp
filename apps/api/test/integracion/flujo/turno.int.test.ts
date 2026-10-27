import { describe, expect } from 'vitest';

import { PIN_EQUIVOCADOS_PARA_BLOQUEAR } from '@repunto/dominio';

import { una } from '../base';
import {
  type NegocioDePrueba,
  asignar,
  cerrarTurno,
  codigoDe,
  crearCanje,
  crearCliente,
  crearClienteEnCaja,
  crearNegocio,
  crearSello,
  crearTarjeta,
  crearUsuario,
  ponerPin,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * El turno de la caja, de punta a punta por HTTP: la lista de nombres de la
 * tablet, abrir con PIN, el bloqueo por PIN equivocados y cerrar.
 *
 * Los tests de bloqueo cuentan dentro de un tramo de quince minutos; si uno
 * cae justo sobre el borde de un tramo, la cuenta se parte en dos. Son unos
 * pocos segundos cada cuarto de hora.
 */

const PIN_CAJERO = '1234';
const PIN_SUPERVISOR = '5678';

/** Un negocio sin turno abierto en la tablet principal, con PIN puestos. */
async function sinTurno(db: Db): Promise<NegocioDePrueba> {
  const negocio = await crearNegocio(db);
  await cerrarTurno(db, negocio.turno);
  await ponerPin(db, negocio.cajero, PIN_CAJERO);
  await ponerPin(db, negocio.supervisor, PIN_SUPERVISOR);
  return negocio;
}

async function turnosAbiertos(db: Db, dispositivo: string): Promise<number> {
  return contar(
    db,
    'turno_caja',
    `dispositivo_id = '${dispositivo}' AND cerrado_el IS NULL`,
  );
}

describe('GET /caja/usuarios · la lista que el cajero toca', () => {
  test('solo quienes pueden abrir turno en esa tablet', async ({ api, db }) => {
    const negocio = await sinTurno(db);
    // Con PIN pero sin asignacion al local: no aparece.
    await ponerPin(db, negocio.dueno, '0000');
    // Asignado pero sin PIN: un nombre sin PIN es un callejon sin salida.
    const sinPin = await crearUsuario(db, negocio.id, 'cajero', null);
    await asignar(db, sinPin, negocio.local, negocio.id);
    // Con PIN y asignado, pero dado de baja.
    const deBaja = await crearUsuario(db, negocio.id, 'cajero', null);
    await asignar(db, deBaja, negocio.local, negocio.id);
    await ponerPin(db, deBaja, '1111');
    await db.query('UPDATE usuario_negocio SET activo = false WHERE id = $1', [deBaja]);

    const respuesta = await api.usuariosDeCaja(negocio.token);

    expect(respuesta.estado).toBe(200);
    const usuarios = respuesta.cuerpo['usuarios'] as { id: string; rol: string }[];
    expect(usuarios.map((u) => u.id).sort()).toEqual(
      [negocio.cajero, negocio.supervisor].sort(),
    );
    expect(JSON.stringify(respuesta.cuerpo)).not.toContain('scrypt');
  });

  test('una asignacion dada de baja saca a la persona de esa tablet', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);
    await db.query(
      'UPDATE usuario_local SET activo = false WHERE usuario_id = $1 AND local_id = $2',
      [negocio.cajero, negocio.local],
    );

    const usuarios = (await api.usuariosDeCaja(negocio.token)).cuerpo['usuarios'] as {
      id: string;
    }[];

    expect(usuarios.map((u) => u.id)).toEqual([negocio.supervisor]);
  });

  test('una tablet revocada no ve la lista', async ({ api, db }) => {
    const negocio = await sinTurno(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.usuariosDeCaja(negocio.token);

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
  });

  test('sin token, 401', async ({ api, db }) => {
    await sinTurno(db);
    expect((await api.usuariosDeCaja('no-soy-una-tablet')).estado).toBe(401);
  });
});

describe('POST /caja/turnos · abrir con PIN', () => {
  test('con el PIN correcto abre el turno y la caja queda lista', async ({ api, db }) => {
    const negocio = await sinTurno(db);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['impedimento']).toBeNull();
    expect(respuesta.cuerpo['turno']).toEqual({
      usuario: 'cajero de prueba',
      rol: 'cajero',
    });
    const turno = await una<{ local_id: string }>(
      db,
      'SELECT local_id FROM turno_caja WHERE dispositivo_id = $1 AND cerrado_el IS NULL',
      [negocio.dispositivo],
    );
    // El local sale de la tablet, nunca del request (INV-2).
    expect(turno.local_id).toBe(negocio.local);
  });

  test('con el turno abierto, sellar ya no responde TURNO_CERRADO', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);
    const antes = await api.estadoDeCaja(negocio.token);
    expect(antes.cuerpo['impedimento']).toBe('TURNO_CERRADO');

    await api.abrirTurno(negocio.token, { usuario_id: negocio.cajero, pin: PIN_CAJERO });

    expect((await api.estadoDeCaja(negocio.token)).cuerpo['impedimento']).toBeNull();
  });

  test('con el PIN equivocado no abre nada, y la respuesta no repite el PIN', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: '9999',
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('PIN_INCORRECTO');
    expect(JSON.stringify(respuesta.cuerpo)).not.toContain('9999');
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(0);
  });

  test('cambio de cajero: abrir turno cierra el de quien estaba', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await ponerPin(db, negocio.supervisor, PIN_SUPERVISOR);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.supervisor,
      pin: PIN_SUPERVISOR,
    });

    expect(respuesta.cuerpo['turno']).toMatchObject({ rol: 'supervisor' });
    const anterior = await una<{ cerrado: boolean }>(
      db,
      'SELECT cerrado_el IS NOT NULL AS cerrado FROM turno_caja WHERE id = $1',
      [negocio.turno],
    );
    expect(anterior.cerrado).toBe(true);
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(1);
  });

  test('el doble toque no abre dos turnos: devuelve el mismo', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await ponerPin(db, negocio.cajero, PIN_CAJERO);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(200);
    // El turno que ya tenia abierto sigue siendo el unico.
    expect(
      await contar(db, 'turno_caja', `dispositivo_id = '${negocio.dispositivo}'`),
    ).toBe(1);
    const abierto = await una<{ id: string }>(
      db,
      'SELECT id FROM turno_caja WHERE dispositivo_id = $1 AND cerrado_el IS NULL',
      [negocio.dispositivo],
    );
    expect(abierto.id).toBe(negocio.turno);
  });

  test('dos aperturas a la vez en la misma tablet terminan en un solo turno', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);

    const respuestas = await Promise.all([
      api.abrirTurno(negocio.token, { usuario_id: negocio.cajero, pin: PIN_CAJERO }),
      api.abrirTurno(negocio.token, {
        usuario_id: negocio.supervisor,
        pin: PIN_SUPERVISOR,
      }),
      api.abrirTurno(negocio.token, { usuario_id: negocio.cajero, pin: PIN_CAJERO }),
    ]);

    expect(respuestas.map((r) => r.estado)).toEqual([200, 200, 200]);
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(1);
  });

  test('el local del body no existe para la api (INV-1)', async ({ api, db }) => {
    const negocio = await sinTurno(db);

    await api.abrirTurno(negocio.token, {
      usuario_id: negocio.supervisor,
      pin: PIN_SUPERVISOR,
      local_id: negocio.otroLocal,
    });

    const turno = await una<{ local_id: string }>(
      db,
      'SELECT local_id FROM turno_caja WHERE dispositivo_id = $1 AND cerrado_el IS NULL',
      [negocio.dispositivo],
    );
    expect(turno.local_id).toBe(negocio.local);
  });

  test.for([
    ['sin asignacion a este local', 'dueno'],
    ['dado de baja', 'baja'],
    ['sin PIN', 'sinPin'],
    ['de otro negocio', 'otroNegocio'],
  ] as const)('USUARIO_NO_HABILITADO para alguien %s', async ([, quien], { api, db }) => {
    const negocio = await sinTurno(db);
    let usuario: string;
    if (quien === 'dueno') {
      usuario = negocio.dueno;
      await ponerPin(db, usuario, PIN_CAJERO);
    } else if (quien === 'baja') {
      usuario = negocio.cajero;
      await db.query('UPDATE usuario_negocio SET activo = false WHERE id = $1', [
        usuario,
      ]);
    } else if (quien === 'sinPin') {
      usuario = await crearUsuario(db, negocio.id, 'cajero', null);
      await asignar(db, usuario, negocio.local, negocio.id);
    } else {
      const otro = await crearNegocio(db);
      usuario = otro.cajero;
      await ponerPin(db, usuario, PIN_CAJERO);
    }

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: usuario,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('USUARIO_NO_HABILITADO');
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(0);
  });

  test('una tablet revocada no abre turno', async ({ api, db }) => {
    const negocio = await sinTurno(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
  });

  test.for([
    ['un PIN que no son cuatro digitos', { pin: '12a4' }],
    ['sin PIN', { pin: undefined }],
    ['un usuario que no es un id', { usuario_id: 'marta' }],
  ] as const)('PETICION_INVALIDA con %s', async ([, cambios], { api, db }) => {
    const negocio = await sinTurno(db);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
      ...cambios,
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('PETICION_INVALIDA');
  });
});

describe('POST /caja/turnos · el bloqueo por PIN equivocados', () => {
  async function equivocarse(api: Api, token: string, usuario: string): Promise<void> {
    for (let i = 0; i < PIN_EQUIVOCADOS_PARA_BLOQUEAR; i += 1) {
      const r = await api.abrirTurno(token, { usuario_id: usuario, pin: '0000' });
      expect(r.cuerpo['codigo']).toBe('PIN_INCORRECTO');
    }
  }

  test('tras diez equivocados, ni el correcto entra, y dice a que hora probar', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);
    await equivocarse(api, negocio.token, negocio.cajero);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(429);
    expect(respuesta.cuerpo['codigo']).toBe('PIN_BLOQUEADO');
    expect(String(respuesta.cuerpo['mensaje'])).toMatch(/Probá de nuevo a las \d\d:\d\d/);
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(0);
  });

  test('el bloqueo es del usuario: tampoco entra desde otra tablet', async ({
    api,
    db,
  }) => {
    const negocio = await sinTurno(db);
    await cerrarTurno(db, negocio.turnoOtroLocal);
    await equivocarse(api, negocio.token, negocio.supervisor);

    const desdeOtra = await api.abrirTurno(negocio.tokenOtroLocal, {
      usuario_id: negocio.supervisor,
      pin: PIN_SUPERVISOR,
    });

    expect(desdeOtra.cuerpo['codigo']).toBe('PIN_BLOQUEADO');
  });

  test('el bloqueo de uno no frena a otro en la misma tablet', async ({ api, db }) => {
    const negocio = await sinTurno(db);
    await equivocarse(api, negocio.token, negocio.supervisor);

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(200);
  });

  test('un PIN correcto no cuenta como intento', async ({ api, db }) => {
    const negocio = await sinTurno(db);

    await api.abrirTurno(negocio.token, { usuario_id: negocio.cajero, pin: PIN_CAJERO });

    expect(await contar(db, 'tope_peticion')).toBe(0);
  });
});

describe('POST /caja/turno/cierre', () => {
  test('cierra el turno y la caja vuelve a pedir turno', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    const respuesta = await api.cerrarTurno(negocio.token);

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['turno']).toBeNull();
    expect(respuesta.cuerpo['impedimento']).toBe('TURNO_CERRADO');
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(0);
  });

  test('cerrar sin turno abierto no es un error: el doble toque da lo mismo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);

    const primera = await api.cerrarTurno(negocio.token);
    const segunda = await api.cerrarTurno(negocio.token);

    expect(segunda.estado).toBe(200);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
  });

  test('solo cierra el de esta tablet', async ({ api, db }) => {
    const negocio = await crearNegocio(db);

    await api.cerrarTurno(negocio.token);

    expect(await turnosAbiertos(db, negocio.dispositivoOtroLocal)).toBe(1);
  });

  test('una tablet revocada no cierra nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.cerrarTurno(negocio.token);

    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
    expect(await turnosAbiertos(db, negocio.dispositivo)).toBe(1);
  });
});

describe('El turno se cierra solo a la hora sin actividad', () => {
  /** Corre la apertura del turno de la tablet `minutos` hacia atras. */
  async function abiertoHace(db: Db, turno: string, minutos: number): Promise<void> {
    await db.query(
      `UPDATE turno_caja SET abierto_el = now() - make_interval(mins => $2::int)
       WHERE id = $1`,
      [turno, minutos],
    );
  }

  test('una hora sin sellar ni canjear: la caja pide turno de nuevo', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await abiertoHace(db, negocio.turno, 61);
    const cliente = await crearClienteEnCaja(db);

    expect((await api.estadoDeCaja(negocio.token)).cuerpo['impedimento']).toBe(
      'TURNO_CERRADO',
    );
    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    expect(sello.estado).toBe(409);
    expect(sello.cuerpo['codigo']).toBe('TURNO_CERRADO');
    expect(await contar(db, 'sello')).toBe(0);
  });

  test('a los 59 minutos todavia opera', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await abiertoHace(db, negocio.turno, 59);

    expect((await api.estadoDeCaja(negocio.token)).cuerpo['impedimento']).toBeNull();
  });

  test('un sello hace media hora lo mantiene abierto, aunque se abrio hace tres', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await abiertoHace(db, negocio.turno, 180);
    const tarjeta = await crearTarjeta(db, await crearCliente(db), negocio);
    const sello = await crearSello(db, tarjeta, negocio);
    await db.query(
      `UPDATE sello SET creado_el = now() - interval '30 minutes' WHERE id = $1`,
      [sello],
    );

    expect((await api.estadoDeCaja(negocio.token)).cuerpo['impedimento']).toBeNull();
  });

  test('un canje tambien cuenta como actividad', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await abiertoHace(db, negocio.turno, 180);
    const tarjeta = await crearTarjeta(db, await crearCliente(db), negocio);
    const canje = await crearCanje(db, tarjeta, negocio);
    await db.query(
      `UPDATE canje SET creado_el = now() - interval '30 minutes' WHERE id = $1`,
      [canje],
    );

    expect((await api.estadoDeCaja(negocio.token)).cuerpo['impedimento']).toBeNull();
  });

  test('el mismo cajero vuelve: turno nuevo, y el viejo cerrado a la hora en que se agoto', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await ponerPin(db, negocio.cajero, PIN_CAJERO);
    await abiertoHace(db, negocio.turno, 180);
    const tarjeta = await crearTarjeta(db, await crearCliente(db), negocio);
    const sello = await crearSello(db, tarjeta, negocio);
    await db.query(
      `UPDATE sello SET creado_el = now() - interval '90 minutes' WHERE id = $1`,
      [sello],
    );

    const respuesta = await api.abrirTurno(negocio.token, {
      usuario_id: negocio.cajero,
      pin: PIN_CAJERO,
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['impedimento']).toBeNull();
    const viejo = await una<{ exacto: boolean }>(
      db,
      `SELECT t.cerrado_el = s.creado_el + interval '60 minutes' AS exacto
       FROM turno_caja t, sello s WHERE t.id = $1 AND s.id = $2`,
      [negocio.turno, sello],
    );
    expect(viejo.exacto).toBe(true);
    const nuevo = await una<{ id: string; usuario_id: string }>(
      db,
      'SELECT id, usuario_id FROM turno_caja WHERE dispositivo_id = $1 AND cerrado_el IS NULL',
      [negocio.dispositivo],
    );
    expect(nuevo.id).not.toBe(negocio.turno);
    expect(nuevo.usuario_id).toBe(negocio.cajero);
  });
});
