import { describe, expect, it } from 'vitest';
import { mensajeParaElCajero } from '@repunto/contratos';
import type { CodigoDeError } from '../../lib/api/http';
import { sePuedeVincular, tonoDeBloqueo } from './bloqueo';

/** Lo que puede llegar como impedimento, mas la tablet sin vincular (un 401). */
const POSIBLES: CodigoDeError[] = [
  'TURNO_CERRADO',
  'DISPOSITIVO_REVOCADO',
  'NEGOCIO_SUSPENDIDO',
  'LOCAL_NO_AUTORIZADO',
  'PROMO_NO_CONFIGURADA',
  'TOKEN_INVALIDO',
];

describe('cuando la alarma ofrece vincular la tablet', () => {
  it('sin vincular o dada de baja, se arregla vinculando', () => {
    expect(sePuedeVincular('TOKEN_INVALIDO')).toBe(true);
    expect(sePuedeVincular('DISPOSITIVO_REVOCADO')).toBe(true);
  });

  it('lo demas no: vincular otra vez no arregla un negocio suspendido', () => {
    for (const codigo of POSIBLES.filter(
      (c) => c !== 'TOKEN_INVALIDO' && c !== 'DISPOSITIVO_REVOCADO',
    )) {
      expect(sePuedeVincular(codigo), codigo).toBe(false);
    }
  });
});

describe('el tono de una caja bloqueada', () => {
  it('abrir turno es una instruccion, no una alarma', () => {
    expect(tonoDeBloqueo('TURNO_CERRADO')).toBe('instruccion');
  });

  it('lo que nadie en el mostrador resuelve es alarma', () => {
    for (const codigo of POSIBLES.filter((c) => c !== 'TURNO_CERRADO')) {
      expect(tonoDeBloqueo(codigo), codigo).toBe('alarma');
    }
  });

  it('un codigo inesperado va como alarma', () => {
    expect(tonoDeBloqueo('TARJETA_VENCIDA')).toBe('alarma');
  });

  /**
   * El criterio escrito como test: es alarma si y solo si el mensaje manda a
   * avisar al dueno. Si un mensaje cambia en contratos y deja de coincidir con
   * el tono, esto falla y obliga a decidir de nuevo.
   */
  it('es alarma justo cuando el mensaje dice "avisá al dueño"', () => {
    for (const codigo of POSIBLES) {
      const mandaAlDueno = /avis[aá] al due[nñ]o/i.test(mensajeParaElCajero(codigo));
      expect(tonoDeBloqueo(codigo) === 'alarma', codigo).toBe(mandaAlDueno);
    }
  });
});
