/**
 * Root ESLint flat config — Ops Control v1.3.
 *
 * Unified ESLint 9 config replacing the dual v8 (root) / v9 (client)
 * setup that lived in v1.2. Client/-specific rules still live in
 * `client/eslint.config.js` and merge from this base.
 *
 * Philosophy:
 *   - error on real bugs (no-unused-vars, no-undef, eqeqeq)
 *   - warn on hygiene (no-console outside scripts, no-debugger)
 *   - off opinions that cause churn (max-len handled by Prettier)
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  // 1. Default ignores — never lint generated / vendor / data
  {
    ignores: [
      'node_modules/',
      'client/node_modules/',
      'desktop/node_modules/',
      'apps/kiosk/node_modules/',
      'apps/kiosk/dist/',
      'client/dist/',
      'desktop/dist-electron/',
      'server/data/',
      '_legacy/',
      'backup/',
      'dist/',
      'docs/audit-2026-04-17/',
      // Claude Code Agent worktrees — temporary on-disk clones used by
      // sub-agents (see Agent tool docs). Treating them as source rots
      // lint output with duplicates of files that already get linted
      // in the primary working tree. CI is unaffected (worktrees are
      // local-only, never committed).
      '.claude/worktrees/',
      // Legacy data dump for one-off import — committed `*_data.js`
      // files use a `window._VARNAME = {...}` IIFE pattern from v1.1
      // (see CLAUDE.md `dataSync.js` notes). Not runtime source, never
      // imported by code paths today; lint surfaces `no-undef` on
      // window which is irrelevant for these fixture files.
      'Data for import/',
    ],
  },
  // 2. Base recommended
  js.configs.recommended,
  // 3. Server (Node) — CommonJS + ESM mixed
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|e|err)$',
        },
      ],
      'no-console': 'off',
      'no-debugger': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // 3b. Puppeteer self-check + screenshot capture scripts — page.evaluate()
  // callbacks ferried into the browser context legitimately reference
  // window/document. Adding browser globals here keeps the smoke harness
  // + capture tooling lint-clean without weakening the no-undef rule for
  // real Node scripts.
  {
    files: [
      'scripts/help/self-check.mjs',
      'scripts/help/capture-screenshots.mjs',
      'scripts/help/capture-subtabs.mjs',
      'scripts/help/capture-with-demo.mjs',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2024 },
    },
  },
  // 3c. Domain server-side + shared + tests — v1.3 vertical-slice layout.
  // Mirrors block 3 (Node globals + ESM) for code under domains/<name>/server/,
  // domains/<name>/shared/, and domains/<name>/tests/. Client-side domain
  // code (domains/<name>/client/) is React + browser globals — added in a
  // separate block when the first client-side domain file lands.
  {
    files: ['domains/**/server/**/*.js', 'domains/**/shared/**/*.js', 'domains/**/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|e|err)$',
        },
      ],
      'no-console': 'off',
      'no-debugger': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // 3d. Kiosk PWA (browser + service-worker globals) — Sprint MES-2.6.
  // apps/kiosk/ is a fully-separate React 19 app served at /kiosk/.
  // src/ runs in the browser (window/localStorage/fetch); public/sw.js
  // runs in the service-worker scope (self/caches/Response/Headers).
  {
    files: ['apps/kiosk/src/**/*.{js,jsx}', 'apps/kiosk/i18n/**/*.js', 'apps/kiosk/styles/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|e|err)$',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['apps/kiosk/public/sw.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.es2024 },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|e|err)$',
        },
      ],
    },
  },
  {
    files: ['apps/kiosk/vite.config.js', 'apps/kiosk/playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2024 },
    },
  },
  // Playwright e2e specs — mixed Node + browser scope. The test body runs
  // in Node (process, Buffer, console); page.evaluate callbacks run in
  // the browser (window, document, localStorage). Both global sets are
  // legitimate references; eslint can't distinguish, so allow both.
  {
    files: ['apps/kiosk/tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...globals.es2024 },
    },
    rules: {
      'no-empty-pattern': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|e|err)$',
        },
      ],
    },
  },
  // 3e. Client (React + Vite, browser globals). client/eslint.config.js
  // owns the per-package lint when run from inside client/; this block
  // applies when ESLint is invoked at the repo root (`npm run lint`)
  // so client files aren't linted under the bare js.configs.recommended
  // defaults (which would flag every `window`, `document`, and the
  // legitimate `_` placeholder vars). Rules mirror the client config
  // intentionally — keep both in sync until the client config is
  // consolidated here.
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2024,
        __OPS_BUNDLE_MARKER__: 'readonly',
        __APP_VERSION__: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]',
          caughtErrorsIgnorePattern: '^(_|e|err|[A-Z])',
        },
      ],
    },
  },
  // 4. Desktop (Electron main process — CJS)
  {
    files: ['desktop/**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^(_|e|err)$' },
      ],
    },
  },
  // 5. Tests — relaxed
  {
    files: ['**/*.test.{js,cjs,mjs}', '**/*.integration.test.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
