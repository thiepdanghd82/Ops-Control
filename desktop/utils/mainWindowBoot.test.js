'use strict';
/**
 * Guards on how the main window gets from "app started" to "app page loaded".
 *
 * On 2026-09-28, right after an install, the SERVER box showed "Không kết nối được tới
 * http://127.0.0.1:3100" twice over an app that had loaded fine — the request log holds `GET /`
 * and the React client calling `/api/health` before each dialog. Two races, both in main.js:
 *
 *  1. The connecting screen was still loading when the app URL was loaded. Electron's loadURL()
 *     promise for the app records that aborted load (-3, on the data: URL) and rejects once the
 *     app has finished loading, and main.js read the rejection as "server unreachable".
 *  2. macOS `activate` fired during startup and created a second main window. The async block of
 *     each createMainWindow() call loaded the module-level `mainWindow` — by then the second
 *     window — so the two loads aborted each other (ERR_ABORTED on the app URL).
 *
 * Both reproduce in a real BrowserWindow (connectThenLoad.test.js, run under Electron). These
 * tests pin the ordering and the decision without booting Electron, so CI runs them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { connectThenLoad, activateAction } = require('./mainWindowBoot');

const CONNECTING = 'data:text/html;charset=utf-8,connecting';
const APP = 'http://127.0.0.1:3100';

/**
 * A stand-in for a BrowserWindow: records when each load starts and settles. The connecting
 * screen takes `connectingMs` to settle and fails when `connectingFails` is set; the app load
 * fails when `appFails` is set.
 */
function fakeWindow({ connectingMs = 30, connectingFails = false, appFails = false } = {}) {
  const events = [];
  return {
    events,
    loadURL(url) {
      const which = url === APP ? 'app' : 'connecting';
      events.push(`${which}:start`);
      const ms = which === 'connecting' ? connectingMs : 1;
      const fails = which === 'connecting' ? connectingFails : appFails;
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          events.push(`${which}:settled`);
          if (fails) reject(Object.assign(new Error('load failed'), { errno: -3 }));
          else resolve();
        }, ms)
      );
    },
  };
}

const opts = (waitReady) => ({ connectingUrl: CONNECTING, appUrl: APP, waitReady });

test('the app load starts only after the connecting screen has settled', async () => {
  // The server answers at once, as it does when the embedded server is already up, while the
  // connecting screen is still loading — the ordering that raised the first false dialog.
  const win = fakeWindow({ connectingMs: 40 });
  const res = await connectThenLoad(
    win,
    opts(async () => true)
  );
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(win.events, [
    'connecting:start',
    'connecting:settled',
    'app:start',
    'app:settled',
  ]);
});

test('a connecting screen that fails to load does not stop the app from loading', async () => {
  const win = fakeWindow({ connectingFails: true });
  const res = await connectThenLoad(
    win,
    opts(async () => true)
  );
  assert.deepEqual(res, { ok: true });
  assert.ok(win.events.includes('app:settled'));
});

test('a server that never answers is reported unreachable and the app URL is not loaded', async () => {
  const win = fakeWindow();
  const res = await connectThenLoad(
    win,
    opts(async () => false)
  );
  assert.deepEqual(res, { ok: false, reason: 'unreachable' });
  assert.ok(!win.events.includes('app:start'), 'must not load the app URL');
});

test('an app page that fails to load is reported with its own error', async () => {
  const win = fakeWindow({ appFails: true });
  const res = await connectThenLoad(
    win,
    opts(async () => true)
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'load-failed');
  assert.equal(res.err.errno, -3);
});

test('two windows each load only themselves', async () => {
  // The second false dialog: two createMainWindow() calls whose async blocks both loaded the
  // module-level window. Each call now drives the window it was handed.
  const a = fakeWindow({ connectingMs: 20 });
  const b = fakeWindow({ connectingMs: 5 });
  const [ra, rb] = await Promise.all([
    connectThenLoad(
      a,
      opts(async () => true)
    ),
    connectThenLoad(
      b,
      opts(async () => true)
    ),
  ]);
  assert.deepEqual([ra, rb], [{ ok: true }, { ok: true }]);
  for (const w of [a, b]) {
    assert.deepEqual(w.events, [
      'connecting:start',
      'connecting:settled',
      'app:start',
      'app:settled',
    ]);
  }
});

test('activate waits while startup has not created the main window', () => {
  // Startup creates the window once the embedded server is up; activate fires in the seconds
  // before that on a Dock click or the reopen event of a second launch. It must not create one.
  assert.equal(activateAction({ startupDone: false, windowCount: 0 }), 'wait');
  assert.equal(activateAction({ startupDone: false, windowCount: 1 }), 'wait');
});

test('after startup, activate recreates a closed window or shows the open one', () => {
  // On macOS closing the last window leaves the app running; a Dock click brings it back.
  assert.equal(activateAction({ startupDone: true, windowCount: 0 }), 'create');
  assert.equal(activateAction({ startupDone: true, windowCount: 1 }), 'show');
});

test('main.js loads the main window through connectThenLoad and gates activate', () => {
  // Source-level, because main.js cannot be required outside Electron: the helpers above only
  // protect the app if main.js actually calls them.
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /connectThenLoad\(mainWindow,/, 'createMainWindow must use connectThenLoad');
  assert.doesNotMatch(
    src,
    /await mainWindow\.loadURL\(url\)/,
    'the app URL must not be loaded inline, next to a still-loading connecting screen'
  );
  const activate = src.slice(src.indexOf("app.on('activate'"));
  assert.match(
    activate.slice(0, 600),
    /activateAction\(/,
    'activate must go through activateAction'
  );
  assert.match(
    src,
    /createMainWindow\(\);\s*\n\s*startupDone = true;/,
    'startup must mark itself done right after creating the main window'
  );
});
