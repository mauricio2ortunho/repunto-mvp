import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { NegocioNuevo, SolicitudDelAdmin } from '@repunto/contratos';

import { una } from '../base';
import { crearEntradaDeAdmin, crearEntradaDeDueno, crearNegocio } from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * La solicitud de negocio: alguien la pide desde la app y el admin la
 * resuelve. Lo que importa: el pedido público no dice nada de nadie, el
 * reenvío no duplica, y aprobar es dar de alta el negocio en la misma
 * transacción —si la solicitud ya no estaba pendiente, no se crea nada.
 */

async function comoAdmin(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  return String((await api.entrarComoAdmin({ codigo })).cuerpo['token']);
}

/** Un teléfono boliviano distinto por llamada, tal como se tipea. */
let siguiente = 0;
function tipeado(): string {
  siguiente += 1;
  return `7${String(6_000_000 + siguiente).padStart(7, '0')}`;
}

function pedido(telefono: string, cambio: Record<string, unknown> = {}) {
  return {
    nombre_negocio: 'Pollos Ana',
    categoria: 'restaurante',
    contacto: 'Ana Pérez',
    telefono,
    mensaje: 'Tenemos dos sucursales',
    ...cambio,
  };
}

function alta(solicitud_id: string | null): NegocioNuevo {
  return {
    nombre: `Pollos Ana ${randomUUID().slice(0, 6)}`,
    categoria: 'restaurante',
    color_principal: '#7A3E1D',
    icono_sello: 'estrella',
    plantilla_tarjeta: 'clasica',
    canje_cualquier_local: true,
    programa: {
      sellos_requeridos: 8,
      premio: 'Un cuarto de pollo',
      vigencia_meses: 1,
      horas_entre_sellos: 4,
      pide_monto: false,
    },
    condicion: { texto: 'Cualquier combo', monto_minimo: null },
    solicitud_id,
  };
}

async function idDe(db: Db, telefono: string): Promise<string> {
  return (
    await una<{ id: string }>(
      db,
      `SELECT id FROM solicitud_negocio WHERE telefono = $1 ORDER BY creado_el DESC LIMIT 1`,
      [`+591${telefono}`],
    )
  ).id;
}

