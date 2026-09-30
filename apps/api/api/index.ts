import 'reflect-metadata';

import type { IncomingMessage, ServerResponse } from 'node:http';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';

/**
 * Entrada de la api como funcion serverless (Vercel).
 *
 * Nest se arranca una vez por instancia y se guarda la promesa, no el
 * resultado: con dos peticiones llegando juntas a una instancia fria, guardar
 * el resultado las haria arrancar la aplicacion dos veces.
 *
 * De lo que sigue arriba, dos cosas importan:
 *
 *  - Vercel compila este archivo con esbuild, que no emite `design:paramtypes`.
 *    Funciona porque la inyeccion del proyecto es explicita con `@Inject()`,
 *    igual que para los tests.
 *  - Cada invocacion puede ser un proceso distinto, asi que todo lo que la api
 *    guarda en memoria —los topes de peticiones— deja de contar bien. Esta
 *    anotado en CLAUDE.md, seccion 15.
 *
 * El servidor de siempre sigue siendo `src/main.ts`: un proceso largo, que es
 * lo que hace falta para los trabajos programados.
 */

type Manejador = (peticion: IncomingMessage, respuesta: ServerResponse) => void;

let arranque: Promise<Manejador> | undefined;

async function arrancar(): Promise<Manejador> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  await app.init();
  return app.getHttpAdapter().getInstance() as Manejador;
}

export default async function handler(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
): Promise<void> {
  arranque ??= arrancar();
  (await arranque)(peticion, respuesta);
}
