import { Module } from '@nestjs/common';

import { CodigoController } from './codigo.controller';
import { CodigoService } from './codigo.service';
import { TopeDePeticiones } from './tope';

@Module({
  controllers: [CodigoController],
  providers: [CodigoService, TopeDePeticiones],
})
export class ClienteModule {}
