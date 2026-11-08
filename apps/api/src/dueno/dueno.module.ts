import { Module } from '@nestjs/common';

import { GuardDeDueno } from './dueno.guard';
import { PromoDelDuenoController } from './promo.controller';
import { PromoDelDuenoService } from './promo.service';
import { ResumenDelDuenoController } from './resumen.controller';
import { ResumenDelDuenoService } from './resumen.service';
import { SesionDeDuenoController } from './sesion.controller';
import { SesionDeDuenoService } from './sesion.service';

/** El panel del dueño: lo usa el dueño de cada negocio, desde su celular. */
@Module({
  controllers: [
    SesionDeDuenoController,
    ResumenDelDuenoController,
    PromoDelDuenoController,
  ],
  providers: [
    SesionDeDuenoService,
    ResumenDelDuenoService,
    PromoDelDuenoService,
    GuardDeDueno,
  ],
})
export class DuenoModule {}
