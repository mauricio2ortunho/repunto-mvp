import { Module } from '@nestjs/common';

import { CodigoController } from './codigo.controller';
import { CodigoService } from './codigo.service';

@Module({
  controllers: [CodigoController],
  providers: [CodigoService],
})
export class ClienteModule {}
