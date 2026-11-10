import { createHash } from 'node:crypto';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect } from 'vitest';

import { una } from '../base';
import { crearEntradaDeAdmin, crearEntradaDeDueno, crearNegocio } from '../escenario';
import { type Api, type Db, levantarApi, test } from './base';

/**
 * El logo y la portada van a R2 y en la base queda la dirección (INV-22).
 * Acá R2 es un servidor falso que guarda lo que recibe y exige la firma de
 * S3 con la clave configurada: lo que se prueba es el pedido de verdad que
 * sale de la api, no una función reemplazada.
 */

const URL_PUBLICA = 'https://pub-prueba.r2.dev';
const CLAVE = 'clave-de-prueba';

interface Subida {
  ruta: string;
  tipo: string | undefined;
  cache: string | undefined;
  bytes: Buffer;
}

const subidas: Subida[] = [];
let falla = false;
let r2: Server;
let conR2: { api: Api; apagar: () => Promise<void> };
let sinR2: { api: Api; apagar: () => Promise<void> };

async function leer(peticion: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of peticion) partes.push(parte as Buffer);
  return Buffer.concat(partes);
}

beforeAll(async () => {
  r2 = createServer((peticion, respuesta) => {
    void leer(peticion).then((bytes) => {
      const firma = String(peticion.headers['authorization'] ?? '');
      const huella = createHash('sha256').update(bytes).digest('hex');
      // La huella firmada tiene que ser la del contenido que llegó.
      const contenido = peticion.headers['x-amz-content-sha256'];
      const firmada =
        firma.startsWith('AWS4-HMAC-SHA256 ') &&
        firma.includes(`Credential=${CLAVE}/`) &&
        contenido === huella;
      if (peticion.method !== 'PUT' || !firmada) return respuesta.writeHead(403).end();
      if (falla) return respuesta.writeHead(500).end();
      subidas.push({
        ruta: peticion.url ?? '',
        tipo: peticion.headers['content-type'],
        cache: peticion.headers['cache-control'],
        bytes,
      });
      respuesta.writeHead(200).end();
    });
  });
  await new Promise<void>((listo) => r2.listen(0, '127.0.0.1', listo));
  const { port } = r2.address() as AddressInfo;

  // La api lee R2 al arrancar: una con las cinco variables y otra sin.
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'cuenta',
    R2_BUCKET: 'repunto-prueba',
    R2_ACCESS_KEY_ID: CLAVE,
    R2_SECRET_ACCESS_KEY: 'secreto-de-prueba',
    R2_URL_PUBLICA: `${URL_PUBLICA}/`,
    R2_ENDPOINT: `http://127.0.0.1:${port}`,
  });
  conR2 = await levantarApi();
  for (const nombre of [
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_URL_PUBLICA',
    'R2_ENDPOINT',
  ]) {
    delete process.env[nombre];
  }
  sinR2 = await levantarApi();
});

afterAll(async () => {
  await conR2.apagar();
  await sinR2.apagar();
  r2.closeAllConnections();
  await new Promise((listo) => r2.close(listo));
});

async function comoAdmin(api: Api, db: Db): Promise<string> {
  const { codigo } = await crearEntradaDeAdmin(db);
  return String((await api.entrarComoAdmin({ codigo })).cuerpo['token']);
}

// Las firmas alcanzan: la api mira los bytes del principio, no decodifica.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
]);

async function imagenesDe(db: Db, negocio: string) {
  return una<{ logo_url: string | null; portada_url: string | null }>(
    db,
    'SELECT logo_url, portada_url FROM negocio WHERE id = $1',
    [negocio],
  );
}

