import { describe, expect, it } from 'vitest';

import { type EntradaDeAlta, decidirAlta, decidirDescarte } from './alta';
import type { CodigoDeError } from './errores';
import {
  AHORA,
  CLIENTE,
  CONDICION,
  LOCAL,
  NEGOCIO,
  PROGRAMA,
  REGISTRO,
  TURNO,
  unaEntradaDeAlta,
  unaTarjeta,
  unaTarjetaEnCurso,
  unosSellos,
} from './pruebas/escenario';

const MINUTO = 60_000;
const HORA = 3_600_000;

function rechazoDe(cambios: Partial<EntradaDeAlta>): CodigoDeError | 'alta aceptada' {
  const decision = decidirAlta(unaEntradaDeAlta(cambios));
  return decision.tipo === 'rechazado' ? decision.codigo : 'alta aceptada';
}

function efectoDe(cambios: Partial<EntradaDeAlta> = {}) {
  const decision = decidirAlta(unaEntradaDeAlta(cambios));
  if (decision.tipo !== 'alta') {
    throw new Error(`Se esperaba el alta y fue rechazada por ${decision.codigo}`);
  }
  return decision.efecto;
}

describe('decidirAlta · lo que lo frena', () => {
  it.each([
    ['REGISTRO_NO_ENCONTRADO', 'no hay registro con ese id', { registro: null }],
    [
      'REGISTRO_NO_ENCONTRADO',
      'el registro es de otra sucursal',
      { registro: { ...REGISTRO, local_id: 'local-9' } },
    ],
    [
      'REGISTRO_NO_ENCONTRADO',
      'el registro vencio: el cliente ya se fue',
      { registro: { ...REGISTRO, expira_el: new Date(AHORA.getTime() - MINUTO) } },
    ],
    [
      'REGISTRO_YA_RESUELTO',
      'otro cajero lo confirmo primero',
      { registro: { ...REGISTRO, estado: 'confirmado' as const } },
    ],
    [
      'REGISTRO_YA_RESUELTO',
      'alguien lo descarto',
      { registro: { ...REGISTRO, estado: 'descartado' as const } },
    ],
    [
      'PROMO_NO_CONFIGURADA',
      'el negocio no tiene programa vigente',
      { programaVigente: null },
    ],
    [
      'PROMO_NO_CONFIGURADA',
      'al sellar, tampoco hay condicion vigente',
      { sellar: true, condicionVigente: null },
    ],
    [
      'DISPOSITIVO_REVOCADO',
      'la tablet fue revocada',
      { dispositivo: { id: 'tablet-1', local_id: LOCAL.id, revocado_el: AHORA } },
    ],
    ['TURNO_CERRADO', 'nadie tiene turno abierto', { turno: null }],
    [
      'LOCAL_NO_AUTORIZADO',
      'el cajero no esta asignado a ese local',
      { asignacion: null },
    ],
  ] as const)('%s cuando %s', (esperado, _caso, cambios) => {
    expect(rechazoDe(cambios)).toBe(esperado);
  });

  it('al confirmar y sellar, valen las reglas del sello: intervalo minimo', () => {
    const codigo = rechazoDe({
      sellar: true,
      clienteExistente: CLIENTE,
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(2) }),
      ultimoSelloDelCliente: {
        id: 'sello-previo',
        tarjeta_id: 'tarjeta-1',
        creado_el: new Date(AHORA.getTime() - HORA),
        anulado: false,
      },
    });
    expect(codigo).toBe('DEMASIADO_PRONTO');
  });

  it('al confirmar y sellar, valen las reglas del sello: tarjeta completa', () => {
    const codigo = rechazoDe({
      sellar: true,
      clienteExistente: CLIENTE,
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos) }),
    });
    expect(codigo).toBe('TARJETA_COMPLETA');
  });
});

describe('decidirAlta · cliente nuevo', () => {
  it('crea la cuenta con el telefono y el nombre del registro', () => {
    const efecto = efectoDe();
    expect(efecto.crearCliente).toEqual({
      telefono: REGISTRO.telefono,
      nombre: REGISTRO.nombre,
    });
    expect(efecto.cliente_id).toBeNull();
  });

  it('el codigo publico y la semilla no salen del dominio', () => {
    // Son secretos: los genera quien ejecuta, con reintento ante colision.
    expect(JSON.stringify(efectoDe())).not.toContain('codigo_publico');
    expect(JSON.stringify(efectoDe())).not.toContain('semilla');
  });

  it('solo confirmar abre la tarjeta y no otorga sello', () => {
    const efecto = efectoDe();
    expect(efecto.sello).toBeNull();
    expect(efecto.arrancarReloj).toBeNull();
    expect(efecto.abrirTarjeta).toEqual({
      programa_id: PROGRAMA.id,
      negocio_id: NEGOCIO.id,
      local_alta_id: LOCAL.id,
    });
    expect(efecto.aviso).toEqual({
      nombre: REGISTRO.nombre,
      progreso: 0,
      faltan: PROGRAMA.sellos_requeridos,
      completa: false,
      premio: PROGRAMA.premio,
      sello: false,
    });
  });

  it('confirmar y sellar abre la tarjeta, sella y arranca el reloj', () => {
    const efecto = efectoDe({ sellar: true });
    expect(efecto.abrirTarjeta).not.toBeNull();
    expect(efecto.sello).toEqual({
      negocio_id: NEGOCIO.id,
      local_id: LOCAL.id,
      turno_id: TURNO.id,
      condicion_id: CONDICION.id,
    });
    expect(efecto.arrancarReloj?.reloj_desde).toEqual(AHORA);
    expect(efecto.aviso).toMatchObject({ progreso: 1, faltan: 9, sello: true });
  });
});

