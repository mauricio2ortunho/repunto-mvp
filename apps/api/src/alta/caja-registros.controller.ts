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

/** Lo que el cajero hace con la lista de registros pendientes de su local. */
@Controller('caja/registros')
@UseGuards(GuardDeDispositivo)
export class CajaRegistrosController {
  constructor(@Inject(AltaService) private readonly alta: AltaService) {}

  /**
   * La lista entera, cada vez. El panel la pide cada pocos segundos: asi
   * aparece "al instante" sin que el cajero refresque y sin sostener una
   * conexion abierta por tablet.
   *
   * Sin respuesta condicional a proposito: Vercel le saca a los 304 el
   * permiso de CORS, el navegador los descarta como un corte de red y el
   * panel mostraba "Sin conexion" con la api andando. Son a lo sumo veinte
   * registros, y la consulta a la base se hacia igual.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  listar(@Req() peticion: PeticionDeCaja): Promise<RegistrosPendientes> {
    return this.alta.pendientes(peticion.tokenHash);
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
