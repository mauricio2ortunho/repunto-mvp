import { Controller, Get, Inject } from '@nestjs/common';
import type { Directorio } from '@repunto/contratos';

import { NegociosService } from './negocios.service';

/**
 * Publico: lo ve quien todavia no tiene cuenta, que es justamente a quien le
 * sirve. Sin parametros, y lo que devuelve es lo que cada negocio ya muestra
 * en su vidriera: nombre, promo y direccion.
 */
@Controller('negocios')
export class NegociosController {
  constructor(@Inject(NegociosService) private readonly negocios: NegociosService) {}

  @Get()
  listar(): Promise<Directorio> {
    return this.negocios.directorio();
  }
}
