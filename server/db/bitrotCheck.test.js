/**
 * bitrotCheck unit tests — Phase 3 M-5b (Track B) of Debug Playbook
 * (2026-06-20).
 *
 *   node --test server/db/bitrotCheck.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { runBitrotCheck, hashRow, getManifestPath } from './bitrotCheck.js';
import { _resetForTests } from './connection.js';

function newTmpDir() {
  return mkdtempSync(join(tmpdir(), 'ops-bitrot-test-'));
}

function setupDbWithQuotes(dbPath, rows) {
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    type TEXT,
    saved_at TEXT,
    raw_json TEXT NOT NULL
  )`);
  const ins = db.prepare('INSERT INTO quotes (id, type, saved_at, raw_json) VALUES (?, ?, ?, ?)');
  for (const r of rows) ins.run(r.id, r.type || 'standard', r.saved_at, r.raw_json);
  db.close();
}

function bootEnv(dbPath, manifestPath) {
  process.env.OPS_DB_PATH = dbPath;
  process.env.OPS_BITROT_MANIFEST = manifestPath;
  _resetForTests();
}

const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60d ago

test('hashRow — deterministic + sensitive to any byte change', () => {
  const a = hashRow('{"id":1,"x":"abc"}');
  const b = hashRow('{"id":1,"x":"abc"}');
  const c = hashRow('{"id":1,"x":"abd"}');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test('runBitrotCheck — first run writes baseline manifest + ok=true', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  const manifestPath = join(dir, 'manifest.json');
  setupDbWithQuotes(dbPath, [
    { id: 1, saved_at: oldDate, raw_json: '{"q":1}' },
    { id: 2, saved_at: oldDate, raw_json: '{"q":2}' },
  ]);
  bootEnv(dbPath, manifestPath);

  const r = runBitrotCheck();
  assert.equal(r.ok, true);
  assert.equal(r.firstRun, true);
  assert.equal(r.total, 2);
  assert.equal(r.checked, 2);
  assert.deepEqual(r.drift, []);
  assert.equal(existsSync(manifestPath), true, 'manifest written');

  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(Object.keys(m.rows).length, 2);
  assert.equal(m.rows['1'].sha256, hashRow('{"q":1}'));
});

test('runBitrotCheck — clean second run (no mutation) → ok=true, drift empty', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  const manifestPath = join(dir, 'manifest.json');
  setupDbWithQuotes(dbPath, [{ id: 1, saved_at: oldDate, raw_json: '{"q":1}' }]);
  bootEnv(dbPath, manifestPath);

  runBitrotCheck(); // baseline
  const r2 = runBitrotCheck();
  assert.equal(r2.ok, true);
  assert.equal(r2.firstRun, false);
  assert.deepEqual(r2.drift, []);
});

test('runBitrotCheck — DRIFT detected when row content changed since baseline', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  const manifestPath = join(dir, 'manifest.json');
  setupDbWithQuotes(dbPath, [{ id: 1, saved_at: oldDate, raw_json: '{"q":1}' }]);
  bootEnv(dbPath, manifestPath);

  runBitrotCheck(); // baseline at {"q":1}

  // Simulate bit-rot: row content mutates to different bytes
  const db = new Database(dbPath);
  db.prepare('UPDATE quotes SET raw_json = ? WHERE id = ?').run('{"q":99}', 1);
  db.close();
  _resetForTests();

  const r2 = runBitrotCheck();
  assert.equal(r2.ok, false, 'drift MUST be reported');
  assert.equal(r2.drift.length, 1);
  assert.equal(r2.drift[0].quoteId, 1);
  assert.equal(r2.drift[0].expectedSha, hashRow('{"q":1}'));
  assert.equal(r2.drift[0].actualSha, hashRow('{"q":99}'));
});

test('runBitrotCheck — new row that just aged past 30d added to manifest, no drift', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  const manifestPath = join(dir, 'manifest.json');
  setupDbWithQuotes(dbPath, [{ id: 1, saved_at: oldDate, raw_json: '{"q":1}' }]);
  bootEnv(dbPath, manifestPath);

  runBitrotCheck(); // baseline tracks id=1

  // Operator adds a new row that's already old (e.g. migration import)
  const db = new Database(dbPath);
  db.prepare('INSERT INTO quotes (id, saved_at, raw_json) VALUES (?, ?, ?)').run(
    2,
    oldDate,
    '{"q":2}'
  );
  db.close();
  _resetForTests();

  const r2 = runBitrotCheck();
  assert.equal(r2.ok, true, 'new row added to manifest is NOT drift');
  assert.equal(r2.missingFromManifest.length, 1);
  assert.equal(r2.missingFromManifest[0].quoteId, 2);

  // After this run, row 2 should be in manifest for next run
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(m.rows['2'], 'row 2 added to baseline on this run');
  assert.equal(m.rows['2'].sha256, hashRow('{"q":2}'));
});

test('runBitrotCheck — rows YOUNGER than 30d are NOT checked (within backup retention)', () => {
  const dir = newTmpDir();
  const dbPath = join(dir, 'ops.db');
  const manifestPath = join(dir, 'manifest.json');
  const youngDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5d ago
  setupDbWithQuotes(dbPath, [
    { id: 1, saved_at: oldDate, raw_json: '{"q":1}' },
    { id: 2, saved_at: youngDate, raw_json: '{"q":2}' },
  ]);
  bootEnv(dbPath, manifestPath);

  const r = runBitrotCheck();
  assert.equal(r.total, 1, 'only 1 row (id=1) past 30d cutoff');
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(m.rows['1']);
  assert.ok(!m.rows['2'], 'young row not yet tracked');
});

test('getManifestPath — honors OPS_BITROT_MANIFEST env override', () => {
  process.env.OPS_BITROT_MANIFEST = '/tmp/custom-manifest.json';
  assert.equal(getManifestPath(), '/tmp/custom-manifest.json');
  delete process.env.OPS_BITROT_MANIFEST;
});
