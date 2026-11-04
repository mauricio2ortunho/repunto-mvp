import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';
import type { ProgramaNuevo } from '@repunto/contratos';

import { una } from '../base';
import {
  codigoDe,
  crearClienteEnCaja,
  crearEntradaDeAdmin,
  crearNegocio,
  type NegocioDePrueba,
} from '../escenario';
import { type Api, type Db, contar, test } from './base';

/**
 * La ficha de un negocio en el panel de administracion: cambiar su
 * apariencia, su promo y su condicion, y suspenderlo. Lo que importa es lo
 * que NO cambia: las tarjetas en curso siguen con su promo (INV-6) y los
 * sellos ya dados con su condicion (INV-7).
 */

async function entrar(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  const respuesta = await api.entrarComoAdmin({ codigo });
  expect(respuesta.estado).toBe(200);
  return String(respuesta.cuerpo['token']);
}

const PROMO_NUEVA: ProgramaNuevo = {
  sellos_requeridos: 6,
  premio: 'Una medialuna',
  vigencia_meses: null,
  horas_entre_sellos: 0,
  pide_monto: true,
};

async function sellar(
  api: Api,
  negocio: NegocioDePrueba,
  cliente: Parameters<typeof codigoDe>[0],
) {
  return api.sellar({ token: negocio.token, cuerpo: { codigo: codigoDe(cliente) } });
}

const NINGUNO = '00000000-0000-4000-8000-000000000000';

describe('GET /admin/negocios/:id · la ficha', () => {
  test('trae la promo vigente, las tarjetas en curso y quien escribio la condicion', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db, 'Panadería Sol');
    await sellar(api, negocio, await crearClienteEnCaja(db));

    const ficha = await api.fichaDelNegocio(token, negocio.id);

    expect(ficha.estado).toBe(200);
    expect(ficha.cuerpo).toMatchObject({
      id: negocio.id,
      nombre: 'Panadería Sol',
      estado: 'activo',
      canje_cualquier_local: true,
      locales_activos: 2,
      tarjetas_en_curso: 1,
      programa: { version: 1, sellos_requeridos: 10, premio: 'Un cafe' },
      condiciones: [
        {
          texto: 'Cualquier capuchino',
          monto_minimo: null,
          autor: { tipo: 'negocio', nombre: 'dueno de prueba' },
        },
      ],
    });
  });

  test('un negocio que no existe, 404; un id que no es uuid, 422', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);

    const inexistente = await api.fichaDelNegocio(token, NINGUNO);
    expect(inexistente.estado).toBe(404);
    expect(inexistente.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');

    expect((await api.fichaDelNegocio(token, 'cualquiera')).estado).toBe(422);
  });

  test('el token de una tablet no abre la ficha', async ({ api, db }) => {
    const negocio = await crearNegocio(db);
    expect((await api.fichaDelNegocio(negocio.token, negocio.id)).estado).toBe(401);
  });
});

describe('POST /admin/negocios/:id/datos · apariencia', () => {
  test('cambia al instante y no toca la promo', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);

    const respuesta = await api.datosDelNegocio(token, negocio.id, {
      nombre: 'Nuevo nombre',
      categoria: 'panaderia',
      color_principal: '#0F766E',
      icono_sello: 'corazon',
      plantilla_tarjeta: 'moderna',
      canje_cualquier_local: false,
    });

    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo).toMatchObject({
      nombre: 'Nuevo nombre',
      categoria: 'panaderia',
      color_principal: '#0F766E',
      icono_sello: 'corazon',
      plantilla_tarjeta: 'moderna',
      canje_cualquier_local: false,
      programa: { version: 1 },
    });
    expect(await contar(db, 'programa')).toBe(1);
  });

  test('un rubro fuera de la lista no cambia nada', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db, 'Sin cambios');

    const respuesta = await api.datosDelNegocio(token, negocio.id, {
      nombre: 'Otro',
      categoria: 'ferreteria',
      color_principal: '#0F766E',
      icono_sello: 'cafe',
      plantilla_tarjeta: 'clasica',
      canje_cualquier_local: true,
    });

    expect(respuesta.estado).toBe(422);
    expect(
      await una(db, 'SELECT nombre FROM negocio WHERE id = $1', [negocio.id]),
    ).toEqual({ nombre: 'Sin cambios' });
  });

  test('sobre un negocio que no existe, 404', async ({ api, db }) => {
    const token = await entrar(api, db);
    const respuesta = await api.datosDelNegocio(token, NINGUNO, {
      nombre: 'x',
      categoria: 'cafe',
      color_principal: '#0F766E',
      icono_sello: 'cafe',
      plantilla_tarjeta: 'clasica',
      canje_cualquier_local: true,
    });
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
  });
});

