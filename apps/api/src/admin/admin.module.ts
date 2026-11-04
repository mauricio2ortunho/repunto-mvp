import { Module } from '@nestjs/common';

import { GuardDeAdmin } from './admin.guard';
import { SesionDeAdminController } from './sesion.controller';
import { SesionDeAdminService } from './sesion.service';

/** El panel de administracion: lo usa el admin de plataforma. */
@Module({
  controllers: [SesionDeAdminController],
  providers: [SesionDeAdminService, GuardDeAdmin],
})
export class AdminModule {}
