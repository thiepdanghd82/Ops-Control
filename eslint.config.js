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
      'client/dist/',
      'desktop/dist-electron/',
      'server/data/',
      '_legacy/',
      'backup/',
      'dist/',
      'docs/audit-2026-04-17/',
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-debugger': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // 3b. Puppeteer self-check — page.evaluate() callbacks ferried into
  // the browser context legitimately reference window/document. Adding
  // browser globals here keeps the smoke harness lint-clean without
  // weakening the no-undef rule for real Node scripts.
  {
    files: ['scripts/help/self-check.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2024 },
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
