import { existsSync } from 'node:fs';

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no carga .env por su cuenta. En local lo leemos con la API nativa
// de Node (sin dependencia extra); en Railway las variables ya vienen del
// entorno, el archivo no existe y las del entorno mandan.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/**
 * Esta configuracion la usa solo el CLI de Prisma: migrar, generar el cliente
 * e introspeccionar. El runtime se conecta por su cuenta (PrismaService).
 *
 * De ahi que use DIRECT_URL cuando existe: con un pooler en modo transaccion
 * —el de Supabase en el 6543— las migraciones no funcionan, porque necesitan
 * sostener un candado de sesion y ejecutar DDL en una sola conexion. La app va
 * por el pooler; `prisma migrate deploy` va derecho a la base.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ? env('DIRECT_URL') : env('DATABASE_URL'),
  },
});
