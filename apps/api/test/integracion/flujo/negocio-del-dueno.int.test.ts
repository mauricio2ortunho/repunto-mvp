import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { NegocioDelDueno, PersonaDelAdmin } from '@repunto/contratos';

import { una } from '../base';
import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeDueno,
  crearNegocio,
  crearUsuario,
  telefono,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * El dueño maneja sus locales, su equipo y sus tablets. Lo que se escribe es
 * lo mismo que desde la ficha del admin (ya probado allá); acá va lo propio
 * del dueño: el negocio sale de la sesión (INV-1) y lo de otro negocio no
 * existe, no abre ni cierra locales, a los dueños no los toca, y su código
 * de vinculación queda firmado por él.
 */

async function entrarComoDueno(api: Api, db: Db, dueno: string): Promise<string> {
  const { codigo } = await crearEntradaDeDueno(db, dueno);
  const respuesta = await api.entrarComoDueno({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

async function negocioDe(api: Api, token: string): Promise<NegocioDelDueno> {
  const respuesta = await api.negocioDelDueno(token);
  expect(respuesta.estado).toBe(200);
  return respuesta.cuerpo as unknown as NegocioDelDueno;
}

async function idsEnLaTablet(api: Api, tablet: string): Promise<string[]> {
  const usuarios = (await api.usuariosDeCaja(tablet)).cuerpo['usuarios'] as {
    id: string;
  }[];
  return usuarios.map((u) => u.id);
}

const DATOS_DEL_LOCAL = {
  nombre: 'Equipetrol Norte',
  direccion: 'Av. San Martín 1200',
  ubicacion: { latitud: -17.7633, longitud: -63.1975 },
};

describe('GET /dueno/negocio', () => {
  test('sus locales, su equipo y sus tablets; nada de otro negocio', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const visto = await negocioDe(api, token);

    expect(visto.locales.map((l) => l.id).sort()).toEqual(
      [negocio.local, negocio.otroLocal].sort(),
    );
    expect(visto.personas.map((p) => p.id).sort()).toEqual(
      [negocio.dueno, negocio.cajero, negocio.supervisor].sort(),
    );
    expect(visto.tablets.map((t) => t.id).sort()).toEqual(
      [negocio.dispositivo, negocio.dispositivoOtroLocal].sort(),
    );
    expect(JSON.stringify(visto)).not.toContain(otro.id);
    expect(JSON.stringify(visto)).not.toContain(otro.local);
  });

  test('sin sesión no ve nada', async ({ api }) => {
    expect((await api.negocioDelDueno()).estado).toBe(401);
  });
});

describe('Locales del dueño', () => {
  test('edita nombre, dirección y ubicación de su local', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(
      token,
      `/locales/${negocio.local}/datos`,
      DATOS_DEL_LOCAL,
    );

    expect(r.estado).toBe(200);
    const local = (r.cuerpo as unknown as NegocioDelDueno).locales.find(
      (l) => l.id === negocio.local,
    );
    expect(local).toMatchObject(DATOS_DEL_LOCAL);
  });

  test('el local de otro negocio no existe, y no se toca', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const datos = await api.comoDueno(
      token,
      `/locales/${otro.local}/datos`,
      DATOS_DEL_LOCAL,
    );
    const qr = await api.comoDueno(token, `/locales/${otro.local}/qr`);

    expect(datos.estado).toBe(404);
    expect(datos.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(qr.estado).toBe(404);
    expect(qr.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(
      await contar(db, 'local', `id = '${otro.local}' AND nombre = 'Equipetrol'`),
    ).toBe(1);
  });

  test('cambia el QR de su local: el viejo deja de servir', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const antes = await una<{ qr_slug: string }>(
      db,
      'SELECT qr_slug FROM local WHERE id = $1',
      [negocio.local],
    );

    const r = await api.comoDueno(token, `/locales/${negocio.local}/qr`);

    expect(r.estado).toBe(200);
    expect(r.cuerpo['qr_slug']).not.toBe(antes.qr_slug);
    expect(await contar(db, 'local', `qr_slug = '${antes.qr_slug}'`)).toBe(0);
  });

  test('no abre ni cierra locales: eso lo hace el admin', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const cierre = await api.comoDueno(token, `/locales/${negocio.local}/cierre`);
    const alta = await api.comoDueno(token, '/locales', DATOS_DEL_LOCAL, randomUUID());

    expect(cierre.estado).toBe(404);
    expect(alta.estado).toBe(404);
    expect(await contar(db, 'local', `negocio_id = '${negocio.id}' AND activo`)).toBe(2);
  });
});

