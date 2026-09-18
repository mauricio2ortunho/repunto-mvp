import { defineConfig } from 'vitest/config';

const EXCLUIDOS = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'];

export default defineConfig({
  test: {
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
