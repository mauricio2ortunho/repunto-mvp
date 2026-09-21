import { Global, Module } from '@nestjs/common';

import { TopeDePeticiones } from './tope';

/** Los topes se comparten entre la caja y el cliente: una sola cuenta. */
@Global()
@Module({
  providers: [TopeDePeticiones],
  exports: [TopeDePeticiones],
})
export class SeguridadModule {}
