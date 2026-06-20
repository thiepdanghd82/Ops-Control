/**
 * integrityProbe unit tests — Phase 3 M-5a (Track B) of Debug Playbook
 * (2026-06-20).
 *
 * Tests cover:
 *   - Healthy DB → ok=true, no errors
 *   - No DB file (first boot) → ok=true, dbExists=false
 *   - Corrupt DB (header bytes mangled) → ok=false, errors populated
 *   - OPS_SKIP_INTEGRITY_PROBE=1 → skipped=true, ok=true (override)
 *
 *   node --test server/db/integrityProbe.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { verifyDbIntegrity } from './integrityProbe.js';
import { _resetForTests } from './connection.js';

function newTmpDir() {
  return mkdtempSync(join(tmpdir(), 'ops-integrity-test-'));
}

test('verifyDbIntegrity — healthy DB returns ok=true', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  // Create a real SQLite DB with one table + one row
  const db = new Database(dbPath);
  db.exec('CREATE TABLE t (id INTEGER, v TEXT)');
  db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'hello');
  db.close();

  process.env.OPS_DB_PATH = dbPath;
  delete process.env.OPS_SKIP_INTEGRITY_PROBE;
  _resetForTests();

  const r = verifyDbIntegrity();
  assert.equal(r.ok, true);
  assert.equal(r.dbExists, true);
  assert.deepEqual(r.errors, []);
  assert.ok(r.elapsedMs >= 0);
  assert.equal(r.dbPath, dbPath);
});

test('verifyDbIntegrity — no DB file (first boot) returns ok=true with dbExists=false', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'does-not-exist.db');
  assert.equal(existsSync(dbPath), false, 'precondition: file absent');

  process.env.OPS_DB_PATH = dbPath;
  delete process.env.OPS_SKIP_INTEGRITY_PROBE;
  _resetForTests();

  const r = verifyDbIntegrity();
  assert.equal(r.ok, true, 'first-boot scenario is OK');
  assert.equal(r.dbExists, false);
  assert.deepEqual(r.errors, []);
});

test('verifyDbIntegrity — corrupt DB (mangled bytes) returns ok=false with errors', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  // Create a real DB then corrupt it by overwriting middle bytes
  const db = new Database(dbPath);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  // Insert enough rows to span multiple pages so corruption surfaces
  const insert = db.prepare('INSERT INTO t VALUES (?, ?)');
  for (let i = 0; i < 1000; i++) insert.run(i, `row-${i}-`.repeat(20));
  db.close();

  // Corrupt the SQLite file header (first 16 bytes = magic "SQLite
  // format 3\0"). Overwriting any header byte makes the file
  // unopenable → getDb()/PRAGMA throws → probe returns ok=false via
  // the catch path. This is the most reliable corruption test that
  // doesn't depend on SQLite's tolerance of mid-file damage.
  const buf = readFileSync(dbPath);
  for (let i = 0; i < 16; i++) buf[i] = 0xff;
  writeFileSync(dbPath, buf);

  process.env.OPS_DB_PATH = dbPath;
  delete process.env.OPS_SKIP_INTEGRITY_PROBE;
  _resetForTests();

  const r = verifyDbIntegrity();
  assert.equal(r.ok, false, 'corrupted DB must fail integrity check');
  assert.equal(r.dbExists, true);
  assert.ok(r.errors.length > 0, 'errors array populated');
  // Each error is a string from PRAGMA integrity_check (or our thrown
  // wrapper "PRAGMA integrity_check threw: ..."). We accept either.
  for (const e of r.errors) assert.equal(typeof e, 'string');
});

test('verifyDbIntegrity — OPS_SKIP_INTEGRITY_PROBE=1 short-circuits to ok=true', () => {
  const dir = newTmpDir();
  // Even with a corrupt file, the env override returns ok=true + skipped
  const dbPath = join(dir, 'ops.db');
  writeFileSync(dbPath, Buffer.from([0xff, 0xff, 0xff, 0xff])); // garbage

  process.env.OPS_DB_PATH = dbPath;
  process.env.OPS_SKIP_INTEGRITY_PROBE = '1';
  _resetForTests();

  const r = verifyDbIntegrity();
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  assert.equal(r.elapsedMs, 0);

  delete process.env.OPS_SKIP_INTEGRITY_PROBE;
});
