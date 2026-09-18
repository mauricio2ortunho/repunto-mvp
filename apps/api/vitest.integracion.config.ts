import { defineProject } from 'vitest/config';

// Integracion contra Postgres real, nunca mocks ni SQLite (CLAUDE.md,
// seccion 10). Vive en apps/api porque es quien declara pg y quien la usa:
// Vitest resuelve los imports del globalSetup desde la raiz del proyecto.
//
// preparar-base.ts recrea repunto_test y le aplica las migraciones una vez por
// corrida; cada test corre en su propia transaccion y la deshace
// (test/integracion/base.ts).
export default defineProject({
  test: {
    name: 'integracion',
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    globalSetup: ['test/integracion/preparar-base.ts'],
    // Un archivo a la vez: determinista, y la suite entera tarda segundos.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
