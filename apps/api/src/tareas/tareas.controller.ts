import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { GuardDeTareas } from './tareas.guard';
import { type ResultadoDeLaNoche, TareasService } from './tareas.service';

/**
 * Lo que dispara Vercel Cron (apps/api/vercel.json). GET porque es lo que
 * manda Vercel; no lo cachea nadie porque lleva Authorization.
 *
 * El resultado vuelve en la respuesta y queda en el log de la invocacion:
 * cuantas tarjetas vencieron y cuanto se purgo, para ver que corrio.
 */
@Controller('tareas')
@UseGuards(GuardDeTareas)
export class TareasController {
  constructor(@Inject(TareasService) private readonly tareas: TareasService) {}

  @Get('nocturna')
  async nocturna(): Promise<ResultadoDeLaNoche> {
    const resultado = await this.tareas.nocturna();
    console.log(JSON.stringify({ tarea: 'nocturna', ...resultado }));
    return resultado;
  }
}