describe('POST /admin/negocios/:id/imagenes/:imagen', () => {
  test('el logo va a R2, firmado, y en la base queda su dirección', async ({ db }) => {
    subidas.length = 0;
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    const r = await api.subirImagen(token, negocio.id, 'logo', PNG, 'image/png');

    expect(r.estado).toBe(200);
    const huella = createHash('sha256').update(PNG).digest('hex').slice(0, 24);
    const clave = `negocios/${negocio.id}/logo-${huella}.png`;
    expect(r.cuerpo['url']).toBe(`${URL_PUBLICA}/${clave}`);
    expect(subidas).toHaveLength(1);
    expect(subidas[0]).toMatchObject({
      ruta: `/repunto-prueba/${clave}`,
      tipo: 'image/png',
      cache: 'public, max-age=31536000, immutable',
    });
    expect(subidas[0]?.bytes.equals(PNG)).toBe(true);
    expect((await imagenesDe(db, negocio.id)).logo_url).toBe(r.cuerpo['url']);
  });

  test('subir dos veces la misma imagen deja la misma dirección', async ({ db }) => {
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    const primera = await api.subirImagen(token, negocio.id, 'logo', JPG, 'image/jpeg');
    const segunda = await api.subirImagen(token, negocio.id, 'logo', JPG, 'image/jpeg');

    expect(primera.estado).toBe(200);
    expect(segunda.estado).toBe(200);
    expect(segunda.cuerpo['url']).toBe(primera.cuerpo['url']);
  });

  test('la portada va a su columna y se ve en la ficha', async ({ db }) => {
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    const r = await api.subirImagen(token, negocio.id, 'portada', WEBP, 'image/webp');

    expect(r.estado).toBe(200);
    expect(String(r.cuerpo['url'])).toMatch(/\/portada-[0-9a-f]{24}\.webp$/);
    expect(await imagenesDe(db, negocio.id)).toEqual({
      logo_url: null,
      portada_url: r.cuerpo['url'],
    });
    const ficha = await api.fichaDelNegocio(token, negocio.id);
    expect(ficha.cuerpo['portada_url']).toBe(r.cuerpo['url']);
  });

  test('lo que no es PNG, JPG ni WebP no sube: ni un SVG, ni un tipo que miente', async ({
    db,
  }) => {
    subidas.length = 0;
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    for (const [bytes, tipo] of [
      [svg, 'image/svg+xml'],
      [svg, 'image/png'],
      [JPG, 'image/png'],
    ] as const) {
      const r = await api.subirImagen(token, negocio.id, 'logo', bytes, tipo);
      expect(r.estado).toBe(422);
      expect(r.cuerpo['codigo']).toBe('IMAGEN_INVALIDA');
    }
    expect(subidas).toHaveLength(0);
    expect((await imagenesDe(db, negocio.id)).logo_url).toBeNull();
  });

  test('más pesada que el tope: 413, y no sube', async ({ db }) => {
    subidas.length = 0;
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);
    const enorme = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);

    const r = await api.subirImagen(token, negocio.id, 'logo', enorme, 'image/png');

    expect(r.estado).toBe(413);
    expect(r.cuerpo['codigo']).toBe('IMAGEN_DEMASIADO_GRANDE');
    expect(subidas).toHaveLength(0);
  });

  test('si R2 falla, la base no cambia', async ({ db }) => {
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    falla = true;
    const r = await api.subirImagen(token, negocio.id, 'logo', PNG, 'image/png');
    falla = false;

    expect(r.estado).toBe(500);
    expect((await imagenesDe(db, negocio.id)).logo_url).toBeNull();
  });

  test('una imagen que no es logo ni portada, o un negocio que no existe', async ({
    db,
  }) => {
    subidas.length = 0;
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    const otra = await api.subirImagen(token, negocio.id, 'fondo', PNG, 'image/png');
    const ninguno = await api.subirImagen(
      token,
      '00000000-0000-4000-8000-000000000000',
      'logo',
      PNG,
      'image/png',
    );

    expect(otra.cuerpo['codigo']).toBe('PETICION_INVALIDA');
    expect(ninguno.estado).toBe(404);
    expect(ninguno.cuerpo['codigo']).toBe('NEGOCIO_NO_ENCONTRADO');
    expect(subidas).toHaveLength(0);
  });

  test('quitar el logo lo deja en null', async ({ db }) => {
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);
    await api.subirImagen(token, negocio.id, 'logo', PNG, 'image/png');

    const r = await api.quitarImagen(token, negocio.id, 'logo');

    expect(r.estado).toBe(200);
    expect(r.cuerpo['url']).toBeNull();
    expect((await imagenesDe(db, negocio.id)).logo_url).toBeNull();
  });

  test('solo el admin: ni sin sesión, ni el dueño', async ({ db }) => {
    subidas.length = 0;
    const { api } = conR2;
    const negocio = await crearNegocio(db);
    const { codigo } = await crearEntradaDeDueno(db, negocio.dueno);
    const dueno = String((await api.entrarComoDueno({ codigo })).cuerpo['token']);

    for (const token of [undefined, dueno]) {
      const r = await api.subirImagen(token, negocio.id, 'logo', PNG, 'image/png');
      expect(r.estado).toBe(401);
      expect((await api.quitarImagen(token, negocio.id, 'logo')).estado).toBe(401);
    }
    expect(subidas).toHaveLength(0);
  });

  test('sin las variables de R2: lo dice, en lugar de fallar a medias', async ({
    db,
  }) => {
    const { api } = sinR2;
    const negocio = await crearNegocio(db);
    const token = await comoAdmin(api, db);

    const r = await api.subirImagen(token, negocio.id, 'logo', PNG, 'image/png');

    expect(r.estado).toBe(503);
    expect(r.cuerpo['codigo']).toBe('IMAGENES_NO_CONFIGURADAS');
  });
});
