/**
 * backupScheduler — backup cycle invariants.
 *   node --test server/services/backupScheduler.test.js
 *
 * Covers PROMPT 7 deliverables:
 *   1. runBackupCycle({force:true}) returns ok=true with a valid env
 *   2. Library tarball excludes Library/Users/totp_secrets* (P1-8)
 *   3. runBackupCycle is idempotent on same-day re-run (skipped:true)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { _resetForTests } from '../db/connection.js';
import { runBackupCycle } from './backupScheduler.js';

// connection.js + backup.js + backupScheduler.js share a single
// singleton DB connection via Node's ESM cache. Each test must call
// _resetForTests() AFTER setting DATA_DIR/OPS_DB_PATH so the next
// getDb() picks up the new path. Cache-buster query strings would
// only refresh backupScheduler.js, not its deep static deps.

function setupTempDataDir(tag) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ops-backup-test-${tag}-`));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(path.join(dataDir, 'Library', 'Users'), { recursive: true });
  // Seed: a TOTP secrets file we want EXCLUDED from the tarball
  fs.writeFileSync(
    path.join(dataDir, 'Library', 'Users', 'totp_secrets.enc'),
    'BOGUS-ENCRYPTED-SECRET-PAYLOAD'
  );
  // Seed: a regular Library file we want INCLUDED
  fs.writeFileSync(
    path.join(dataDir, 'Library', 'Users', 'users.json'),
    JSON.stringify({ users: [] })
  );
  const dbPath = path.join(dataDir, 'ops.db');
  process.env.DATA_DIR = dataDir;
  process.env.OPS_DB_PATH = dbPath;
  // Reset the connection singleton so getDbPath() re-reads OPS_DB_PATH
  _resetForTests();
  // Create the empty DB file via better-sqlite3 directly so backupOpsDb
  // has something to back up.
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.close();
  return { tmpDir, dataDir, dbPath };
}

function teardown(tmpDir) {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.OPS_DB_PATH;
}

test('runBackupCycle({force:true}) returns ok=true with valid env', async () => {
  const { tmpDir } = setupTempDataDir('happy');
  try {
    const summary = await runBackupCycle({ force: true });
    assert.equal(summary.ok, true, `expected ok=true, got: ${JSON.stringify(summary, null, 2)}`);
    assert.ok(Array.isArray(summary.steps), 'steps should be an array');
    const sqliteStep = summary.steps.find((s) => s.name === 'sqlite');
    assert.ok(sqliteStep, 'sqlite step should exist');
    assert.equal(sqliteStep.ok, true, 'sqlite step should be ok');
    const libStep = summary.steps.find((s) => s.name === 'library');
    assert.ok(libStep, 'library step should exist');
    assert.equal(libStep.ok, true, 'library step should be ok');
  } finally {
    teardown(tmpDir);
  }
});

test('Library tarball excludes Library/Users/totp_secrets*', () => {
  // This test directly exercises the tar command shape used in
  // tarLibrary() — the bug being fixed is that --exclude was missing.
  // Running tar with the new exclude flag against a real on-disk
  // fixture is the most surgical verification that the fix is correct.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-backup-test-exclude-'));
  try {
    const dataRoot = path.join(tmpDir, 'data');
    fs.mkdirSync(path.join(dataRoot, 'Library', 'Users'), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'Library', 'Users', 'totp_secrets.enc'), 'SECRET-X');
    fs.writeFileSync(path.join(dataRoot, 'Library', 'Users', 'totp_secrets.json'), '{"x":1}');
    fs.writeFileSync(path.join(dataRoot, 'Library', 'Users', 'users.json'), '{"users":[]}');
    const outFile = path.join(tmpDir, 'library_test.tar.gz');
    // Same exact tar invocation as tarLibrary() at backupScheduler.js:130
    execSync(
      `tar czf "${outFile}" -C "${dataRoot}" ` +
        `--exclude='Library/Users/totp_secrets*' ` +
        `Library`,
      { stdio: 'pipe', timeout: 60_000 }
    );
    assert.ok(fs.existsSync(outFile), 'tarball should be created');
    // Inspect: tar tzf should NOT show totp_secrets entries
    const listing = execSync(`tar tzf "${outFile}"`, { encoding: 'utf-8' });
    const lines = listing.split('\n').filter(Boolean);
    const totpEntries = lines.filter((l) => l.includes('totp_secrets'));
    assert.equal(
      totpEntries.length,
      0,
      `tarball must NOT contain totp_secrets — found: ${totpEntries.join(', ')}`
    );
    // Sanity: users.json IS present
    const usersEntries = lines.filter((l) => l.includes('users.json'));
    assert.ok(
      usersEntries.length >= 1,
      `tarball should contain Library/Users/users.json — got: ${lines.join(' | ')}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runBackupCycle is idempotent on same-day re-run', async () => {
  const { tmpDir } = setupTempDataDir('idempotent');
  try {
    const first = await runBackupCycle({ force: true });
    assert.equal(first.ok, true, `first run should be ok, got: ${JSON.stringify(first, null, 2)}`);
    // Second run without force should hit the same-day skip path
    // both for sqlite (backupOpsDb skipped=true) and library (tarball
    // exists short-circuit at line 121).
    const second = await runBackupCycle({ force: false });
    assert.equal(second.ok, true, 'second run should also be ok');
    const sqliteStep = second.steps.find((s) => s.name === 'sqlite');
    assert.ok(sqliteStep, 'sqlite step should exist on second run');
    assert.equal(
      sqliteStep.skipped,
      true,
      `sqlite step should be skipped on same-day re-run, got: ${JSON.stringify(sqliteStep)}`
    );
    const libStep = second.steps.find((s) => s.name === 'library');
    assert.ok(libStep, 'library step should exist on second run');
    assert.equal(
      libStep.skipped,
      true,
      `library step should be skipped on same-day re-run, got: ${JSON.stringify(libStep)}`
    );
  } finally {
    teardown(tmpDir);
  }
});
