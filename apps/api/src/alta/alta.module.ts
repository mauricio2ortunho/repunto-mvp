import { Module } from '@nestjs/common';

import { AltaService } from './alta.service';
import { CajaRegistrosController } from './caja-registros.controller';
import { RegistrosController } from './registros.controller';

@Module({
  controllers: [RegistrosController, CajaRegistrosController],
  providers: [AltaService],
})
export class AltaModule {}
