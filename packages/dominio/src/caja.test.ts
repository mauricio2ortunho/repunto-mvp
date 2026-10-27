import { describe, expect, it } from 'vitest';

import {
  type Caja,
  MINUTOS_DE_INACTIVIDAD_DEL_TURNO,
  type PromoConfigurada,
  finPorInactividad,
  revisarCaja,
  revisarCajaParaSellar,
  revisarTablet,
  turnoAgotado,
} from './caja';
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
  ahora: AHORA,
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

describe('el turno se agota a la hora sin actividad', () => {
  const MINUTO = 60_000;
  const conActividadHace = (minutos: number) => ({
    ...TURNO,
    ultima_actividad: new Date(AHORA.getTime() - minutos * MINUTO),
  });

  it('son 60 minutos', () => {
    expect(MINUTOS_DE_INACTIVIDAD_DEL_TURNO).toBe(60);
  });

  it('se agota justo a los 60 minutos de la ultima actividad, no antes', () => {
    const turno = conActividadHace(0);
    expect(finPorInactividad(turno)).toEqual(new Date(AHORA.getTime() + 60 * MINUTO));
    expect(turnoAgotado(turno, new Date(AHORA.getTime() + 60 * MINUTO - 1))).toBe(false);
    expect(turnoAgotado(turno, new Date(AHORA.getTime() + 60 * MINUTO))).toBe(true);
  });

  it('con actividad hace 59 minutos, la caja opera', () => {
    expect(revisarCaja({ ...CAJA, turno: conActividadHace(59) }).valido).toBe(true);
  });

  it('con la ultima actividad hace 60 minutos, es TURNO_CERRADO', () => {
    const revision = revisarCaja({ ...CAJA, turno: conActividadHace(60) });
    expect(revision.valido ? 'puede operar' : revision.codigo).toBe('TURNO_CERRADO');
  });

  it('una tablet revocada sigue ganando sobre el turno agotado', () => {
    const revision = revisarCaja({
      ...CAJA,
      dispositivo: { ...DISPOSITIVO, revocado_el: AHORA },
      turno: conActividadHace(120),
    });
    expect(revision.valido ? 'puede operar' : revision.codigo).toBe(
      'DISPOSITIVO_REVOCADO',
    );
  });
});

describe('revisarTablet', () => {
  it('una tablet vinculada a su local activo esta habilitada', () => {
    expect(revisarTablet({ dispositivo: DISPOSITIVO, local: LOCAL })).toBeNull();
  });

  it('una tablet revocada no lee nada, ni siquiera sin turno', () => {
    const revocada = { ...DISPOSITIVO, revocado_el: AHORA };
    expect(revisarTablet({ dispositivo: revocada, local: LOCAL })).toBe(
      'DISPOSITIVO_REVOCADO',
    );
  });

  it('revocada tiene precedencia sobre el local dado de baja', () => {
    const revocada = { ...DISPOSITIVO, revocado_el: AHORA };
    const cerrado = { ...LOCAL, activo: false };
    expect(revisarTablet({ dispositivo: revocada, local: cerrado })).toBe(
      'DISPOSITIVO_REVOCADO',
    );
  });

  it('el local dado de baja deja a su tablet sin acceso', () => {
    const cerrado = { ...LOCAL, activo: false };
    expect(revisarTablet({ dispositivo: DISPOSITIVO, local: cerrado })).toBe(
      'LOCAL_NO_AUTORIZADO',
    );
  });

  it('un local que no es el de la tablet es LOCAL_NO_AUTORIZADO (INV-2)', () => {
    const otro = { ...LOCAL, id: 'otro-local' };
    expect(revisarTablet({ dispositivo: DISPOSITIVO, local: otro })).toBe(
      'LOCAL_NO_AUTORIZADO',
    );
  });
});
