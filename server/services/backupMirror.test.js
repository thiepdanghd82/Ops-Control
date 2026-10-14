/**
 * backupMirror — the off-site mirror run by the app (Settings → Backup).
 *   node --test server/services/backupMirror.test.js
 *
 * Every test works in throwaway directories (Lesson 33); none touches the
 * live data dir or a real drive.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MIRROR_SUBDIR,
  readMirrorConfig,
  writeMirrorConfig,
  validateMirrorDest,
  listMirrorTargets,
  runMirror,
} from './backupMirror.js';
import { readOffsiteStatus } from './offsiteStatus.js';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function put(root, rel, body = 'x') {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}

/** A data dir shaped like the live one, credentials included. */
function seedData() {
  const data = tmp('mirror-data-');
  put(data, 'ops.db', 'sqlite-bytes');
  put(data, 'Backup/SQLite/ops_20261014_025404.sqlite', 'backup');
  put(data, 'Library/QuoteHistory/quote_history.json', '[]');
  put(data, 'Library/Users/users.json', '{"u":"hash"}');
  put(data, 'Library/Users/sessions.json', '{}');
  put(data, 'Library/totp/totp_secrets.enc', 'secret');
  put(data, 'Backup/ops-migration.env', 'OPS_TOTP_KEY=' + 'a'.repeat(64));
  put(data, 'Backup/Library/library_20261014.tar.gz', 'tarball');
  put(data, 'Library/Fleet/heartbeats.json', '{}');
  put(data, 'license.json', '{}');
  return data;
}

test('config round-trips and starts empty', () => {
  const data = tmp('mirror-cfg-');
  assert.deepEqual(readMirrorConfig(data), { dest: null, auto: true });
  writeMirrorConfig(data, { dest: '/Volumes/X', auto: false }, 'henry');
  const c = readMirrorConfig(data);
  assert.equal(c.dest, '/Volumes/X');
  assert.equal(c.auto, false);
  assert.equal(c.updatedBy, 'henry');
});

test('validateMirrorDest refuses a relative, missing, or inside-the-data path', () => {
  const data = seedData();
  const ok = tmp('mirror-dest-');
  assert.equal(validateMirrorDest('relative/path', data).ok, false);
  assert.equal(validateMirrorDest(path.join(ok, 'nope'), data).ok, false);
  const inside = validateMirrorDest(path.join(data, 'Library'), data);
  assert.equal(inside.ok, false);
  assert.equal(inside.code, 'inside_data');
  assert.equal(validateMirrorDest(data, data).code, 'inside_data');
  const good = validateMirrorDest(ok, data);
  assert.equal(good.ok, true, good.code);
  assert.equal(typeof good.sameDiskAsData, 'boolean');
});

test('runMirror copies the data and holds every credential back', async () => {
  const data = seedData();
  const dest = tmp('mirror-dest-');
  writeMirrorConfig(data, { dest, auto: true }, 'henry');
  const r = await runMirror(data);
  assert.equal(r.state, 'ok', r.detail);
  const m = path.join(dest, MIRROR_SUBDIR, 'data');
  assert.ok(fs.existsSync(path.join(m, 'ops.db')));
  assert.ok(fs.existsSync(path.join(m, 'Backup/SQLite/ops_20261014_025404.sqlite')));
  assert.ok(fs.existsSync(path.join(m, 'Library/QuoteHistory/quote_history.json')));
  for (const rel of [
    'Library/Users/users.json',
    'Library/Users/sessions.json',
    'Library/totp/totp_secrets.enc',
    'Backup/ops-migration.env',
    'Backup/Library/library_20261014.tar.gz',
    'Library/Fleet/heartbeats.json',
    'license.json',
  ]) {
    assert.ok(!fs.existsSync(path.join(m, rel)), `${rel} must not reach the mirror`);
  }
  assert.ok(fs.existsSync(path.join(dest, MIRROR_SUBDIR, 'LAST_MIRROR_OK.txt')));
  const st = readOffsiteStatus(data);
  assert.equal(st.last_run_state, 'ok');
  assert.ok(st.last_ok_at);
});

test('a second run mirrors deletions, inside the mirror folder only', async () => {
  const data = seedData();
  const dest = tmp('mirror-dest-');
  put(dest, 'keep-me.txt', 'not ours');
  writeMirrorConfig(data, { dest, auto: true }, 'henry');
  await runMirror(data);
  fs.rmSync(path.join(data, 'Library/QuoteHistory'), { recursive: true });
  const r = await runMirror(data);
  assert.equal(r.state, 'ok', r.detail);
  assert.ok(!fs.existsSync(path.join(dest, MIRROR_SUBDIR, 'data/Library/QuoteHistory')));
  assert.ok(fs.existsSync(path.join(dest, 'keep-me.txt')), 'nothing outside the mirror is touched');
});

test('an unplugged drive is a skip: nothing deleted, last success kept', async () => {
  const data = seedData();
  const dest = tmp('mirror-dest-');
  writeMirrorConfig(data, { dest, auto: true }, 'henry');
  await runMirror(data);
  const firstOk = readOffsiteStatus(data).last_ok_at;
  writeMirrorConfig(data, { dest: path.join(dest, 'unplugged'), auto: true }, 'henry');
  const r = await runMirror(data);
  assert.equal(r.state, 'skip');
  const st = readOffsiteStatus(data);
  assert.equal(st.last_run_state, 'skip');
  assert.equal(st.last_ok_at, firstOk);
  assert.ok(fs.existsSync(path.join(dest, MIRROR_SUBDIR, 'data/ops.db')));
});

test('no destination configured: nothing runs and no status is written', async () => {
  const data = seedData();
  const r = await runMirror(data);
  assert.equal(r.state, 'not_configured');
  assert.equal(readOffsiteStatus(data), null);
});

test('a key that slips past the excludes is removed and the run fails', async () => {
  const data = seedData();
  put(data, 'Library/System/leftover.txt', 'OPS_EXPORT_HMAC_KEY=' + 'b'.repeat(64) + '\n');
  const dest = tmp('mirror-dest-');
  writeMirrorConfig(data, { dest, auto: true }, 'henry');
  const r = await runMirror(data);
  assert.equal(r.state, 'error');
  assert.match(r.detail, /credential/);
  assert.ok(!fs.existsSync(path.join(dest, MIRROR_SUBDIR, 'data/Library/System/leftover.txt')));
  assert.equal(readOffsiteStatus(data).last_run_state, 'error');
});

test('listMirrorTargets lists mounted volumes and flags the data disk', () => {
  const data = seedData();
  const vols = tmp('mirror-vols-');
  fs.mkdirSync(path.join(vols, 'Henry_USB'));
  fs.writeFileSync(path.join(vols, 'not-a-dir'), '');
  const t = listMirrorTargets(data, { volumesRoot: vols });
  const usb = t.find((x) => x.name === 'Henry_USB');
  assert.ok(usb, 'the volume is listed');
  assert.equal(usb.path, path.join(vols, 'Henry_USB'));
  assert.equal(typeof usb.freeBytes, 'number');
  // In a temp dir the "volume" lives on the same disk as the data — the
  // flag that makes the card warn that it would not survive a disk failure.
  assert.equal(usb.sameDiskAsData, true);
  assert.ok(!t.some((x) => x.name === 'not-a-dir'));
});
