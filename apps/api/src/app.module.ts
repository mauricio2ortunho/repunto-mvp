import { Module } from '@nestjs/common';

import { SaludModule } from './salud/salud.module';

@Module({
  imports: [SaludModule],
})
export class AppModule {}
