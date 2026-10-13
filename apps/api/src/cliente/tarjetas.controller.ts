import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { MisTarjetas } from '@repunto/contratos';

import { GuardDeCliente, type PeticionDelCliente } from './cliente.guard';
import { TarjetasService } from './tarjetas.service';

@Controller('mis')
@UseGuards(GuardDeCliente)
export class TarjetasController {
  constructor(@Inject(TarjetasService) private readonly tarjetas: TarjetasService) {}

  /**
   * Las tarjetas del cliente del token. Como en `/mi/codigo`, no hay ningun
   * parametro: ni en la ruta, ni en la query, ni en el cuerpo. No hay nada que
   * un cliente pueda cambiar para ver las tarjetas de otro (INV-1).
   */
  @Get('tarjetas')
  listar(@Req() peticion: PeticionDelCliente): Promise<MisTarjetas> {
    return this.tarjetas.de(peticion.tokenHash);
  }
}
