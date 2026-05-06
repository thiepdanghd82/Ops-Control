/**
 * MES-3-V1 (KIOSK-006b) — kiosk-admin perms migration idempotency tests.
 *
 * Pure file-system test against `os.tmpdir()` — no DB, no server. Covers
 * the contract surface of `migrate(dataDir)`:
 *
 *   1. Fresh groups.json (no kiosk-admin entries) → applied: tab in
 *      catalog, all 8 groups receive default ('edit' for all_access +
 *      leader_default, 'hidden' for the other 6).
 *   2. Re-running on the migrated file → applied=false, reason='already_applied',
 *      file bytes unchanged (operator customisations preserved).
 *   3. Operator customisation ('read' on a previously-defaulted group)
 *      survives a third run.
 *   4. Missing groups.json → applied=false, reason='no_groups_file'
 *      (no crash, no file written).
 *   5. Malformed JSON → applied=false, reason='invalid_json' (caught,
 *      no crash).
 *   6. Group with missing `tab_permissions` object → migration creates it.
 *
 * Runner:
 *   node --test scripts/migrations/tests/kiosk-admin-perms.test.js
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { migrate } from '../2026-05-kiosk-admin-perms.js';

// Quiet logger so test output isn't drowned in [migration:...] lines.
const QUIET = { log() {}, warn() {}, error() {} };

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-admin-perms-test-'));
  fs.mkdirSync(path.join(dir, 'Library', 'PermissionGroups'), { recursive: true });
  return dir;
}

function writeGroups(dataDir, raw) {
  const p = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');
  fs.writeFileSync(p, JSON.stringify(raw, null, 2) + '\n');
  return p;
}

function readGroups(dataDir) {
  return JSON.parse(
    fs.readFileSync(path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json'), 'utf8')
  );
}

const SEED_GROUPS = () => ({
  _schema_version: 1,
  _tab_catalog: [
    { id: 'standard', label: 'Pricing (Std)' },
    { id: 'dashboard', label: 'Dashboard' },
  ],
  groups: [
    { id: 'all_access', name: 'All Access', tab_permissions: { standard: 'edit' } },
    { id: 'leader_default', name: 'Leader', tab_permissions: { standard: 'edit' } },
    { id: 'sales_default', name: 'Sales', tab_permissions: { standard: 'read' } },
    { id: 'cs_default', name: 'CS', tab_permissions: { standard: 'read' } },
    { id: 'npi_default', name: 'NPI', tab_permissions: { standard: 'edit' } },
    { id: 'purchasing_default', name: 'Purchasing', tab_permissions: { standard: 'hidden' } },
    { id: 'production_default', name: 'Production', tab_permissions: { standard: 'hidden' } },
    { id: 'quality_default', name: 'Quality', tab_permissions: { standard: 'hidden' } },
  ],
});

describe('kiosk-admin perms migration — fresh apply', () => {
  let dataDir;
  beforeEach(() => {
    dataDir = freshDataDir();
    writeGroups(dataDir, SEED_GROUPS());
  });

  test('applies on a fresh file: tab added + all 8 groups receive default', () => {
    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, true);
    assert.equal(result.tab_catalog_added, true);
    assert.equal(result.groups_touched, 8);

    const after = readGroups(dataDir);
    assert.ok(
      after._tab_catalog.find((t) => t.id === 'kiosk-admin'),
      'tab present in catalog'
    );

    // EDIT_GROUPS receive 'edit'; the rest receive 'hidden'.
    const editIds = ['all_access', 'leader_default'];
    for (const g of after.groups) {
      const expected = editIds.includes(g.id) ? 'edit' : 'hidden';
      assert.equal(
        g.tab_permissions['kiosk-admin'],
        expected,
        `group ${g.id} should default to '${expected}'`
      );
    }
  });
});

describe('kiosk-admin perms migration — idempotency', () => {
  let dataDir;
  beforeEach(() => {
    dataDir = freshDataDir();
    writeGroups(dataDir, SEED_GROUPS());
  });

  test('second run is a no-op (file bytes unchanged)', () => {
    migrate(dataDir, { logger: QUIET });
    const filePath = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');
    const bytes1 = fs.readFileSync(filePath);

    const result2 = migrate(dataDir, { logger: QUIET });
    assert.equal(result2.applied, false);
    assert.equal(result2.reason, 'already_applied');

    const bytes2 = fs.readFileSync(filePath);
    assert.ok(bytes1.equals(bytes2), 'file content identical after no-op run');
  });

  test('operator customisation survives a third run (preserves explicit values)', () => {
    migrate(dataDir, { logger: QUIET }); // 1st: apply
    // Operator manually changes sales_default's kiosk-admin from
    // 'hidden' → 'read'. This must NOT be reset by a subsequent run.
    const after1 = readGroups(dataDir);
    const sales = after1.groups.find((g) => g.id === 'sales_default');
    sales.tab_permissions['kiosk-admin'] = 'read';
    writeGroups(dataDir, after1);

    const result3 = migrate(dataDir, { logger: QUIET });
    assert.equal(result3.applied, false, '3rd run is no-op');

    const after2 = readGroups(dataDir);
    const salesAfter = after2.groups.find((g) => g.id === 'sales_default');
    assert.equal(salesAfter.tab_permissions['kiosk-admin'], 'read');
  });
});

describe('kiosk-admin perms migration — fail-safe error handling', () => {
  test('missing groups.json returns no_groups_file (no write, no crash)', () => {
    const dataDir = freshDataDir();
    // Note: do NOT call writeGroups — leave the file absent.
    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'no_groups_file');
    const exists = fs.existsSync(path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json'));
    assert.equal(exists, false, 'no file was created');
  });

  test('malformed JSON returns invalid_json (no crash, no write)', () => {
    const dataDir = freshDataDir();
    const filePath = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');
    fs.writeFileSync(filePath, '{ this is not valid JSON');
    const before = fs.readFileSync(filePath, 'utf8');

    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'invalid_json');

    const after = fs.readFileSync(filePath, 'utf8');
    assert.equal(after, before, 'malformed file untouched');
  });
});

describe('kiosk-admin perms migration — partial state', () => {
  test('group missing tab_permissions object gets one created', () => {
    const dataDir = freshDataDir();
    const seed = SEED_GROUPS();
    delete seed.groups[0].tab_permissions;
    writeGroups(dataDir, seed);

    migrate(dataDir, { logger: QUIET });

    const after = readGroups(dataDir);
    const ax = after.groups[0];
    assert.equal(typeof ax.tab_permissions, 'object');
    assert.equal(ax.tab_permissions['kiosk-admin'], 'edit'); // all_access
  });

  test('catalog already contains kiosk-admin → only groups are touched', () => {
    const dataDir = freshDataDir();
    const seed = SEED_GROUPS();
    seed._tab_catalog.push({ id: 'kiosk-admin', label: 'Kiosk Admin' });
    writeGroups(dataDir, seed);

    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, true);
    assert.equal(result.tab_catalog_added, false, 'tab already in catalog');
    assert.equal(result.groups_touched, 8);
  });
});
