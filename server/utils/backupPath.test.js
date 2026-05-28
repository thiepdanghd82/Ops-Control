/**
 * Tests for backup path whitelist + quota (Phase 9F.1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveBackupTarget,
  getBackupRoot,
  getDirectoryBytes,
  checkQuota,
  writeBackupChecksum,
  pruneOldBackups,
  getRetentionSettings,
  verifyBackupChecksum,
  BACKUP_SUBDIR,
  DEFAULT_QUOTA_MB,
} from './backupPath.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-bkup-'));
const dataDir = tmp;
const root = path.join(dataDir, BACKUP_SUBDIR);
fs.mkdirSync(root, { recursive: true });

test('getBackupRoot composes DATA_DIR + Backup/Data', () => {
  assert.equal(getBackupRoot('/srv/ops'), path.join('/srv/ops', 'Backup', 'Data'));
});

// ── whitelist ──

test('no destPath → default file inside root', () => {
  const r = resolveBackupTarget({ backupRoot: root, defaultFileName: 'foo.js' });
  assert.equal(r.ok, true);
  assert.equal(r.target, path.join(root, 'foo.js'));
});

test('empty/whitespace destPath same as omitted', () => {
  const r1 = resolveBackupTarget({ backupRoot: root, defaultFileName: 'foo.js', destPath: '' });
  const r2 = resolveBackupTarget({ backupRoot: root, defaultFileName: 'foo.js', destPath: '   ' });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r1.target, r2.target);
});

test('absolute path rejected', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'foo.js',
    destPath: '/etc/passwd.bak',
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('must be relative'));
});

test('~ expansion rejected', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'foo.js',
    destPath: '~/passwd.bak',
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('~'));
});

test('relative .. escape rejected', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'foo.js',
    destPath: '../../etc/passwd.bak',
  });
  assert.equal(r.ok, false);
  assert.ok(r.error.toLowerCase().includes('escape'));
});

test('deeply-nested .. eventually escaping also rejected', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'foo.js',
    destPath: 'legit/sub/../../../outside.bak',
  });
  assert.equal(r.ok, false);
});

test('relative subdir allowed + file under root', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'foo.js',
    destPath: 'sub/dir/file.bak',
  });
  assert.equal(r.ok, true);
  assert.equal(r.target, path.join(root, 'sub/dir/file.bak'));
});

test('existing directory causes defaultFileName to be appended', () => {
  const subDir = path.join(root, 'subA');
  fs.mkdirSync(subDir, { recursive: true });
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'auto.js',
    destPath: 'subA',
  });
  assert.equal(r.ok, true);
  assert.equal(r.target, path.join(subDir, 'auto.js'));
});

test('trailing separator treated as directory', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: 'auto.js',
    destPath: 'newDir/',
  });
  assert.equal(r.ok, true);
  assert.equal(r.target, path.join(root, 'newDir', 'auto.js'));
});

test('defaultFileName without separators required', () => {
  const r = resolveBackupTarget({
    backupRoot: root,
    defaultFileName: '../evil',
    destPath: 'sub',
  });
  assert.equal(r.ok, false);
});

test('non-absolute backupRoot rejected', () => {
  const r = resolveBackupTarget({
    backupRoot: 'relative/root',
    defaultFileName: 'foo.js',
  });
  assert.equal(r.ok, false);
});

// ── quota ──

test('getDirectoryBytes on missing dir returns 0', () => {
  assert.equal(getDirectoryBytes(path.join(tmp, 'does-not-exist')), 0);
});

test('getDirectoryBytes sums file sizes recursively', () => {
  const qDir = fs.mkdtempSync(path.join(tmp, 'qs-'));
  fs.writeFileSync(path.join(qDir, 'a.txt'), 'x'.repeat(1000));
  const subDir = path.join(qDir, 'deep');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'b.txt'), 'y'.repeat(2000));
  const n = getDirectoryBytes(qDir);
  assert.equal(n, 3000);
});

test('checkQuota allows when under limit', () => {
  // No env override → default 500 MB, far above the tmp dir.
  const r = checkQuota(root, 1024);
  assert.equal(r.ok, true);
});

test('checkQuota rejects when incoming would exceed', () => {
  const small = fs.mkdtempSync(path.join(tmp, 'quota-'));
  // Force a tiny quota via env.
  process.env.OPS_BACKUP_QUOTA_MB = '0.001'; // 1 KB
  fs.writeFileSync(path.join(small, 'filler.dat'), 'a'.repeat(900));
  const r = checkQuota(small, 500);
  delete process.env.OPS_BACKUP_QUOTA_MB;
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('quota'));
  assert.ok(r.used >= 900);
});

test('default quota constant is 500 MB', () => {
  assert.equal(DEFAULT_QUOTA_MB, 500);
});

// ── integrity checksum ──

test('writeBackupChecksum: creates .sha256 sidecar matching file content', () => {
  const f = path.join(root, 'checksum-me.bin');
  fs.writeFileSync(f, 'hello-ops-control');
  const r = writeBackupChecksum(f);
  assert.equal(r.ok, true);
  assert.equal(r.sidecar, f + '.sha256');
  const sidecar = fs.readFileSync(r.sidecar, 'utf-8');
  // Format: "<hex>  <basename>\n"
  // eslint-disable-next-line no-regex-spaces -- pre-existing tech debt: intentional multi-space match in fixture
  assert.match(sidecar, /^[a-f0-9]{64}  checksum-me\.bin\n$/);
  assert.ok(sidecar.startsWith(r.hex));
});

test('writeBackupChecksum: returns error on missing file', () => {
  const r = writeBackupChecksum(path.join(root, 'does-not-exist.bin'));
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

// ── verify checksum ──

test('verifyBackupChecksum: ok when sidecar matches file', () => {
  const f = path.join(root, 'verify-ok.bin');
  fs.writeFileSync(f, 'stable-content');
  writeBackupChecksum(f);
  const v = verifyBackupChecksum(f);
  assert.equal(v.ok, true);
  assert.match(v.hex, /^[a-f0-9]{64}$/);
});

test('verifyBackupChecksum: mismatch when file mutated after sidecar', () => {
  const f = path.join(root, 'verify-tamper.bin');
  fs.writeFileSync(f, 'original');
  writeBackupChecksum(f);
  fs.writeFileSync(f, 'tampered'); // no new sidecar
  const v = verifyBackupChecksum(f);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'mismatch');
  assert.ok(v.expected);
  assert.ok(v.actual);
  assert.notEqual(v.expected, v.actual);
});

test('verifyBackupChecksum: no_sidecar when missing .sha256', () => {
  const f = path.join(root, 'verify-no-sidecar.bin');
  fs.writeFileSync(f, 'dangling');
  const v = verifyBackupChecksum(f);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'no_sidecar');
});

test('verifyBackupChecksum: sidecar_parse on malformed content', () => {
  const f = path.join(root, 'verify-bad-sidecar.bin');
  fs.writeFileSync(f, 'x');
  fs.writeFileSync(f + '.sha256', 'not-a-hash\n');
  const v = verifyBackupChecksum(f);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'sidecar_parse');
});

test('verifyBackupChecksum: accepts sha256sum-style sidecar with CRLF', () => {
  const f = path.join(root, 'verify-crlf.bin');
  fs.writeFileSync(f, 'portable');
  const c = writeBackupChecksum(f);
  // Rewrite sidecar with CRLF line ending to simulate Windows.
  fs.writeFileSync(f + '.sha256', `${c.hex}  ${path.basename(f)}\r\n`);
  const v = verifyBackupChecksum(f);
  assert.equal(v.ok, true);
});

// ── retention pruning ──

test('pruneOldBackups: deletes files older than keepDays', () => {
  const sub = fs.mkdtempSync(path.join(tmp, 'retain-'));
  const young = path.join(sub, 'young.json');
  const old = path.join(sub, 'old.json');
  fs.writeFileSync(young, '{}');
  fs.writeFileSync(old, '{}');
  fs.writeFileSync(old + '.sha256', 'dummy');
  // Set old mtime to 45 days ago.
  const past = Date.now() - 45 * 86400_000;
  fs.utimesSync(old, new Date(past), new Date(past));
  fs.utimesSync(old + '.sha256', new Date(past), new Date(past));

  const r = pruneOldBackups({ backupRoot: sub, keepDays: 30, keepMin: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.deleted, 1);
  assert.equal(fs.existsSync(young), true);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(old + '.sha256'), false);
});

test('pruneOldBackups: keepMin protects newest even if all expired', () => {
  const sub = fs.mkdtempSync(path.join(tmp, 'retain-min-'));
  for (let i = 0; i < 5; i++) {
    const p = path.join(sub, `b${i}.json`);
    fs.writeFileSync(p, '{}');
    const past = Date.now() - 100 * 86400_000;
    fs.utimesSync(p, new Date(past - i * 1000), new Date(past - i * 1000));
  }
  const r = pruneOldBackups({ backupRoot: sub, keepDays: 30, keepMin: 3 });
  assert.equal(r.kept, 3);
  assert.equal(r.deleted, 2);
  assert.equal(fs.readdirSync(sub).filter((n) => n.endsWith('.json')).length, 3);
});

test('pruneOldBackups: missing dir returns empty result, no throw', () => {
  const r = pruneOldBackups({ backupRoot: path.join(tmp, 'does-not-exist'), keepDays: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.scanned, 0);
  assert.equal(r.deleted, 0);
});

test('pruneOldBackups: does not touch .sha256 sidecars independently', () => {
  const sub = fs.mkdtempSync(path.join(tmp, 'retain-sidecar-'));
  // Orphaned sidecar with no parent file — should be left alone by the
  // scan (it's filtered out) so ops can notice + clean up manually.
  const orphan = path.join(sub, 'lost.bin.sha256');
  fs.writeFileSync(orphan, 'dummy');
  const past = Date.now() - 60 * 86400_000;
  fs.utimesSync(orphan, new Date(past), new Date(past));
  const r = pruneOldBackups({ backupRoot: sub, keepDays: 30, keepMin: 0 });
  assert.equal(r.scanned, 0);
  assert.equal(fs.existsSync(orphan), true);
});

// ── retention settings ──

test('getRetentionSettings: defaults 30d / 10 min', () => {
  delete process.env.OPS_BACKUP_RETENTION_DAYS;
  delete process.env.OPS_BACKUP_RETENTION_MIN;
  const s = getRetentionSettings();
  assert.equal(s.keepDays, 30);
  assert.equal(s.keepMin, 10);
});

test('getRetentionSettings: valid env overrides apply', () => {
  process.env.OPS_BACKUP_RETENTION_DAYS = '7';
  process.env.OPS_BACKUP_RETENTION_MIN = '3';
  const s = getRetentionSettings();
  assert.equal(s.keepDays, 7);
  assert.equal(s.keepMin, 3);
  delete process.env.OPS_BACKUP_RETENTION_DAYS;
  delete process.env.OPS_BACKUP_RETENTION_MIN;
});

test('getRetentionSettings: invalid env falls back to defaults', () => {
  process.env.OPS_BACKUP_RETENTION_DAYS = 'abc';
  process.env.OPS_BACKUP_RETENTION_MIN = '-5';
  const s = getRetentionSettings();
  assert.equal(s.keepDays, 30);
  assert.equal(s.keepMin, 10);
  delete process.env.OPS_BACKUP_RETENTION_DAYS;
  delete process.env.OPS_BACKUP_RETENTION_MIN;
});

// ── cleanup ──

test('cleanup: remove tmp dir', () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});
