import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type NegocioCreado,
  type NegociosDelAdmin,
  esquemaNegocioNuevo,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia } from '../caja/peticion';
import { GuardDeAdmin, type PeticionDeAdmin } from './admin.guard';
import { NegociosDeAdminService } from './negocios.service';

@Controller('admin/negocios')
@UseGuards(GuardDeAdmin)
export class NegociosDeAdminController {
  constructor(
    @Inject(NegociosDeAdminService) private readonly negocios: NegociosDeAdminService,
  ) {}

  @Get()
  listar(): Promise<NegociosDelAdmin> {
    return this.negocios.listar();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Req() peticion: PeticionDeAdmin,
    @Body() cuerpo: unknown,
  ): Promise<NegocioCreado> {
    const clave = claveDeIdempotencia(peticion);
    const alta = esquemaNegocioNuevo.safeParse(cuerpo);
    if (!alta.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.crear(peticion.admin.id, clave, alta.data);
  }
}
