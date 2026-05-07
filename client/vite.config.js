/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const APP_VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).version;

// Sprint 32 — opt-in bundle analyzer. `ANALYZE=1 npm run build` emits
// dist/bundle-stats.html (interactive treemap) + dist/bundle-stats.json
// (programmatic inspection). Gated by env var so normal builds stay
// identical in output and CI time. Treemap explains which modules
// occupy the 241 kB shell chunk when someone asks "why did index.js
// grow?"
const ANALYZE = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    ANALYZE && visualizer({
      filename: 'dist/bundle-stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
    // Second pass emits raw-data JSON for scripting (future perf-budget
    // rule that reads module-level costs instead of file totals).
    ANALYZE && visualizer({
      filename: 'dist/bundle-stats.json',
      template: 'raw-data',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  build: {
    // Phase 9L.2 — do not emit .js.map in production. Default Vite
    // setting bundles source maps, which attackers can use to
    // reconstruct the full client codebase (including comments,
    // variable names, route mounts). OWASP A05 (security
    // misconfiguration). For error monitoring we can switch to
    // 'hidden' when Sentry-style integration lands — maps generated
    // and uploaded, not served publicly.
    sourcemap: false,
  },
  // v1.3 F4 — Bundle marker. Emitted as a constant in the main entry
  // chunk so post-build verification can `grep` for it inside the DMG
  // (after asar extract) and prove "this binary contains v1.3 client
  // bundle from this exact build". Format:
  //   opsctl-v1.3-marker:<commit-or-buildhash>:<iso-timestamp>
  define: {
    __OPS_BUNDLE_MARKER__: JSON.stringify(
      `opsctl-v1.3-marker:${process.env.OPS_BUILD_ID || 'local'}:${new Date().toISOString()}`,
    ),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/legacy': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/data': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
