import { describe, expect, it } from 'vitest';

import {
  type EntradaDeAnulacion,
  MINUTOS_PARA_DESHACER,
  decidirAnulacion,
} from './anulacion';
import type { CodigoDeError } from './errores';
import {
  AHORA,
  CLIENTE,
  LOCAL,
  PROGRAMA,
  TURNO,
  TURNO_DE_SUPERVISOR,
  unSelloParaAnular,
  unaEntradaDeAnulacion,
  unaTarjetaEnCurso,
  unosSellos,
} from './pruebas/escenario';

const MINUTO = 60_000;

function rechazoDe(
  cambios: Partial<EntradaDeAnulacion>,
): CodigoDeError | 'anulacion aceptada' {
  const decision = decidirAnulacion(unaEntradaDeAnulacion(cambios));
  return decision.tipo === 'rechazado' ? decision.codigo : 'anulacion aceptada';
}

function efectoDe(cambios: Partial<EntradaDeAnulacion> = {}) {
  const decision = decidirAnulacion(unaEntradaDeAnulacion(cambios));
  if (decision.tipo !== 'anular') {
    throw new Error(`Se esperaba anular y fue rechazado por ${decision.codigo}`);
  }
  return decision.efecto;
}

describe('decidirAnulacion · el cajero deshace lo que acaba de hacer', () => {
  it('anula su ultimo sello, un minuto despues', () => {
    expect(rechazoDe({})).toBe('anulacion aceptada');
  });

  it('borde: justo a los cinco minutos todavia vale', () => {
    const sello = unSelloParaAnular({
      creado_el: new Date(AHORA.getTime() - MINUTOS_PARA_DESHACER * MINUTO),
    });
    expect(rechazoDe({ sello })).toBe('anulacion aceptada');
  });

  it('un milisegundo despues de los cinco minutos, ya no', () => {
    const sello = unSelloParaAnular({
      creado_el: new Date(AHORA.getTime() - MINUTOS_PARA_DESHACER * MINUTO - 1),
    });
    expect(rechazoDe({ sello })).toBe('ANULACION_NO_PERMITIDA');
  });

  it('no puede anular el sello de otro cajero', () => {
    const sello = unSelloParaAnular({ usuario_id: 'cajero-9' });
    expect(rechazoDe({ sello })).toBe('ANULACION_NO_PERMITIDA');
  });

  it('no puede anular uno suyo que ya no es el ultimo', () => {
    const sello = unSelloParaAnular({ id: 'sello-2' });
    expect(rechazoDe({ sello })).toBe('ANULACION_NO_PERMITIDA');
  });

  it('los tres casos dan el mismo codigo: no se filtra de quien es cada sello', () => {
    const ajeno = rechazoDe({ sello: unSelloParaAnular({ usuario_id: 'cajero-9' }) });
    const viejo = rechazoDe({
      sello: unSelloParaAnular({ creado_el: new Date(AHORA.getTime() - 10 * MINUTO) }),
    });
    const noEsElUltimo = rechazoDe({ sello: unSelloParaAnular({ id: 'sello-2' }) });
    expect([ajeno, viejo, noEsElUltimo]).toEqual([
      'ANULACION_NO_PERMITIDA',
      'ANULACION_NO_PERMITIDA',
      'ANULACION_NO_PERMITIDA',
    ]);
  });
});

describe('decidirAnulacion · el supervisor no tiene esos limites', () => {
  const comoSupervisor = {
    turno: TURNO_DE_SUPERVISOR,
    asignacion: {
      usuario_id: TURNO_DE_SUPERVISOR.usuario_id,
      local_id: LOCAL.id,
      activo: true,
    },
  };

  it('anula un sello de otro cajero', () => {
    expect(
      rechazoDe({ ...comoSupervisor, sello: unSelloParaAnular({ usuario_id: 'otro' }) }),
    ).toBe('anulacion aceptada');
  });

  it('anula uno de hace tres dias', () => {
    const sello = unSelloParaAnular({
      usuario_id: 'otro',
      creado_el: new Date(AHORA.getTime() - 3 * 24 * 3_600_000),
    });
    expect(rechazoDe({ ...comoSupervisor, sello })).toBe('anulacion aceptada');
  });

  it('el dueño con turno abierto puede lo mismo', () => {
    const turno = {
      ...TURNO_DE_SUPERVISOR,
      usuario_id: 'dueno-1',
      rol: 'dueno' as const,
    };
    expect(
      rechazoDe({
        turno,
        asignacion: { usuario_id: 'dueno-1', local_id: LOCAL.id, activo: true },
        sello: unSelloParaAnular({ usuario_id: 'otro' }),
      }),
    ).toBe('anulacion aceptada');
  });
});

describe('decidirAnulacion · lo que no se anula nunca', () => {
  it.each([
    ['SELLO_NO_ENCONTRADO', 'el sello no existe', { sello: null }],
    [
      'SELLO_NO_ENCONTRADO',
      'el sello es de otra sucursal',
      { sello: unSelloParaAnular({ local_id: 'local-9' }) },
    ],
    [
      'SELLO_YA_ANULADO',
      'ya estaba anulado',
      { sello: unSelloParaAnular({ anulado: true }) },
    ],
    [
      'SELLO_YA_CANJEADO',
      'el premio que lo incluia ya se entrego',
      { sello: unSelloParaAnular({ tarjeta_estado: 'canjeada' as const }) },
    ],
    [
      'DISPOSITIVO_REVOCADO',
      'la tablet fue revocada',
      { dispositivo: { id: 'tablet-1', local_id: LOCAL.id, revocado_el: AHORA } },
    ],
    ['TURNO_CERRADO', 'nadie tiene turno abierto', { turno: null }],
    // No deberia poder pasar —si hay sello, hay tarjeta— pero si la lectura
    // devolviera algo incoherente, no se anula nada.
    ['SELLO_NO_ENCONTRADO', 'el sello no trae su tarjeta', { tarjeta: null }],
  ] as const)('%s cuando %s', (esperado, _caso, cambios) => {
    expect(rechazoDe(cambios)).toBe(esperado);
  });
});

describe('decidirAnulacion · el efecto', () => {
  it('marca el sello y deja el turno desde el que se anulo (INV-17)', () => {
    const efecto = efectoDe();
    expect(efecto.sello_id).toBe('sello-3');
    expect(efecto.anulado_turno_id).toBe(TURNO.id);
  });

  it('dice como queda la tarjeta: un sello menos', () => {
    expect(efectoDe().aviso).toEqual({
      nombre: CLIENTE.nombre,
      progreso: 2,
      faltan: PROGRAMA.sellos_requeridos - 2,
      completa: false,
    });
  });

  it('una tarjeta completa deja de estarlo al anular', () => {
    const sellos = unosSellos(PROGRAMA.sellos_requeridos, {
      hasta: new Date(AHORA.getTime() - MINUTO),
    });
    const ultimo = sellos[sellos.length - 1];
    const sello = unSelloParaAnular({ id: ultimo?.id ?? 'sello-10' });
    const efecto = efectoDe({
      sello,
      tarjeta: unaTarjetaEnCurso({ sellos }),
      ultimoSelloDelUsuario: ultimo ?? null,
    });
    expect(efecto.aviso).toMatchObject({ progreso: 9, faltan: 1, completa: false });
  });
});
