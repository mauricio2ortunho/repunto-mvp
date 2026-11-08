import { describe, expect, it } from 'vitest';

import {
  DIAS_DE_SESION_DE_DUENO,
  type EntradaDeDueno,
  HORAS_DE_ENTRADA_DE_DUENO,
  decidirEntradaDeDueno,
  sesionDeDuenoVigente,
} from './dueno';

const AHORA = new Date('2026-11-08T15:00:00Z');
const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

function entrada(cambios: Partial<EntradaDeDueno> = {}): EntradaDeDueno {
  return {
    id: 'entrada-1',
    usuario_id: 'dueno-1',
    expira_el: new Date(AHORA.getTime() + 10 * MINUTO),
    usado_el: null,
    usuario_activo: true,
    ...cambios,
  };
}

describe('decidirEntradaDeDueno', () => {
  it('las reglas fijas: el codigo dura 24 horas y la sesion 30 dias sin uso', () => {
    expect(HORAS_DE_ENTRADA_DE_DUENO).toBe(24);
    expect(DIAS_DE_SESION_DE_DUENO).toBe(30);
  });

  it('un codigo vigente, sin usar y de un dueno activo abre la sesion', () => {
    expect(decidirEntradaDeDueno({ ahora: AHORA, entrada: entrada() })).toEqual({
      tipo: 'entrar',
      efecto: { entrada_id: 'entrada-1', usuario_id: 'dueno-1' },
    });
  });

  it.each([
    ['no existe', null],
    ['ya se uso', entrada({ usado_el: new Date(AHORA.getTime() - MINUTO) })],
    ['vencio', entrada({ expira_el: new Date(AHORA.getTime() - 1) })],
    ['vence justo ahora', entrada({ expira_el: AHORA })],
    ['su dueno esta dado de baja', entrada({ usuario_activo: false })],
  ])('si %s, el mismo rechazo para todo', (_caso, valor) => {
    expect(decidirEntradaDeDueno({ ahora: AHORA, entrada: valor })).toMatchObject({
      tipo: 'rechazado',
      codigo: 'ENTRADA_INVALIDA',
    });
  });
});

describe('sesionDeDuenoVigente', () => {
  const sesion = { ultimo_acceso: AHORA, revocada_el: null, usuario_activo: true };

  it('recien usada, sirve', () => {
    expect(sesionDeDuenoVigente(sesion, AHORA)).toBe(true);
  });

  it('sirve hasta un instante antes de los 30 dias sin uso', () => {
    expect(sesionDeDuenoVigente(sesion, new Date(AHORA.getTime() + 30 * DIA - 1))).toBe(
      true,
    );
  });

  it('a los 30 dias sin uso, vence', () => {
    expect(sesionDeDuenoVigente(sesion, new Date(AHORA.getTime() + 30 * DIA))).toBe(
      false,
    );
  });

  it('revocada, no sirve', () => {
    expect(sesionDeDuenoVigente({ ...sesion, revocada_el: AHORA }, AHORA)).toBe(false);
  });

  it('de un dueno dado de baja, no sirve', () => {
    expect(sesionDeDuenoVigente({ ...sesion, usuario_activo: false }, AHORA)).toBe(false);
  });
});
