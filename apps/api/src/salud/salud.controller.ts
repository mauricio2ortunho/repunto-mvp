import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { esquemaSalud, type Salud } from '@repunto/contratos';

import { PrismaService } from '../prisma/prisma.service';

const VERSION = process.env.APP_VERSION ?? '0.1.0-dev';

/** Lo minimo de la respuesta de Express que hace falta para fijar el estado. */
interface RespuestaHttp {
  status(codigo: number): void;
}

@Controller('salud')
export class SaludController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Estado del proceso y de su base. Lo consulta el chequeo del hosting.
   *
   * Consulta la base de verdad: una api que arranca pero no puede consultar
   * —credenciales cambiadas, pooler caido, red cortada— no esta sana, y es
   * exactamente el caso que un chequeo tiene que ver. Cuando la base no
   * contesta devuelve 503, para que el hosting no mande trafico a un proceso
   * que va a rechazar todo.
   *
   * La respuesta pasa por el esquema de `@repunto/contratos`: si alguien
   * cambia el contrato y no el controller, revienta aca y no en el cliente.
   */
  @Get()
  async obtener(@Res({ passthrough: true }) respuesta: RespuestaHttp): Promise<Salud> {
    const base = (await this.baseResponde()) ? 'ok' : 'sin-conexion';
    if (base === 'sin-conexion') respuesta.status(HttpStatus.SERVICE_UNAVAILABLE);

    return esquemaSalud.parse({
      estado: base === 'ok' ? 'ok' : 'degradado',
      version: VERSION,
      base,
    });
  }

  private async baseResponde(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
