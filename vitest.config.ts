import { defineConfig } from 'vitest/config';

const EXCLUIDOS = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'];

export default defineConfig({
  test: {
    projects: [
      {
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
