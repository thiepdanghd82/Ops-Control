/**
 * Older SQLite backups are kept gzipped (Henry, 2026-09-30).
 *
 * A daily `ops_*.sqlite` is a full copy of ops.db — 180 MB on the live box — and
 * 30 of them is 5.4 GB. Gzip takes one to 33 MB in under two seconds. The newest
 * backup stays a plain `.sqlite` so it can be opened or restored at once; every
 * older one becomes `.sqlite.gz`, with its mtime kept so the retention prune still
 * ages it from the day it was taken.
 *
 * Runner: node --test server/db/compressSqliteBackups.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { compressOlderSqliteBackups, pruneSqliteBackups } from './backup.js';

const DAY = 86400000;
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ops-gz-'));
const ls = (d) => fs.readdirSync(d).sort();

/** A backup whose content is recognisable, aged `ageDays`. */
function make(dir, name, ageDays, { sidecars = false } = {}) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `SQLite format 3 — ${name} — `.repeat(500));
  const t = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(p, t, t);
  if (sidecars) {
    fs.writeFileSync(p + '-shm', 'x');
    fs.writeFileSync(p + '-wal', '');
  }
  return p;
}

test('every older backup is gzipped, the newest is left plain', async () => {
  const d = tmpDir();
  const a = make(d, 'ops_20260901_010000.sqlite', 29, { sidecars: true });
  const b = make(d, 'ops_20260915_010000.sqlite', 15);
  make(d, 'ops_20260930_010000.sqlite', 0);
  const original = fs.readFileSync(a);
  const aMtime = fs.statSync(a).mtimeMs;
  const bOriginal = fs.readFileSync(b);

  const r = await compressOlderSqliteBackups(d, 'ops_20260930_010000.sqlite');

  assert.equal(r.compressed, 2);
  assert.deepEqual(ls(d), [
    'ops_20260901_010000.sqlite.gz',
    'ops_20260915_010000.sqlite.gz',
    'ops_20260930_010000.sqlite',
  ]);
  const gz = path.join(d, 'ops_20260901_010000.sqlite.gz');
  assert.deepEqual(
    zlib.gunzipSync(fs.readFileSync(gz)),
    original,
    'the archive must hold the same bytes'
  );
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(b + '.gz')), bOriginal);
  assert.ok(fs.statSync(gz).size < original.length, 'and be smaller');
  assert.equal(
    Math.round(fs.statSync(gz).mtimeMs / 1000),
    Math.round(aMtime / 1000),
    'mtime kept for the prune'
  );
});

test('a second run has nothing to do', async () => {
  const d = tmpDir();
  make(d, 'ops_20260901_010000.sqlite', 29);
  make(d, 'ops_20260930_010000.sqlite', 0);
  await compressOlderSqliteBackups(d, 'ops_20260930_010000.sqlite');
  const r = await compressOlderSqliteBackups(d, 'ops_20260930_010000.sqlite');
  assert.equal(r.compressed, 0);
});

test('files that are not ops_ backups are left alone', async () => {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'something.sqlite'), 'x');
  fs.writeFileSync(path.join(d, 'README.txt'), 'x');
  await compressOlderSqliteBackups(d, null);
  assert.deepEqual(ls(d), ['README.txt', 'something.sqlite']);
});

test('a half-written archive from an interrupted run is redone, not trusted', async () => {
  const d = tmpDir();
  const a = make(d, 'ops_20260901_010000.sqlite', 29);
  const original = fs.readFileSync(a);
  // A crash after writing part of the archive: the .gz exists but is truncated.
  const full = zlib.gzipSync(original);
  fs.writeFileSync(a + '.gz', full.subarray(0, Math.floor(full.length / 2)));
  fs.writeFileSync(a + '.gz.tmp', 'partial');

  const r = await compressOlderSqliteBackups(d, null);

  assert.equal(r.compressed, 1);
  assert.deepEqual(ls(d), ['ops_20260901_010000.sqlite.gz']);
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(a + '.gz')), original);
});

test('a complete archive whose source was not yet removed just drops the source', async () => {
  const d = tmpDir();
  const a = make(d, 'ops_20260901_010000.sqlite', 29);
  const original = fs.readFileSync(a);
  fs.writeFileSync(a + '.gz', zlib.gzipSync(original));
  await compressOlderSqliteBackups(d, null);
  assert.deepEqual(ls(d), ['ops_20260901_010000.sqlite.gz']);
  assert.deepEqual(zlib.gunzipSync(fs.readFileSync(a + '.gz')), original);
});

test('the prune ages gzipped backups like plain ones', () => {
  const d = tmpDir();
  make(d, 'ops_20260801_010000.sqlite.gz', 60);
  make(d, 'ops_20260920_010000.sqlite.gz', 10);
  make(d, 'ops_20260930_010000.sqlite', 0);
  const r = pruneSqliteBackups(d, { retentionDays: 30 });
  assert.equal(r.pruned, 1);
  assert.deepEqual(ls(d), ['ops_20260920_010000.sqlite.gz', 'ops_20260930_010000.sqlite']);
});