describe('POST /admin/negocios/:id/programa · cambiar la promo', () => {
  test('INV-5 e INV-6 · nace la version 2; la tarjeta en curso sigue con la 1 y la nueva empieza con la 2', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const ana = await crearClienteEnCaja(db, 'Ana');
    await sellar(api, negocio, ana);

    const respuesta = await api.cambiarPrograma(token, negocio.id, PROMO_NUEVA);

    expect(respuesta.estado).toBe(201);
    expect(respuesta.cuerpo).toEqual({ version: 2, tarjetas_en_curso: 1 });
    expect(
      await una(
        db,
        `SELECT array_agg(version ORDER BY version) AS versiones,
                array_agg(vigente ORDER BY version) AS vigentes
         FROM programa WHERE negocio_id = $1`,
        [negocio.id],
      ),
    ).toEqual({ versiones: [1, 2], vigentes: [false, true] });

    const juan = await crearClienteEnCaja(db, 'Juan');
    const sello = await sellar(api, negocio, juan);
    expect(sello.cuerpo).toMatchObject({ progreso: 1, faltan: 5 });

    const tarjetas = await db.query<{ cliente: string; version: number }>(
      `SELECT c.nombre AS cliente, p.version
       FROM tarjeta t JOIN cliente c ON c.id = t.cliente_id
       JOIN programa p ON p.id = t.programa_id
       WHERE t.negocio_id = $1 ORDER BY c.nombre`,
      [negocio.id],
    );
    expect(tarjetas.rows).toEqual([
      { cliente: 'Ana', version: 1 },
      { cliente: 'Juan', version: 2 },
    ]);
  });

  test('el doble toque crea una sola version', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const clave = randomUUID();

    const primera = await api.cambiarPrograma(token, negocio.id, PROMO_NUEVA, clave);
    const segunda = await api.cambiarPrograma(token, negocio.id, PROMO_NUEVA, clave);

    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(await contar(db, 'programa')).toBe(2);
  });

  test('la misma clave para otro negocio no es un reintento', async ({ api, db }) => {
    const token = await entrar(api, db);
    const uno = await crearNegocio(db, 'Uno');
    const otro = await crearNegocio(db, 'Otro');
    const clave = randomUUID();
    await api.cambiarPrograma(token, uno.id, PROMO_NUEVA, clave);

    const respuesta = await api.cambiarPrograma(token, otro.id, PROMO_NUEVA, clave);

    expect(respuesta.cuerpo['codigo']).toBe('IDEMPOTENCIA_DISTINTA');
  });

  test('un negocio que no existe, 404, y no queda nada guardado', async ({ api, db }) => {
    const token = await entrar(api, db);
    const respuesta = await api.cambiarPrograma(token, NINGUNO, PROMO_NUEVA);
    expect(respuesta.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
    expect(await contar(db, 'peticion_idempotente_admin')).toBe(0);
  });

  test('cero sellos no es una promo', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const respuesta = await api.cambiarPrograma(token, negocio.id, {
      ...PROMO_NUEVA,
      sellos_requeridos: 0,
    });
    expect(respuesta.estado).toBe(422);
    expect(await contar(db, 'programa')).toBe(1);
  });
});

describe('POST /admin/negocios/:id/condicion · cambiar la condicion', () => {
  test('INV-7 · aplica desde ahora: el sello viejo conserva la suya y el nuevo lleva la nueva', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await sellar(api, negocio, await crearClienteEnCaja(db, 'Ana'));

    const respuesta = await api.cambiarCondicion(token, negocio.id, {
      texto: 'Una torta entera',
      monto_minimo: '80',
    });
    expect(respuesta.estado).toBe(201);

    await sellar(api, negocio, await crearClienteEnCaja(db, 'Juan'));
    const sellos = await db.query<{ cliente: string; condicion: string }>(
      `SELECT cl.nombre AS cliente, c.texto AS condicion
       FROM sello s JOIN condicion_sello c ON c.id = s.condicion_id
       JOIN tarjeta t ON t.id = s.tarjeta_id JOIN cliente cl ON cl.id = t.cliente_id
       WHERE s.negocio_id = $1 ORDER BY cl.nombre`,
      [negocio.id],
    );
    expect(sellos.rows).toEqual([
      { cliente: 'Ana', condicion: 'Cualquier capuchino' },
      { cliente: 'Juan', condicion: 'Una torta entera' },
    ]);

    const ficha = await api.fichaDelNegocio(token, negocio.id);
    expect(ficha.cuerpo['condiciones']).toMatchObject([
      {
        texto: 'Una torta entera',
        monto_minimo: '80.00',
        autor: { tipo: 'administracion' },
      },
      { texto: 'Cualquier capuchino', autor: { tipo: 'negocio' } },
    ]);
  });

  test('el doble toque escribe una sola condicion', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const clave = randomUUID();
    const cuerpo = { texto: 'Un pan', monto_minimo: null };

    await api.cambiarCondicion(token, negocio.id, cuerpo, clave);
    await api.cambiarCondicion(token, negocio.id, cuerpo, clave);

    expect(await contar(db, 'condicion_sello')).toBe(2);
  });
});

describe('Suspender y reactivar', () => {
  test('suspendido no sella ni aparece en el directorio; reactivado, vuelve', async ({
    api,
    db,
  }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    const cliente = await crearClienteEnCaja(db);

    const suspendido = await api.suspenderNegocio(token, negocio.id);
    expect(suspendido.cuerpo).toEqual({ estado: 'suspendido' });
    expect((await sellar(api, negocio, cliente)).cuerpo['codigo']).toBe(
      'NEGOCIO_SUSPENDIDO',
    );
    expect((await api.negocios()).cuerpo).toEqual({ negocios: [] });

    const reactivado = await api.reactivarNegocio(token, negocio.id);
    expect(reactivado.cuerpo).toEqual({ estado: 'activo' });
    expect((await sellar(api, negocio, cliente)).estado).toBe(200);
  });

  test('suspender dos veces deja lo mismo', async ({ api, db }) => {
    const token = await entrar(api, db);
    const negocio = await crearNegocio(db);
    await api.suspenderNegocio(token, negocio.id);
    const otra = await api.suspenderNegocio(token, negocio.id);
    expect(otra.cuerpo).toEqual({ estado: 'suspendido' });
  });

  test('un negocio que no existe, 404', async ({ api, db }) => {
    const token = await entrar(api, db);
    expect((await api.suspenderNegocio(token, NINGUNO)).estado).toBe(404);
  });
});
