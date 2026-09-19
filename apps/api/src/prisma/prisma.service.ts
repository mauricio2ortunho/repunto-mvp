import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * El cliente de Prisma del proceso. Se conecta por el adaptador de `pg`, que
 * es el que permite usar SQL crudo y transacciones interactivas: el flujo de
 * sellado necesita las dos cosas (INV-19).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env['DATABASE_URL'];
    if (url === undefined || url === '') {
      throw new Error('Falta DATABASE_URL: la api no arranca sin base de datos.');
    }
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
