/**
 * The SQLite backup prune must not leave sidecars behind.
 *
 * The prune inside backupOpsDb filtered on `f.endsWith('.sqlite')`, so every
 * backup it deleted abandoned its `-shm` and `-wal` companions forever. On
 * this box that had accumulated **136 orphans** against 25 real backups —
 * 2.8 MB, so not a disk problem, but it made `Backup/SQLite` report 205
 * files when only 25 were backups. That number is what sent me chasing a
 * retention bug that did not exist.
 *
 * One rule covers both halves: a sidecar with no parent `.sqlite` is
 * deleted. New prunes never orphan, and the orphans already on disk are
 * swept the next time the cycle runs.
 *
 * Runner: node --test server/db/pruneSqliteBackups.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneSqliteBackups } from './backup.js';

const DAY = 86400000;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ops-prune-'));
}

/** Create `name` and optionally its sidecars, aged `ageDays` days. */
function make(dir, name, ageDays, { sidecars = true } = {}) {
  const t = Date.now() - ageDays * DAY;
  const write = (f) => {
    const p = path.join(dir, f);
    fs.writeFileSync(p, 'x');
    fs.utimesSync(p, new Date(t), new Date(t));
  };
  write(name);
  if (sidecars) {
    write(name + '-shm');
    write(name + '-wal');
  }
}

const ls = (d) => fs.readdirSync(d).sort();

test('an expired backup takes its sidecars with it', () => {
  const d = tmpDir();
  make(d, 'ops_20260101_000000.sqlite', 60);
  const r = pruneSqliteBackups(d, { retentionDays: 30 });
  assert.equal(r.pruned, 1);
  assert.deepEqual(ls(d), [], 'the -shm and -wal must go with the backup');
});

test('a backup inside the window keeps its sidecars', () => {
  const d = tmpDir();
  make(d, 'ops_20260901_000000.sqlite', 5);
  pruneSqliteBackups(d, { retentionDays: 30 });
  assert.deepEqual(ls(d), [
    'ops_20260901_000000.sqlite',
    'ops_20260901_000000.sqlite-shm',
    'ops_20260901_000000.sqlite-wal',
  ]);
});

test('sidecars already orphaned on disk are swept, whatever their age', () => {
  // This is the 136 on the live box: their parents were pruned by the old
  // code, so nothing will ever delete them unless the rule looks for them.
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'ops_20260501_000000.sqlite-shm'), 'x');
  fs.writeFileSync(path.join(d, 'ops_20260501_000000.sqlite-wal'), 'x');
  make(d, 'ops_20260914_000000.sqlite', 1); // a healthy recent backup
  const r = pruneSqliteBackups(d, { retentionDays: 30 });
  assert.equal(r.orphansSwept, 2);
  assert.deepEqual(ls(d), [
    'ops_20260914_000000.sqlite',
    'ops_20260914_000000.sqlite-shm',
    'ops_20260914_000000.sqlite-wal',
  ]);
});

test('files that are not ops_ backups are never touched', () => {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'README.txt'), 'x');
  fs.writeFileSync(path.join(d, 'something.sqlite'), 'x');
  const before = ls(d);
  pruneSqliteBackups(d, { retentionDays: 0 });
  assert.deepEqual(ls(d), before, 'the prune owns ops_*.sqlite only');
});

test('a missing directory is not an error', () => {
  const r = pruneSqliteBackups(path.join(os.tmpdir(), 'ops-does-not-exist-' + Date.now()), {});
  assert.equal(r.pruned, 0);
  assert.equal(r.orphansSwept, 0);
});
