import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { CodigoDelCliente } from '@repunto/contratos';

import { GuardDeCliente, type PeticionDelCliente } from './cliente.guard';
import { CodigoService } from './codigo.service';

@Controller('mi')
@UseGuards(GuardDeCliente)
export class CodigoController {
  constructor(@Inject(CodigoService) private readonly codigos: CodigoService) {}

  /**
   * Devuelve SOLO el codigo del cliente del token. No acepta un identificador
   * de cliente en la peticion, ni siquiera el propio: no hay parametro, ni en
   * la ruta, ni en la query, ni en el cuerpo, asi que no hay nada que un
   * cliente pueda cambiar para ver el codigo de otro.
   */
  @Get('codigo')
  obtener(@Req() peticion: PeticionDelCliente): Promise<CodigoDelCliente> {
    return this.codigos.codigoDe(peticion.tokenHash);
  }
}
