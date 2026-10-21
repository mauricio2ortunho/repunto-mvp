import { Module } from '@nestjs/common';

import { AnulacionService } from './anulacion.service';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { EstadoService } from './estado.service';
import { TurnoService } from './turno.service';
import { VinculacionController } from './vinculacion.controller';
import { VinculacionService } from './vinculacion.service';

@Module({
  controllers: [CajaController, VinculacionController],
  providers: [
    CajaService,
    AnulacionService,
    EstadoService,
    TurnoService,
    VinculacionService,
  ],
})
export class CajaModule {}
