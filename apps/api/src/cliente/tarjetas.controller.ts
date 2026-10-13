import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import type { DetalleDeTarjeta, MisTarjetas } from '@repunto/contratos';

import { idEnLaRuta } from '../caja/peticion';
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

  /**
   * Una tarjeta del cliente del token. El id de la ruta elige cual, pero el
   * dueño sale del token: con el id de una tarjeta ajena, la consulta no
   * encuentra nada.
   */
  @Get('tarjetas/:id')
  detalle(
    @Req() peticion: PeticionDelCliente,
    @Param('id') id: string,
  ): Promise<DetalleDeTarjeta> {
    return this.tarjetas.detalle(peticion.tokenHash, idEnLaRuta(id));
  }
}
