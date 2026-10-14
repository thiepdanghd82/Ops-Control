/**
 * clientFirstRun.js — tests for the CLIENT build's first-run "connect to
 * server" dialog.
 *
 * Test này YÊU CẦU Electron context (cần BrowserWindow + Chromium thật để
 * chứng minh kênh renderer → main process hoạt động). Cách chạy:
 *
 *   cd desktop && env -u ELECTRON_RUN_AS_NODE \
 *     ./node_modules/.bin/electron --no-deprecation clientFirstRun.test.js
 *
 * Regression 2026-09-10 (Henry — máy client CCL không kết nối được):
 * dialog nạp bằng `data:` URL rồi gọi fetch('/__probe__?…') và chặn bằng
 * session.webRequest. Trang `data:` có origin rỗng + base URL không phân
 * cấp → đường dẫn tuyệt đối không parse được → fetch reject ngay,
 * interceptor KHÔNG BAO GIỜ chạy, probeServer() không bao giờ được gọi.
 * Người dùng chỉ thấy "✗ Không kết nối được: probe timeout" sau 5 s trong
 * khi server hoàn toàn khỏe. Cả ba nút (Test / Lưu / Bỏ qua) đều chết.
 *
 * KHÔNG import main.js — require nó sẽ boot cả app (server nhúng, license,
 * DATA_DIR thật). Dialog phải là module riêng, nhận `store`/`log` qua
 * tham số, giống setupWizard.js.
 *
 * An toàn dữ liệu: userData trỏ vào tmpdir, server test bind 127.0.0.1
 * cổng ephemeral — không chạm live data dir (xem skill prod-data-safety).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert');
const { app, BrowserWindow } = require('electron');

// Loaded defensively: an uncaught throw in Electron's main process pops a
// modal error box and hangs the run instead of failing the suite.
let showClientFirstRunDialog;
try {
  ({ showClientFirstRunDialog } = require('./clientFirstRun.js'));
} catch (err) {
  console.error(`✖ cannot load ./clientFirstRun.js — ${err.message}`);
  process.exit(1);
}

// Watchdog: the renderer's own probe race is 5 s, so a healthy suite is
// well under this. Without it a stuck window would hang CI forever.
setTimeout(() => {
  console.error('✖ watchdog: suite hung');
  app.exit(2);
}, 90_000).unref();

let pass = 0,
  fail = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    results.push(`✔ ${name}`);
  } catch (err) {
    fail++;
    results.push(`✖ ${name}\n  ${err.message}`);
  }
  console.log(results[results.length - 1]);
}

/** A dead button never closes the window — fail the test, don't hang it. */
function within(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`timed out waiting for ${label}`)), ms);
    }),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────
function waitUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (async function poll() {
      let v;
      try {
        v = await fn();
      } catch {
        v = null;
      }
      if (v) return resolve(v);
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${label}`));
      setTimeout(poll, 50);
    })();
  });
}

/** Throwaway /health server on an ephemeral port — never the live :3100. */
function startFakeServer(version) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version }));
      } else {
        res.writeHead(404).end();
      }
    });
    srv.listen(0, '127.0.0.1', () =>
      resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` })
    );
  });
}

function fakeDeps() {
  const data = new Map();
  return {
    store: {
      get: (k) => data.get(k),
      set: (k, v) => data.set(k, v),
      delete: (k) => data.delete(k),
      _data: data,
    },
    log: { info() {}, warn() {}, error() {} },
  };
}

/** Opens the dialog and hands back the live BrowserWindow to drive. */
async function openDialog(deps) {
  const before = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
  const closed = showClientFirstRunDialog(deps);
  const win = await waitUntil(
    () => BrowserWindow.getAllWindows().find((w) => !before.has(w.id)) || null,
    5000,
    'dialog window'
  );
  await waitUntil(
    async () =>
      (await win.webContents.executeJavaScript(
        `document.readyState === 'complete' && !!document.getElementById('test')`
      )) || null,
    5000,
    'dialog DOM'
  );
  return { closed, win };
}

