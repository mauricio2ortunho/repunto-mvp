import { Module } from '@nestjs/common';

import { PersonasDelNegocioService } from '../negocio/personas.service';
import { TabletsDelNegocioService } from '../negocio/tablets.service';
import { GuardDeDueno } from './dueno.guard';
import { NegocioDelDuenoController } from './negocio.controller';
import { NegocioDelDuenoService } from './negocio.service';
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
    NegocioDelDuenoController,
  ],
  providers: [
    SesionDeDuenoService,
    ResumenDelDuenoService,
    PromoDelDuenoService,
    NegocioDelDuenoService,
    PersonasDelNegocioService,
    TabletsDelNegocioService,
    GuardDeDueno,
  ],
})
export class DuenoModule {}
