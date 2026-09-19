import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Los tests corren contra el CODIGO de los paquetes, no contra su dist: sin
 * esto, un cambio en el dominio no se ve hasta compilarlo y los tests pasarian
 * contra una version vieja.
 */
const ALIAS = {
  '@repunto/dominio': fileURLToPath(
    new URL('./packages/dominio/src/index.ts', import.meta.url),
  ),
  '@repunto/contratos': fileURLToPath(
    new URL('./packages/contratos/src/index.ts', import.meta.url),
  ),
};

const EXCLUIDOS = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'];

export default defineConfig({
  test: {
    // Un archivo a la vez. Los tests del flujo commitean contra una base
    // compartida, asi que dos archivos en paralelo se pisan. Va aca y no en
    // la config del proyecto porque es una opcion de la raiz: declarada
    // adentro de un proyecto, Vitest la ignora sin avisar.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // Solo el dominio: es el unico paquete con logica propia por ahora.
      include: ['packages/dominio/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/pruebas/**',
        // Solo declaraciones de tipos: no hay codigo que ejecutar.
        'packages/dominio/src/index.ts',
        'packages/dominio/src/tipos.ts',
      ],
      reporter: ['text-summary', 'text'],
    },
    projects: [
      {
        resolve: { alias: ALIAS },
        test: {
          name: 'unitarios',
          environment: 'node',
          include: ['{apps,packages}/*/**/*.test.ts'],
          exclude: [...EXCLUIDOS, '**/*.int.test.ts'],
        },
      },
      // Integracion contra Postgres real: ver apps/api/vitest.integracion.config.ts.
      'apps/api/vitest.integracion.config.ts',
    ],
  },
});
