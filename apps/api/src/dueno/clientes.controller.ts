import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { ClientesDelDueno } from '@repunto/contratos';

import { ClientesDelDuenoService } from './clientes.service';
import { GuardDeDueno, type PeticionDeDueno } from './dueno.guard';

@Controller('dueno')
@UseGuards(GuardDeDueno)
export class ClientesDelDuenoController {
  constructor(
    @Inject(ClientesDelDuenoService) private readonly clientes: ClientesDelDuenoService,
  ) {}

  /** Sin parámetros: el negocio es el de la sesión (INV-1). */
  @Get('clientes')
  obtener(@Req() peticion: PeticionDeDueno): Promise<ClientesDelDueno> {
    return this.clientes.clientes(peticion.dueno.negocio.id);
  }
}
