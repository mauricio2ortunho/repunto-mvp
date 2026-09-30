import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * El cliente de Prisma del proceso. Se conecta por el adaptador de `pg`, que
 * es el que permite usar SQL crudo y transacciones interactivas: el flujo de
 * sellado necesita las dos cosas (INV-19).
 *
 * El SSL se decide en la cadena de conexion, no aca: `?sslmode=require` para
 * una base manejada, nada para el Postgres de Docker. Asi el codigo no tiene
 * una rama por proveedor.
 */

/** En serverless cada instancia atiende de a una peticion: una conexion basta. */
const CONEXIONES = process.env['VERCEL'] === undefined ? 10 : 1;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env['DATABASE_URL'];
    if (url === undefined || url === '') {
      throw new Error('Falta DATABASE_URL: la api no arranca sin base de datos.');
    }
    super({ adapter: new PrismaPg({ connectionString: url, max: CONEXIONES }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
