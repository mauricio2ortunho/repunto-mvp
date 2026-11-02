import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { BitacoraDeCaja } from './bitacora';
import { CodigoInterceptor } from './codigo.interceptor';
import { FiltroDeErrores } from './errores.filter';

/**
 * El log de cada pedido, la bitacora de la caja y los errores a Sentry
 * (CLAUDE.md, seccion 8). Global porque la bitacora la usan la caja y el
 * alta, que son modulos distintos. El middleware se monta en AppModule.
 */
@Global()
@Module({
  providers: [
    BitacoraDeCaja,
    { provide: APP_INTERCEPTOR, useClass: CodigoInterceptor },
    { provide: APP_FILTER, useClass: FiltroDeErrores },
  ],
  exports: [BitacoraDeCaja],
})
export class ObservabilidadModule {}
