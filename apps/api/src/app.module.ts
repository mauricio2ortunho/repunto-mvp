import { Module } from '@nestjs/common';

import { CajaModule } from './caja/caja.module';
import { ClienteModule } from './cliente/cliente.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [PrismaModule, SaludModule, CajaModule, ClienteModule],
})
export class AppModule {}
