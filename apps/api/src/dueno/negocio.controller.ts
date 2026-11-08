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
  type CodigoDeVinculacion,
  type EstadoDePersona,
  type NegocioDelDueno,
  type PersonaBorrada,
  type PersonaCreada,
  type PinPuesto,
  type QrCambiado,
  type TabletRevocada,
  esquemaDatosDelLocal,
  esquemaPersonaDelEquipo,
  esquemaPinNuevo,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia, idEnLaRuta } from '../caja/peticion';
import type { Firmante } from '../negocio/firmante';
import { PersonasDelNegocioService } from '../negocio/personas.service';
import { TabletsDelNegocioService } from '../negocio/tablets.service';
import { GuardDeDueno, type PeticionDeDueno } from './dueno.guard';
import { NegocioDelDuenoService } from './negocio.service';

/**
 * Los locales, el equipo y las tablets del negocio del dueño. El negocio sale
 * de la sesión (INV-1); los ids de la ruta, y los locales en el cuerpo de una
 * persona, nombran cosas de ese negocio, y cada consulta filtra por él: lo de
 * otro negocio contesta que no existe.
 *
 * No hay alta ni cierre de locales: los hace el admin, que acompaña cada
 * apertura. A los dueños tampoco los toca (DUENO_NO_EDITABLE).
 */
@Controller('dueno')
@UseGuards(GuardDeDueno)
export class NegocioDelDuenoController {
  constructor(
    @Inject(NegocioDelDuenoService) private readonly negocios: NegocioDelDuenoService,
    @Inject(PersonasDelNegocioService)
    private readonly personas: PersonasDelNegocioService,
    @Inject(TabletsDelNegocioService) private readonly tablets: TabletsDelNegocioService,
  ) {}

  @Get('negocio')
  obtener(@Req() peticion: PeticionDeDueno): Promise<NegocioDelDueno> {
    return this.negocios.negocio(negocioDe(peticion));
  }

  @Post('locales/:local/datos')
  @HttpCode(HttpStatus.OK)
  datosDelLocal(
    @Req() peticion: PeticionDeDueno,
    @Param('local') local: string,
    @Body() cuerpo: unknown,
  ): Promise<NegocioDelDueno> {
    const elLocal = idEnLaRuta(local);
    const datos = esquemaDatosDelLocal.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.guardarLocal(negocioDe(peticion), elLocal, datos.data);
  }

  /** Sin clave: cada toque es un QR nuevo, y el último es el que vale. */
  @Post('locales/:local/qr')
  @HttpCode(HttpStatus.OK)
  cambiarQr(
    @Req() peticion: PeticionDeDueno,
    @Param('local') local: string,
  ): Promise<QrCambiado> {
    return this.negocios.cambiarQr(negocioDe(peticion), idEnLaRuta(local));
  }

  /** El código para vincular una tablet nueva a ese local, firmado por el dueño. */
  @Post('locales/:local/vinculacion')
  @HttpCode(HttpStatus.CREATED)
  codigoDeVinculacion(
    @Req() peticion: PeticionDeDueno,
    @Param('local') local: string,
  ): Promise<CodigoDeVinculacion> {
    const elLocal = idEnLaRuta(local);
    const clave = claveDeIdempotencia(peticion);
    return this.tablets.generarCodigo(
      firmaDe(peticion),
      negocioDe(peticion),
      elLocal,
      clave,
    );
  }

  @Post('tablets/:tablet/revocacion')
  @HttpCode(HttpStatus.OK)
  revocarTablet(
    @Req() peticion: PeticionDeDueno,
    @Param('tablet') tablet: string,
  ): Promise<TabletRevocada> {
    return this.tablets.revocar(negocioDe(peticion), idEnLaRuta(tablet));
  }

  @Post('personas')
  @HttpCode(HttpStatus.CREATED)
  crearPersona(
    @Req() peticion: PeticionDeDueno,
    @Body() cuerpo: unknown,
  ): Promise<PersonaCreada> {
    const clave = claveDeIdempotencia(peticion);
    const persona = esquemaPersonaDelEquipo.safeParse(cuerpo);
    if (!persona.success) throw errorDeApi('PETICION_INVALIDA');
    return this.personas.crear(
      firmaDe(peticion),
      negocioDe(peticion),
      clave,
      persona.data,
    );
  }

  /** Sin Idempotency-Key: la huella del cuerpo dejaría el PIN a la vista. */
  @Post('personas/:persona/pin')
  @HttpCode(HttpStatus.OK)
  async ponerPin(
    @Req() peticion: PeticionDeDueno,
    @Param('persona') persona: string,
    @Body() cuerpo: unknown,
  ): Promise<PinPuesto> {
    const laPersona = idEnLaRuta(persona);
    const pin = esquemaPinNuevo.safeParse(cuerpo);
    if (!pin.success) throw errorDeApi('PETICION_INVALIDA');
    await this.negocios.exigirDelEquipo(negocioDe(peticion), laPersona);
    return this.personas.ponerPin(negocioDe(peticion), laPersona, pin.data.pin);
  }

  @Post('personas/:persona/datos')
  @HttpCode(HttpStatus.OK)
  async datosDePersona(
    @Req() peticion: PeticionDeDueno,
    @Param('persona') persona: string,
    @Body() cuerpo: unknown,
  ): Promise<NegocioDelDueno> {
    const laPersona = idEnLaRuta(persona);
    const datos = esquemaPersonaDelEquipo.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    await this.negocios.exigirDelEquipo(negocioDe(peticion), laPersona);
    await this.personas.actualizar(negocioDe(peticion), laPersona, datos.data);
    return this.negocios.negocio(negocioDe(peticion));
  }

  @Post('personas/:persona/baja')
  @HttpCode(HttpStatus.OK)
  async darDeBaja(
    @Req() peticion: PeticionDeDueno,
    @Param('persona') persona: string,
  ): Promise<EstadoDePersona> {
    const laPersona = idEnLaRuta(persona);
    await this.negocios.exigirDelEquipo(negocioDe(peticion), laPersona);
    return this.personas.darDeBaja(negocioDe(peticion), laPersona);
  }

  /** Sin cuerpo: solo el dueño reactivado trae teléfono, y a ese lo maneja el admin. */
  @Post('personas/:persona/reactivacion')
  @HttpCode(HttpStatus.OK)
  async reactivarPersona(
    @Req() peticion: PeticionDeDueno,
    @Param('persona') persona: string,
  ): Promise<EstadoDePersona> {
    const laPersona = idEnLaRuta(persona);
    await this.negocios.exigirDelEquipo(negocioDe(peticion), laPersona);
    return this.personas.reactivar(negocioDe(peticion), laPersona, null);
  }

  /** Solo a quien no tiene historia: lo cargado por error. */
  @Post('personas/:persona/borrado')
  @HttpCode(HttpStatus.OK)
  async borrarPersona(
    @Req() peticion: PeticionDeDueno,
    @Param('persona') persona: string,
  ): Promise<PersonaBorrada> {
    const laPersona = idEnLaRuta(persona);
    await this.negocios.exigirDelEquipo(negocioDe(peticion), laPersona);
    return this.personas.borrar(negocioDe(peticion), laPersona);
  }
}

function negocioDe(peticion: PeticionDeDueno): string {
  return peticion.dueno.negocio.id;
}

function firmaDe(peticion: PeticionDeDueno): Firmante {
  return { tipo: 'negocio', usuario_id: peticion.dueno.id };
}
