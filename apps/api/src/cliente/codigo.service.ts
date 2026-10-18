import { Inject, Injectable } from '@nestjs/common';
import { type CodigoDelCliente, esquemaCodigoDelCliente } from '@repunto/contratos';
import { VENTANA_SEGUNDOS, codigoDeVentana, ventanaDe } from '@repunto/dominio';

import { errorDeApi } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { descifrarSemilla } from '../seguridad/cifrado';
import { TOPE_DEL_CODIGO, TopeDePeticiones } from '../seguridad/tope';

interface FilaDelCliente {
  id: string;
  codigo_publico: string;
  semilla_totp: string;
  ahora: Date | string;
}

/**
 * El codigo que el cliente muestra en caja.
 *
 * Lo calcula el servidor porque la PWA no puede: no importa `dominio`
 * (CLAUDE.md, seccion 3) y, sobre todo, porque la semilla no sale de aca en
 * ninguna circunstancia. Ni en la respuesta, ni en el log, ni en Sentry.
 *
 * El cliente sale del token de sesion. La peticion no acepta ningun
 * identificador de cliente, ni siquiera el propio (INV-1).
 */
@Injectable()
export class CodigoService {
  // Token explicito por lo mismo que en CajaService.
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  async codigoDe(tokenHash: string): Promise<CodigoDelCliente> {
    const filas = await this.prisma.$queryRaw<FilaDelCliente[]>`
      SELECT c.id, c.codigo_publico, c.semilla_totp, now() AS ahora
      FROM dispositivo_cliente d
      JOIN cliente c ON c.id = d.cliente_id
      WHERE d.token_hash = ${tokenHash}`;

    const fila = filas[0];
    if (fila === undefined) throw errorDeApi('TOKEN_INVALIDO');
    await this.tope.exigir(`codigo:${fila.id}`, TOPE_DEL_CODIGO);

    const ahora = fila.ahora instanceof Date ? fila.ahora : new Date(fila.ahora);
    const semilla = descifrarSemilla(fila.semilla_totp);
    const actual = ventanaDe(ahora);

    // La actual y la siguiente: con las dos, la app aguanta un minuto sin
    // volver a pedir, que es lo que dura una fila.
    return esquemaCodigoDelCliente.parse({
      // El reloj es el de la base, el mismo con el que la caja valida el
      // codigo: si la app contara contra el del telefono, un equipo atrasado
      // mostraria vigente un codigo que la caja ya no acepta.
      ahora: ahora.toISOString(),
      codigos: [actual, actual + 1].map((ventana) => ({
        codigo: `${fila.codigo_publico}-${codigoDeVentana(semilla, ventana)}`,
        vence_el: finDeLaVentana(ventana).toISOString(),
      })),
    });
  }
}

/** Ultimo instante de esa ventana de 30 segundos: cuando deja de ser la actual. */
function finDeLaVentana(ventana: number): Date {
  return new Date((ventana + 1) * VENTANA_SEGUNDOS * 1000 - 1);
}
