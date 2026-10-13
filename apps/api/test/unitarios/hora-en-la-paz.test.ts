/**
 * La hora que ve el cajero es hora de La Paz, corra donde corra la API.
 *
 * El proceso se pone en una zona lejana ANTES de importar nada: asi, una
 * implementacion que se olvide del `timeZone` explicito y use la del servidor
 * falla en cualquier maquina, y no solo en la nube. Sin esto el test pasaria
 * en una laptop boliviana y el error llegaria igual al mostrador.
 *
 * El sintoma seria barato de no ver y caro de tener: "puede volver a sellar a
 * las 21:02" cuando en el local son las 17:02. El cajero le dice al cliente
 * que vuelva cuatro horas despues.
 */
process.env['TZ'] = 'Pacific/Kiritimati'; // UTC+14, la zona mas lejana que hay

import { describe, expect, it } from 'vitest';

import { rechazo } from '@repunto/dominio';

import { errorDeRechazo } from '../../src/caja/errores-http';

/** 17:02 en La Paz. En UTC son las 21:02 y en Kiritimati las 11:02. */
const INSTANTE = new Date('2026-10-12T21:02:00.000Z');

function mensajeDe(puede_sellar_desde: Date): string {
  const excepcion = errorDeRechazo(
    rechazo('DEMASIADO_PRONTO', { puede_sellar_desde }),
    null,
  );
  return (excepcion.getResponse() as { mensaje: string }).mensaje;
}

describe('la hora de DEMASIADO_PRONTO', () => {
  it('es la de La Paz, no la del servidor', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('America/La_Paz');

    expect(mensajeDe(INSTANTE)).toContain('a las 17:02');
  });

  it.each([
    ['medianoche en La Paz', '2026-10-13T04:00:00.000Z', '00:00'],
    ['un minuto antes, que es el dia anterior', '2026-10-13T03:59:00.000Z', '23:59'],
    ['mediodia', '2026-10-12T16:00:00.000Z', '12:00'],
  ])('%s', (_caso, utc, esperado) => {
    expect(mensajeDe(new Date(utc))).toContain(`a las ${esperado}`);
  });

  it('usa reloj de 24 horas: a las 21:02 no dice 9:02', () => {
    // 21:02 en La Paz.
    expect(mensajeDe(new Date('2026-10-13T01:02:00.000Z'))).toContain('a las 21:02');
  });
});
