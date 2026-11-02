import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { vigilarTarea } from '../observabilidad/sentry';
import { GuardDeTareas } from './tareas.guard';
import { type ResultadoDeLaNoche, TareasService } from './tareas.service';

/**
 * Cuando la espera Sentry: la hora entera en que Vercel Hobby puede correrla.
 * vercel.json pide 04:15 UTC, pero el plan no respeta el minuto.
 */
const HORARIO_DE_LA_NOCHE = '0 4 * * *';

/**
 * Lo que dispara Vercel Cron (apps/api/vercel.json). GET porque es lo que
 * manda Vercel; no lo cachea nadie porque lleva Authorization.
 *
 * El resultado vuelve en la respuesta y queda en el log de la invocacion:
 * cuantas tarjetas vencieron y cuanto se purgo, para ver que corrio. Sentry
 * vigila la otra mitad: que corra todas las noches.
 */
@Controller('tareas')
@UseGuards(GuardDeTareas)
export class TareasController {
  constructor(@Inject(TareasService) private readonly tareas: TareasService) {}

  @Get('nocturna')
  async nocturna(): Promise<ResultadoDeLaNoche> {
    const resultado = await vigilarTarea('tarea-nocturna', HORARIO_DE_LA_NOCHE, () =>
      this.tareas.nocturna(),
    );
    console.log(JSON.stringify({ tarea: 'nocturna', ...resultado }));
    return resultado;
  }
}
