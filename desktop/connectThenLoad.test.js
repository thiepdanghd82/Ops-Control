'use strict';
/**
 * connectThenLoad under a REAL BrowserWindow — the race behind the first false
 * "Không kết nối được tới http://127.0.0.1:3100" dialog of 2026-09-28.
 *
 * Electron's loadURL() promise for a page records a main-frame did-fail-load that fires while it is
 * pending, even when the failure belongs to the page before it. Loading the app while the
 * connecting screen is committed but still loading aborts the connecting screen (-3, with an empty
 * description, on the data: URL), and the app's loadURL() rejects with that abort after the app
 * page has loaded. On a busy boot the window is milliseconds wide — one boot in eleven hit it —
 * so here a slow image holds the connecting screen open and the server "answers" the moment it
 * commits, which hits it every time.
 *
 *   cd desktop && env -u ELECTRON_RUN_AS_NODE \
 *     ./node_modules/.bin/electron --no-deprecation connectThenLoad.test.js
 */

const http = require('node:http');
const assert = require('node:assert');
const { app, BrowserWindow } = require('electron');
const { connectThenLoad } = require('./utils/mainWindowBoot');

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

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Several windows open and close in turn; without this the app quits after the first one.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/slow.gif') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/gif' });
        res.end(GIF);
      }, 800);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>app</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const appUrl = `${base}/`;
  const connectingUrl =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(`<!doctype html><p>Đang kết nối…</p><img src="${base}/slow.gif">`);

  // Sandboxed and isolated, as the main window is.
  const newWindow = () =>
    new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  // The server "answers" the moment the connecting screen commits — the worst case.
  const readyOnCommit = (win) => () =>
    new Promise((resolve) => win.webContents.once('did-navigate', () => resolve(true)));

  try {
    await test("control: loading over a still-loading page rejects with that page's abort", async () => {
      // Pins the Electron behaviour connectThenLoad exists for. If a later Electron stops
      // attributing the old page's abort to the new load, this fails first and says so.
      const win = newWindow();
      try {
        const committed = readyOnCommit(win)();
        win.loadURL(connectingUrl).catch(() => {});
        await committed;
        await assert.rejects(
          win.loadURL(appUrl),
          (err) => err.errno === -3 && String(err.url).startsWith('data:'),
          'expected the abort of the data: URL'
        );
        assert.strictEqual(win.webContents.getURL(), appUrl, 'the app page itself loaded');
      } finally {
        win.destroy();
      }
    });

    await test('connectThenLoad loads the app although the server answers mid-connect', async () => {
      const win = newWindow();
      try {
        const res = await connectThenLoad(win, {
          connectingUrl,
          appUrl,
          waitReady: readyOnCommit(win),
        });
        const shown = res.ok ? res : { ...res, err: String(res.err) };
        assert.deepStrictEqual(res, { ok: true }, `got ${JSON.stringify(shown)}`);
        assert.strictEqual(win.webContents.getURL(), appUrl);
      } finally {
        win.destroy();
      }
    });
  } finally {
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail === 0 ? 0 : 1);
});
