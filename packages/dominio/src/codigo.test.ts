import { describe, expect, it } from 'vitest';

import {
  ALFABETO_CODIGO_PUBLICO,
  LARGO_CODIGO_PUBLICO,
  codigoDeVentana,
  codigoPublicoDesde,
  esCodigoPublicoValido,
  partirCodigoTipeado,
  ventanaDe,
  ventanasAceptadas,
  verificarCodigo,
} from './codigo';

/** La del RFC 6238: ASCII "12345678901234567890" en base32. */
const SEMILLA_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const SEMILLA = 'JBSWY3DPEHPK3PXP';

describe('codigoDeVentana', () => {
  // Si estos seis cambian, el codigo dejo de ser TOTP estandar y las apps que
  // lo generan del otro lado dejarian de coincidir.
  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
    [20_000_000_000, '353130'],
  ])('coincide con el vector del RFC 6238 en t=%i', (epoch, esperado) => {
    const ventana = ventanaDe(new Date(epoch * 1000));
    expect(codigoDeVentana(SEMILLA_RFC, ventana)).toBe(esperado);
  });

  it('siempre devuelve seis digitos, incluso con ceros adelante', () => {
    for (let ventana = 0; ventana < 200; ventana += 1) {
      expect(codigoDeVentana(SEMILLA, ventana)).toMatch(/^\d{6}$/);
    }
  });
});

describe('ventanaDe', () => {
  it('cambia cada 30 segundos', () => {
    const base = new Date('2026-09-18T12:00:00.000Z');
    expect(ventanaDe(base)).toBe(ventanaDe(new Date(base.getTime() + 29_999)));
    expect(ventanaDe(new Date(base.getTime() + 30_000))).toBe(ventanaDe(base) + 1);
  });

  it('acepta la actual y la anterior, en ese orden', () => {
    const ahora = new Date('2026-09-18T12:00:45.000Z');
    const [actual, anterior] = ventanasAceptadas(ahora);
    expect(actual).toBe(ventanaDe(ahora));
    expect(anterior).toBe(actual - 1);
  });
});

describe('verificarCodigo', () => {
  const ahora = new Date('2026-09-18T12:00:45.000Z');
  const [actual, anterior] = ventanasAceptadas(ahora);

  it('acepta el codigo de la ventana actual y dice cual consumir', () => {
    const totp = codigoDeVentana(SEMILLA, actual);
    expect(verificarCodigo({ semilla: SEMILLA, totp, ahora })).toEqual({
      valido: true,
      ventana: actual,
    });
  });

  it('acepta el de la ventana anterior: el cliente tardo en dictarlo', () => {
    const totp = codigoDeVentana(SEMILLA, anterior);
    expect(verificarCodigo({ semilla: SEMILLA, totp, ahora })).toEqual({
      valido: true,
      ventana: anterior,
    });
  });

  it('rechaza el de dos ventanas atras', () => {
    const totp = codigoDeVentana(SEMILLA, actual - 2);
    expect(verificarCodigo({ semilla: SEMILLA, totp, ahora })).toEqual({
      valido: false,
      ventana: null,
    });
  });

  it('rechaza el de la ventana siguiente', () => {
    const totp = codigoDeVentana(SEMILLA, actual + 1);
    expect(verificarCodigo({ semilla: SEMILLA, totp, ahora }).valido).toBe(false);
  });

  it('rechaza el codigo de otra semilla', () => {
    const totp = codigoDeVentana('KRSXG5DJNZTQ====', actual);
    expect(verificarCodigo({ semilla: SEMILLA, totp, ahora }).valido).toBe(false);
  });
});

describe('semillas invalidas', () => {
  it('avisa si la semilla no es base32', () => {
    expect(() => codigoDeVentana('no-es-base32!', 1)).toThrow(/base32/);
  });

  it('rechaza un TOTP de otro largo sin compararlo digito por digito', () => {
    const ahora = new Date('2026-09-18T12:00:45.000Z');
    expect(verificarCodigo({ semilla: SEMILLA, totp: '1234', ahora }).valido).toBe(false);
  });
});

describe('codigo publico', () => {
  it('no tiene caracteres que se confundan a un metro del mostrador', () => {
    for (const ambiguo of ['0', 'O', '1', 'I', 'L', '5', 'S']) {
      expect(ALFABETO_CODIGO_PUBLICO).not.toContain(ambiguo);
    }
    expect(ALFABETO_CODIGO_PUBLICO).toHaveLength(29);
  });

  it('da mas de veinte millones de combinaciones para cien mil clientes', () => {
    expect(ALFABETO_CODIGO_PUBLICO.length ** LARGO_CODIGO_PUBLICO).toBeGreaterThan(
      20_000_000,
    );
  });

  it('genera codigos validos a partir de bytes al azar', () => {
    for (let semilla = 0; semilla < 60; semilla += 1) {
      const bytes = Uint8Array.from([
        semilla,
        semilla + 7,
        semilla + 31,
        semilla + 97,
        semilla + 251,
      ]);
      expect(esCodigoPublicoValido(codigoPublicoDesde(bytes))).toBe(true);
    }
  });

  it('pide bytes suficientes', () => {
    expect(() => codigoPublicoDesde(Uint8Array.from([1, 2]))).toThrow(/bytes/);
  });

  it.each([
    ['con el largo justo', 'K7Q4M', true],
    ['corto', 'K7Q4', false],
    ['largo', 'K7Q4MN', false],
    ['en minusculas', 'k7q4m', false],
    ['con un caracter ambiguo', 'K7Q4O', false],
  ])('%s', (_caso, texto, esperado) => {
    expect(esCodigoPublicoValido(texto)).toBe(esperado);
  });
});

describe('partirCodigoTipeado', () => {
  const partido = { codigo_publico: 'K7Q4M', totp: '418329' };

  it.each([
    ['tal cual', 'K7Q4M418329'],
    ['con guion', 'K7Q4M-418329'],
    ['con espacio', 'K7Q4M 418329'],
    ['en minusculas', 'k7q4m-418329'],
    ['con espacios de mas', ' k7q4m - 418329 '],
  ])('lo parte %s: el cajero tipea como puede', (_caso, tipeado) => {
    expect(partirCodigoTipeado(tipeado)).toEqual(partido);
  });

  it.each([
    ['vacio', ''],
    ['solo el prefijo', 'K7Q4M'],
    ['solo el totp', '418329'],
    ['un digito de menos', 'K7Q4M-41832'],
    ['un digito de mas', 'K7Q4M-4183290'],
    ['con letras en el totp', 'K7Q4M-41832A'],
    ['con un ambiguo en el prefijo', 'K7Q40-418329'],
  ])('devuelve null si %s', (_caso, tipeado) => {
    expect(partirCodigoTipeado(tipeado)).toBeNull();
  });
});