describe('POST /solicitudes · el pedido desde la app', () => {
  test('queda pendiente, con el teléfono normalizado', async ({ api, db }) => {
    const tel = tipeado();

    const r = await api.pedirSolicitud(pedido(`${tel.slice(0, 4)} ${tel.slice(4)}`));

    expect(r.estado).toBe(202);
    expect(r.cuerpo).toEqual({ recibida: true });
    const fila = await una<{ estado: string; telefono: string; mensaje: string }>(
      db,
      'SELECT estado::text AS estado, telefono, mensaje FROM solicitud_negocio',
    );
    expect(fila).toEqual({
      estado: 'pendiente',
      telefono: `+591${tel}`,
      mensaje: 'Tenemos dos sucursales',
    });
  });

  test('el reenvío no crea otra, y responde lo mismo', async ({ api, db }) => {
    const tel = tipeado();

    const primera = await api.pedirSolicitud(pedido(tel));
    const segunda = await api.pedirSolicitud(pedido(tel, { nombre_negocio: 'Otro' }));

    expect(segunda).toMatchObject({ estado: primera.estado, cuerpo: primera.cuerpo });
    expect(await contar(db, 'solicitud_negocio')).toBe(1);
  });

  test('un mensaje vacío es lo mismo que ninguno', async ({ api, db }) => {
    await api.pedirSolicitud(pedido(tipeado(), { mensaje: '   ' }));
    expect(await contar(db, 'solicitud_negocio', 'mensaje IS NULL')).toBe(1);
  });

  test('un teléfono que no es teléfono, o un rubro que no existe, no entran', async ({
    api,
    db,
  }) => {
    const telefono = await api.pedirSolicitud(pedido('123'));
    const rubro = await api.pedirSolicitud(pedido(tipeado(), { categoria: 'casino' }));

    expect(telefono.cuerpo['codigo']).toBe('TELEFONO_INVALIDO');
    expect(rubro.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    expect(await contar(db, 'solicitud_negocio')).toBe(0);
  });

  test('tres por teléfono por día: el cuarto pedido es TOPE_SUPERADO', async ({
    api,
    db,
  }) => {
    const tel = tipeado();
    for (let i = 0; i < 3; i += 1) {
      expect((await api.pedirSolicitud(pedido(tel))).estado).toBe(202);
    }
    const cuarto = await api.pedirSolicitud(pedido(tel));
    expect(cuarto.estado).toBe(429);
    expect(cuarto.cuerpo['codigo']).toBe('TOPE_SUPERADO');
    expect(await contar(db, 'solicitud_negocio')).toBe(1);
  });
});

describe('Las solicitudes en el panel del admin', () => {
  test('lista las pendientes con lo que hace falta para responder', async ({
    api,
    db,
  }) => {
    const tel = tipeado();
    await api.pedirSolicitud(pedido(tel));
    const token = await comoAdmin(api, db);

    const r = await api.solicitudes(token);

    expect(r.estado).toBe(200);
    const [s] = r.cuerpo['solicitudes'] as SolicitudDelAdmin[];
    expect(s).toMatchObject({
      nombre_negocio: 'Pollos Ana',
      categoria: 'restaurante',
      contacto: 'Ana Pérez',
      telefono: `+591${tel}`,
      estado: 'pendiente',
      negocio_id: null,
    });
    const una = await api.solicitud(token, String(s?.id));
    expect(una.cuerpo).toEqual(s);
  });

  test('rechazar la guarda con su motivo, y no se rechaza dos veces', async ({
    api,
    db,
  }) => {
    const tel = tipeado();
    await api.pedirSolicitud(pedido(tel));
    const token = await comoAdmin(api, db);
    const id = await idDe(db, tel);

    const r = await api.rechazarSolicitud(token, id, { motivo: 'Fuera de Santa Cruz' });
    const otra = await api.rechazarSolicitud(token, id, {});

    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({
      estado: 'rechazada',
      motivo_rechazo: 'Fuera de Santa Cruz',
    });
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo['codigo']).toBe('SOLICITUD_YA_RESUELTA');
    // Rechazada, el mismo teléfono puede volver a pedir.
    await api.pedirSolicitud(pedido(tel));
    expect(await contar(db, 'solicitud_negocio', `estado = 'pendiente'`)).toBe(1);
  });

  test('aprobar es dar de alta: el negocio y la solicitud, juntos', async ({
    api,
    db,
  }) => {
    const tel = tipeado();
    await api.pedirSolicitud(pedido(tel));
    const token = await comoAdmin(api, db);
    const id = await idDe(db, tel);

    const creado = await api.crearNegocioComoAdmin(token, alta(id), randomUUID());

    expect(creado.estado).toBe(201);
    const s = (await api.solicitud(token, id)).cuerpo;
    expect(s).toMatchObject({ estado: 'aprobada', negocio_id: creado.cuerpo['id'] });
  });

  test('una solicitud ya resuelta no se aprueba: no se crea ningún negocio', async ({
    api,
    db,
  }) => {
    const tel = tipeado();
    await api.pedirSolicitud(pedido(tel));
    const token = await comoAdmin(api, db);
    const id = await idDe(db, tel);
    await api.rechazarSolicitud(token, id);
    const antes = await contar(db, 'negocio');

    const r = await api.crearNegocioComoAdmin(token, alta(id), randomUUID());
    const ninguna = await api.crearNegocioComoAdmin(
      token,
      alta('00000000-0000-4000-8000-000000000000'),
      randomUUID(),
    );

    expect(r.estado).toBe(409);
    expect(r.cuerpo['codigo']).toBe('SOLICITUD_YA_RESUELTA');
    expect(ninguna.estado).toBe(404);
    expect(ninguna.cuerpo['codigo']).toBe('SOLICITUD_NO_ENCONTRADA');
    expect(await contar(db, 'negocio')).toBe(antes);
  });

  test('un alta sin solicitud sigue como siempre', async ({ api, db }) => {
    const token = await comoAdmin(api, db);
    const r = await api.crearNegocioComoAdmin(token, alta(null), randomUUID());
    expect(r.estado).toBe(201);
  });

  test('solo el admin: ni sin sesión, ni el dueño', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearEntradaDeDueno(db, negocio.dueno);
    const dueno = String((await api.entrarComoDueno({ codigo })).cuerpo['token']);
    await api.pedirSolicitud(pedido(tipeado()));
    const id = (await una<{ id: string }>(db, 'SELECT id FROM solicitud_negocio')).id;

    for (const token of [undefined, dueno]) {
      expect((await api.solicitudes(token)).estado).toBe(401);
      expect((await api.solicitud(token, id)).estado).toBe(401);
      expect((await api.rechazarSolicitud(token, id)).estado).toBe(401);
    }
    expect(await contar(db, 'solicitud_negocio', `estado = 'pendiente'`)).toBe(1);
  });
});
