import { describe, expect } from 'vitest';

import { crearClienteEnCaja, crearNegocio } from '../escenario';
import { type Respuesta, test } from './base';

/**
 * `GET /negocios`: el directorio "Dónde juntar sellos". Publico, para mirar.
 *
 * Lo que se prueba con la base de verdad es el filtro —un negocio donde la
 * caja rechazaria el sello no se ofrece— y que la credencial del alta, el
 * `qr_slug`, no salga nunca.
 */

interface NegocioDelDirectorio {
  id: string;
  nombre: string;
  categoria: string;
  premio: string;
  sellos_requeridos: number;
  locales: { nombre: string; direccion: string }[];
}

function negociosDe(respuesta: Respuesta): NegocioDelDirectorio[] {
  expect(respuesta.estado).toBe(200);
  return (respuesta.cuerpo as unknown as { negocios: NegocioDelDirectorio[] }).negocios;
}

describe('GET /negocios', () => {
  test('es publico y trae la marca, la promo vigente y los locales', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);

    expect(negociosDe(await api.negocios())).toEqual([
      {
        id: negocio.id,
        nombre: 'Negocio de prueba',
        categoria: 'cafe',
        color_principal: '#1A2B3C',
        logo_url: null,
        portada_url: null,
        plantilla_tarjeta: 'clasica',
        icono_sello: 'cafe',
        premio: 'Un cafe',
        sellos_requeridos: 10,
        locales: [
          { nombre: 'Centro', direccion: 'Santa Cruz de la Sierra' },
          { nombre: 'Equipetrol', direccion: 'Santa Cruz de la Sierra' },
        ],
      },
    ]);
  });

  test('nunca devuelve el qr_slug: es la credencial del alta', async ({ api, db }) => {
    await crearNegocio(db);
    const { rows } = await db.query<{ qr_slug: string }>('SELECT qr_slug FROM local');

    const crudo = JSON.stringify((await api.negocios()).cuerpo);

    expect(rows).toHaveLength(2);
    for (const { qr_slug } of rows) expect(crudo).not.toContain(qr_slug);
    expect(crudo).not.toContain('qr_slug');
  });

  test('un negocio suspendido no aparece', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query(`UPDATE negocio SET estado = 'suspendido' WHERE id = $1`, [
      negocio.id,
    ]);

    expect(negociosDe(await api.negocios())).toEqual([]);
  });

  test('un negocio sin programa vigente no aparece', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);

    expect(negociosDe(await api.negocios())).toEqual([]);
  });

  test('muestra la promo de la version vigente, no la anterior (INV-5)', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE programa SET vigente = false WHERE id = $1', [
      negocio.programa,
    ]);
    await db.query(
      `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
       VALUES ($1, 2, 5, 'Un cafe chico', 4, true)`,
      [negocio.id],
    );

    expect(negociosDe(await api.negocios())).toMatchObject([
      { premio: 'Un cafe chico', sellos_requeridos: 5 },
    ]);
  });

  test('un local cerrado no aparece, y sin locales abiertos tampoco el negocio', async ({
    api,
    db,
  }) => {
    const negocio = await crearNegocio(db);
    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.otroLocal]);

    expect(negociosDe(await api.negocios())).toMatchObject([
      { locales: [{ nombre: 'Equipetrol' }] },
    ]);

    await db.query('UPDATE local SET activo = false WHERE id = $1', [negocio.local]);

    expect(negociosDe(await api.negocios())).toEqual([]);
  });

  test('vienen ordenados por categoria y despues por nombre', async ({ api, db }) => {
    const panaderia = await crearNegocio(db, 'Pan del Dia');
    const cafeB = await crearNegocio(db, 'Cafe Bravo');
    const cafeA = await crearNegocio(db, 'Cafe Alto');
    await db.query(`UPDATE negocio SET categoria = 'panaderia' WHERE id = $1`, [
      panaderia.id,
    ]);

    expect(negociosDe(await api.negocios()).map((n) => n.id)).toEqual([
      cafeA.id,
      cafeB.id,
      panaderia.id,
    ]);
  });

  test('con la sesion de un cliente responde lo mismo que sin ella', async ({
    api,
    db,
  }) => {
    await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const sin = await api.negocios();
    const con = await api.negocios(cliente.token);

    expect(con.estado).toBe(200);
    expect(con.cuerpo).toEqual(sin.cuerpo);
  });
});
