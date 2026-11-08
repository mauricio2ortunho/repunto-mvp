import { describe, expect } from 'vitest';
import type { ResumenDelDueno } from '@repunto/contratos';
import { inicioDelMesEnLaPaz } from '@repunto/dominio';

import {
  crearCanje,
  crearCliente,
  crearEntradaDeAdmin,
  crearEntradaDeDueno,
  crearNegocio,
  crearSello,
  crearSellos,
  crearTarjeta,
} from '../escenario';
import { type Api, type Db, test } from './base';

/**
 * El resumen del dueño cuenta con las definiciones de la sección 6: un sello
 * anulado no cuenta, las tarjetas vacías no son abiertas, "volvió" son dos
 * sellos aunque sean del mismo día, "enfriado" son tres sellos y ninguno en
 * 30 días, y la frecuencia es la mediana, no el promedio. Todo de SU negocio,
 * que sale de la sesión.
 */

async function entrarComoDueno(api: Api, db: Db, dueno: string): Promise<string> {
  const { codigo } = await crearEntradaDeDueno(db, dueno);
  const respuesta = await api.entrarComoDueno({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

const DIA = 24;

describe('GET /dueno/resumen', () => {
  test('cuenta clientes, visitas, premios y locales de su negocio', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db, 'Con movimiento');
    const otro = await crearNegocio(db, 'Otro');
    // Hace cuántas horas fue el primer sello de cada cliente que cuenta.
    const primeros: number[] = [];

    // A: un sello ahora. Activo; no volvió.
    const clienteA = await crearCliente(db);
    await crearSello(db, await crearTarjeta(db, clienteA, negocio), negocio);
    primeros.push(0);
    // El mismo A en otro negocio no cuenta acá.
    await crearSello(db, await crearTarjeta(db, clienteA, otro), otro);
    // B: hace 40 y hace 10 días. Volvió; el segundo es un regreso del mes.
    const b = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSello(db, b, negocio, 40 * DIA);
    await crearSello(db, b, negocio, 10 * DIA);
    primeros.push(40 * DIA);
    // C: tres sellos hace 50, 49 y 48 días. Enfriado; sigue activo (60 días).
    const c = await crearTarjeta(db, await crearCliente(db), negocio);
    for (const dias of [50, 49, 48]) await crearSello(db, c, negocio, dias * DIA);
    primeros.push(50 * DIA);
    // D: su único sello se anuló. No cuenta en nada.
    const d = await crearTarjeta(db, await crearCliente(db), negocio);
    const anulado = await crearSello(db, d, negocio);
    await db.query(
      `UPDATE sello SET anulado = true, anulado_el = now(), anulado_turno_id = $2
       WHERE id = $1`,
      [anulado, negocio.turno],
    );
    // E: tarjeta vacía. No es abierta.
    await crearTarjeta(db, await crearCliente(db), negocio);
    // F: diez sellos, uno por día hasta ayer. Completa: falta entregarle el premio.
    const f = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSellos(db, f, negocio, 10);
    primeros.push(10 * DIA);
    // G: un canje de hoy, sobre una tarjeta sin sellos sueltos.
    const g = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearCanje(db, g, negocio);
    // H: dos visitas el mismo día, hace 5 y hace 1 hora. Ya volvió.
    const h = await crearTarjeta(db, await crearCliente(db), negocio);
    await crearSello(db, h, negocio, 5);
    await crearSello(db, h, negocio, 1);
    primeros.push(5);

    const token = await entrarComoDueno(api, db, negocio.dueno);
    const respuesta = await api.resumenDelDueno(token);

    expect(respuesta.estado).toBe(200);
    const resumen = respuesta.cuerpo as unknown as ResumenDelDueno;
    expect(resumen.ventanas).toEqual({
      semana_dias: 7,
      mes_dias: 30,
      cliente_activo_dias: 60,
      enfriado_dias: 30,
      sellos_para_enfriado: 3,
      local_sin_sellos_dias: 7,
    });

    // Nuevo del mes depende del día en que corra el test: se cuenta igual que
    // la api, con el corte de La Paz.
    const inicio = inicioDelMesEnLaPaz(new Date(resumen.generado_el)).getTime();
    const generado = Date.parse(resumen.generado_el);
    const nuevos = primeros.filter((horas) => generado - horas * 3_600_000 >= inicio);

    expect(resumen.clientes).toEqual({
      con_sellos: 5,
      activos: 5,
      nuevos_del_mes: nuevos.length,
      volvieron: 4,
      enfriados: 1,
    });
    expect(resumen.visitas).toEqual({
      // A, seis de F (de ayer a hace 6 días) y los dos de H.
      sellos_semana: 9,
      // A, el de hace 10 días de B, los diez de F y los dos de H.
      sellos_mes: 14,
      // El segundo de B, nueve de F y el segundo de H.
      regresos_mes: 11,
      // Entre visitas: 30 días (B), 1 y 1 (C), nueve de 1 (F), 4 horas (H).
      // La mediana es 1; el promedio daría 3,2.
      dias_entre_visitas: 1,
    });
    expect(resumen.premios).toEqual({
      canjes_mes: 1,
      tarjetas_abiertas: 5,
      listas_para_canjear: 1,
    });
    expect(resumen.locales).toEqual([
      expect.objectContaining({
        id: negocio.local,
        sellos_semana: 9,
        tablets_activas: 1,
      }),
      expect.objectContaining({
        id: negocio.otroLocal,
        sellos_semana: 0,
        ultimo_sello: null,
        tablets_activas: 1,
      }),
    ]);
    expect(resumen.locales[0]?.ultimo_sello).not.toBeNull();
  });

  test('un negocio sin movimiento da ceros, y la frecuencia queda vacía', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.resumenDelDueno(token);

    expect(respuesta.estado).toBe(200);
    const resumen = respuesta.cuerpo as unknown as ResumenDelDueno;
    expect(resumen.clientes).toEqual({
      con_sellos: 0,
      activos: 0,
      nuevos_del_mes: 0,
      volvieron: 0,
      enfriados: 0,
    });
    expect(resumen.visitas.dias_entre_visitas).toBeNull();
    expect(resumen.premios).toEqual({
      canjes_mes: 0,
      tarjetas_abiertas: 0,
      listas_para_canjear: 0,
    });
  });

  test('un local cerrado no aparece', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.otroLocal]);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const resumen = (await api.resumenDelDueno(token))
      .cuerpo as unknown as ResumenDelDueno;

    expect(resumen.locales.map((l) => l.id)).toEqual([negocio.local]);
  });

  test('INV-1 · el negocio sale de la sesion: pedir otro por la query no sirve', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const otro = await crearNegocio(db);
    await crearSello(db, await crearTarjeta(db, await crearCliente(db), otro), otro);
    const token = await entrarComoDueno(api, db, negocio.dueno);

    const respuesta = await api.resumenDelDueno(token, `?negocio_id=${otro.id}`);

    expect(respuesta.estado).toBe(200);
    const resumen = respuesta.cuerpo as unknown as ResumenDelDueno;
    expect(resumen.clientes.con_sellos).toBe(0);
    expect(resumen.locales.map((l) => l.id)).toEqual([negocio.local, negocio.otroLocal]);
  });

  test('con el negocio suspendido, el dueño sigue viendo su resumen', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const token = await entrarComoDueno(api, db, negocio.dueno);
    await db.query(`UPDATE negocio SET estado = 'suspendido' WHERE id = $1`, [
      negocio.id,
    ]);

    expect((await api.resumenDelDueno(token)).estado).toBe(200);
  });

  test('sin sesion de dueño, 401: ni el admin, ni la tablet, ni el cliente', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    const { codigo } = await crearEntradaDeAdmin(db);
    const admin = String((await api.entrarComoAdmin({ codigo })).cuerpo['token']);

    for (const token of [undefined, admin, negocio.token]) {
      expect((await api.resumenDelDueno(token)).estado).toBe(401);
    }
  });
});
