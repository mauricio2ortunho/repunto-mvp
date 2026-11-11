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
  type SolicitudDelAdmin,
  type SolicitudesDelAdmin,
  esquemaRechazoDeSolicitud,
} from '@repunto/contratos';

import { GuardDeAdmin, type PeticionDeAdmin } from '../admin/admin.guard';
import { errorDeApi } from '../caja/errores-http';
import { idEnLaRuta } from '../caja/peticion';
import { SolicitudesService } from './solicitudes.service';

/**
 * Las solicitudes, desde el panel del admin. Aprobar no está acá: es dar de
 * alta el negocio con `solicitud_id` (POST /admin/negocios).
 */
@Controller('admin/solicitudes')
@UseGuards(GuardDeAdmin)
export class SolicitudesDelAdminController {
  constructor(
    @Inject(SolicitudesService) private readonly solicitudes: SolicitudesService,
  ) {}

  @Get()
  listar(): Promise<SolicitudesDelAdmin> {
    return this.solicitudes.listar();
  }

  @Get(':id')
  una(@Param('id') id: string): Promise<SolicitudDelAdmin> {
    return this.solicitudes.una(idEnLaRuta(id));
  }

  /** Sin clave: rechazar dos veces contesta SOLICITUD_YA_RESUELTA y no cambia nada. */
  @Post(':id/rechazo')
  @HttpCode(HttpStatus.OK)
  rechazar(
    @Req() peticion: PeticionDeAdmin,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<SolicitudDelAdmin> {
    const solicitud = idEnLaRuta(id);
    const rechazo = esquemaRechazoDeSolicitud.safeParse(cuerpo ?? {});
    if (!rechazo.success) throw errorDeApi('PETICION_INVALIDA');
    return this.solicitudes.rechazar(peticion.admin.id, solicitud, rechazo.data.motivo);
  }
}
