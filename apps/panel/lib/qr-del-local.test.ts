import { describe, expect, it } from 'vitest';
import { encode } from 'uqr';

import { MARGEN_DEL_QR, direccionDelQr, dibujarQr } from './qr-del-local';

describe('direccionDelQr', () => {
  it('lleva a la página de alta del local en la app del cliente', () => {
    expect(direccionDelQr('https://repunto-cliente.vercel.app', 'k7q4m8xtwa')).toBe(
      'https://repunto-cliente.vercel.app/r/k7q4m8xtwa',
    );
  });

  it('un QR viejo con caracteres raros no rompe la dirección', () => {
    expect(direccionDelQr('http://localhost:3000', 'demo equipetrol')).toBe(
      'http://localhost:3000/r/demo%20equipetrol',
    );
  });
});

describe('dibujarQr', () => {
  const texto = 'https://repunto-cliente.vercel.app/r/k7q4m8xtwa';
  const { lado, camino } = dibujarQr(texto);
  const modulos = camino.match(/M(\d+) (\d+)/g) ?? [];
  const oscuros = new Set(modulos.map((m) => m.slice(1)));

  it('dibuja un cuadradito por cada módulo oscuro del QR', () => {
    const { data } = encode(texto, { ecc: 'Q', border: MARGEN_DEL_QR });
    const esperados = data.flat().filter(Boolean).length;
    expect(modulos).toHaveLength(esperados);
  });

  it('deja el margen blanco de cuatro módulos alrededor', () => {
    for (const m of oscuros) {
      const [x, y] = m.split(' ').map(Number) as [number, number];
      expect(x).toBeGreaterThanOrEqual(MARGEN_DEL_QR);
      expect(y).toBeGreaterThanOrEqual(MARGEN_DEL_QR);
      expect(x).toBeLessThan(lado - MARGEN_DEL_QR);
      expect(y).toBeLessThan(lado - MARGEN_DEL_QR);
    }
  });

  it('tiene los tres cuadrados de las esquinas donde la cámara los busca', () => {
    const fin = lado - MARGEN_DEL_QR - 1;
    for (const esquina of [
      `${MARGEN_DEL_QR} ${MARGEN_DEL_QR}`,
      `${fin} ${MARGEN_DEL_QR}`,
      `${MARGEN_DEL_QR} ${fin}`,
    ]) {
      expect(oscuros.has(esquina)).toBe(true);
    }
  });
});
