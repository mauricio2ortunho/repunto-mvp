import { Module } from '@nestjs/common';

import { CodigoController } from './codigo.controller';
import { CodigoService } from './codigo.service';
import { NegociosController } from './negocios.controller';
import { NegociosService } from './negocios.service';
import { TarjetasController } from './tarjetas.controller';
import { TarjetasService } from './tarjetas.service';

@Module({
  controllers: [CodigoController, TarjetasController, NegociosController],
  providers: [CodigoService, TarjetasService, NegociosService],
})
export class ClienteModule {}
