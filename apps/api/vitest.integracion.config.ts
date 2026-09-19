import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

/**
 * Los tests corren contra el CODIGO de los paquetes, no contra su dist: sin
 * esto, un cambio en el dominio no se ve hasta compilarlo y los tests pasarian
 * contra una version vieja.
 */
const ALIAS = {
  '@repunto/dominio': fileURLToPath(
    new URL('../../packages/dominio/src/index.ts', import.meta.url),
  ),
  '@repunto/contratos': fileURLToPath(
    new URL('../../packages/contratos/src/index.ts', import.meta.url),
  ),
};

// Integracion contra Postgres real, nunca mocks ni SQLite (CLAUDE.md,
// seccion 10). Vive en apps/api porque es quien declara pg y quien la usa:
// Vitest resuelve los imports del globalSetup desde la raiz del proyecto.
//
// preparar-base.ts recrea repunto_test y le aplica las migraciones una vez por
// corrida; cada test corre en su propia transaccion y la deshace
// (test/integracion/base.ts).
export default defineProject({
  resolve: { alias: ALIAS },
  test: {
    name: 'integracion',
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    globalSetup: ['test/integracion/preparar-base.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