describe('Tablets del dueño', () => {
  test('su código vincula una tablet, firmado por él y asignándolo al local', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    // El dueño de prueba no está asignado a ningún local.
    expect(await contar(db, 'usuario_local', `usuario_id = '${negocio.dueno}'`)).toBe(0);

    const generado = await api.comoDueno(
      token,
      `/locales/${negocio.local}/vinculacion`,
      undefined,
      randomUUID(),
    );

    expect(generado.estado).toBe(201);
    expect(
      await contar(
        db,
        'vinculacion_pendiente',
        `local_id = '${negocio.local}' AND creado_por_usuario_id = '${negocio.dueno}'
         AND creado_por_admin_id IS NULL`,
      ),
    ).toBe(1);
    expect(
      await contar(
        db,
        'usuario_local',
        `usuario_id = '${negocio.dueno}' AND local_id = '${negocio.local}' AND activo`,
      ),
    ).toBe(1);

    const vinculada = await api.vincular({ codigo: generado.cuerpo['codigo'] });
    expect(vinculada.estado).toBe(200);
    const estado = await api.estadoDeCaja(String(vinculada.cuerpo['token']));
    expect(estado.estado).toBe(200);
  });

  test('si le habían sacado el local, se lo devuelve y el código sirve', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await db.query(
      `INSERT INTO usuario_local (usuario_id, local_id, negocio_id, activo)
       VALUES ($1, $2, $3, false)`,
      [negocio.dueno, negocio.local, negocio.id],
    );
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const generado = await api.comoDueno(
      token,
      `/locales/${negocio.local}/vinculacion`,
      undefined,
      randomUUID(),
    );

    expect(generado.estado).toBe(201);
    expect((await api.vincular({ codigo: generado.cuerpo['codigo'] })).estado).toBe(200);
  });

  test('tocar dos veces deja un solo código', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const clave = randomUUID();
    const ruta = `/locales/${negocio.local}/vinculacion`;

    const primero = await api.comoDueno(token, ruta, undefined, clave);
    const segundo = await api.comoDueno(token, ruta, undefined, clave);

    expect(segundo.cuerpo).toEqual(primero.cuerpo);
    expect(
      await contar(db, 'vinculacion_pendiente', `local_id = '${negocio.local}'`),
    ).toBe(1);
    expect(
      await contar(db, 'peticion_idempotente_dueno', `usuario_id = '${negocio.dueno}'`),
    ).toBe(1);
  });

  test('sin Idempotency-Key no genera nada', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(token, `/locales/${negocio.local}/vinculacion`);

    expect(r.estado).toBe(400);
    expect(r.cuerpo['codigo']).toBe('FALTA_IDEMPOTENCY_KEY');
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
  });

  test('a un local de otro negocio no le genera código ni lo asigna', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(
      token,
      `/locales/${otro.local}/vinculacion`,
      undefined,
      randomUUID(),
    );

    expect(r.estado).toBe(404);
    expect(r.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'vinculacion_pendiente')).toBe(0);
    expect(await contar(db, 'usuario_local', `usuario_id = '${negocio.dueno}'`)).toBe(0);
  });

  test('un local cerrado no recibe tablets', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.local]);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(
      token,
      `/locales/${negocio.local}/vinculacion`,
      undefined,
      randomUUID(),
    );

    expect(r.estado).toBe(409);
    expect(r.cuerpo['codigo']).toBe('LOCAL_CERRADO');
  });

  test('revoca una tablet suya: deja de operar al instante', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(token, `/tablets/${negocio.dispositivo}/revocacion`);

    expect(r.estado).toBe(200);
    const sello = await api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(await crearClienteEnCaja(db)) },
    });
    expect(sello.estado).toBe(403);
    expect(sello.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
  });

  test('la tablet de otro negocio no existe, y sigue andando', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(token, `/tablets/${otro.dispositivo}/revocacion`);

    expect(r.estado).toBe(404);
    expect(r.cuerpo['codigo']).toBe('TABLET_NO_ENCONTRADA');
    expect((await api.estadoDeCaja(otro.token)).estado).toBe(200);
  });
});

