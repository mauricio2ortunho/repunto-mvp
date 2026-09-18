import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ZONA_HORARIA } from '@repunto/dominio';

import { AppModule } from './app.module';

const PUERTO_POR_DEFECTO = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const puerto = Number(process.env.PORT ?? PUERTO_POR_DEFECTO);

  await app.listen(puerto);

  // Todo timestamp se guarda en UTC; los cortes de dia se calculan en esta
  // zona (CLAUDE.md, INV-21). Dejarlo en el arranque evita discutirlo despues.
  console.log(`api escuchando en http://localhost:${puerto} — cortes en ${ZONA_HORARIA}`);
}

void bootstrap();
