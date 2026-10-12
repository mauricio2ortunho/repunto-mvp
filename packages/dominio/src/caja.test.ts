import { describe, expect, it } from 'vitest';

import { type Caja, type PromoConfigurada, revisarCajaParaSellar } from './caja';
import {
  AHORA,
  ASIGNACION,
  DISPOSITIVO,
  LOCAL,
  NEGOCIO,
  TURNO,
} from './pruebas/escenario';

/**
 * `revisarCajaParaSellar`: la caja completa, promo incluida.
 *
 * `revisarCaja` ya esta cubierto por los tests de sellado, canje, alta y
 * anulacion, que pasan por el. Lo que se prueba aca es lo que agrega esta
 * funcion: que la promo sin configurar impida operar, y que no tape un
 * problema mas urgente del equipo.
 */

const CAJA: Caja = {
  negocio: NEGOCIO,
  local: LOCAL,
  dispositivo: DISPOSITIVO,
  turno: TURNO,
  asignacion: ASIGNACION,
};

const CONFIGURADA: PromoConfigurada = { condicionVigente: true, programaVigente: true };

function codigoDe(caja: Caja, promo: PromoConfigurada): string {
  const revision = revisarCajaParaSellar(caja, promo);
  return revision.valido ? 'puede operar' : revision.codigo;
}

describe('revisarCajaParaSellar', () => {
  it('con todo en orden, deja operar y devuelve el turno', () => {
    const revision = revisarCajaParaSellar(CAJA, CONFIGURADA);

    expect(revision.valido).toBe(true);
    if (revision.valido) expect(revision.turno).toEqual(TURNO);
  });

  it.each([
    ['sin programa vigente', { condicionVigente: true, programaVigente: false }],
    ['sin condicion vigente', { condicionVigente: false, programaVigente: true }],
    ['sin ninguna de las dos', { condicionVigente: false, programaVigente: false }],
  ])('%s, la caja no puede sellar', (_caso, promo) => {
    // La misma regla que aplica planDeSellado: sin condicion no hay sello que
    // insertar, y sin programa no hay a que sellar contra.
    expect(codigoDe(CAJA, promo)).toBe('PROMO_NO_CONFIGURADA');
  });

  it('un problema del equipo gana sobre la promo', () => {
    // El dueño acaba de revocar la tablet: eso es lo que quiere ver, aunque
    // ademas falte configurar la promo.
    const revocada: Caja = {
      ...CAJA,
      dispositivo: { ...DISPOSITIVO, revocado_el: AHORA },
    };

    expect(codigoDe(revocada, { condicionVigente: false, programaVigente: false })).toBe(
      'DISPOSITIVO_REVOCADO',
    );
  });

  it('el turno cerrado tambien gana sobre la promo', () => {
    expect(
      codigoDe(
        { ...CAJA, turno: null },
        { condicionVigente: false, programaVigente: false },
      ),
    ).toBe('TURNO_CERRADO');
  });
});
