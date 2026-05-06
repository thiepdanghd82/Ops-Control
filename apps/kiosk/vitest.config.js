// Vitest config — Sprint MES-3-V2 KIOSK-004.
// jsdom env so Testing-Library can mount React. globals=true gives us
// describe/test/expect/vi without per-file imports — matches the project's
// existing node:test ergonomics.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // jsxRuntime 'automatic' is the @vitejs/plugin-react default but
  // vitest 3 sometimes loses the transform on .test.jsx files unless we
  // set the esbuild JSX automatic shim too.
  esbuild: {
    jsx: 'automatic',
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Restrict the discover glob so vite's normal test glob (which would
    // also pull `tests/e2e/**` Playwright specs) doesn't trip over them.
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
