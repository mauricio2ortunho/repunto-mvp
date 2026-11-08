import { Module } from '@nestjs/common';

import { PersonasDelNegocioService } from '../negocio/personas.service';
import { TabletsDelNegocioService } from '../negocio/tablets.service';
import { GuardDeAdmin } from './admin.guard';
import { EntradaDelDuenoService } from './entrada-del-dueno.service';
import { NegociosDeAdminController } from './negocios.controller';
import { NegociosDeAdminService } from './negocios.service';
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
    PersonasDelNegocioService,
    TabletsDelNegocioService,
    TableroDeAdminService,
    EntradaDelDuenoService,
    GuardDeAdmin,
  ],
})
export class AdminModule {}
