import { Module } from '@nestjs/common';

import { GuardDeAdmin } from './admin.guard';
import { NegociosDeAdminController } from './negocios.controller';
import { NegociosDeAdminService } from './negocios.service';
import { PersonasDeAdminService } from './personas.service';
import { TabletsDeAdminService } from './tablets.service';
import { SesionDeAdminController } from './sesion.controller';
import { SesionDeAdminService } from './sesion.service';

/** El panel de administracion: lo usa el admin de plataforma. */
@Module({
  controllers: [SesionDeAdminController, NegociosDeAdminController],
  providers: [
    SesionDeAdminService,
    NegociosDeAdminService,
    PersonasDeAdminService,
    TabletsDeAdminService,
    GuardDeAdmin,
  ],
})
export class AdminModule {}
