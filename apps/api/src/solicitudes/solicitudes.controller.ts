import { Body, Controller, HttpCode, HttpStatus, Inject, Ip, Post } from '@nestjs/common';
import { type SolicitudRecibida, esquemaSolicitudNueva } from '@repunto/contratos';

import { errorDeApi } from '../caja/errores-http';
import { SolicitudesService } from './solicitudes.service';

/**
 * `POST /solicitudes`, público: quien pide sumar su negocio todavía no tiene
 * cuenta de nada. Con tope por conexión y por teléfono.
 *
 * Sin Idempotency-Key: el doble toque lo frena la base, que admite una sola
 * solicitud pendiente por teléfono, y la respuesta es siempre la misma.
 */
@Controller('solicitudes')
export class SolicitudesController {
  constructor(
    @Inject(SolicitudesService) private readonly solicitudes: SolicitudesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  pedir(@Body() cuerpo: unknown, @Ip() ip: string): Promise<SolicitudRecibida> {
    const solicitud = esquemaSolicitudNueva.safeParse(cuerpo);
    if (!solicitud.success) throw errorDeApi('PETICION_INVALIDA');
    return this.solicitudes.pedir(solicitud.data, ip);
  }
}
