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

  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail === 0 ? 0 : 1);
});
