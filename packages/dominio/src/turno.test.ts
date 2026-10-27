import { describe, expect, it } from 'vitest';

import {
  type EntradaDeApertura,
  PIN_EQUIVOCADOS_PARA_BLOQUEAR,
  decidirApertura,
  finDelTramoDePin,
} from './turno';
import {
  AHORA,
  ASIGNACION,
  DISPOSITIVO,
  LOCAL,
  NEGOCIO,
  TURNO,
} from './pruebas/escenario';

const MARTA = {
  id: ASIGNACION.usuario_id,
  negocio_id: NEGOCIO.id,
  rol: 'cajero' as const,
  activo: true,
  tiene_pin: true,
};

const ENTRADA: EntradaDeApertura = {
  ahora: AHORA,
  negocio: NEGOCIO,
  local: LOCAL,
  dispositivo: DISPOSITIVO,
  usuario: MARTA,
  asignacion: ASIGNACION,
  equivocados: 0,
  pinCorrecto: true,
  turnoAbierto: null,
};

function codigoDe(cambios: Partial<EntradaDeApertura>): string {
  const decision = decidirApertura({ ...ENTRADA, ...cambios });
  return decision.tipo === 'rechazado' ? decision.codigo : decision.tipo;
}

describe('decidirApertura · el camino feliz', () => {
  it('con el PIN correcto abre el turno en la tablet y el local de la tablet', () => {
    expect(decidirApertura(ENTRADA)).toEqual({
      tipo: 'abrir',
      efecto: {
        dispositivo_id: DISPOSITIVO.id,
        usuario_id: MARTA.id,
        local_id: LOCAL.id,
        cerrar_turno: null,
      },
    });
  });

  it('si la tablet tenia el turno de otro, lo cierra: es el cambio de cajero', () => {
    const deOtro = { ...TURNO, id: 'turno-de-diego', usuario_id: 'diego' };
    const decision = decidirApertura({ ...ENTRADA, turnoAbierto: deOtro });
    // Cambio de cajero en un turno vivo: se cierra ahora.
    expect(decision.tipo === 'abrir' && decision.efecto.cerrar_turno).toEqual({
      id: 'turno-de-diego',
      cerrado_el: AHORA,
    });
  });

  it('si el turno abierto ya era suyo, lo devuelve: el doble toque no abre otro', () => {
    expect(decidirApertura({ ...ENTRADA, turnoAbierto: TURNO })).toEqual({
      tipo: 'ya_abierto',
      turno_id: TURNO.id,
    });
  });
});

describe('decidirApertura · el turno agotado por inactividad', () => {
  const agotadoDe = (usuario_id: string) => ({
    ...TURNO,
    id: 'turno-de-la-mañana',
    usuario_id,
    ultima_actividad: new Date(AHORA.getTime() - 90 * 60_000),
  });

  it('del mismo usuario no se recupera: se cierra y se abre otro', () => {
    const decision = decidirApertura({ ...ENTRADA, turnoAbierto: agotadoDe(MARTA.id) });
    expect(decision.tipo).toBe('abrir');
  });

  it('se cierra con la hora en que se agoto, no con la de ahora', () => {
    const decision = decidirApertura({ ...ENTRADA, turnoAbierto: agotadoDe(MARTA.id) });
    expect(decision.tipo === 'abrir' && decision.efecto.cerrar_turno).toEqual({
      id: 'turno-de-la-mañana',
      // Ultima actividad hace 90 minutos, mas los 60: hace media hora.
      cerrado_el: new Date(AHORA.getTime() - 30 * 60_000),
    });
  });

  it('de otro usuario, igual: se cierra a la hora en que se agoto', () => {
    const decision = decidirApertura({ ...ENTRADA, turnoAbierto: agotadoDe('diego') });
    expect(decision.tipo === 'abrir' && decision.efecto.cerrar_turno?.cerrado_el).toEqual(
      new Date(AHORA.getTime() - 30 * 60_000),
    );
  });

  it('el PIN equivocado no cierra nada: el rechazo va antes', () => {
    expect(codigoDe({ turnoAbierto: agotadoDe(MARTA.id), pinCorrecto: false })).toBe(
      'PIN_INCORRECTO',
    );
  });
});

