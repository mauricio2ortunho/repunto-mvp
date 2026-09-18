import { describe, expect, it } from 'vitest';

import { codigoDeVentana, ventanaDe } from './codigo';
import type { CodigoDeError } from './errores';
import {
  AHORA,
  CLIENTE,
  CONDICION,
  LOCAL,
  NEGOCIO,
  PROGRAMA,
  SEMILLA,
  TURNO,
  codigoValido,
  unaEntradaDeSellado,
  unaTarjeta,
  unaTarjetaEnCurso,
  unosSellos,
} from './pruebas/escenario';
import { type EntradaDeSellado, decidirSello } from './sellado';

const HORA = 3_600_000;

function rechazoDe(cambios: Partial<EntradaDeSellado>): CodigoDeError | 'sello aceptado' {
  const decision = decidirSello(unaEntradaDeSellado(cambios));
  return decision.tipo === 'rechazado' ? decision.codigo : 'sello aceptado';
}

function efectoDe(cambios: Partial<EntradaDeSellado> = {}) {
  const decision = decidirSello(unaEntradaDeSellado(cambios));
  if (decision.tipo !== 'sellar') {
    throw new Error(`Se esperaba sellar y fue rechazado por ${decision.codigo}`);
  }
  return decision.efecto;
}

describe('decidirSello · cada validacion tiene su caso que la dispara', () => {
  it.each([
    [
      'DISPOSITIVO_REVOCADO',
      'la tablet fue revocada',
      { dispositivo: { id: 'tablet-1', local_id: LOCAL.id, revocado_el: AHORA } },
    ],
    ['TURNO_CERRADO', 'el turno ya se cerro', { turno: { ...TURNO, cerrado_el: AHORA } }],
    [
      'LOCAL_NO_AUTORIZADO',
      'el local esta dado de baja',
      { local: { ...LOCAL, activo: false } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el cajero no tiene ese local asignado',
      { asignacion: null },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'la asignacion del cajero esta dada de baja',
      { asignacion: { usuario_id: TURNO.usuario_id, local_id: LOCAL.id, activo: false } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el turno es de otra tablet',
      { turno: { ...TURNO, dispositivo_id: 'tablet-9' } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el local no es el de la tablet',
      { local: { ...LOCAL, id: 'local-9' } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el local es de otro negocio',
      { local: { ...LOCAL, negocio_id: 'negocio-b' } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'el turno declara otro local que el de su tablet',
      { turno: { ...TURNO, local_id: 'local-9' } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'la asignacion es de otro usuario',
      { asignacion: { usuario_id: 'cajero-9', local_id: LOCAL.id, activo: true } },
    ],
    [
      'LOCAL_NO_AUTORIZADO',
      'la asignacion es para otro local',
      { asignacion: { usuario_id: TURNO.usuario_id, local_id: 'local-9', activo: true } },
    ],
    [
      'NEGOCIO_SUSPENDIDO',
      'el negocio esta suspendido',
      { negocio: { ...NEGOCIO, estado: 'suspendido' as const } },
    ],
    ['CODIGO_INVALIDO', 'el codigo no tiene la forma esperada', { codigo: '418329' }],
    [
      'CODIGO_INVALIDO',
      'el prefijo es de otro cliente',
      { codigo: `AB2CD-${codigoDeVentana(SEMILLA, ventanaDe(AHORA))}` },
    ],
    [
      'CODIGO_INVALIDO',
      'el TOTP es de tres ventanas atras',
      {
        codigo: `${CLIENTE.codigo_publico}-${codigoDeVentana(SEMILLA, ventanaDe(AHORA) - 3)}`,
      },
    ],
    ['CODIGO_YA_USADO', 'esa ventana ya se consumio', { codigoYaUsado: true }],
    [
      'PROMO_NO_CONFIGURADA',
      'el negocio no tiene condicion vigente',
      { condicionVigente: null },
    ],
    [
      'PROMO_NO_CONFIGURADA',
      'no hay programa vigente y el cliente no tiene tarjeta',
      { programaVigente: null },
    ],
    [
      'DEMASIADO_PRONTO',
      'el ultimo sello fue hace menos de las horas del programa',
      {
        ultimoSelloDelCliente: {
          id: 'sello-previo',
          tarjeta_id: 'tarjeta-1',
          creado_el: new Date(AHORA.getTime() - 3 * HORA),
          anulado: false,
        },
      },
    ],
    [
      'TARJETA_VENCIDA',
      'la tarjeta vencio ayer y el cron todavia no paso',
      {
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({
            reloj_desde: new Date(AHORA.getTime() - 40 * 24 * HORA),
            vence_el: new Date(AHORA.getTime() - 24 * HORA),
          }),
        }),
      },
    ],
    [
      'TARJETA_COMPLETA',
      'la tarjeta ya llego a los sellos que pide el programa',
      { enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos) }) },
    ],
  ] as const)('%s cuando %s', (esperado, _caso, cambios) => {
    expect(rechazoDe(cambios)).toBe(esperado);
  });
});

describe('decidirSello · cada validacion tiene su caso que la deja pasar', () => {
  it.each([
    ['la caja esta en orden', {}],
    [
      'el TOTP es de la ventana anterior: el cliente tardo en dictarlo',
      {
        codigo: `${CLIENTE.codigo_publico}-${codigoDeVentana(SEMILLA, ventanaDe(AHORA) - 1)}`,
      },
    ],
    [
      'el cajero tipeo en minusculas y sin guion',
      { codigo: codigoValido().toLowerCase().replace('-', ' ') },
    ],
    [
      'paso el intervalo minimo justo',
      {
        ultimoSelloDelCliente: {
          id: 'sello-previo',
          tarjeta_id: 'tarjeta-1',
          creado_el: new Date(AHORA.getTime() - PROGRAMA.horas_entre_sellos * HORA),
          anulado: false,
        },
      },
    ],
    [
      'la tarjeta vence hoy: el dia del vencimiento todavia se sella',
      {
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({
            reloj_desde: new Date(AHORA.getTime() - 20 * 24 * HORA),
            vence_el: new Date('2026-09-19T03:59:59.999Z'),
          }),
        }),
      },
    ],
    [
      'no hay programa vigente pero la tarjeta en curso trae el suyo',
      {
        programaVigente: null,
        enCurso: unaTarjetaEnCurso(),
      },
    ],
    [
      'los sellos anulados no cuentan para completarla',
      {
        enCurso: unaTarjetaEnCurso({
          sellos: unosSellos(PROGRAMA.sellos_requeridos - 1, { anulados: 3 }),
        }),
      },
    ],
  ] as const)('sella cuando %s', (_caso, cambios) => {
    expect(rechazoDe(cambios)).toBe('sello aceptado');
  });
});

