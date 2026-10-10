import { Module } from '@nestjs/common';

import { AnulacionService } from './anulacion.service';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { EstadoService } from './estado.service';

@Module({
  controllers: [CajaController],
  providers: [CajaService, AnulacionService, EstadoService],
})
export class CajaModule {}
