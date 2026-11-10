import type { IncomingMessage } from 'node:http';

import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IMAGENES_DEL_NEGOCIO,
  type ImagenDelNegocio,
  type ImagenGuardada,
  LIMITES_DE_IMAGEN,
} from '@repunto/contratos';

import { GuardDeAdmin, type PeticionDeAdmin } from '../admin/admin.guard';
import { errorDeApi } from '../caja/errores-http';
import { idEnLaRuta } from '../caja/peticion';
import { leerCuerpo } from './cuerpo';
import { ImagenesDelNegocioService } from './imagenes.service';

/**
 * El logo y la portada, desde la ficha del admin. El cuerpo son los bytes de
 * la imagen con su Content-Type: sin JSON ni base64 de por medio. El dueño
 * no los cambia: la apariencia es del admin.
 */
@Controller('admin/negocios')
@UseGuards(GuardDeAdmin)
export class ImagenesDeAdminController {
  constructor(
    @Inject(ImagenesDelNegocioService)
    private readonly imagenes: ImagenesDelNegocioService,
  ) {}

  @Post(':id/imagenes/:imagen')
  @HttpCode(HttpStatus.OK)
  async subir(
    @Req() peticion: PeticionDeAdmin & IncomingMessage,
    @Param('id') id: string,
    @Param('imagen') imagen: string,
  ): Promise<ImagenGuardada> {
    const negocio = idEnLaRuta(id);
    const cual = imagenDeLaRuta(imagen);
    const bytes = await leerCuerpo(peticion, LIMITES_DE_IMAGEN.bytes);
    const tipo = peticion.headers['content-type'];
    return this.imagenes.guardar(
      negocio,
      cual,
      typeof tipo === 'string' ? tipo : undefined,
      bytes,
    );
  }

  @Post(':id/imagenes/:imagen/quitar')
  @HttpCode(HttpStatus.OK)
  quitar(
    @Param('id') id: string,
    @Param('imagen') imagen: string,
  ): Promise<ImagenGuardada> {
    return this.imagenes.quitar(idEnLaRuta(id), imagenDeLaRuta(imagen));
  }
}

function imagenDeLaRuta(texto: string): ImagenDelNegocio {
  const imagen = IMAGENES_DEL_NEGOCIO.find((i) => i === texto);
  if (imagen === undefined) throw errorDeApi('PETICION_INVALIDA');
  return imagen;
}
