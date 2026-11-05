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
  type CondicionCambiada,
  type EstadoDelLocal,
  type EstadoDelNegocio,
  type FichaDelNegocio,
  type LocalCreado,
  type EstadoDePersona,
  type PersonaCreada,
  type PinPuesto,
  type NegocioCreado,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  esquemaCondicionNueva,
  esquemaDatosDelLocal,
  esquemaDatosDePersona,
  esquemaPersonaNueva,
  esquemaPinNuevo,
  esquemaDatosDelNegocio,
  esquemaNegocioNuevo,
  esquemaProgramaNuevo,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia, idEnLaRuta } from '../caja/peticion';
import { GuardDeAdmin, type PeticionDeAdmin } from './admin.guard';
import { NegociosDeAdminService } from './negocios.service';
import { PersonasDeAdminService } from './personas.service';

@Controller('admin/negocios')
@UseGuards(GuardDeAdmin)
export class NegociosDeAdminController {
  constructor(
    @Inject(NegociosDeAdminService) private readonly negocios: NegociosDeAdminService,
    @Inject(PersonasDeAdminService) private readonly personas: PersonasDeAdminService,
  ) {}

  @Get()
  listar(): Promise<NegociosDelAdmin> {
    return this.negocios.listar();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Req() peticion: PeticionDeAdmin,
    @Body() cuerpo: unknown,
  ): Promise<NegocioCreado> {
    const clave = claveDeIdempotencia(peticion);
    const alta = esquemaNegocioNuevo.safeParse(cuerpo);
    if (!alta.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.crear(peticion.admin.id, clave, alta.data);
  }

  @Get(':id')
  ficha(@Param('id') id: string): Promise<FichaDelNegocio> {
    return this.negocios.ficha(idEnLaRuta(id));
  }

  @Post(':id/datos')
  @HttpCode(HttpStatus.OK)
  datos(@Param('id') id: string, @Body() cuerpo: unknown): Promise<FichaDelNegocio> {
    const negocio = idEnLaRuta(id);
    const datos = esquemaDatosDelNegocio.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.actualizarDatos(negocio, datos.data);
  }

  @Post(':id/programa')
  @HttpCode(HttpStatus.CREATED)
  programa(
    @Req() peticion: PeticionDeAdmin,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<ProgramaCambiado> {
    const negocio = idEnLaRuta(id);
    const clave = claveDeIdempotencia(peticion);
    const programa = esquemaProgramaNuevo.safeParse(cuerpo);
    if (!programa.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.cambiarPrograma(
      peticion.admin.id,
      negocio,
      clave,
      programa.data,
    );
  }

  @Post(':id/condicion')
  @HttpCode(HttpStatus.CREATED)
  condicion(
    @Req() peticion: PeticionDeAdmin,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<CondicionCambiada> {
    const negocio = idEnLaRuta(id);
    const clave = claveDeIdempotencia(peticion);
    const condicion = esquemaCondicionNueva.safeParse(cuerpo);
    if (!condicion.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.cambiarCondicion(
      peticion.admin.id,
      negocio,
      clave,
      condicion.data,
    );
  }

  @Post(':id/suspension')
  @HttpCode(HttpStatus.OK)
  suspender(@Param('id') id: string): Promise<EstadoDelNegocio> {
    return this.negocios.cambiarEstado(idEnLaRuta(id), 'suspendido');
  }

  @Post(':id/reactivacion')
  @HttpCode(HttpStatus.OK)
  reactivar(@Param('id') id: string): Promise<EstadoDelNegocio> {
    return this.negocios.cambiarEstado(idEnLaRuta(id), 'activo');
  }

  @Post(':id/locales')
  @HttpCode(HttpStatus.CREATED)
  crearLocal(
    @Req() peticion: PeticionDeAdmin,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<LocalCreado> {
    const negocio = idEnLaRuta(id);
    const clave = claveDeIdempotencia(peticion);
    const datos = esquemaDatosDelLocal.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.crearLocal(peticion.admin.id, negocio, clave, datos.data);
  }

  @Post(':id/locales/:local/datos')
  @HttpCode(HttpStatus.OK)
  datosDelLocal(
    @Param('id') id: string,
    @Param('local') local: string,
    @Body() cuerpo: unknown,
  ): Promise<FichaDelNegocio> {
    const negocio = idEnLaRuta(id);
    const elLocal = idEnLaRuta(local);
    const datos = esquemaDatosDelLocal.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    return this.negocios.actualizarLocal(negocio, elLocal, datos.data);
  }

  @Post(':id/locales/:local/cierre')
  @HttpCode(HttpStatus.OK)
  cerrarLocal(
    @Param('id') id: string,
    @Param('local') local: string,
  ): Promise<EstadoDelLocal> {
    return this.negocios.cambiarEstadoDelLocal(idEnLaRuta(id), idEnLaRuta(local), false);
  }

  @Post(':id/locales/:local/reapertura')
  @HttpCode(HttpStatus.OK)
  reabrirLocal(
    @Param('id') id: string,
    @Param('local') local: string,
  ): Promise<EstadoDelLocal> {
    return this.negocios.cambiarEstadoDelLocal(idEnLaRuta(id), idEnLaRuta(local), true);
  }

  @Post(':id/personas')
  @HttpCode(HttpStatus.CREATED)
  crearPersona(
    @Req() peticion: PeticionDeAdmin,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<PersonaCreada> {
    const negocio = idEnLaRuta(id);
    const clave = claveDeIdempotencia(peticion);
    const persona = esquemaPersonaNueva.safeParse(cuerpo);
    if (!persona.success) throw errorDeApi('PETICION_INVALIDA');
    return this.personas.crear(peticion.admin.id, negocio, clave, persona.data);
  }

  /** Sin Idempotency-Key: la huella del cuerpo dejaria el PIN a la vista. */
  @Post(':id/personas/:persona/pin')
  @HttpCode(HttpStatus.OK)
  ponerPin(
    @Param('id') id: string,
    @Param('persona') persona: string,
    @Body() cuerpo: unknown,
  ): Promise<PinPuesto> {
    const negocio = idEnLaRuta(id);
    const laPersona = idEnLaRuta(persona);
    const pin = esquemaPinNuevo.safeParse(cuerpo);
    if (!pin.success) throw errorDeApi('PETICION_INVALIDA');
    return this.personas.ponerPin(negocio, laPersona, pin.data.pin);
  }

  @Post(':id/personas/:persona/datos')
  @HttpCode(HttpStatus.OK)
  async datosDePersona(
    @Param('id') id: string,
    @Param('persona') persona: string,
    @Body() cuerpo: unknown,
  ): Promise<FichaDelNegocio> {
    const negocio = idEnLaRuta(id);
    const laPersona = idEnLaRuta(persona);
    const datos = esquemaDatosDePersona.safeParse(cuerpo);
    if (!datos.success) throw errorDeApi('PETICION_INVALIDA');
    await this.personas.actualizar(negocio, laPersona, datos.data);
    return this.negocios.ficha(negocio);
  }

  @Post(':id/personas/:persona/baja')
  @HttpCode(HttpStatus.OK)
  darDeBaja(
    @Param('id') id: string,
    @Param('persona') persona: string,
  ): Promise<EstadoDePersona> {
    return this.personas.cambiarEstado(idEnLaRuta(id), idEnLaRuta(persona), false);
  }

  @Post(':id/personas/:persona/reactivacion')
  @HttpCode(HttpStatus.OK)
  reactivarPersona(
    @Param('id') id: string,
    @Param('persona') persona: string,
  ): Promise<EstadoDePersona> {
    return this.personas.cambiarEstado(idEnLaRuta(id), idEnLaRuta(persona), true);
  }
}
