/**
 * Smoke test for verify-install.js — runs the script in-process and
 * asserts the exit code + the "all checks passed" summary.
 *
 * Only runs when `client/dist/` exists (i.e. after `npm run build`). If
 * the dist is absent we skip — the CI pipeline runs build before this
 * test, so a skip here means the test environment is unusual, not a
 * regression.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(__dirname, 'verify-install.js');
const DIST = path.join(ROOT, 'client', 'dist');

const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));

test('verify-install: exits 0 with all checks passing on a good build', { skip: !hasBuild }, () => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf-8' });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /OK: \d+ checks passed/);
  // Spot-check the specific bucket labels so a future drop in coverage is
  // visible in test failures rather than silently expanding pass count.
  assert.match(r.stdout, /file server\/index\.js/);
  assert.match(r.stdout, /client\/dist\/assets/);
  assert.match(r.stdout, /asset references/);
  assert.match(r.stdout, /node_modules/);
});

test('verify-install: OPS_VERIFY_ROOT=empty-dir → exit 1, reports missing files', () => {
  // Point the script at a fresh tmpdir (no server/, no client/dist, no
  // package.json). Every file check + dist check should fail, and the
  // process must exit non-zero. Uses env override so the real repo is
  // untouched and parallel tests stay isolated.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-empty-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf-8',
      env: { ...process.env, OPS_VERIFY_ROOT: tmp, DATA_DIR: '' },
    });
    assert.equal(r.status, 1, `expected exit 1 in empty dir; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /FAILED/);
    assert.match(r.stdout, /server\/index\.js.*missing|✗/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
