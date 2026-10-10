import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect } from 'vitest';

import handler from '../../../api/index';
import { test } from './base';

/**
 * CORS, contra el handler de verdad.
 *
 * Va por `api/index.ts` y no por el arranque del arnes a proposito: lo que
 * importa es la configuracion que se despliega, no una copia de prueba.
 *
 * Los demas tests de integracion usan `fetch` desde Node, que ignora CORS por
 * completo: si el panel no puede llamar a la api desde un navegador, ninguno
 * de los 471 se entera. Estos cuatro miran las cabeceras que el navegador mira.
 */
async function conLaApi<T>(usar: (url: string) => Promise<T>): Promise<T> {
  const servidor = createServer((peticion, respuesta) => {
    void handler(peticion, respuesta);
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;

  try {
    return await usar(`http://127.0.0.1:${port}`);
  } finally {
    servidor.closeAllConnections();
    await new Promise<void>((listo) => servidor.close(() => listo()));
  }
}

/** El panel en desarrollo. Sin ORIGENES_PERMITIDOS, es uno de los dos por defecto. */
const PANEL = 'http://localhost:3002';

describe('CORS', () => {
  test('el preflight del panel acepta las cabeceras que la caja necesita', async ({
    db,
  }) => {
    expect(db).toBeDefined();

    const cabeceras = await conLaApi(async (url) => {
      const respuesta = await fetch(`${url}/caja/sellos`, {
        method: 'OPTIONS',
        headers: {
          origin: PANEL,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type,idempotency-key',
        },
      });
      expect(respuesta.status).toBeLessThan(300);
      return respuesta.headers;
    });

    expect(cabeceras.get('access-control-allow-origin')).toBe(PANEL);
    const permitidas = (
      cabeceras.get('access-control-allow-headers') ?? ''
    ).toLowerCase();
    expect(permitidas).toContain('authorization');
    expect(permitidas).toContain('idempotency-key');
    expect(permitidas).toContain('if-none-match');
  });

  test('el preflight se cachea: con If-None-Match cada 3 segundos, importa', async ({
    db,
  }) => {
    expect(db).toBeDefined();

    const maxAge = await conLaApi(async (url) => {
      const respuesta = await fetch(`${url}/caja/registros`, {
        method: 'OPTIONS',
        headers: {
          origin: PANEL,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,if-none-match',
        },
      });
      return Number(respuesta.headers.get('access-control-max-age') ?? '0');
    });

    expect(maxAge).toBeGreaterThanOrEqual(3600);
  });

  test('expone ETag, que si no el panel no puede leerlo', async ({ db }) => {
    expect(db).toBeDefined();

    const expuestas = await conLaApi(async (url) => {
      const respuesta = await fetch(`${url}/salud`, { headers: { origin: PANEL } });
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('access-control-allow-origin')).toBe(PANEL);
      return (respuesta.headers.get('access-control-expose-headers') ?? '').toLowerCase();
    });

    expect(expuestas).toContain('etag');
  });

  test('un origen que no esta en la lista no recibe permiso', async ({ db }) => {
    expect(db).toBeDefined();

    const permiso = await conLaApi(async (url) => {
      const respuesta = await fetch(`${url}/salud`, {
        headers: { origin: 'https://evil.com' },
      });
      return respuesta.headers.get('access-control-allow-origin');
    });

    // Sin la cabecera, el navegador descarta la respuesta aunque la api haya
    // contestado 200.
    expect(permiso).toBeNull();
  });
});
