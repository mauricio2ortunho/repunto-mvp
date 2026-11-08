import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { ResumenDelDueno } from '@repunto/contratos';

import { GuardDeDueno, type PeticionDeDueno } from './dueno.guard';
import { ResumenDelDuenoService } from './resumen.service';

@Controller('dueno')
@UseGuards(GuardDeDueno)
export class ResumenDelDuenoController {
  constructor(
    @Inject(ResumenDelDuenoService) private readonly resumen: ResumenDelDuenoService,
  ) {}

  /** Sin parámetros: el negocio es el de la sesión (INV-1). */
  @Get('resumen')
  obtener(@Req() peticion: PeticionDeDueno): Promise<ResumenDelDueno> {
    return this.resumen.resumen(peticion.dueno.negocio.id);
  }
}
