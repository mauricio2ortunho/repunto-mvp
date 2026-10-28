import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { BitacoraDeCaja } from './bitacora';
import { CodigoInterceptor } from './codigo.interceptor';

/**
 * El log de cada pedido y la bitacora de la caja (CLAUDE.md, seccion 8).
 * Global porque la bitacora la usan la caja y el alta, que son modulos
 * distintos. El middleware se monta en AppModule.
 */
@Global()
@Module({
  providers: [BitacoraDeCaja, { provide: APP_INTERCEPTOR, useClass: CodigoInterceptor }],
  exports: [BitacoraDeCaja],
})
export class ObservabilidadModule {}
