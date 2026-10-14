import { describe, expect, it } from 'vitest';

import { relojDesde } from './reloj';

describe('relojDesde', () => {
  it('arranca en la hora del servidor, no en la del telefono', () => {
    const reloj = relojDesde('2026-10-12T21:02:00.000Z', () => 0);

    expect(reloj.ahora()).toBe(Date.parse('2026-10-12T21:02:00.000Z'));
  });

  it('avanza con el reloj monotono', () => {
    let monotono = 1_000;
    const reloj = relojDesde('2026-10-12T21:02:00.000Z', () => monotono);

    monotono += 12_500;

    expect(reloj.ahora()).toBe(Date.parse('2026-10-12T21:02:12.500Z'));
  });
});