describe('decidirSello · el efecto', () => {
  it('abre la tarjeta cuando el cliente no tiene ninguna, y arranca el reloj', () => {
    const efecto = efectoDe();
    expect(efecto.tarjeta_id).toBeNull();
    expect(efecto.abrirTarjeta).toEqual({
      programa_id: PROGRAMA.id,
      negocio_id: NEGOCIO.id,
      local_alta_id: LOCAL.id,
    });
    expect(efecto.arrancarReloj?.reloj_desde).toEqual(AHORA);
  });

  it('sella sobre la tarjeta en curso sin volver a tocar el reloj', () => {
    const efecto = efectoDe({ enCurso: unaTarjetaEnCurso() });
    expect(efecto.tarjeta_id).toBe('tarjeta-1');
    expect(efecto.abrirTarjeta).toBeNull();
    expect(efecto.arrancarReloj).toBeNull();
  });

  it('arranca el reloj si la tarjeta existia pero todavia no tenia sellos', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({
        sellos: [],
        tarjeta: unaTarjeta({ reloj_desde: null }),
      }),
    });
    expect(efecto.arrancarReloj?.reloj_desde).toEqual(AHORA);
  });

  it('adjunta la condicion vigente y el turno, y el local sale de la caja', () => {
    expect(efectoDe().sello).toEqual({
      negocio_id: NEGOCIO.id,
      local_id: LOCAL.id,
      turno_id: TURNO.id,
      condicion_id: CONDICION.id,
    });
  });

  it('dice lo que el cajero canta en voz alta', () => {
    const efecto = efectoDe({ enCurso: unaTarjetaEnCurso({ sellos: unosSellos(3) }) });
    expect(efecto.aviso).toEqual({
      nombre: 'Juan',
      progreso: 4,
      faltan: 6,
      completa: false,
    });
  });

  it('avisa cuando el sello completa la tarjeta', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos - 1) }),
    });
    expect(efecto.aviso).toMatchObject({ progreso: 10, faltan: 0, completa: true });
  });
});

