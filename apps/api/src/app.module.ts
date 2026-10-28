import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AltaModule } from './alta/alta.module';
import { CajaModule } from './caja/caja.module';
import { ClienteModule } from './cliente/cliente.module';
import { ObservabilidadModule } from './observabilidad/observabilidad.module';
import { PedidoMiddleware } from './observabilidad/pedido.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';
import { SeguridadModule } from './seguridad/seguridad.module';
import { TareasModule } from './tareas/tareas.module';

@Module({
  imports: [
    PrismaModule,
    SeguridadModule,
    ObservabilidadModule,
    SaludModule,
    CajaModule,
    ClienteModule,
    AltaModule,
    TareasModule,
  ],
})
export class AppModule implements NestModule {
  // Aca y no en main.ts: asi lo tienen el servidor de desarrollo, la funcion
  // de Vercel y los tests, que arrancan la api cada uno por su lado.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PedidoMiddleware).forRoutes('{*ruta}');
  }
}
