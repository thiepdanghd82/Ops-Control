#!/usr/bin/env node
// S-BACKUP-V2 (2026-05-05) — schema-version gate guards.
// Run: node --test scripts/test-backup-meta-versioning.mjs
//
// Scope: validateBackupVersion is the single chokepoint that decides
// whether to accept a snapshot. Bugs here would either (a) restore a
// future-format file incorrectly, corrupting the live store, or (b)
// reject legacy v0 backups, breaking older customers.
//
// We DON'T test buildBackupSnapshot or restoreFromSnapshot directly —
// they touch the filesystem + SQLite + need getLibDir(). Those run via
// HTTP integration in /backup/restore endpoint tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBackupVersion,
  BACKUP_SCHEMA_VERSION,
} from '../server/routes/costApi.js';

test('legacy v0 (no _meta) is accepted with legacy=true flag', () => {
  const v = validateBackupVersion({ quoteHistory: [], _backup_at: '2024-01-01' });
  assert.equal(v.ok, true);
  assert.equal(v.version, 0);
  assert.equal(v.legacy, true);
});

test('v1 backup is accepted', () => {
  const snap = { _meta: { version: 1, createdAt: 'x' }, quoteHistory: [] };
  const v = validateBackupVersion(snap);
  assert.equal(v.ok, true);
  assert.equal(v.version, 1);
});

test('current schema version is accepted', () => {
  const snap = { _meta: { version: BACKUP_SCHEMA_VERSION } };
  const v = validateBackupVersion(snap);
  assert.equal(v.ok, true);
});

test('future version is REJECTED with clear error', () => {
  const snap = { _meta: { version: BACKUP_SCHEMA_VERSION + 1 } };
  const v = validateBackupVersion(snap);
  assert.equal(v.ok, false);
  assert.match(v.error, /newer app version/i);
  assert.match(v.error, new RegExp(`v${BACKUP_SCHEMA_VERSION + 1}`));
});

test('non-numeric version is REJECTED', () => {
  const snap = { _meta: { version: 'two' } };
  const v = validateBackupVersion(snap);
  assert.equal(v.ok, false);
  assert.match(v.error, /not a number/i);
});

test('v99 (far future) is REJECTED — no silent acceptance', () => {
  const snap = { _meta: { version: 99 } };
  const v = validateBackupVersion(snap);
  assert.equal(v.ok, false);
});
