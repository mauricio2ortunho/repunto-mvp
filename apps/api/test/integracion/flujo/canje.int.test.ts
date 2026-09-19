import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import {
  type ClienteDePrueba,
  type NegocioDePrueba,
  codigoDe,
  crearClienteEnCaja,
  crearNegocio,
  crearSellos,
  crearTarjeta,
  crearTarjetaVencida,
} from '../escenario';
import { una } from '../base';
import { type Db, contar, test } from './base';

/**
 * El canje por HTTP. Pide el codigo del cliente igual que el sellado: lo
 * confirma el negocio, pero con el cliente presente, asi que consume su
 * ventana como cualquier otro uso del codigo (INV-9).
 */

interface Preparada {
  negocio: NegocioDePrueba;
  cliente: ClienteDePrueba;
  tarjeta: string;
}

/** Un cliente con la tarjeta completa, lista para canjear. */
async function completa(db: Db, sellos = 10): Promise<Preparada> {
  const negocio = await crearNegocio(db);
  const cliente = await crearClienteEnCaja(db);
  const tarjeta = await crearTarjeta(db, cliente.id, negocio);
  await crearSellos(db, tarjeta, negocio, sellos);
  return { negocio, cliente, tarjeta };
}

describe('POST /caja/canjes · el camino feliz', () => {
  test('entrega el premio, cierra la tarjeta y abre la siguiente', async ({
    api,
    db,
  }) => {
    const { negocio, cliente, tarjeta } = await completa(db);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toEqual({
      nombre: 'Juan',
      premio: 'Un cafe',
      sobrantes: 0,
    });

    const cerrada = await una<{ estado: string }>(
      db,
      'SELECT estado FROM tarjeta WHERE id = $1',
      [tarjeta],
    );
    expect(cerrada.estado).toBe('canjeada');
    expect(await contar(db, 'canje')).toBe(1);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });

  test('sin sobrantes, la tarjeta nueva nace vacia y sin reloj (INV-12 manda sobre INV-14)', async ({
    api,
    db,
  }) => {
    const { negocio, cliente, tarjeta } = await completa(db);
    await api.canjear({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });

    const nueva = await una<{ reloj_desde: Date | null; vence_el: Date | null }>(
      db,
      "SELECT reloj_desde, vence_el FROM tarjeta WHERE estado = 'activa' AND id <> $1",
      [tarjeta],
    );
    expect(nueva.reloj_desde).toBeNull();
    expect(nueva.vence_el).toBeNull();
  });

  test('los sobrantes se mudan con su fecha y su local originales (INV-15)', async ({
    api,
    db,
  }) => {
    const { negocio, cliente, tarjeta } = await completa(db, 12);
    const { rows: antes } = await db.query<{
      id: string;
      creado_el: Date;
      local_id: string;
    }>('SELECT id, creado_el, local_id FROM sello ORDER BY creado_el DESC LIMIT 2', []);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.cuerpo['sobrantes']).toBe(2);
    const nueva = await una<{ id: string; reloj_desde: Date | null }>(
      db,
      "SELECT id, reloj_desde FROM tarjeta WHERE estado = 'activa' AND id <> $1",
      [tarjeta],
    );
    // Con sobrantes, el reloj arranca en el canje y no en el sello mas viejo.
    expect(nueva.reloj_desde).not.toBeNull();

    for (const sello of antes) {
      const despues = await una<{
        tarjeta_id: string;
        creado_el: Date;
        local_id: string;
      }>(db, 'SELECT tarjeta_id, creado_el, local_id FROM sello WHERE id = $1', [
        sello.id,
      ]);
      expect(despues.tarjeta_id).toBe(nueva.id);
      expect(despues.creado_el).toEqual(sello.creado_el);
      expect(despues.local_id).toBe(sello.local_id);
    }
    // Los diez consumidos se quedan en la tarjeta cerrada: nunca se borran.
    expect(await contar(db, 'sello', `tarjeta_id = '${tarjeta}'`)).toBe(10);
  });
});

describe('POST /caja/canjes · un caso por cada codigo de error', () => {
  test('TARJETA_INCOMPLETA cuando le falta un sello', async ({ api, db }) => {
    const { negocio, cliente } = await completa(db, 9);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('TARJETA_INCOMPLETA');
    expect(await contar(db, 'canje')).toBe(0);
  });

  test('TARJETA_INCOMPLETA cuando el cliente no tiene ninguna tarjeta', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('TARJETA_INCOMPLETA');
  });

  test('TARJETA_VENCIDA: al canjear si frena, a diferencia del sellado', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjetaVencida(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 10);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('TARJETA_VENCIDA');
    expect(await contar(db, 'canje')).toBe(0);
  });

  test('CANJE_EN_OTRO_LOCAL dice en que sucursal se entrega', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    await db.query('UPDATE negocio SET canje_cualquier_local = false WHERE id = $1', [
      negocio.id,
    ]);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [cliente.id, negocio.programa, negocio.id, negocio.otroLocal],
    );
    await crearSellos(db, rows[0]?.id ?? '', negocio, 10);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('CANJE_EN_OTRO_LOCAL');
    // "Centro" es el nombre del otro local en el escenario.
    expect(respuesta.cuerpo['mensaje']).toContain('Centro');
  });

  test('CODIGO_INVALIDO: sin el codigo del cliente no hay canje', async ({ api, db }) => {
    const { negocio } = await completa(db);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: 'ZZZZZ-000000' },
    });

    expect(respuesta.estado).toBe(422);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_INVALIDO');
    expect(await contar(db, 'canje')).toBe(0);
  });

  test('CODIGO_YA_USADO: el codigo que se uso para sellar no sirve para canjear', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await completa(db, 9);
    const codigo = codigoDe(cliente);
    const sellado = await api.sellar({ token: negocio.token, cuerpo: { codigo } });
    expect(sellado.cuerpo['completa']).toBe(true);

    const respuesta = await api.canjear({ token: negocio.token, cuerpo: { codigo } });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('CODIGO_YA_USADO');
    expect(await contar(db, 'canje')).toBe(0);
  });

  test('PROMO_NO_CONFIGURADA: sin programa vigente no hay tarjeta nueva que abrir', async ({
    api,
    db,
  }) => {
    const { negocio, cliente } = await completa(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(409);
    expect(respuesta.cuerpo['codigo']).toBe('PROMO_NO_CONFIGURADA');
  });

  test('DISPOSITIVO_REVOCADO tambien frena el canje', async ({ api, db }) => {
    const { negocio, cliente } = await completa(db);
    await db.query('UPDATE dispositivo_caja SET revocado_el = now() WHERE id = $1', [
      negocio.dispositivo,
    ]);

    const respuesta = await api.canjear({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });

    expect(respuesta.estado).toBe(403);
    expect(respuesta.cuerpo['codigo']).toBe('DISPOSITIVO_REVOCADO');
  });
});

describe('POST /caja/canjes · idempotencia', () => {
  test('el doble toque entrega un solo premio', async ({ api, db }) => {
    const { negocio, cliente } = await completa(db);
    const llamada = {
      token: negocio.token,
      clave: randomUUID(),
      cuerpo: { codigo: codigoDe(cliente) },
    };

    const primera = await api.canjear(llamada);
    const segunda = await api.canjear(llamada);

    expect(primera.estado).toBe(200);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'canje')).toBe(1);
    expect(await contar(db, 'tarjeta')).toBe(2);
  });
});
