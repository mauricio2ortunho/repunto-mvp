import type { CSSProperties } from 'react';
import { colorDeTextoSobre, esColorHex } from '@repunto/contratos';

/**
 * El color de un negocio, listo para ponerlo en un elemento: define
 * --c-marca y --c-sobre-marca, y todo lo que este adentro puede usarlos.
 *
 * Es el unico camino para pintar con el color del negocio. El texto encima
 * sale de `colorDeTextoSobre`, de contratos: blanco o negro puros por
 * contraste, igual que en la app del cliente. Si el color no es #RRGGBB no se
 * pinta nada y quedan los de la caja: `colorDeTextoSobre` igual devolveria un
 * color, pero para un fondo que nadie deberia estar pintando.
 */
export function variablesDeMarca(
  color: string | null | undefined,
): CSSProperties | undefined {
  if (color == null || !esColorHex(color)) return undefined;
  return {
    '--c-marca': color,
    '--c-sobre-marca': colorDeTextoSobre(color),
  } as CSSProperties;
}