describe('decidirAlta · cliente que ya existia', () => {
  it('no crea otra cuenta: abre una tarjeta mas', () => {
    const efecto = efectoDe({ clienteExistente: CLIENTE });
    expect(efecto.crearCliente).toBeNull();
    expect(efecto.cliente_id).toBe(CLIENTE.id);
    expect(efecto.abrirTarjeta).not.toBeNull();
  });

  it('lo saluda con el nombre de su cuenta, no con el que acaba de tipear', () => {
    const efecto = efectoDe({
      clienteExistente: { ...CLIENTE, nombre: 'Juan Carlos' },
      registro: { ...REGISTRO, nombre: 'juancito' },
    });
    expect(efecto.aviso.nombre).toBe('Juan Carlos');
  });

  it('si ya tiene tarjeta en este negocio, no abre otra (INV-11)', () => {
    const efecto = efectoDe({
      clienteExistente: CLIENTE,
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(3) }),
    });
    expect(efecto.abrirTarjeta).toBeNull();
    expect(efecto.aviso).toMatchObject({ progreso: 3, faltan: 7 });
  });

  it('si la que tiene vencio, la cierra y abre una nueva', () => {
    const efecto = efectoDe({
      clienteExistente: CLIENTE,
      enCurso: unaTarjetaEnCurso({
        tarjeta: unaTarjeta({
          reloj_desde: new Date(AHORA.getTime() - 40 * 24 * HORA),
          vence_el: new Date(AHORA.getTime() - 24 * HORA),
        }),
        sellos: unosSellos(3),
      }),
    });
    expect(efecto.vencerTarjeta).toBe('tarjeta-1');
    expect(efecto.abrirTarjeta).not.toBeNull();
    expect(efecto.aviso.progreso).toBe(0);
  });

  it('confirmar y sellar sobre la tarjeta que ya tiene', () => {
    const efecto = efectoDe({
      sellar: true,
      clienteExistente: CLIENTE,
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(3) }),
    });
    expect(efecto.abrirTarjeta).toBeNull();
    expect(efecto.aviso).toMatchObject({ progreso: 4, sello: true });
  });
});

describe('decidirDescarte · el cajero saca de la lista al que se fue', () => {
  function descarte(cambios: Partial<EntradaDeAlta> = {}) {
    const entrada = unaEntradaDeAlta(cambios);
    return decidirDescarte({
      ahora: entrada.ahora,
      negocio: entrada.negocio,
      local: entrada.local,
      dispositivo: entrada.dispositivo,
      turno: entrada.turno,
      asignacion: entrada.asignacion,
      registro: entrada.registro,
    });
  }

  it('lo marca, con el turno que lo descarto', () => {
    const decision = descarte();
    if (decision.tipo !== 'descartar') throw new Error('Se esperaba descartar.');
    expect(decision.efecto).toEqual({
      registro_id: REGISTRO.id,
      resuelto_turno_id: TURNO.id,
    });
  });

  it.each([
    ['REGISTRO_NO_ENCONTRADO', 'no existe', { registro: null }],
    [
      'REGISTRO_NO_ENCONTRADO',
      'es de otra sucursal',
      { registro: { ...REGISTRO, local_id: 'local-9' } },
    ],
    [
      'REGISTRO_NO_ENCONTRADO',
      'ya vencio',
      { registro: { ...REGISTRO, expira_el: new Date(AHORA.getTime() - MINUTO) } },
    ],
    [
      'REGISTRO_YA_RESUELTO',
      'ya lo habian confirmado',
      { registro: { ...REGISTRO, estado: 'confirmado' as const } },
    ],
    ['TURNO_CERRADO', 'nadie tiene turno abierto', { turno: null }],
  ] as const)('%s cuando %s', (esperado, _caso, cambios) => {
    const decision = descarte(cambios);
    expect(decision.tipo === 'rechazado' ? decision.codigo : 'descartado').toBe(esperado);
  });
});
