import { existsSync } from 'node:fs';

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no carga .env por su cuenta. En local lo leemos con la API nativa
// de Node (sin dependencia extra); en Railway las variables ya vienen del
// entorno, el archivo no existe y las del entorno mandan.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
