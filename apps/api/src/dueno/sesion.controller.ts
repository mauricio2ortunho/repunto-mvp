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
  type DuenoActual,
  type EntrarComoDuenoRespuesta,
  esquemaEntrarComoDuenoPeticion,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { GuardDeDueno, type PeticionDeDueno } from './dueno.guard';
import { SesionDeDuenoService } from './sesion.service';

@Controller('dueno')
export class SesionDeDuenoController {
  constructor(
    @Inject(SesionDeDuenoService) private readonly sesion: SesionDeDuenoService,
  ) {}

  /**
   * Canjear el código de entrada por la sesión. Sin guard a propósito: el
   * celular todavía no tiene credencial. La de este pedido es el código de un
   * solo uso; el freno, el tope por IP.
   */
  @Post('sesion')
  @HttpCode(HttpStatus.OK)
  entrar(@Body() cuerpo: unknown, @Ip() ip: string): Promise<EntrarComoDuenoRespuesta> {
    const resultado = esquemaEntrarComoDuenoPeticion.safeParse(cuerpo);
    if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
    return this.sesion.entrar(resultado.data.codigo, ip);
  }

  @Get('yo')
  @UseGuards(GuardDeDueno)
  yo(@Req() peticion: PeticionDeDueno): DuenoActual {
    const { dueno } = peticion;
    return {
      nombre: dueno.nombre,
      negocio: { nombre: dueno.negocio.nombre, estado: dueno.negocio.estado },
    };
  }

  @Post('sesion/cierre')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(GuardDeDueno)
  async cerrar(@Req() peticion: PeticionDeDueno): Promise<void> {
    await this.sesion.cerrar(peticion.dueno.sesion_id);
  }
}
