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
  type NegocioCreado,
  type NegociosDelAdmin,
  type ProgramaCambiado,
  esquemaCondicionNueva,
  esquemaDatosDelLocal,
  esquemaDatosDelNegocio,
  esquemaNegocioNuevo,
  esquemaProgramaNuevo,
} from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { claveDeIdempotencia, idEnLaRuta } from '../caja/peticion';
import { GuardDeAdmin, type PeticionDeAdmin } from './admin.guard';
import { NegociosDeAdminService } from './negocios.service';

@Controller('admin/negocios')
@UseGuards(GuardDeAdmin)
export class NegociosDeAdminController {
  constructor(
    @Inject(NegociosDeAdminService) private readonly negocios: NegociosDeAdminService,
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
}
