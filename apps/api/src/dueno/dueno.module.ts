import { Module } from '@nestjs/common';

import { GuardDeDueno } from './dueno.guard';
import { SesionDeDuenoController } from './sesion.controller';
import { SesionDeDuenoService } from './sesion.service';

/** El panel del dueño: lo usa el dueño de cada negocio, desde su celular. */
@Module({
  controllers: [SesionDeDuenoController],
  providers: [SesionDeDuenoService, GuardDeDueno],
})
export class DuenoModule {}
