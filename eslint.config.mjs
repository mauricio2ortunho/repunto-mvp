import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * La regla de dependencias de CLAUDE.md, seccion 3:
 *
 *   cliente ─┬──> ui ──┐
 *   panel  ──┘         ├──> contratos <── api ──> dominio
 *            ──────────┘                            │
 *                                               (no importa nada)
 *
 * `ui` es el sistema de diseno compartido: importa React y contratos, nunca
 * Next, el dominio ni las apps.
 *
 * Se aplica en dos capas porque ninguna sola alcanza:
 *
 *  - `import-x/no-restricted-paths` corta los imports por ruta relativa, el
 *    clasico `../../packages/dominio/src` con el que alguien se saltea el
 *    limite sin tocar ningun package.json.
 *  - `no-restricted-imports` corta los imports por nombre de paquete, que el
 *    anterior no ve: `@repunto/dominio`, `@nestjs/common`, `next`.
 *
 * Y abajo de todo esta pnpm: si un paquete no declara la dependencia, el
 * import ni siquiera resuelve. El lint esta para dar el mensaje claro.
 */
const MENSAJE_DOMINIO =
  'packages/dominio no importa nada: recibe datos planos y devuelve decisiones (CLAUDE.md, seccion 3).';
const MENSAJE_FRONTEND =
  'Los frontends solo importan @repunto/contratos y @repunto/ui. Nunca apps/api ni packages/dominio (CLAUDE.md, seccion 3).';
const MENSAJE_UI =
  'packages/ui solo importa React y @repunto/contratos: ni Next, ni dominio, ni las apps. Asi lo usan las dos (CLAUDE.md, seccion 3).';
const MENSAJE_CONTRATOS =
  'packages/contratos es una hoja compartida: no importa apps ni dominio (CLAUDE.md, seccion 3).';
const MENSAJE_API =
  'apps/api no importa de los frontends. El flujo va api -> contratos <- frontends.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { 'import-x': importX },
    settings: {
      // Sin esto el resolver no reconoce .ts/.tsx y los imports por ruta
      // relativa entre paquetes pasan sin que nadie los mire.
      'import-x/resolver': {
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'] },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './packages/dominio', from: './apps', message: MENSAJE_DOMINIO },
            {
              target: './packages/dominio',
              from: './packages/contratos',
              message: MENSAJE_DOMINIO,
            },
            {
              target: './packages/contratos',
              from: './apps',
              message: MENSAJE_CONTRATOS,
            },
            {
              target: './packages/contratos',
              from: './packages/dominio',
              message: MENSAJE_CONTRATOS,
            },
            {
              target: './apps/cliente',
              from: './apps/api',
              message: MENSAJE_FRONTEND,
            },
            {
              target: './apps/cliente',
              from: './packages/dominio',
              message: MENSAJE_FRONTEND,
            },
            { target: './apps/panel', from: './apps/api', message: MENSAJE_FRONTEND },
            {
              target: './apps/panel',
              from: './packages/dominio',
              message: MENSAJE_FRONTEND,
            },
            { target: './apps/api', from: './apps/cliente', message: MENSAJE_API },
            { target: './apps/api', from: './apps/panel', message: MENSAJE_API },
            { target: './packages/ui', from: './apps', message: MENSAJE_UI },
            { target: './packages/ui', from: './packages/dominio', message: MENSAJE_UI },
            {
              target: './packages/contratos',
              from: './packages/ui',
              message: MENSAJE_CONTRATOS,
            },
            {
              target: './packages/dominio',
              from: './packages/ui',
              message: MENSAJE_DOMINIO,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@repunto/*',
                '@prisma/*',
                'prisma',
                '@nestjs/*',
                'next',
                'next/*',
                'react',
                'react-dom',
                'express',
                'zod',
              ],
              message: MENSAJE_DOMINIO,
            },
          ],
        },
      ],
      // El reloj entra por parametro. Es lo que hace testeables el
      // vencimiento de la tarjeta, el intervalo entre sellos y la ventana del
      // codigo rotativo (CLAUDE.md, seccion 3).
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'dominio no lee el reloj del sistema: recibi el instante por parametro.',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            'dominio no lee el reloj del sistema: recibi el instante por parametro.',
        },
        {
          selector: "MemberExpression[object.name='performance'][property.name='now']",
          message:
            'dominio no lee el reloj del sistema: recibi el instante por parametro.',
        },
      ],
    },
  },

  {
    files: ['packages/contratos/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@repunto/dominio',
                '@repunto/ui',
                '@nestjs/*',
                'next',
                'next/*',
                '@prisma/*',
              ],
              message: MENSAJE_CONTRATOS,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@repunto/dominio',
                '@repunto/dominio/*',
                '@nestjs/*',
                '@prisma/*',
                'next',
                'next/*',
              ],
              message: MENSAJE_UI,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/cliente/**/*.{ts,tsx}', 'apps/panel/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@repunto/dominio', '@repunto/dominio/*', '@prisma/*', '@nestjs/*'],
              message: MENSAJE_FRONTEND,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*', 'react', 'react-dom'], message: MENSAJE_API },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },

  {
    // El service worker corre en su propio ambito, no en una pagina.
    files: ['apps/cliente/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },

  prettier,
);
