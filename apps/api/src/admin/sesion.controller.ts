import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminActual,
  type EntrarComoAdminRespuesta,
  esquemaEntrarComoAdminPeticion,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { GuardDeAdmin, type PeticionDeAdmin } from './admin.guard';
import { SesionDeAdminService } from './sesion.service';

@Controller('admin')
export class SesionDeAdminController {
  constructor(
    @Inject(SesionDeAdminService) private readonly sesion: SesionDeAdminService,
  ) {}

  /**
   * Canjear el codigo de entrada por la sesion. Sin guard a proposito: el
   * equipo todavia no tiene credencial. La de este pedido es el codigo de un
   * solo uso; el freno, el tope por IP.
   */
  @Post('sesion')
  @HttpCode(HttpStatus.OK)
  entrar(@Body() cuerpo: unknown, @Ip() ip: string): Promise<EntrarComoAdminRespuesta> {
    const resultado = esquemaEntrarComoAdminPeticion.safeParse(cuerpo);
    if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
    return this.sesion.entrar(resultado.data.codigo, ip);
  }

  @Get('yo')
  @UseGuards(GuardDeAdmin)
  yo(@Req() peticion: PeticionDeAdmin): AdminActual {
    return { nombre: peticion.admin.nombre };
  }

  @Post('sesion/cierre')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(GuardDeAdmin)
  async cerrar(@Req() peticion: PeticionDeAdmin): Promise<void> {
    await this.sesion.cerrar(peticion.admin.sesion_id);
  }
}
