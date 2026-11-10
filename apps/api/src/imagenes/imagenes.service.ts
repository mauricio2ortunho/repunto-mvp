import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  type ImagenDelNegocio,
  type ImagenGuardada,
  esquemaImagenGuardada,
} from '@repunto/contratos';
import { rechazo } from '@repunto/dominio';

import { negocioNoEncontrado } from '../admin/negocios.service';
import { errorDeRechazo } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { ALMACEN_DE_IMAGENES, type AlmacenDeImagenes } from './almacen';
import { EXTENSION, tipoPorBytes } from './formato';

/**
 * El logo y la portada de un negocio. La imagen va a R2 y en la base queda
 * su dirección (INV-22).
 *
 * El nombre del archivo sale de su contenido: subir dos veces la misma
 * imagen —el doble toque— deja el mismo archivo y la misma dirección, sin
 * Idempotency-Key. Una imagen nueva no borra la anterior: un teléfono que la
 * tenía guardada no muestra una imagen rota, y R2 cobra por GB, no por
 * archivo.
 */
@Injectable()
export class ImagenesDelNegocioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ALMACEN_DE_IMAGENES) private readonly almacen: AlmacenDeImagenes | null,
  ) {}

  /** `POST /admin/negocios/:id/imagenes/:imagen`. */
  async guardar(
    negocioId: string,
    imagen: ImagenDelNegocio,
    tipoDeclarado: string | undefined,
    bytes: Uint8Array,
  ): Promise<ImagenGuardada> {
    if (this.almacen === null) {
      throw errorDeRechazo(rechazo('IMAGENES_NO_CONFIGURADAS'), null);
    }
    await this.exigirNegocio(negocioId);
    // Lo que dice el pedido y lo que tienen los bytes tienen que coincidir.
    const tipo = tipoPorBytes(bytes);
    const declarado = tipoDeclarado?.split(';')[0]?.trim().toLowerCase();
    if (tipo === null || declarado !== tipo) {
      throw errorDeRechazo(rechazo('IMAGEN_INVALIDA'), null);
    }

    const huella = createHash('sha256').update(bytes).digest('hex').slice(0, 24);
    const clave = `negocios/${negocioId}/${imagen}-${huella}.${EXTENSION[tipo]}`;
    const url = await this.almacen.guardar(clave, bytes, tipo);
    await this.anotar(negocioId, imagen, url);
    return esquemaImagenGuardada.parse({ url });
  }

  /** `POST .../imagenes/:imagen/quitar`: el negocio queda sin esa imagen. */
  async quitar(negocioId: string, imagen: ImagenDelNegocio): Promise<ImagenGuardada> {
    await this.exigirNegocio(negocioId);
    await this.anotar(negocioId, imagen, null);
    return esquemaImagenGuardada.parse({ url: null });
  }

  private async anotar(
    negocioId: string,
    imagen: ImagenDelNegocio,
    url: string | null,
  ): Promise<void> {
    // Una consulta por columna: el nombre de una columna no viaja como
    // parámetro.
    if (imagen === 'logo') {
      await this.prisma.$executeRaw`
        UPDATE negocio SET logo_url = ${url} WHERE id = ${negocioId}::uuid`;
    } else {
      await this.prisma.$executeRaw`
        UPDATE negocio SET portada_url = ${url} WHERE id = ${negocioId}::uuid`;
    }
  }

  private async exigirNegocio(negocioId: string): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM negocio WHERE id = ${negocioId}::uuid`;
    if (filas.length === 0) throw negocioNoEncontrado();
  }
}
