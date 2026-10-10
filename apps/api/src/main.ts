import 'reflect-metadata';

import { existsSync } from 'node:fs';

import { NestFactory } from '@nestjs/core';
import { ZONA_HORARIA } from '@repunto/dominio';

import { AppModule } from './app.module';
import { opcionesDeCors } from './seguridad/cors';

const PUERTO_POR_DEFECTO = 3001;

async function bootstrap(): Promise<void> {
  // En local las variables viven en .env; en Railway ya vienen del entorno y
  // el archivo no existe. Las del entorno mandan: loadEnvFile no las pisa.
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create(AppModule);
  // Los frontends viven en otro origen: sin esto el navegador bloquea todo.
  app.enableCors(opcionesDeCors());

  const puerto = Number(process.env.PORT ?? PUERTO_POR_DEFECTO);

  await app.listen(puerto);

  // Todo timestamp se guarda en UTC; los cortes de dia se calculan en esta
  // zona (CLAUDE.md, INV-21). Dejarlo en el arranque evita discutirlo despues.
  console.log(`api escuchando en http://localhost:${puerto} — cortes en ${ZONA_HORARIA}`);
}

void bootstrap();
