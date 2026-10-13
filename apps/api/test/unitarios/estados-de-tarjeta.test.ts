import { describe, expect, it } from 'vitest';

import { ESTADOS_DE_TARJETA_DEL_CLIENTE } from '@repunto/contratos';
import { ESTADOS_PARA_EL_CLIENTE } from '@repunto/dominio';

/**
 * Los estados en que el cliente ve una tarjeta viven dos veces, por lo mismo
 * que los codigos de error: el dominio los decide, la app los necesita para
 * dibujar, y contratos no puede importar dominio (CLAUDE.md, seccion 3).
 *
 * `apps/api` es el unico paquete que ve los dos. Si alguien agrega un estado
 * en el dominio y se olvida de contratos, la api devolveria un valor que el
 * esquema rechaza: falla esto antes.
 */
describe('las dos listas de estados de tarjeta del cliente', () => {
  it('son la misma, en el mismo orden', () => {
    expect([...ESTADOS_DE_TARJETA_DEL_CLIENTE]).toEqual([...ESTADOS_PARA_EL_CLIENTE]);
  });
});
