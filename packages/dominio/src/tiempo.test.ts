import { describe, expect, it } from 'vitest';

import { ZONA_HORARIA, minutosTranscurridos } from './tiempo';

describe('minutosTranscurridos', () => {
  const desde = new Date('2026-01-31T14:00:00.000Z');

  it('cuenta los minutos completos entre dos instantes', () => {
    expect(minutosTranscurridos(desde, new Date('2026-01-31T14:05:00.000Z'))).toBe(5);
  });

  it('trunca los segundos sueltos en lugar de redondear', () => {
    expect(minutosTranscurridos(desde, new Date('2026-01-31T14:04:59.999Z'))).toBe(4);
  });

  it('es cero para el mismo instante', () => {
    expect(minutosTranscurridos(desde, desde)).toBe(0);
  });

  it('devuelve negativo si el reloj va para atras', () => {
    expect(minutosTranscurridos(desde, new Date('2026-01-31T13:58:00.000Z'))).toBe(-2);
  });

  it('no depende del reloj del sistema: mismo resultado en dos llamadas', () => {
    const ahora = new Date('2026-02-28T23:59:00.000Z');
    expect(minutosTranscurridos(desde, ahora)).toBe(minutosTranscurridos(desde, ahora));
  });
});

describe('ZONA_HORARIA', () => {
  it('es la zona de Bolivia, sin horario de verano', () => {
    expect(ZONA_HORARIA).toBe('America/La_Paz');
  });
});
