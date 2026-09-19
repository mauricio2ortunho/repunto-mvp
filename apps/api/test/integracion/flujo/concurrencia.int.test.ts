import { describe, expect } from 'vitest';

import { VENTANA_SEGUNDOS } from '@repunto/dominio';

import {
  codigoAnteriorDe,
  codigoDe,
  crearClienteEnCaja,
  crearNegocio,
  crearSellos,
  crearTarjeta,
} from '../escenario';
import { type Respuesta, contar, test } from './base';

/**
 * Las tres carreras de CLAUDE.md, seccion 10. Datos commiteados y conexiones
 * separadas: la api usa su pool y el test el suyo, asi que las transacciones
 * se pisan de verdad.
 *
 * En las tres, lo que se exige es lo mismo: un solo efecto coherente.
 */

/** Cuantas de las respuestas terminaron bien, y con que codigo la otra. */
function reparto(respuestas: Respuesta[]): { exitos: number; codigos: string[] } {
  return {
    exitos: respuestas.filter((r) => r.estado === 200).length,
    codigos: respuestas
      .filter((r) => r.estado !== 200)
      .map((r) => String(r.cuerpo['codigo'])),
  };
}

/**
 * Espera a que la ventana del codigo recien empiece. Los tests que usan la
 * ventana anterior necesitan que no se les vaya de rango en el medio.
 */
async function conVentanaFresca(): Promise<void> {
  const largo = VENTANA_SEGUNDOS * 1000;
  const restante = largo - (Date.now() % largo);
  if (restante < 5000) await new Promise((seguir) => setTimeout(seguir, restante + 50));
}

describe('carreras', () => {
  test('dos sellados simultaneos con el mismo codigo: uno solo sella (INV-9)', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const codigo = codigoDe(cliente);

    const respuestas = await Promise.all([
      api.sellar({ token: negocio.token, cuerpo: { codigo } }),
      api.sellar({ token: negocio.token, cuerpo: { codigo } }),
    ]);

    expect(reparto(respuestas)).toEqual({ exitos: 1, codigos: ['CODIGO_YA_USADO'] });
    expect(await contar(db, 'sello')).toBe(1);
    expect(await contar(db, 'codigo_usado')).toBe(1);
    expect(await contar(db, 'tarjeta')).toBe(1);
  });

  test('dos canjes simultaneos sobre la misma tarjeta: un solo premio (INV-16)', async ({
    api,
    db,
  }) => {
    await conVentanaFresca();
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const tarjeta = await crearTarjeta(db, cliente.id, negocio);
    await crearSellos(db, tarjeta, negocio, 10);

    // Dos codigos distintos del mismo cliente: la ventana actual y la
    // anterior, que el dominio tambien acepta. Con el mismo codigo, la carrera
    // la ganaria codigo_usado y nunca se probaria la del canje.
    const respuestas = await Promise.all([
      api.canjear({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } }),
      api.canjear({
        token: negocio.token,
        cuerpo: { codigo: codigoAnteriorDe(cliente) },
      }),
    ]);

    expect(reparto(respuestas)).toEqual({ exitos: 1, codigos: ['TARJETA_INCOMPLETA'] });
    expect(await contar(db, 'canje')).toBe(1);
    expect(await contar(db, 'tarjeta', "estado = 'canjeada'")).toBe(1);
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
  });

  test('un sello que entra justo cuando el cron vence esa tarjeta', async ({
    api,
    db,
    pool,
  }) => {
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);
    const vencida = await crearTarjeta(db, cliente.id, negocio);
    await db.query(
      `UPDATE tarjeta SET reloj_desde = now() - interval '40 days',
                          vence_el = now() - interval '1 day' WHERE id = $1`,
      [vencida],
    );
    await crearSellos(db, vencida, negocio, 3);

    // El cron toma el candado de la fila y lo suelta recien al commitear.
    const cron = await pool.connect();
    await cron.query('BEGIN');
    await cron.query(
      `UPDATE tarjeta SET estado = 'vencida'
       WHERE estado = 'activa' AND vence_el < now()`,
    );

    const sellado = api.sellar({
      token: negocio.token,
      cuerpo: { codigo: codigoDe(cliente) },
    });
    await new Promise((seguir) => setTimeout(seguir, 100));
    await cron.query('COMMIT');
    cron.release();

    const respuesta = await sellado;

    // Un solo efecto coherente: la vieja vencida una sola vez, una tarjeta
    // activa nueva y el sello adentro.
    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo['progreso']).toBe(1);
    expect(await contar(db, 'tarjeta', `id = '${vencida}' AND estado = 'vencida'`)).toBe(
      1,
    );
    expect(await contar(db, 'tarjeta', "estado = 'activa'")).toBe(1);
    expect(await contar(db, 'sello')).toBe(4);
    expect(await contar(db, 'sello', `tarjeta_id = '${vencida}'`)).toBe(3);
  });
});
