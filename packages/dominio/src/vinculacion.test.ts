import { describe, expect, it } from 'vitest';

import { ALFABETO_CODIGO_PUBLICO } from './codigo';
import { AHORA, LOCAL } from './pruebas/escenario';
import {
  type EntradaDeVinculacion,
  LARGO_CODIGO_DE_VINCULACION,
  type VinculacionPendiente,
  codigoDeVinculacionDesde,
  decidirVinculacion,
  formatearCodigoDeVinculacion,
  normalizarCodigoDeVinculacion,
} from './vinculacion';

const UN_MINUTO = 60_000;

const VIGENTE: VinculacionPendiente = {
  id: 'vinculacion-1',
  local_id: LOCAL.id,
  expira_el: new Date(AHORA.getTime() + 10 * UN_MINUTO),
  usado_el: null,
  creador_activo: true,
};

const ENTRADA: EntradaDeVinculacion = {
  ahora: AHORA,
  vinculacion: VIGENTE,
  local: LOCAL,
};

function codigoDe(cambios: Partial<EntradaDeVinculacion>): string {
  const decision = decidirVinculacion({ ...ENTRADA, ...cambios });
  return decision.tipo === 'rechazado' ? decision.codigo : decision.tipo;
}

describe('decidirVinculacion', () => {
  it('con un codigo vigente vincula la tablet al local del codigo', () => {
    expect(decidirVinculacion(ENTRADA)).toEqual({
      tipo: 'vincular',
      efecto: { vinculacion_id: 'vinculacion-1', local_id: LOCAL.id },
    });
  });

  it.each([
    ['no existe', { vinculacion: null }],
    ['ya se uso', { vinculacion: { ...VIGENTE, usado_el: AHORA } }],
    ['vencio', { vinculacion: { ...VIGENTE, expira_el: new Date(AHORA.getTime() - 1) } }],
    ['vence justo ahora', { vinculacion: { ...VIGENTE, expira_el: AHORA } }],
    [
      'quien lo genero ya no esta activo',
      { vinculacion: { ...VIGENTE, creador_activo: false } },
    ],
  ])('VINCULACION_INVALIDA, siempre la misma, cuando el codigo %s', (_caso, cambios) => {
    expect(codigoDe(cambios)).toBe('VINCULACION_INVALIDA');
  });

  it('LOCAL_NO_AUTORIZADO si el local se dio de baja', () => {
    expect(codigoDe({ local: { ...LOCAL, activo: false } })).toBe('LOCAL_NO_AUTORIZADO');
  });
});

describe('el codigo de vinculacion', () => {
  it('tiene ocho caracteres, todos del alfabeto sin ambiguos', () => {
    const codigo = codigoDeVinculacionDesde(
      new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]),
    );
    expect(codigo).toHaveLength(LARGO_CODIGO_DE_VINCULACION);
    expect([...codigo].every((c) => ALFABETO_CODIGO_PUBLICO.includes(c))).toBe(true);
  });

  it('pide bytes suficientes', () => {
    expect(() => codigoDeVinculacionDesde(new Uint8Array(3))).toThrow();
  });

  it('se muestra en dos mitades y se lee como se haya tipeado', () => {
    expect(formatearCodigoDeVinculacion('K7QM4R8T')).toBe('K7QM-4R8T');
    expect(normalizarCodigoDeVinculacion(' k7qm-4r8t ')).toBe('K7QM4R8T');
    expect(normalizarCodigoDeVinculacion('K7QM 4R8T')).toBe('K7QM4R8T');
  });

  it('lo que no tiene forma de codigo es null', () => {
    expect(normalizarCodigoDeVinculacion('K7QM4R8')).toBeNull();
    // 0 y O no estan en el alfabeto: nunca se generan.
    expect(normalizarCodigoDeVinculacion('K7QM4R80')).toBeNull();
    expect(normalizarCodigoDeVinculacion('')).toBeNull();
  });
});
