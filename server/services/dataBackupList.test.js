/**
 * collectDataBackups — merges restorable data-backup snapshots from the manual
 * dir (PackageBackups/Data) and the scheduler auto dir (Backup/Data).
 *
 * Lesson 33: uses throwaway temp dirs only — never DATA_DIR / live data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectDataBackups } from './dataBackupList.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bklist-'));
}
// Write a file and stamp a specific mtime so date-sort is deterministic.
function writeAt(dir, name, mtimeIso) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, '{}');
  const t = new Date(mtimeIso);
  fs.utimesSync(fp, t, t);
}

test('merges both dirs and carries name + size + date per entry', () => {
  const manual = tmpDir();
  const auto = tmpDir();
  writeAt(manual, 'manual_20260601_010000.json', '2026-06-01T01:00:00Z');
  writeAt(auto, 'auto_20260616_044020.json', '2026-06-16T04:40:20Z');
  const files = collectDataBackups([manual, auto]);
  assert.equal(files.length, 2);
  for (const f of files) {
    assert.ok(typeof f.filename === 'string' && f.filename);
    assert.ok(typeof f.size === 'number' && f.size >= 0);
    assert.ok(typeof f.mtimeMs === 'number' && f.mtimeMs > 0, 'mtimeMs epoch for local formatting');
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(f.date), 'date kept for fallback');
  }
});

test('sorts newest-first by date across dirs', () => {
  const manual = tmpDir();
  const auto = tmpDir();
  writeAt(manual, 'manual_old.json', '2026-05-01T00:00:00Z');
  writeAt(auto, 'auto_new.json', '2026-06-16T00:00:00Z');
  writeAt(manual, 'manual_mid.json', '2026-06-01T00:00:00Z');
  const files = collectDataBackups([manual, auto]);
  assert.deepEqual(
    files.map((f) => f.filename),
    ['auto_new.json', 'manual_mid.json', 'manual_old.json']
  );
});

test('dedupes by filename — first dir (manual) wins', () => {
  const manual = tmpDir();
  const auto = tmpDir();
  writeAt(manual, 'dup.json', '2026-06-10T00:00:00Z');
  writeAt(auto, 'dup.json', '2026-01-01T00:00:00Z');
  const files = collectDataBackups([manual, auto]);
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'dup.json');
  assert.equal(files[0].date.slice(0, 4), '2026'); // from manual (the kept one)
  assert.ok(files[0].date.startsWith('2026-06-10'), 'kept the manual dir entry, not auto');
});

test('ignores non-json + dotfiles; missing dir contributes nothing', () => {
  const manual = tmpDir();
  writeAt(manual, 'good.json', '2026-06-10T00:00:00Z');
  writeAt(manual, 'notes.txt', '2026-06-10T00:00:00Z');
  writeAt(manual, '.DS_Store', '2026-06-10T00:00:00Z');
  const files = collectDataBackups([manual, path.join(manual, 'does-not-exist')]);
  assert.deepEqual(
    files.map((f) => f.filename),
    ['good.json']
  );
});

test('empty / nullish input → empty list (no throw)', () => {
  assert.deepEqual(collectDataBackups([]), []);
  assert.deepEqual(collectDataBackups(undefined), []);
});
