import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * One flat config for the whole monorepo. Each workspace gets the shared TypeScript
 * baseline plus only the rules that make sense for its environment: React rules apply
 * to apps/web alone, Node globals to apps/api and packages/shared.
 *
 * `projectService: true` gives the type-aware rules a real type checker, which is the
 * point of linting a TypeScript codebase at all — rules like no-floating-promises
 * cannot be expressed syntactically. This is why TypeScript is pinned to 6.0.x
 * (see docs/decisions.md, D8).
 */
export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/*.tsbuildinfo',
    'apps/web/public/**',
  ]),

  // Shared TypeScript baseline — every workspace.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args are allowed only when explicitly marked, e.g. Express's (_req, res).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Money is integer minor units and tenant scoping is centrally enforced; silent
      // `any` leaks are exactly how those invariants get broken.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Frontend only.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Backend and shared package.
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Plain JS config files are not part of any tsconfig, so no type-aware rules.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Node scripts that drive a browser: page.evaluate() callbacks are serialised and
  // run inside Chrome, so they legitimately reference browser globals.
  {
    files: ['apps/api/scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
]);
