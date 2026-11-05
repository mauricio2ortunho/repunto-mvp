import { describe, expect, it } from 'vitest';

import { ALFABETO_CODIGO_PUBLICO } from './codigo';
import { LARGO_QR_DEL_LOCAL, qrDelLocalDesde } from './local';

describe('el QR del local', () => {
  it('tiene diez caracteres del alfabeto sin ambiguos, en minusculas', () => {
    const qr = qrDelLocalDesde(new Uint8Array([0, 1, 2, 3, 4, 250, 251, 252, 253, 254]));
    expect(qr).toHaveLength(LARGO_QR_DEL_LOCAL);
    const alfabeto = ALFABETO_CODIGO_PUBLICO.toLowerCase();
    expect([...qr].every((c) => alfabeto.includes(c))).toBe(true);
  });

  it('no tiene letras ni numeros que se confundan al tipearlo', () => {
    const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
    let visto = '';
    for (let i = 0; i + LARGO_QR_DEL_LOCAL <= todos.length; i += LARGO_QR_DEL_LOCAL) {
      visto += qrDelLocalDesde(todos.slice(i, i + LARGO_QR_DEL_LOCAL));
    }
    for (const ambiguo of ['0', 'o', '1', 'i', 'l', '5', 's']) {
      expect(visto).not.toContain(ambiguo);
    }
  });

  it('pide bytes suficientes', () => {
    expect(() => qrDelLocalDesde(new Uint8Array(4))).toThrow();
  });
});
