import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type AnularRespuesta,
  type CanjearRespuesta,
  type EstadoDeCaja,
  esquemaSellarPeticion,
  type SellarPeticion,
  type SellarRespuesta,
  type SellosRecientes,
  type UsuariosDeCaja,
  esquemaAbrirTurnoPeticion,
} from '@repunto/contratos';

import { AnulacionService } from './anulacion.service';
import { CajaService } from './caja.service';
import { EstadoService } from './estado.service';
import { GuardDeDispositivo, type PeticionDeCaja } from './dispositivo.guard';
import { errorDeApi } from './errores-http';
import { claveDeIdempotencia, idEnLaRuta } from './peticion';
import { TurnoService } from './turno.service';

/**
 * Los endpoints de la caja: el estado, el turno, sellar, deshacer y canjear.
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
  constructor(
    @Inject(CajaService) private readonly caja: CajaService,
    @Inject(AnulacionService) private readonly anulacion: AnulacionService,
    @Inject(EstadoService) private readonly estadoDeCaja: EstadoService,
    @Inject(TurnoService) private readonly turno: TurnoService,
  ) {}

  /**
   * Con que se dibuja el panel antes de la primera accion: la marca, el local,
   * quien tiene el turno, la condicion vigente y el premio.
   *
   * Es el unico de caja que contesta aunque la caja no pueda operar: el panel
   * necesita saber que mostrar justamente cuando nadie abrio turno o cuando la
   * tablet fue revocada. Eso viene en `impedimento`.
   */
  @Get('estado')
  estado(@Req() peticion: PeticionDeCaja): Promise<EstadoDeCaja> {
    return this.estadoDeCaja.estado(peticion.tokenHash);
  }

  /** Quienes pueden abrir turno en esta tablet: la lista que el cajero toca. */
  @Get('usuarios')
  usuarios(@Req() peticion: PeticionDeCaja): Promise<UsuariosDeCaja> {
    return this.turno.usuarios(peticion.tokenHash);
  }

  /**
   * Abrir turno con PIN. Sin Idempotency-Key a proposito (ver el contrato): el
   * doble toque devuelve el mismo turno.
   */
  @Post('turnos')
  @HttpCode(HttpStatus.OK)
  abrirTurno(
    @Req() peticion: PeticionDeCaja,
    @Body() cuerpo: unknown,
  ): Promise<EstadoDeCaja> {
    const resultado = esquemaAbrirTurnoPeticion.safeParse(cuerpo);
    if (!resultado.success) throw errorDeApi('PETICION_INVALIDA');
    return this.turno.abrir(peticion.tokenHash, resultado.data);
  }

  /** Cerrar el turno abierto de esta tablet, si hay uno. */
  @Post('turno/cierre')
  @HttpCode(HttpStatus.OK)
  cerrarTurno(@Req() peticion: PeticionDeCaja): Promise<EstadoDeCaja> {
    return this.turno.cerrar(peticion.tokenHash);
  }

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

  /**
   * Deshacer un sello. Quien puede sale del rol del turno, no del request: un
   * cajero no puede pedir anular "como supervisor" porque no hay donde decirlo.
   */
  @Post('sellos/:id/anulacion')
  @HttpCode(HttpStatus.OK)
  anular(
    @Req() peticion: PeticionDeCaja,
    @Param('id') id: string,
  ): Promise<AnularRespuesta> {
    return this.anulacion.anular(
      peticion.tokenHash,
      claveDeIdempotencia(peticion),
      idEnLaRuta(id),
    );
  }

  /** De donde el supervisor saca cual anular. */
  @Get('sellos/recientes')
  recientes(@Req() peticion: PeticionDeCaja): Promise<SellosRecientes> {
    return this.anulacion.recientes(peticion.tokenHash);
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
