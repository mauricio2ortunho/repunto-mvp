import { Module } from '@nestjs/common';

import { CodigoController } from './codigo.controller';
import { CodigoService } from './codigo.service';
import { TarjetasController } from './tarjetas.controller';
import { TarjetasService } from './tarjetas.service';

@Module({
  controllers: [CodigoController, TarjetasController],
  providers: [CodigoService, TarjetasService],
})
export class ClienteModule {}
