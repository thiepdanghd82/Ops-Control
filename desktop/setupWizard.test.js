/**
 * setupWizard.js — tests for the first-run gate (setup-done.json).
 *
 * Electron context required (setupWizard resolves paths via app.getPath).
 *
 *   cd desktop && env -u ELECTRON_RUN_AS_NODE \
 *     ./node_modules/.bin/electron --no-deprecation setupWizard.test.js
 *
 * Regression 2026-09-10: main.js's client recovery path clears the
 * `firstRunCompleted` flag in electron-store to "re-run the wizard", but
 * setup-done.json survives → isFirstRun() still says false → the wizard is
 * skipped and boot falls through to the legacy dialog instead. Recovery
 * has to clear BOTH halves of the state or it doesn't recover anything.
 *
 * An toàn dữ liệu: userData trỏ vào tmpdir — không chạm live data dir.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { app } = require('electron');

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

app.whenReady().then(async () => {
  // Must precede the require — setup-done.json resolves under userData.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-wizard-test-'));
  app.setPath('userData', tmp);
  const setupWizard = require('./setupWizard.js');
  const donePath = path.join(tmp, 'setup-done.json');

  await test('a completed client setup is no longer a first run', async () => {
    setupWizard.markComplete('client', {});
    assert.equal(setupWizard.isFirstRun('client'), false);
  });

  await test('markIncomplete() sends a completed client back to first run', async () => {
    setupWizard.markComplete('client', {});
    assert.equal(setupWizard.isFirstRun('client'), false, 'precondition');

    setupWizard.markIncomplete();

    assert.equal(
      setupWizard.isFirstRun('client'),
      true,
      'after markIncomplete() the wizard must run again'
    );
    assert.equal(fs.existsSync(donePath), false, 'setup-done.json should be gone');
  });

  await test('markIncomplete() on a fresh install is a no-op, not a throw', async () => {
    if (fs.existsSync(donePath)) fs.unlinkSync(donePath);
    setupWizard.markIncomplete();
    assert.equal(setupWizard.isFirstRun('client'), true);
  });

  // ── XSS guard on setAlert ────────────────────────────────────────────────
  //
  // The wizard renderer runs with nodeIntegration: true and
  // contextIsolation: false, so HTML parsed in it has full Node access. The
  // alert box used to be built with innerHTML, and msg is not always our own
  // literal: ops:setup.initDb returns e.message from fs.mkdirSync(dataPath),
  // and Node embeds the operator-typed path verbatim -- so a path containing
  // markup reached innerHTML and executed.
  //
  // Driven against the REAL wizard HTML in a real BrowserWindow rather than
  // grepping the source, because what matters is whether the DOM parses it.
  await test('setAlert renders a markup payload as TEXT, never as an element', async () => {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    });
    try {
      const html = setupWizard.renderClientWizard();
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

      // Exactly the shape fs.mkdirSync produces for an unwritable path the
      // operator typed, with a payload inside it.
      const payload =
        'EACCES: permission denied, mkdir \'/x/<img src=x onerror="window.__pwned=1">\'';

      const zone = await win.webContents.executeJavaScript(
        '(function(){var z=document.querySelector(\'[id^="alert-"]\');return z?z.id:null;})()'
      );
      assert.ok(zone, 'the client wizard must expose an alert zone to write into');

      await win.webContents.executeJavaScript(
        'setAlert(' + JSON.stringify(zone) + ", 'bad', " + JSON.stringify(payload) + ');'
      );

      const seen = await win.webContents.executeJavaScript(
        '({ imgs: document.querySelectorAll("img").length,' +
          '   pwned: typeof window.__pwned,' +
          '   text: document.getElementById(' +
          JSON.stringify(zone) +
          ').textContent })'
      );

      assert.equal(seen.imgs, 0, 'the payload must not become an <img> element');
      assert.equal(seen.pwned, 'undefined', 'no script from the payload may run');
      assert.ok(
        seen.text.includes('<img src=x'),
        'the operator must still SEE the offending path, verbatim, as text'
      );
    } finally {
      win.destroy();
    }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail === 0 ? 0 : 1);
});
