import { describe, expect, it } from 'vitest';
import { variablesDeMarca } from './marca';

describe('el color del negocio', () => {
  it('trae su texto calculado: nunca se pasa uno a mano', () => {
    expect(variablesDeMarca('#0F5C4D')).toEqual({
      '--c-marca': '#0F5C4D',
      '--c-sobre-marca': '#FFFFFF',
    });
    expect(variablesDeMarca('#FFE45C')).toEqual({
      '--c-marca': '#FFE45C',
      '--c-sobre-marca': '#000000',
    });
  });

  it('sin color, o con uno que no es #RRGGBB, quedan los colores de la caja', () => {
    expect(variablesDeMarca(null)).toBeUndefined();
    expect(variablesDeMarca('verde')).toBeUndefined();
    expect(variablesDeMarca('#abc')).toBeUndefined();
  });
});
