import { describe, expect, it } from 'vitest';

import { hashDePin, pinCoincide } from '../../src/seguridad/pin';

describe('hashDePin / pinCoincide', () => {
  it('el PIN correcto coincide y otro no', async () => {
    const guardado = await hashDePin('1234');
    expect(await pinCoincide('1234', guardado)).toBe(true);
    expect(await pinCoincide('1235', guardado)).toBe(false);
  });

  it('el hash no contiene el PIN', async () => {
    expect(await hashDePin('1234')).not.toContain('1234');
  });

  it('lleva sal: el mismo PIN da hashes distintos, y dos cajeros pueden compartirlo', async () => {
    const a = await hashDePin('1234');
    const b = await hashDePin('1234');
    expect(a).not.toBe(b);
    expect(await pinCoincide('1234', a)).toBe(true);
    expect(await pinCoincide('1234', b)).toBe(true);
  });

  it('rechaza un PIN que no son cuatro digitos', async () => {
    await expect(hashDePin('123')).rejects.toThrow();
    await expect(hashDePin('12a4')).rejects.toThrow();
  });

  it('un hash corrupto o de otro formato no coincide, sin explotar', async () => {
    expect(await pinCoincide('1234', '')).toBe(false);
    expect(await pinCoincide('1234', 'scrypt$v9$abc$def')).toBe(false);
    expect(await pinCoincide('1234', 'scrypt$v1$AAAA$AAAA')).toBe(false);
  });
});
