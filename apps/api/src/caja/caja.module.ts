import { Module } from '@nestjs/common';

import { AnulacionService } from './anulacion.service';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { EstadoService } from './estado.service';
import { TurnoService } from './turno.service';

@Module({
  controllers: [CajaController],
  providers: [CajaService, AnulacionService, EstadoService, TurnoService],
})
export class CajaModule {}
