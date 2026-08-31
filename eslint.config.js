import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import i18next from 'eslint-plugin-i18next';
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

  // No hardcoded UI strings in the web app (CLAUDE.md / decision D9 / Epic X.1.1).
  // `i18next/no-literal-string` in `jsx-text-only` mode flags user-visible text
  // sitting between JSX tags that isn't routed through `t()` — the highest-signal
  // check, and the one that keeps D9's convention from creeping back. Attribute
  // copy (placeholder / aria-label / title …), toast text and Zod messages were
  // converted alongside and are covered by review, not this rule (its broader
  // modes false-positive on Radix `value=`, route `path=`, motion variant names).
  // Scoped to `apps/web/src`; the i18n resource bundles and the dev-only state
  // gallery are the places literal strings legitimately live.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/i18n/resources/**',
      'apps/web/src/routes/dev/**',
      'apps/web/src/**/*.test.{ts,tsx}',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },

  // Base component library (backlog 0.4.2): these files legitimately mix component
  // exports with re-exported Radix primitives (`export const X = Primitive.Root`)
  // and cva variant configs (`buttonVariants`). react-refresh/only-export-components
  // can't statically prove a re-exported primitive is a component, so it false-
  // positives on every compound-component file in this style — the same pattern
  // shadcn/ui's own generated files hit. Scoped narrowly to this one folder rather
  // than disabled project-wide.
  {
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
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

  // TypeScript check scripts (run with `tsx`, e.g. numbering-check.ts,
  // web/scripts/i18n-check.ts), tool config files (vitest / playwright), Vitest
  // setup files and the Playwright `e2e/` specs all live outside any app's `src`
  // rootDir, so they are in no tsconfig. Lint them untyped rather than distort the
  // build's file layout. The e2e specs also run `page.evaluate()` callbacks in a
  // real browser, so they reference browser globals.
  {
    files: [
      'apps/api/scripts/**/*.ts',
      'apps/web/scripts/**/*.ts',
      '*.config.ts',
      'apps/*/*.config.ts',
      'apps/*/vitest.setup.ts',
      'apps/web/e2e/**/*.ts',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
]);
