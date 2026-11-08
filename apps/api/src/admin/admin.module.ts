import { Module } from '@nestjs/common';

import { GuardDeAdmin } from './admin.guard';
import { NegociosDeAdminController } from './negocios.controller';
import { NegociosDeAdminService } from './negocios.service';
import { PersonasDeAdminService } from './personas.service';
import { TabletsDeAdminService } from './tablets.service';
import { SesionDeAdminController } from './sesion.controller';
import { SesionDeAdminService } from './sesion.service';
import { TableroDeAdminController } from './tablero.controller';
import { TableroDeAdminService } from './tablero.service';

/** El panel de administracion: lo usa el admin de plataforma. */
@Module({
  controllers: [
    SesionDeAdminController,
    NegociosDeAdminController,
    TableroDeAdminController,
  ],
  providers: [
    SesionDeAdminService,
    NegociosDeAdminService,
    PersonasDeAdminService,
    TabletsDeAdminService,
    TableroDeAdminService,
    GuardDeAdmin,
  ],
})
export class AdminModule {}
