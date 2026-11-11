import { Module } from '@nestjs/common';

import { GuardDeAdmin } from '../admin/admin.guard';
import { SolicitudesDelAdminController } from './solicitudes-del-admin.controller';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';

/** La solicitud de negocio: el pedido público y su resolución en el admin. */
@Module({
  controllers: [SolicitudesController, SolicitudesDelAdminController],
  providers: [SolicitudesService, GuardDeAdmin],
})
export class SolicitudesModule {}