describe('decidirSello · vencimiento con el primer sello (INV-13)', () => {
  it('borde: primer sello el 31 de enero, vence el 28 de febrero al fin del dia', () => {
    const ahora = new Date('2026-01-31T18:00:00.000Z'); // 14:00 en La Paz
    const efecto = efectoDe({ ahora, codigo: codigoValido(ahora) });
    expect(efecto.arrancarReloj?.vence_el?.toISOString()).toBe(
      '2026-03-01T03:59:59.999Z',
    );
  });

  it('borde: primer sello a las 23:59 hora La Paz, cuenta como ese dia', () => {
    const ahora = new Date('2026-02-01T03:59:00.000Z'); // 31/1 23:59 en La Paz
    const efecto = efectoDe({ ahora, codigo: codigoValido(ahora) });
    expect(efecto.arrancarReloj?.reloj_desde).toEqual(ahora);
    expect(efecto.arrancarReloj?.vence_el?.toISOString()).toBe(
      '2026-03-01T03:59:59.999Z',
    );
  });

  it('un programa sin vigencia no vence', () => {
    const efecto = efectoDe({ programaVigente: { ...PROGRAMA, vigencia_meses: null } });
    expect(efecto.arrancarReloj?.vence_el).toBeNull();
  });
});

describe('decidirSello · el intervalo se mide por cliente y negocio', () => {
  it('rechaza aunque el ultimo sello sea de la tarjeta anterior, ya canjeada', () => {
    const codigo = rechazoDe({
      enCurso: unaTarjetaEnCurso({ sellos: [] }),
      ultimoSelloDelCliente: {
        id: 'sello-de-la-tarjeta-vieja',
        tarjeta_id: 'tarjeta-canjeada',
        creado_el: new Date(AHORA.getTime() - HORA),
        anulado: false,
      },
    });
    expect(codigo).toBe('DEMASIADO_PRONTO');
  });

  it('usa las horas del programa de la tarjeta en curso, no las del vigente (INV-6)', () => {
    const hace6Horas = new Date(AHORA.getTime() - 6 * HORA);
    const codigo = rechazoDe({
      programaVigente: { ...PROGRAMA, id: 'programa-v2', horas_entre_sellos: 4 },
      enCurso: unaTarjetaEnCurso({
        programa: { ...PROGRAMA, horas_entre_sellos: 12 },
        sellos: unosSellos(2, { hasta: hace6Horas }),
      }),
      ultimoSelloDelCliente: {
        id: 'sello-2',
        tarjeta_id: 'tarjeta-1',
        creado_el: hace6Horas,
        anulado: false,
      },
    });
    expect(codigo).toBe('DEMASIADO_PRONTO');
  });
});

describe('decidirSello · no deja enumerar clientes', () => {
  it('un prefijo que no existe y un TOTP equivocado dan el mismo error', () => {
    const prefijoAjeno = rechazoDe({
      codigo: `AB2CD-${codigoDeVentana(SEMILLA, ventanaDe(AHORA))}`,
    });
    const totpAjeno = rechazoDe({
      codigo: `${CLIENTE.codigo_publico}-000000`,
    });
    expect(prefijoAjeno).toBe('CODIGO_INVALIDO');
    expect(totpAjeno).toBe('CODIGO_INVALIDO');
  });
});
