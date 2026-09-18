import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * globalSetup del proyecto `integracion`. Corre una vez por `pnpm
 * test:integration`, antes de cualquier test:
 *
 *  1. Lee DATABASE_URL_TEST y se niega a seguir si no apunta a una base local
 *     cuyo nombre termine en _test. Esta corrida la borra.
 *  2. Borra y vuelve a crear esa base: cada corrida arranca de cero.
 *  3. Le aplica las migraciones con `prisma migrate deploy`, el mismo camino
 *     que produccion. No `db push`: ese arma la base desde schema.prisma y
 *     omitiria los indices parciales, los CHECK y los triggers, que viven
 *     solo en el SQL de las migraciones.
 *
 * Si Postgres no responde, falla. Nunca saltea: un test de integracion que
 * se saltea en silencio es peor que no tenerlo.
 */

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

export default async function prepararBase(project: TestProject): Promise<void> {
  cargarEnvLocal();
  const url = urlDeTest();
  await recrearBase(url);
  aplicarMigraciones(url);
  project.provide('urlBaseTest', url.toString());
}

function cargarEnvLocal(): void {
  const archivo = resolve(RAIZ, '.env');
  // Las variables que ya vienen del entorno ganan: loadEnvFile no las pisa.
  if (existsSync(archivo)) {
    process.loadEnvFile(archivo);
  }
}

function urlDeTest(): URL {
  const cruda = process.env['DATABASE_URL_TEST'];
  if (!cruda) {
    throw new Error('Falta DATABASE_URL_TEST. Copiala de .env.example a .env.');
  }
  const url = new URL(cruda);
  const base = nombreDeBase(url);
  if (!/^[a-z0-9_]+_test$/.test(base)) {
    throw new Error(
      `DATABASE_URL_TEST apunta a la base "${base}". Tiene que terminar en _test: ` +
        'esta corrida la borra y la vuelve a crear.',
    );
  }
  if (!HOSTS_LOCALES.has(url.hostname)) {
    throw new Error(
      `DATABASE_URL_TEST apunta a ${url.hostname}. Los tests de integracion solo ` +
        'corren contra un Postgres local.',
    );
  }
  return url;
}

function nombreDeBase(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

async function recrearBase(url: URL): Promise<void> {
  const base = nombreDeBase(url);
  const mantenimiento = new URL(url);
  mantenimiento.pathname = '/postgres';

  const cliente = new Client({ connectionString: mantenimiento.toString() });
  try {
    await cliente.connect();
  } catch (error) {
    throw new Error(
      `Postgres no responde en ${url.host}. Levanta la base con "docker compose up -d" ` +
        'y volve a correr. Los tests de integracion no se saltean.',
      { cause: error },
    );
  }
  try {
    // El nombre ya paso por la validacion de urlDeTest: solo [a-z0-9_].
    await cliente.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE "${base}"`);
  } finally {
    await cliente.end();
  }
}

function aplicarMigraciones(url: URL): void {
  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    });
  } catch (error) {
    throw new Error(
      `prisma migrate deploy fallo contra ${nombreDeBase(url)}:\n${salidaDe(error)}`,
      { cause: error },
    );
  }
}

function salidaDe(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stdout' in error &&
    'stderr' in error
  ) {
    return `${String(error.stdout)}${String(error.stderr)}`;
  }
  return String(error);
}