describe('Equipo del dueño', () => {
  const CAJERA = (locales: string[]) => ({
    nombre: 'Rocío',
    rol: 'cajero',
    telefono: null,
    locales,
  });

  test('carga una cajera con PIN y aparece en la tablet de su local', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const creada = await api.comoDueno(
      token,
      '/personas',
      CAJERA([negocio.local]),
      randomUUID(),
    );
    expect(creada.estado).toBe(201);
    const id = String(creada.cuerpo['id']);
    const pin = await api.comoDueno(token, `/personas/${id}/pin`, { pin: '4821' });

    expect(pin.estado).toBe(200);
    expect(await idsEnLaTablet(api, negocio.token)).toContain(id);
    expect(await idsEnLaTablet(api, negocio.tokenOtroLocal)).not.toContain(id);
  });

  test('tocar dos veces carga una sola persona', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const clave = randomUUID();

    const primera = await api.comoDueno(
      token,
      '/personas',
      CAJERA([negocio.local]),
      clave,
    );
    const segunda = await api.comoDueno(
      token,
      '/personas',
      CAJERA([negocio.local]),
      clave,
    );

    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'usuario_negocio', `nombre = 'Rocío'`)).toBe(1);
  });

  test('no carga dueños', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(
      token,
      '/personas',
      { nombre: 'Socio', rol: 'dueno', telefono: telefono(), locales: [] },
      randomUUID(),
    );

    expect(r.estado).toBe(422);
    expect(await contar(db, 'usuario_negocio', `nombre = 'Socio'`)).toBe(0);
  });

  test('un local de otro negocio en el cuerpo no existe, y no carga a nadie', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(
      token,
      '/personas',
      CAJERA([negocio.local, otro.local]),
      randomUUID(),
    );

    expect(r.estado).toBe(404);
    expect(r.cuerpo['codigo']).toBe('LOCAL_NO_ENCONTRADO');
    expect(await contar(db, 'usuario_negocio', `nombre = 'Rocío'`)).toBe(0);
  });

  test('a un dueño no lo cambia: ni a sí mismo ni a un socio', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const socio = await crearUsuario(db, negocio.id, 'dueno', telefono(), 'Socio');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    for (const dueno of [negocio.dueno, socio]) {
      const pedidos = [
        api.comoDueno(token, `/personas/${dueno}/pin`, { pin: '1111' }),
        api.comoDueno(token, `/personas/${dueno}/datos`, {
          nombre: 'Otro nombre',
          rol: 'cajero',
          telefono: null,
          locales: [negocio.local],
        }),
        api.comoDueno(token, `/personas/${dueno}/baja`),
        api.comoDueno(token, `/personas/${dueno}/reactivacion`),
        api.comoDueno(token, `/personas/${dueno}/borrado`),
      ];
      for (const r of await Promise.all(pedidos)) {
        expect(r.estado).toBe(403);
        expect(r.cuerpo['codigo']).toBe('DUENO_NO_EDITABLE');
      }
    }
    expect(
      await contar(
        db,
        'usuario_negocio',
        `rol = 'dueno' AND activo AND pin_hash IS NULL AND negocio_id = '${negocio.id}'`,
      ),
    ).toBe(2);
    // Su sesión sigue: no se dio de baja.
    expect((await api.negocioDelDueno(token)).estado).toBe(200);
  });

  test('a la persona de otro negocio no la encuentra, y no la toca', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db, 'Otro');
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const pedidos = [
      api.comoDueno(token, `/personas/${otro.cajero}/pin`, { pin: '1111' }),
      api.comoDueno(token, `/personas/${otro.cajero}/datos`, CAJERA([negocio.local])),
      api.comoDueno(token, `/personas/${otro.cajero}/baja`),
      api.comoDueno(token, `/personas/${otro.cajero}/borrado`),
    ];
    for (const r of await Promise.all(pedidos)) {
      expect(r.estado).toBe(404);
      expect(r.cuerpo['codigo']).toBe('PERSONA_NO_ENCONTRADA');
    }
    expect(await contar(db, 'usuario_negocio', `id = '${otro.cajero}' AND activo`)).toBe(
      1,
    );
  });

  test('cambia los locales y el rol de un cajero', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const r = await api.comoDueno(token, `/personas/${negocio.cajero}/datos`, {
      nombre: 'Cajero de prueba',
      rol: 'supervisor',
      telefono: null,
      locales: [negocio.otroLocal],
    });

    expect(r.estado).toBe(200);
    const persona = (r.cuerpo as unknown as NegocioDelDueno).personas.find(
      (p: PersonaDelAdmin) => p.id === negocio.cajero,
    );
    expect(persona).toMatchObject({ rol: 'supervisor', locales: [negocio.otroLocal] });
  });

  test('da de baja y reactiva: sale de la tablet y vuelve', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query(`UPDATE usuario_negocio SET pin_hash = 'x' WHERE id = $1`, [
      negocio.cajero,
    ]);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    expect(await idsEnLaTablet(api, negocio.token)).toContain(negocio.cajero);

    const baja = await api.comoDueno(token, `/personas/${negocio.cajero}/baja`);
    expect(baja.estado).toBe(200);
    expect(await idsEnLaTablet(api, negocio.token)).not.toContain(negocio.cajero);

    const vuelta = await api.comoDueno(token, `/personas/${negocio.cajero}/reactivacion`);
    expect(vuelta.estado).toBe(200);
    expect(await idsEnLaTablet(api, negocio.token)).toContain(negocio.cajero);
  });

  test('borra a quien cargó por error; con historia, no', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    const creada = await api.comoDueno(
      token,
      '/personas',
      CAJERA([negocio.local]),
      randomUUID(),
    );
    const id = String(creada.cuerpo['id']);

    const borrada = await api.comoDueno(token, `/personas/${id}/borrado`);
    // El cajero de prueba abrió un turno.
    const conHistoria = await api.comoDueno(token, `/personas/${negocio.cajero}/borrado`);

    expect(borrada.estado).toBe(200);
    expect(await contar(db, 'usuario_negocio', `id = '${id}'`)).toBe(0);
    expect(conHistoria.estado).toBe(409);
    expect(conHistoria.cuerpo['codigo']).toBe('PERSONA_CON_HISTORIA');
  });
});
