import { describe, expect, it } from 'vitest';

import {
  DIAS_DE_SESION_DE_ADMIN,
  type EntradaDeAdmin,
  decidirEntradaDeAdmin,
  sesionDeAdminVigente,
} from './admin';

const AHORA = new Date('2026-11-04T15:00:00Z');
const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

function entrada(cambios: Partial<EntradaDeAdmin> = {}): EntradaDeAdmin {
  return {
    id: 'entrada-1',
    admin_id: 'admin-1',
    expira_el: new Date(AHORA.getTime() + 10 * MINUTO),
    usado_el: null,
    admin_activo: true,
    ...cambios,
  };
}

describe('decidirEntradaDeAdmin', () => {
  it('un codigo vigente, sin usar y de un admin activo abre la sesion', () => {
    expect(decidirEntradaDeAdmin({ ahora: AHORA, entrada: entrada() })).toEqual({
      tipo: 'entrar',
      efecto: { entrada_id: 'entrada-1', admin_id: 'admin-1' },
    });
  });

  it.each([
    ['no existe', null],
    ['ya se uso', entrada({ usado_el: new Date(AHORA.getTime() - MINUTO) })],
    ['vencio', entrada({ expira_el: new Date(AHORA.getTime() - 1) })],
    ['vence justo ahora', entrada({ expira_el: AHORA })],
    ['su admin esta dado de baja', entrada({ admin_activo: false })],
  ])('si %s, el mismo rechazo para todo', (_caso, valor) => {
    expect(decidirEntradaDeAdmin({ ahora: AHORA, entrada: valor })).toMatchObject({
      tipo: 'rechazado',
      codigo: 'ENTRADA_INVALIDA',
    });
  });
});

describe('sesionDeAdminVigente', () => {
  const sesion = { ultimo_acceso: AHORA, revocada_el: null, admin_activo: true };

  it('recien usada, sirve', () => {
    expect(sesionDeAdminVigente(sesion, AHORA)).toBe(true);
  });

  it(`sirve hasta un instante antes de los ${DIAS_DE_SESION_DE_ADMIN} dias sin uso`, () => {
    const casi = new Date(AHORA.getTime() + DIAS_DE_SESION_DE_ADMIN * DIA - 1);
    const justo = new Date(AHORA.getTime() + DIAS_DE_SESION_DE_ADMIN * DIA);

    expect(sesionDeAdminVigente(sesion, casi)).toBe(true);
    expect(sesionDeAdminVigente(sesion, justo)).toBe(false);
  });

  it('revocada, no sirve aunque sea de recien', () => {
    expect(sesionDeAdminVigente({ ...sesion, revocada_el: AHORA }, AHORA)).toBe(false);
  });

  it('de un admin dado de baja, no sirve', () => {
    expect(sesionDeAdminVigente({ ...sesion, admin_activo: false }, AHORA)).toBe(false);
  });
});
