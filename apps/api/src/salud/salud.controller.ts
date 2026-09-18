import { Controller, Get } from '@nestjs/common';
import { esquemaSalud, type Salud } from '@repunto/contratos';

const VERSION = process.env.APP_VERSION ?? '0.1.0-dev';

@Controller('salud')
export class SaludController {
  /**
   * Estado del proceso. Lo consumen el chequeo de Railway y, por ahora, los
   * dos frontends, para verificar que el contrato compartido viaja entero.
   *
   * La respuesta pasa por el esquema de `@repunto/contratos`: si alguien
   * cambia el contrato y no el controller, revienta aca y no en el cliente.
   */
  @Get()
  obtener(): Salud {
    return esquemaSalud.parse({ estado: 'ok', version: VERSION });
  }
}
