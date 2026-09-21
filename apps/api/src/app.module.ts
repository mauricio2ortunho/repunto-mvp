import { Module } from '@nestjs/common';

import { AltaModule } from './alta/alta.module';
import { CajaModule } from './caja/caja.module';
import { ClienteModule } from './cliente/cliente.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';
import { SeguridadModule } from './seguridad/seguridad.module';

@Module({
  imports: [
    PrismaModule,
    SeguridadModule,
    SaludModule,
    CajaModule,
    ClienteModule,
    AltaModule,
  ],
})
export class AppModule {}
