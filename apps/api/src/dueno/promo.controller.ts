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
  type CondicionCambiada,
  type ProgramaCambiado,
  type PromoDelDueno,
  esquemaCondicionNueva,
  esquemaProgramaNuevo,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia } from '../caja/peticion';
import { GuardDeDueno, type PeticionDeDueno } from './dueno.guard';
import { type DuenoQuePide, PromoDelDuenoService } from './promo.service';

/**
 * La promo y la condición del negocio del dueño. Ninguna ruta lleva el
 * negocio: sale de la sesión (INV-1). Un `negocio_id` en el cuerpo no se
 * lee; el esquema lo descarta.
 */
@Controller('dueno/promo')
@UseGuards(GuardDeDueno)
export class PromoDelDuenoController {
  constructor(
    @Inject(PromoDelDuenoService) private readonly promos: PromoDelDuenoService,
  ) {}

  @Get()
  obtener(@Req() peticion: PeticionDeDueno): Promise<PromoDelDueno> {
    return this.promos.promo(peticion.dueno.negocio.id);
  }

  @Post('programa')
  @HttpCode(HttpStatus.CREATED)
  programa(
    @Req() peticion: PeticionDeDueno,
    @Body() cuerpo: unknown,
  ): Promise<ProgramaCambiado> {
    const clave = claveDeIdempotencia(peticion);
    const programa = esquemaProgramaNuevo.safeParse(cuerpo);
    if (!programa.success) throw errorDeApi('PETICION_INVALIDA');
    return this.promos.cambiarPrograma(quienPide(peticion), clave, programa.data);
  }

  @Post('condicion')
  @HttpCode(HttpStatus.CREATED)
  condicion(
    @Req() peticion: PeticionDeDueno,
    @Body() cuerpo: unknown,
  ): Promise<CondicionCambiada> {
    const clave = claveDeIdempotencia(peticion);
    const condicion = esquemaCondicionNueva.safeParse(cuerpo);
    if (!condicion.success) throw errorDeApi('PETICION_INVALIDA');
    return this.promos.cambiarCondicion(quienPide(peticion), clave, condicion.data);
  }
}

function quienPide(peticion: PeticionDeDueno): DuenoQuePide {
  return { usuario_id: peticion.dueno.id, negocio_id: peticion.dueno.negocio.id };
}
