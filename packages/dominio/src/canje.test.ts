import { describe, expect, it } from 'vitest';

import { type EntradaDeCanje, decidirCanje } from './canje';
import type { CodigoDeError } from './errores';
import { codigoDeVentana, ventanaDe } from './codigo';
import {
  AHORA,
  CLIENTE,
  LOCAL,
  NEGOCIO,
  PROGRAMA,
  SEMILLA,
  TURNO,
  unaEntradaDeCanje,
  unaTarjeta,
  unaTarjetaEnCurso,
  unosSellos,
} from './pruebas/escenario';

const HORA = 3_600_000;
const COMPLETA = unosSellos(PROGRAMA.sellos_requeridos);

function rechazoDe(cambios: Partial<EntradaDeCanje>): CodigoDeError | 'canje aceptado' {
  const decision = decidirCanje(unaEntradaDeCanje(cambios));
  return decision.tipo === 'rechazado' ? decision.codigo : 'canje aceptado';
}

function efectoDe(cambios: Partial<EntradaDeCanje> = {}) {
  const decision = decidirCanje(unaEntradaDeCanje(cambios));
  if (decision.tipo !== 'canjear') {
    throw new Error(`Se esperaba canjear y fue rechazado por ${decision.codigo}`);
  }
  return decision.efecto;
}

describe('decidirCanje · lo que lo frena', () => {
  it.each([
    ['TARJETA_INCOMPLETA', 'el cliente no tiene tarjeta', { enCurso: null }],
    [
      'TARJETA_INCOMPLETA',
      'le falta un sello',
      {
        enCurso: unaTarjetaEnCurso({
          sellos: unosSellos(PROGRAMA.sellos_requeridos - 1),
        }),
      },
    ],
    [
      'TARJETA_INCOMPLETA',
      'los sellos que le faltan estan anulados',
      {
        enCurso: unaTarjetaEnCurso({
          sellos: unosSellos(PROGRAMA.sellos_requeridos - 2, { anulados: 2 }),
        }),
      },
    ],
    [
      'TARJETA_INCOMPLETA',
      'la tarjeta ya fue canjeada',
      {
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({ estado: 'canjeada' }),
          sellos: COMPLETA,
        }),
      },
    ],
    [
      'TARJETA_VENCIDA',
      'vencio ayer',
      {
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({
            reloj_desde: new Date(AHORA.getTime() - 40 * 24 * HORA),
            vence_el: new Date(AHORA.getTime() - 24 * HORA),
          }),
          sellos: COMPLETA,
        }),
      },
    ],
    [
      'CANJE_EN_OTRO_LOCAL',
      'el negocio solo canjea donde se abrio la tarjeta',
      {
        negocio: { ...NEGOCIO, canje_cualquier_local: false },
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({ local_alta_id: 'local-9' }),
          sellos: COMPLETA,
        }),
      },
    ],
    [
      'PROMO_NO_CONFIGURADA',
      'no hay programa vigente con el cual abrir la siguiente',
      { programaVigente: null },
    ],
    [
      'NEGOCIO_SUSPENDIDO',
      'el negocio esta suspendido',
      {
        negocio: { ...NEGOCIO, estado: 'suspendido' as const },
      },
    ],
    [
      'DISPOSITIVO_REVOCADO',
      'la tablet fue revocada',
      {
        dispositivo: { id: 'tablet-1', local_id: LOCAL.id, revocado_el: AHORA },
      },
    ],
    ['TURNO_CERRADO', 'el turno ya se cerro', { turno: { ...TURNO, cerrado_el: AHORA } }],
    ['TURNO_CERRADO', 'nadie abrio turno en esa tablet', { turno: null }],
    ['CODIGO_INVALIDO', 'el codigo no tiene la forma esperada', { codigo: '418329' }],
    ['CODIGO_INVALIDO', 'el prefijo no resuelve a ningun cliente', { cliente: null }],
    [
      'CODIGO_INVALIDO',
      'el TOTP es de tres ventanas atras',
      {
        codigo: `${CLIENTE.codigo_publico}-${codigoDeVentana(SEMILLA, ventanaDe(AHORA) - 3)}`,
      },
    ],
    ['CODIGO_YA_USADO', 'esa ventana ya se consumio al sellar', { codigoYaUsado: true }],
  ] as const)('%s cuando %s', (esperado, _caso, cambios) => {
    expect(rechazoDe(cambios)).toBe(esperado);
  });
});

describe('decidirCanje · lo que lo deja pasar', () => {
  it.each([
    ['la tarjeta esta completa y la caja en orden', {}],
    [
      'sobran sellos por encima de los que pide el programa',
      {
        enCurso: unaTarjetaEnCurso({
          sellos: unosSellos(PROGRAMA.sellos_requeridos + 2),
        }),
      },
    ],
    [
      'borde: se canjea el mismo dia del vencimiento',
      {
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({
            reloj_desde: new Date(AHORA.getTime() - 20 * 24 * HORA),
            vence_el: new Date('2026-09-19T03:59:59.999Z'),
          }),
          sellos: COMPLETA,
        }),
      },
    ],
    [
      'el negocio limita el canje y es el local donde se abrio',
      { negocio: { ...NEGOCIO, canje_cualquier_local: false } },
    ],
    [
      'el cliente muestra el codigo de la ventana anterior',
      {
        codigo: `${CLIENTE.codigo_publico}-${codigoDeVentana(SEMILLA, ventanaDe(AHORA) - 1)}`,
      },
    ],
  ] as const)('canjea cuando %s', (_caso, cambios) => {
    expect(rechazoDe(cambios)).toBe('canje aceptado');
  });
});

