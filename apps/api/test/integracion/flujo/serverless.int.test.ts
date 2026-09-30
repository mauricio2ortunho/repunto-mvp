import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect } from 'vitest';

import handler from '../../../api/index';
import { test } from './base';

/**
 * La api como funcion serverless, que es como corre en Vercel.
 *
 * Este test existe porque el handler de `api/index.ts` no lo compila el mismo
 * tsc que el resto: en Vercel lo compila esbuild, que no emite
 * `design:paramtypes`. Si algun dia alguien vuelve a inyectar por tipo en vez
 * de con `@Inject()`, el servidor de siempre va a seguir funcionando y el
 * despliegue se va a romper en produccion. Vitest tambien usa esbuild, asi que
 * esto lo detecta acá.
 *
 * Levanta el handler sobre un http.Server, que es en esencia lo que hace el
 * runtime de Vercel con la peticion entrante.
 */
async function conElHandler<T>(usar: (url: string) => Promise<T>): Promise<T> {
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

describe('la api como funcion serverless', () => {
  test('arranca Nest y contesta /salud, con esbuild y sin metadatos de tipos', async ({
    db,
  }) => {
    expect(db).toBeDefined();

    const cuerpo = await conElHandler(async (url) => {
      const respuesta = await fetch(`${url}/salud`);
      expect(respuesta.status).toBe(200);
      return (await respuesta.json()) as Record<string, unknown>;
    });

    // Si la base no contestara, /salud devolveria 503 y base 'sin-conexion'.
    expect(cuerpo).toMatchObject({ estado: 'ok', base: 'ok' });
  });

  test('las rutas de caja siguen protegidas detras del guard', async ({ db }) => {
    expect(db).toBeDefined();

    const estado = await conElHandler(async (url) => {
      const respuesta = await fetch(`${url}/caja/sellos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'prueba-1234' },
        body: JSON.stringify({ codigo: 'JUAN2-123456' }),
      });
      return respuesta.status;
    });

    expect(estado).toBe(401);
  });
});
