import { Module } from '@nestjs/common';

import { PersonasDelNegocioService } from '../negocio/personas.service';
import { TabletsDelNegocioService } from '../negocio/tablets.service';
import { ALMACEN_DE_IMAGENES, AlmacenR2, configDeR2 } from '../imagenes/almacen';
import { ImagenesDeAdminController } from '../imagenes/imagenes.controller';
import { ImagenesDelNegocioService } from '../imagenes/imagenes.service';
import { GuardDeAdmin } from './admin.guard';
import { EntradaDelDuenoService } from './entrada-del-dueno.service';
import { NegociosDeAdminController } from './negocios.controller';
import { NegociosDeAdminService } from './negocios.service';
import { SesionDeAdminController } from './sesion.controller';
import { SesionDeAdminService } from './sesion.service';
import { TableroDeAdminController } from './tablero.controller';
import { TableroDeAdminService } from './tablero.service';

/** El panel de administracion: lo usa el admin de plataforma. */
@Module({
  controllers: [
    SesionDeAdminController,
    NegociosDeAdminController,
    TableroDeAdminController,
    ImagenesDeAdminController,
  ],
  providers: [
    SesionDeAdminService,
    NegociosDeAdminService,
    PersonasDelNegocioService,
    TabletsDelNegocioService,
    TableroDeAdminService,
    EntradaDelDuenoService,
    ImagenesDelNegocioService,
    // Lee las variables al arrancar: sin las cinco, null, y subir contesta
    // IMAGENES_NO_CONFIGURADAS.
    {
      provide: ALMACEN_DE_IMAGENES,
      useFactory: () => {
        const config = configDeR2(process.env);
        return config === null ? null : new AlmacenR2(config);
      },
    },
    GuardDeAdmin,
  ],
})
export class AdminModule {}
