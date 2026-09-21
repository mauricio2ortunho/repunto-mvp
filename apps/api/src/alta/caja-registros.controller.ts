import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type ConfirmarRespuesta,
  type DescartarRespuesta,
  type RegistrosPendientes,
  esquemaConfirmarPeticion,
} from '@repunto/contratos';

import { GuardDeDispositivo, type PeticionDeCaja } from '../caja/dispositivo.guard';
import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia, idEnLaRuta } from '../caja/peticion';
import { AltaService } from './alta.service';
import { etiquetaDe } from './etag';

/** Lo que el cajero hace con la lista de registros pendientes de su local. */
@Controller('caja/registros')
@UseGuards(GuardDeDispositivo)
export class CajaRegistrosController {
  constructor(@Inject(AltaService) private readonly alta: AltaService) {}

  /**
   * La lista, con ETag: el panel la pide cada pocos segundos y, mientras no
   * cambie, se lleva un 304 de cien bytes. Asi aparece "al instante" sin que
   * el cajero refresque y sin sostener una conexion abierta por tablet.
   */
  @Get()
  @Header('Cache-Control', 'no-cache')
  async listar(
    @Req() peticion: PeticionDeCaja,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<RegistrosPendientes | undefined> {
    const pendientes = await this.alta.pendientes(peticion.tokenHash);
    const etiqueta = etiquetaDe(pendientes);
    respuesta.setHeader('ETag', etiqueta);

    if (peticion.headers['if-none-match'] === etiqueta) {
      respuesta.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    return pendientes;
  }

  @Post(':id/confirmar')
  @HttpCode(HttpStatus.OK)
  confirmar(
    @Req() peticion: PeticionDeCaja,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<ConfirmarRespuesta> {
    const resultado = esquemaConfirmarPeticion.safeParse(cuerpo);
    if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');

    return this.alta.confirmar(
      peticion.tokenHash,
      claveDeIdempotencia(peticion),
      idEnLaRuta(id),
      resultado.data.sellar,
    );
  }

  @Post(':id/descartar')
  @HttpCode(HttpStatus.OK)
  descartar(
    @Req() peticion: PeticionDeCaja,
    @Param('id') id: string,
  ): Promise<DescartarRespuesta> {
    return this.alta.descartar(
      peticion.tokenHash,
      claveDeIdempotencia(peticion),
      idEnLaRuta(id),
    );
  }
}

/** Lo minimo de la respuesta de Express que hace falta para el ETag. */
interface RespuestaHttp {
  setHeader(nombre: string, valor: string): void;
  status(codigo: number): void;
}
