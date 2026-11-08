import { Module } from '@nestjs/common';

import { GuardDeDueno } from './dueno.guard';
import { ResumenDelDuenoController } from './resumen.controller';
import { ResumenDelDuenoService } from './resumen.service';
import { SesionDeDuenoController } from './sesion.controller';
import { SesionDeDuenoService } from './sesion.service';

/** El panel del dueño: lo usa el dueño de cada negocio, desde su celular. */
@Module({
  controllers: [SesionDeDuenoController, ResumenDelDuenoController],
  providers: [SesionDeDuenoService, ResumenDelDuenoService, GuardDeDueno],
})
export class DuenoModule {}
