import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Headers,
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
  registrar(
    @Body() cuerpo: unknown,
    @Headers('idempotency-key') clave: unknown,
    @Ip() ip: string,
  ): Promise<RegistroRespuesta> {
    return this.alta.registrar(validar(cuerpo), claveDeRegistro(clave), ip);
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

/**
 * La Idempotency-Key del alta. Obligatoria, como en todo endpoint que crea algo
 * (CLAUDE.md, seccion 9), pero aca exige mas que en la caja: el ticket se
 * deriva de ella (ver `ticketDeRegistro`), asi que quien adivine la clave de
 * otro y conozca su telefono recibiria su ticket. 32 caracteres de un alfabeto
 * de 64 son 192 bits: no se adivina. Un UUID v4 alcanza.
 */
const CLAVE_DE_REGISTRO = /^[A-Za-z0-9_-]{32,200}$/;

function claveDeRegistro(clave: unknown): string {
  if (typeof clave !== 'string' || !CLAVE_DE_REGISTRO.test(clave)) {
    throw errorDeApi('FALTA_IDEMPOTENCY_KEY');
  }
  return clave;
}

function validar(cuerpo: unknown): RegistroPeticion {
  const resultado = esquemaRegistroPeticion.safeParse(cuerpo);
  if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
  return resultado.data;
}
