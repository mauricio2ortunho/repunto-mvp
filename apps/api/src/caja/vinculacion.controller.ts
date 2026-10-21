import { Body, Controller, HttpCode, HttpStatus, Inject, Ip, Post } from '@nestjs/common';
import { type VincularRespuesta, esquemaVincularPeticion } from '@repunto/contratos';

import { errorDeApi } from './errores-http';
import { VinculacionService } from './vinculacion.service';

/**
 * Vincular una tablet nueva. Sin guard a proposito: la tablet todavia no tiene
 * credencial, y la que recibe sale de aca. La credencial de este pedido es el
 * codigo de un solo uso; el freno, el tope por IP.
 */
@Controller('caja/vinculacion')
export class VinculacionController {
  constructor(
    @Inject(VinculacionService) private readonly vinculacion: VinculacionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  vincular(@Body() cuerpo: unknown, @Ip() ip: string): Promise<VincularRespuesta> {
    const resultado = esquemaVincularPeticion.safeParse(cuerpo);
    if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
    return this.vinculacion.vincular(resultado.data.codigo, ip);
  }
}
