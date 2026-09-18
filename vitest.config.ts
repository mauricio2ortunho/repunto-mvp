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
      {
        // Integracion contra Postgres real, nunca mocks ni SQLite
        // (CLAUDE.md, seccion 10). Todavia no hay casos: el comando existe
        // para que el primero no tenga que inventar el andamiaje.
        test: {
          name: 'integracion',
          environment: 'node',
          include: ['{apps,packages}/*/**/*.int.test.ts'],
          exclude: EXCLUIDOS,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
