import { Module } from '@nestjs/common';

import { AnulacionService } from './anulacion.service';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';

@Module({
  controllers: [CajaController],
  providers: [CajaService, AnulacionService],
})
export class CajaModule {}