const statusOf = (win) =>
  win.webContents.executeJavaScript(`document.getElementById('status').textContent`);

/** Settled = the 5 s race in the renderer produced something either way. */
const settledStatus = (win) =>
  waitUntil(
    async () => {
      const s = await statusOf(win);
      return s && !s.startsWith('Đang test') ? s : null;
    },
    12000,
    'status line to settle'
  );

// ─── Tests ────────────────────────────────────────────────────────
async function main() {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ops-firstrun-test-')));

  const { srv, url } = await startFakeServer('9.9.9-test');

  await test('"Test kết nối" reaches the main process and reports the server version', async () => {
    const deps = fakeDeps();
    const { closed, win } = await openDialog(deps);
    try {
      await win.webContents.executeJavaScript(
        `document.getElementById('url').value = ${JSON.stringify(url)};
         document.getElementById('test').click(); true;`
      );
      const status = await settledStatus(win);
      assert.ok(
        status.startsWith('✓ Server v9.9.9-test OK'),
        `expected a successful probe, got: ${status}`
      );
      const saveDisabled = await win.webContents.executeJavaScript(
        `document.getElementById('save').disabled`
      );
      assert.equal(saveDisabled, false, '"Lưu & tiếp tục" should be enabled after a good test');
    } finally {
      if (!win.isDestroyed()) win.close();
      await within(closed, 8000, 'the dialog to close');
    }
  });

  await test('"Lưu & tiếp tục" persists thin mode + remoteUrl, then closes', async () => {
    const deps = fakeDeps();
    const { closed, win } = await openDialog(deps);
    await win.webContents.executeJavaScript(
      `document.getElementById('url').value = ${JSON.stringify(url)};
       document.getElementById('test').click(); true;`
    );
    await settledStatus(win);
    await win.webContents.executeJavaScript(`document.getElementById('save').click(); true;`);
    try {
      await within(closed, 8000, 'the dialog to close after "Lưu & tiếp tục"');
    } finally {
      if (!win.isDestroyed()) win.close();
    }
    assert.equal(deps.store.get('mode'), 'thin');
    assert.equal(deps.store.get('remoteUrl'), url);
  });

  await test('"Bỏ qua" falls back to embedded mode, then closes', async () => {
    const deps = fakeDeps();
    const { closed, win } = await openDialog(deps);
    await win.webContents.executeJavaScript(`document.getElementById('skip').click(); true;`);
    try {
      await within(closed, 8000, 'the dialog to close after "Bỏ qua"');
    } finally {
      if (!win.isDestroyed()) win.close();
    }
    assert.equal(deps.store.get('mode'), 'embedded');
    assert.equal(deps.store.get('remoteUrl'), '');
  });

  await test('an unreachable server reports the real error, not a bare timeout', async () => {
    const deps = fakeDeps();
    const { closed, win } = await openDialog(deps);
    try {
      // Port 1 on loopback: nothing listens → immediate ECONNREFUSED.
      await win.webContents.executeJavaScript(
        `document.getElementById('url').value = 'http://127.0.0.1:1';
         document.getElementById('test').click(); true;`
      );
      const status = await settledStatus(win);
      assert.ok(status.startsWith('✗ Không kết nối được:'), `got: ${status}`);
      assert.ok(
        /ECONNREFUSED/i.test(status),
        `expected the real connection error to surface, got: ${status}`
      );
      const saveDisabled = await win.webContents.executeJavaScript(
        `document.getElementById('save').disabled`
      );
      assert.equal(saveDisabled, true, 'Save must stay disabled after a failed test');
    } finally {
      if (!win.isDestroyed()) win.close();
      await within(closed, 8000, 'the dialog to close');
    }
  });

  srv.close();

  console.log('\n' + results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail === 0 ? 0 : 1);
}

app.whenReady().then(main);
