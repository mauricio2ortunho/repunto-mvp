import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool, type PoolClient } from 'pg';
import { inject, test as testDeVitest } from 'vitest';

import { AppModule } from '../../../src/app.module';
import { configurarEntorno, exigirBaseVacia } from '../base';

/**
 * Arnes de los tests del flujo de caja. A diferencia de los del esquema, estos
 * hablan HTTP contra la api de verdad —guards, cabeceras, estados y todo—, asi
 * que la api abre sus propias conexiones y commitea.
 *
 * Como no se puede envolver un test en una transaccion que la api no ve, cada
 * uno vacia las tablas al terminar y exige la base vacia al empezar. El
 * aislamiento sale igual: ningun test ve datos de otro.
 */

export type Db = PoolClient;

export interface Respuesta {
  estado: number;
  cuerpo: Record<string, unknown>;
}

export interface Llamada {
  /** Token en claro de la tablet o del telefono. Sin el, no va la cabecera. */
  token?: string;
  /** Idempotency-Key. Por defecto, una distinta en cada llamada. */
  clave?: string;
  cuerpo?: unknown;
}

export class Api {
  constructor(private readonly url: string) {}

  sellar(llamada: Llamada): Promise<Respuesta> {
    return this.postear('/caja/sellos', llamada);
  }

  canjear(llamada: Llamada): Promise<Respuesta> {
    return this.postear('/caja/canjes', llamada);
  }

  /** `query` existe para probar que un identificador de cliente se ignora. */
  async miCodigo(token?: string, query = ''): Promise<Respuesta> {
    return this.pedir('GET', `/mi/codigo${query}`, { token });
  }

  private postear(ruta: string, llamada: Llamada): Promise<Respuesta> {
    return this.pedir('POST', ruta, {
      clave: randomUUID(),
      ...llamada,
    });
  }

  private async pedir(
    metodo: string,
    ruta: string,
    llamada: Llamada,
  ): Promise<Respuesta> {
    const cabeceras: Record<string, string> = {};
    if (llamada.token !== undefined) {
      cabeceras['authorization'] = `Bearer ${llamada.token}`;
    }
    if (llamada.clave !== undefined) cabeceras['idempotency-key'] = llamada.clave;
    if (llamada.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';

    const respuesta = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: llamada.cuerpo === undefined ? undefined : JSON.stringify(llamada.cuerpo),
    });

    const texto = await respuesta.text();
    return {
      estado: respuesta.status,
      cuerpo: texto === '' ? {} : (JSON.parse(texto) as Record<string, unknown>),
    };
  }
}

export const test = testDeVitest.extend<{ api: Api; pool: Pool; db: Db }>({
  api: [
    // eslint-disable-next-line no-empty-pattern -- Vitest exige desestructurar el contexto del fixture aunque no use nada de el.
    async ({}, use) => {
      configurarEntorno();
      const app: INestApplication = await NestFactory.create(AppModule, {
        logger: false,
      });
      await app.listen(0, '127.0.0.1');
      const servidor = app.getHttpServer() as Server;
      const direccion = servidor.address() as AddressInfo;
      await use(new Api(`http://127.0.0.1:${direccion.port}`));
      // fetch deja los sockets abiertos con keep-alive, y con un socket vivo el
      // servidor no cierra nunca: sin esto, la suite se cuelga al terminar el
      // primer archivo.
      servidor.closeAllConnections();
      await app.close();
    },
    { scope: 'file' },
  ],

  pool: [
    // eslint-disable-next-line no-empty-pattern -- Igual que arriba.
    async ({}, use) => {
      configurarEntorno();
      const pool = new Pool({ connectionString: inject('urlBaseTest'), max: 4 });
      await use(pool);
      await pool.end();
    },
    { scope: 'file' },
  ],

  db: async ({ pool }, use) => {
    const conexion = await pool.connect();
    try {
      await exigirBaseVacia(conexion);
      await use(conexion);
    } finally {
      await vaciarBase(conexion);
      conexion.release();
    }
  },
});

/**
 * Deja la base como estaba. TRUNCATE y no DELETE porque no dispara los
 * triggers de inmutabilidad, que impiden borrar programas y condiciones.
 */
export async function vaciarBase(db: Db): Promise<void> {
  await db.query(`
    DO $$
    DECLARE tablas text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ') INTO tablas
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF tablas IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tablas || ' CASCADE';
      END IF;
    END $$`);
}

/** Cuenta filas de una tabla. Los tests del flujo miran el efecto, no el SQL. */
export async function contar(db: Db, tabla: string, donde = 'true'): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${tabla} WHERE ${donde}`,
  );
  return Number(rows[0]?.n ?? '0');
}
