import { describe, expect, it } from 'vitest';

import { tipoPorBytes } from './formato';

const bytes = (...b: number[]) => new Uint8Array(b);
const texto = (t: string) => new TextEncoder().encode(t);

describe('tipoPorBytes', () => {
  it('reconoce PNG, JPG y WebP por su firma', () => {
    expect(tipoPorBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(tipoPorBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(tipoPorBytes(texto('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(
      'image/webp',
    );
  });

  it('un SVG, un GIF o algo cortado no es imagen', () => {
    expect(tipoPorBytes(texto('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(tipoPorBytes(texto('GIF89a'))).toBeNull();
    // RIFF sin WEBP: un WAV, por ejemplo.
    expect(tipoPorBytes(texto('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull();
    expect(tipoPorBytes(bytes(0x89, 0x50))).toBeNull();
    expect(tipoPorBytes(bytes())).toBeNull();
  });
});
