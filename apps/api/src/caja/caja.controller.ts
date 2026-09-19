import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type CanjearRespuesta,
  esquemaSellarPeticion,
  type SellarPeticion,
  type SellarRespuesta,
} from '@repunto/contratos';

import { CajaService } from './caja.service';
import { GuardDeDispositivo, type PeticionDeCaja } from './dispositivo.guard';
import { errorDeApi } from './errores-http';

/**
 * Los dos endpoints de la caja.
 *
 * El cuerpo lleva unicamente el codigo que el cliente muestra. El negocio, el
 * local y el turno salen del token de la tablet y de la base, nunca del
 * request (INV-1, INV-2). El canje pide el codigo igual que el sellado: lo
 * confirma el negocio, pero con el cliente presente.
 *
 * El controller no decide nada: valida, llama y deja que el error se mapee.
 */
@Controller('caja')
@UseGuards(GuardDeDispositivo)
export class CajaController {
  constructor(@Inject(CajaService) private readonly caja: CajaService) {}

  @Post('sellos')
  @HttpCode(HttpStatus.OK)
  sellar(
    @Req() peticion: PeticionDeCaja,
    @Body() cuerpo: unknown,
  ): Promise<SellarRespuesta> {
    return this.caja.sellar(
      peticion.tokenHash,
      claveDeIdempotencia(peticion),
      validarCodigo(cuerpo),
    );
  }

  @Post('canjes')
  @HttpCode(HttpStatus.OK)
  canjear(
    @Req() peticion: PeticionDeCaja,
    @Body() cuerpo: unknown,
  ): Promise<CanjearRespuesta> {
    return this.caja.canjear(
      peticion.tokenHash,
      claveDeIdempotencia(peticion),
      validarCodigo(cuerpo),
    );
  }
}

function validarCodigo(cuerpo: unknown): SellarPeticion {
  const resultado = esquemaSellarPeticion.safeParse(cuerpo);
  if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
  return resultado.data;
}

/**
 * Obligatoria en todo endpoint que crea algo (CLAUDE.md, seccion 9). Que falte
 * es un bug del panel: sin ella, el doble toque del cajero crea dos sellos.
 */
function claveDeIdempotencia(peticion: PeticionDeCaja): string {
  const clave = peticion.headers['idempotency-key'];
  if (typeof clave !== 'string' || clave.length < 8) {
    throw errorDeApi('FALTA_IDEMPOTENCY_KEY');
  }
  return clave;
}