describe('decidirApertura · cada validacion tiene su caso', () => {
  it.each([
    [
      'DISPOSITIVO_REVOCADO',
      'la tablet fue revocada',
      { dispositivo: { ...DISPOSITIVO, revocado_el: AHORA } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el local esta dado de baja',
      { local: { ...LOCAL, activo: false } },
    ],
    [
      'NEGOCIO_SUSPENDIDO',
      'el negocio esta suspendido',
      { negocio: { ...NEGOCIO, estado: 'suspendido' as const } },
    ],
    ['USUARIO_NO_HABILITADO', 'el usuario no existe', { usuario: null }],
    [
      'USUARIO_NO_HABILITADO',
      'el usuario es de otro negocio',
      { usuario: { ...MARTA, negocio_id: 'otro-negocio' } },
    ],
    [
      'USUARIO_NO_HABILITADO',
      'al usuario lo dieron de baja',
      { usuario: { ...MARTA, activo: false } },
    ],
    [
      'USUARIO_NO_HABILITADO',
      'el usuario no tiene PIN',
      { usuario: { ...MARTA, tiene_pin: false } },
    ],
    [
      'USUARIO_NO_HABILITADO',
      'no esta asignado a este local (INV-3)',
      { asignacion: null },
    ],
    [
      'USUARIO_NO_HABILITADO',
      'su asignacion a este local se dio de baja',
      { asignacion: { ...ASIGNACION, activo: false } },
    ],
    [
      'USUARIO_NO_HABILITADO',
      'la asignacion es de otro local',
      { asignacion: { ...ASIGNACION, local_id: 'otro-local' } },
    ],
    ['PIN_INCORRECTO', 'el PIN no coincide', { pinCorrecto: false }],
  ])('%s cuando %s', (codigo, _caso, cambios) => {
    expect(codigoDe(cambios)).toBe(codigo);
  });
});

describe('decidirApertura · el bloqueo por PIN equivocados', () => {
  it('con nueve equivocados todavia deja probar', () => {
    expect(codigoDe({ equivocados: PIN_EQUIVOCADOS_PARA_BLOQUEAR - 1 })).toBe('abrir');
  });

  it('con diez, bloquea hasta el fin del tramo', () => {
    const decision = decidirApertura({
      ...ENTRADA,
      equivocados: PIN_EQUIVOCADOS_PARA_BLOQUEAR,
    });
    expect(decision).toEqual({
      tipo: 'rechazado',
      codigo: 'PIN_BLOQUEADO',
      detalle: { bloqueado_hasta: finDelTramoDePin(AHORA) },
    });
  });

  it('bloqueado, ni el PIN correcto entra: el bloqueo va antes que el PIN', () => {
    expect(
      codigoDe({ equivocados: PIN_EQUIVOCADOS_PARA_BLOQUEAR, pinCorrecto: true }),
    ).toBe('PIN_BLOQUEADO');
  });

  it('un usuario que no puede abrir turno no se entera de si esta bloqueado', () => {
    expect(
      codigoDe({
        usuario: { ...MARTA, activo: false },
        equivocados: PIN_EQUIVOCADOS_PARA_BLOQUEAR,
      }),
    ).toBe('USUARIO_NO_HABILITADO');
  });
});

describe('finDelTramoDePin', () => {
  it('termina en el proximo cuarto de hora', () => {
    expect(finDelTramoDePin(new Date('2026-03-10T14:07:30Z')).toISOString()).toBe(
      '2026-03-10T14:15:00.000Z',
    );
  });

  it('justo en el borde ya es el tramo siguiente', () => {
    expect(finDelTramoDePin(new Date('2026-03-10T14:15:00Z')).toISOString()).toBe(
      '2026-03-10T14:30:00.000Z',
    );
  });

  it('el ultimo tramo del dia termina a medianoche UTC', () => {
    expect(finDelTramoDePin(new Date('2026-03-10T23:59:59.999Z')).toISOString()).toBe(
      '2026-03-11T00:00:00.000Z',
    );
  });
});
