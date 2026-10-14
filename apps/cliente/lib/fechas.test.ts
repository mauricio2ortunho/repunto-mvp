/**
 * Las fechas se muestran en hora de La Paz, este donde este el telefono.
 *
 * El proceso se pone en la zona mas lejana que hay ANTES de importar nada: una
 * implementacion que se olvide del `timeZone` y use la del telefono falla en
 * cualquier maquina, no solo en la de un turista. Es la misma trampa que
 * escondio la hora de DEMASIADO_PRONTO: con datos donde las dos zonas dan el
 * mismo numero, un error de zona se ve correcto.
 */
process.env['TZ'] = 'Pacific/Kiritimati'; // UTC+14

import { describe, expect, it } from 'vitest';

import { diaEnLaPaz, diasHasta, fechaYHoraEnLaPaz } from './fechas';

describe('fechas en La Paz', () => {
  it('el proceso de verdad esta en otra zona', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('America/La_Paz');
  });

  it('el ultimo instante del 14 de noviembre en La Paz es el 14, no el 15', () => {
    // En UTC ya es el 15; en Kiritimati, el 15 a la tarde.
    expect(diaEnLaPaz('2026-11-15T03:59:59.999Z')).toBe('14 de noviembre');
  });

  it('la hora es la de La Paz, con reloj de 24 horas', () => {
    expect(fechaYHoraEnLaPaz('2026-10-12T21:02:00Z')).toBe('12 oct, 17:02');
  });

  describe('diasHasta cuenta dias calendario de La Paz', () => {
    // Mediodia del 12 de octubre en La Paz.
    const MEDIODIA = Date.parse('2026-10-12T16:00:00Z');

    it('una tarjeta que vence esta noche vence hoy, aunque falten horas', () => {
      expect(diasHasta('2026-10-13T03:59:59.999Z', MEDIODIA)).toBe(0);
    });

    it('la que vence mañana a la noche, mañana', () => {
      expect(diasHasta('2026-10-14T03:59:59.999Z', MEDIODIA)).toBe(1);
    });

    it('un mes calendario despues', () => {
      expect(diasHasta('2026-11-13T03:59:59.999Z', MEDIODIA)).toBe(31);
    });

    it('a las 23:59 de La Paz todavia es hoy', () => {
      const casiMedianoche = Date.parse('2026-10-13T03:59:00Z');
      expect(diasHasta('2026-10-13T03:59:59.999Z', casiMedianoche)).toBe(0);
    });
  });
});
