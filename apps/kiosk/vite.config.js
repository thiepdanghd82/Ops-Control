// Kiosk PWA — Sprint MES-2.6.
// Served from /kiosk/ on the planner's node server (server/index.js
// mounts apps/kiosk/dist as static under that path). Dev mode runs on
// :5176 and proxies /api to the planner :3000 so kiosk JWT requests
// hit the real MES-2.5 endpoints without CORS gymnastics.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kiosk/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // mirrors client/ Phase 9L.2 — no source maps in prod
    target: 'es2020', // tablet browsers all support this
  },
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