describe('decidirCanje · el efecto', () => {
  it('consume los sellos mas viejos y deja los mas nuevos como sobrantes', () => {
    const sellos = unosSellos(PROGRAMA.sellos_requeridos + 2);
    const efecto = efectoDe({ enCurso: unaTarjetaEnCurso({ sellos }) });

    expect(efecto.sellos_consumidos).toHaveLength(PROGRAMA.sellos_requeridos);
    expect(efecto.sobrantes).toEqual(['sello-11', 'sello-12']);
    // Los consumidos son anteriores a los sobrantes.
    const fecha = (id: string) =>
      sellos.find((sello) => sello.id === id)?.creado_el.getTime() ?? 0;
    const ultimoConsumido = Math.max(...efecto.sellos_consumidos.map(fecha));
    expect(ultimoConsumido).toBeLessThan(Math.min(...efecto.sobrantes.map(fecha)));
  });

  it('deja afuera los sellos anulados: no se consumen ni sobran', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({
        sellos: unosSellos(PROGRAMA.sellos_requeridos, { anulados: 2 }),
      }),
    });
    const anulados = ['sello-11', 'sello-12'];
    expect(efecto.sellos_consumidos).not.toEqual(expect.arrayContaining(anulados));
    expect(efecto.sobrantes).toEqual([]);
  });

  it('cierra la tarjeta vieja y copia su premio, que es la regla con la que junto', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({
        programa: { ...PROGRAMA, premio: 'Una torta' },
        sellos: COMPLETA,
      }),
      programaVigente: { ...PROGRAMA, id: 'programa-v2', premio: 'Un cafe chico' },
    });
    expect(efecto.tarjeta_id).toBe('tarjeta-1');
    expect(efecto.canje).toEqual({
      negocio_id: NEGOCIO.id,
      local_id: LOCAL.id,
      turno_id: TURNO.id,
      premio_texto: 'Una torta',
    });
  });

  it('la tarjeta nueva nace con el programa vigente al momento del canje', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({
        programa: { ...PROGRAMA, id: 'programa-v1' },
        sellos: COMPLETA,
      }),
      programaVigente: { ...PROGRAMA, id: 'programa-v2' },
    });
    expect(efecto.tarjetaNueva.programa_id).toBe('programa-v2');
    expect(efecto.tarjetaNueva.local_alta_id).toBe(LOCAL.id);
  });

  it('con sobrantes, el reloj arranca en el canje y no en el sello mas viejo (INV-14)', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos + 1) }),
    });
    expect(efecto.tarjetaNueva.reloj_desde).toEqual(AHORA);
    expect(efecto.tarjetaNueva.vence_el?.toISOString()).toBe('2026-10-19T03:59:59.999Z');
  });

  it('sin sobrantes, la tarjeta nueva nace vacia y sin reloj (INV-12 manda sobre INV-14)', () => {
    const efecto = efectoDe({ enCurso: unaTarjetaEnCurso({ sellos: COMPLETA }) });
    expect(efecto.sobrantes).toEqual([]);
    expect(efecto.tarjetaNueva.reloj_desde).toBeNull();
    expect(efecto.tarjetaNueva.vence_el).toBeNull();
  });

  it('con sobrantes y un programa sin vigencia, la nueva no vence', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos + 1) }),
      programaVigente: { ...PROGRAMA, vigencia_meses: null },
    });
    expect(efecto.tarjetaNueva.reloj_desde).toEqual(AHORA);
    expect(efecto.tarjetaNueva.vence_el).toBeNull();
  });
});

describe('decidirCanje · lo que el cajero dice al entregar', () => {
  it('trae el nombre, el premio y cuantos sellos quedan para la proxima', () => {
    const efecto = efectoDe({
      enCurso: unaTarjetaEnCurso({
        sellos: unosSellos(PROGRAMA.sellos_requeridos + 2),
      }),
    });
    expect(efecto.aviso).toEqual({
      nombre: 'Juan',
      premio: PROGRAMA.premio,
      sobrantes: 2,
    });
  });

  it('CANJE_EN_OTRO_LOCAL dice en que local se abrio la tarjeta', () => {
    const decision = decidirCanje(
      unaEntradaDeCanje({
        negocio: { ...NEGOCIO, canje_cualquier_local: false },
        enCurso: unaTarjetaEnCurso({
          tarjeta: unaTarjeta({ local_alta_id: 'local-9' }),
          sellos: COMPLETA,
        }),
      }),
    );
    if (decision.tipo !== 'rechazado') throw new Error('Se esperaba un rechazo.');
    expect(decision.detalle?.local_alta_id).toBe('local-9');
  });
});
