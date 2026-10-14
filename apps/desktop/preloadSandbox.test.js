'use strict';
/**
 * The main window runs with `sandbox: true` — this proves the preload still
 * works there.
 *
 * Until 2026-09-21 it ran with `sandbox: false`, annotated "Cần false để
 * preload truy cập node modules". That had stopped being true: every
 * filesystem call moved behind IPC, and preload.js now requires only
 * `electron` and reads `process.platform` / `process.versions`, all of which a
 * sandboxed preload still has. But "looks compatible" is not evidence, and
 * flipping the flag can break every `window.ops` call at once while the app
 * still opens and looks fine — the failure is a renderer whose bridge is
 * simply absent.
 *
 * So this loads the REAL preload under the REAL flags and drives a REAL IPC
 * round-trip. Nothing else in the suite touches the main window's
 * webPreferences.
 *
 *   cd desktop && env -u ELECTRON_RUN_AS_NODE \
 *     ./node_modules/.bin/electron --no-deprecation preloadSandbox.test.js
 */

const path = require('node:path');
const assert = require('node:assert');
const { app, BrowserWindow, ipcMain } = require('electron');

let pass = 0,
  fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✔ ${name}`);
  } catch (err) {
    fail++;
    console.log(`✖ ${name}\n  ${err.message}`);
  }
}

// Every top-level namespace preload.js puts on window.ops. Listed explicitly
// rather than derived, so dropping one is a failure rather than a smaller set.
const OPS_NAMESPACES = [
  'app',
  'license',
  'updater',
  'net',
  'shell',
  'printer',
  'labelPrinter',
  'scale',
  'scanner',
  'cache',
  'fs',
];

app.whenReady().then(async () => {
  // Stub for the round-trip. `ops:get-config` is what window.ops.app.getConfig
  // invokes; the value is arbitrary, reaching main and coming back is the point.
  ipcMain.handle('ops:get-config', () => ({ marker: 'round-trip-ok' }));

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // the flag under test
    },
  });

  try {
    await win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><title>t</title>')
    );

    await test('the bridge exists at all under sandbox', async () => {
      const shape = await win.webContents.executeJavaScript(
        '({ ops: typeof window.ops, runtime: typeof window.opsRuntime })'
      );
      assert.strictEqual(shape.ops, 'object', 'window.ops must be exposed');
      assert.strictEqual(shape.runtime, 'object', 'window.opsRuntime must be exposed');
    });

    await test('every window.ops namespace survived', async () => {
      const got = await win.webContents.executeJavaScript('Object.keys(window.ops || {}).sort()');
      assert.deepStrictEqual(
        got,
        [...OPS_NAMESPACES].sort(),
        `namespaces changed: got ${JSON.stringify(got)}`
      );
    });

    await test('an IPC call actually crosses to main and back', async () => {
      // The one assertion that cannot pass by accident: a value produced in
      // the main process, fetched from the sandboxed renderer through the
      // preload bridge.
      const r = await win.webContents.executeJavaScript('window.ops.app.getConfig()');
      assert.strictEqual(r.marker, 'round-trip-ok', 'IPC round-trip failed');
    });

    await test('process.platform and versions still reach the renderer', async () => {
      // preload reads these off the sandboxed `process` polyfill. If Electron
      // ever stops providing them, Settings → About goes blank and nothing
      // else complains, so pin them here.
      const rt = await win.webContents.executeJavaScript(
        '({ platform: window.opsRuntime.platform, electron: window.opsRuntime.versions.electron,' +
          '   chrome: window.opsRuntime.versions.chrome, node: window.opsRuntime.versions.node,' +
          '   isElectron: window.opsRuntime.isElectron })'
      );
      assert.strictEqual(rt.isElectron, true);
      assert.ok(rt.platform && typeof rt.platform === 'string', 'platform must be a string');
      assert.match(rt.electron || '', /^\d+\.\d+\.\d+/, 'electron version must reach the renderer');
      assert.match(rt.chrome || '', /^\d+\./, 'chrome version must reach the renderer');
      // node was the one value expected to disappear under sandbox — it does
      // not, Electron's polyfilled process still carries it, so Settings →
      // About loses nothing. Asserted because "we checked once" is not a guard.
      assert.match(rt.node || '', /^\d+\.\d+\.\d+/, 'node version must reach the renderer');
    });

    await test('the renderer still has no direct node access', async () => {
      // The whole point of sandbox + contextIsolation. If any of these are
      // defined, the bridge is not the only way out.
      const leaks = await win.webContents.executeJavaScript(
        '({ require: typeof window.require, process: typeof window.process,' +
          '   module: typeof window.module, Buffer: typeof window.Buffer })'
      );
      for (const [k, v] of Object.entries(leaks)) {
        assert.strictEqual(v, 'undefined', `window.${k} must not be reachable from the renderer`);
      }
    });
  } finally {
    win.destroy();
    ipcMain.removeHandler('ops:get-config');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail === 0 ? 0 : 1);
});
