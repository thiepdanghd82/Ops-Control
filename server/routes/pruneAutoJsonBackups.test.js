/**
 * pruneAutoJsonBackups — the /save-all auto-snapshot retention rule.
 *   node --test server/routes/pruneAutoJsonBackups.test.js
 *
 * This prune was inline in the save-all handler and untested, while it
 * deletes files. Extracted so the rule can be checked on its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pruneAutoJsonBackups } from './costApi.js';

function seed(dir, name, ageDays) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '{}');
  const t = new Date(Date.now() - ageDays * 86400000);
  fs.utimesSync(p, t, t);
  return p;
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ops-autoprune-'));
}

test('deletes auto_ snapshots past the retention window', () => {
  const d = tmpdir();
  try {
    seed(d, 'auto_20260101_000000.json', 100);
    seed(d, 'auto_20260601_000000.json', 1);
    assert.equal(pruneAutoJsonBackups(d, 30), 1);
    assert.deepEqual(fs.readdirSync(d), ['auto_20260601_000000.json']);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a longer retention keeps what 30 days would delete', () => {
  const d = tmpdir();
  try {
    seed(d, 'auto_20260101_000000.json', 100);
    assert.equal(pruneAutoJsonBackups(d, 400), 0, '100 days old is inside a 400-day window');
    assert.equal(fs.readdirSync(d).length, 1);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('manual_ snapshots are never pruned, however old', () => {
  const d = tmpdir();
  try {
    seed(d, 'manual_20250101_000000.json', 900);
    seed(d, 'auto_20250101_000000.json', 900);
    assert.equal(pruneAutoJsonBackups(d, 30), 1, 'only the auto_ one may go');
    assert.deepEqual(fs.readdirSync(d), ['manual_20250101_000000.json']);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('non-JSON and unrelated files are left alone', () => {
  const d = tmpdir();
  try {
    seed(d, 'auto_20250101_000000.json.tmp', 900);
    seed(d, 'readme.txt', 900);
    assert.equal(pruneAutoJsonBackups(d, 30), 0);
    assert.equal(fs.readdirSync(d).length, 2);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a missing directory returns 0 rather than throwing', () => {
  assert.equal(pruneAutoJsonBackups(path.join(os.tmpdir(), 'ops-does-not-exist-xyz'), 30), 0);
});
