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
} from '@nestjs/common';
import {
  type EstadoDelRegistro,
  type RegistroPeticion,
  type RegistroRespuesta,
  esquemaRegistroPeticion,
} from '@repunto/contratos';

import { tokenDeLaCabecera } from '../caja/dispositivo.guard';
import { errorDeApi } from '../caja/errores-http';
import { hashDeToken } from '../seguridad/token';
import { AltaService } from './alta.service';

/**
 * Los dos endpoints del telefono del cliente durante el alta.
 *
 * El primero es el unico endpoint publico de todo el flujo de caja: la
 * credencial es el `qr_slug` impreso en el mostrador. Por eso tiene tope por
 * telefono y por IP.
 */
@Controller()
export class RegistrosController {
  constructor(@Inject(AltaService) private readonly alta: AltaService) {}

  @Post('registros')
  @HttpCode(HttpStatus.ACCEPTED)
  registrar(@Body() cuerpo: unknown, @Ip() ip: string): Promise<RegistroRespuesta> {
    return this.alta.registrar(validar(cuerpo), ip);
  }

  /**
   * El estado del propio registro, con el ticket como credencial. No acepta
   * ningun identificador: el registro sale del ticket.
   */
  @Get('registros/mio')
  estado(@Req() peticion: PeticionConTicket): Promise<EstadoDelRegistro> {
    const ticket = tokenDeLaCabecera(peticion.headers['authorization']);
    if (ticket === null) throw errorDeApi('TOKEN_INVALIDO');
    return this.alta.estadoDelRegistro(hashDeToken(ticket));
  }
}

interface PeticionConTicket {
  headers: Record<string, string | string[] | undefined>;
}

function validar(cuerpo: unknown): RegistroPeticion {
  const resultado = esquemaRegistroPeticion.safeParse(cuerpo);
  if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
  return resultado.data;
}
