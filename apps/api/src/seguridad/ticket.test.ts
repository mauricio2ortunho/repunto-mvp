import { beforeAll, describe, expect, it } from 'vitest';

import { numeroDeEmparejamiento } from './ticket';

// La clave se lee al usarla: una de prueba, solo para este archivo.
beforeAll(() => {
  process.env['CLAVE_CIFRADO_SEMILLAS'] ??= Buffer.alloc(32, 7).toString('base64');
});

describe('numeroDeEmparejamiento', () => {
  it('el mismo ticket da siempre el mismo número', () => {
    expect(numeroDeEmparejamiento('ticket-a')).toBe(numeroDeEmparejamiento('ticket-a'));
  });

  it('siempre dos dígitos, del 10 al 99, y repartidos', () => {
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const n = numeroDeEmparejamiento(`ticket-${i}`);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(99);
      vistos.add(n);
    }
    // Con 2000 tickets salen casi todos: no se amontonan en unos pocos.
    expect(vistos.size).toBeGreaterThan(85);
  });
});
