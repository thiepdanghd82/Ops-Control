/**
 * RFQ Tracking tab migration idempotency tests.
 *
 * Mirror of reason-codes-tab.test.js — same fail-safe + idempotent
 * contract surface, extended for the 3-tier default (edit/read/hidden).
 * Pure file-system test against `os.tmpdir()`, no DB.
 *
 * Runner:
 *   node --test scripts/migrations/tests/rfq-tracking-tab.test.js
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { migrate } from '../2026-07-rfq-tracking-tab.js';

const QUIET = { log() {}, warn() {}, error() {} };
const TAB = 'rfq-tracking';

function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfq-tracking-tab-test-'));
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
  _tab_catalog: [{ id: 'standard', label: 'Pricing (Std)' }],
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

const EXPECTED = {
  all_access: 'edit',
  leader_default: 'edit',
  sales_default: 'edit',
  cs_default: 'read',
  npi_default: 'read',
  purchasing_default: 'hidden',
  production_default: 'hidden',
  quality_default: 'hidden',
};

describe('rfq-tracking-tab migration — fresh apply', () => {
  let dataDir;
  beforeEach(() => {
    dataDir = freshDataDir();
    writeGroups(dataDir, SEED_GROUPS());
  });

  test('applies on a fresh file: tab added + all 8 groups get 3-tier default', () => {
    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, true);
    assert.equal(result.tab_catalog_added, true);
    assert.equal(result.groups_touched, 8);

    const after = readGroups(dataDir);
    const cat = after._tab_catalog.find((t) => t.id === TAB);
    assert.ok(cat, 'tab catalog entry added');
    assert.equal(cat.label, 'RFQ Tracking');

    for (const g of after.groups) {
      assert.equal(g.tab_permissions[TAB], EXPECTED[g.id], `${g.id} default`);
    }
  });
});

describe('rfq-tracking-tab migration — idempotency', () => {
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
    assert.ok(bytes1.equals(bytes2));
  });

  test('operator customisation survives a second run', () => {
    migrate(dataDir, { logger: QUIET });
    const after1 = readGroups(dataDir);
    const purchasing = after1.groups.find((g) => g.id === 'purchasing_default');
    purchasing.tab_permissions[TAB] = 'edit'; // operator opts one group in
    writeGroups(dataDir, after1);

    const result3 = migrate(dataDir, { logger: QUIET });
    assert.equal(result3.applied, false);

    const after2 = readGroups(dataDir);
    const purchasingAfter = after2.groups.find((g) => g.id === 'purchasing_default');
    assert.equal(purchasingAfter.tab_permissions[TAB], 'edit');
  });
});

describe('rfq-tracking-tab migration — fail-safe error handling', () => {
  test('missing groups.json returns no_groups_file (no write, no crash)', () => {
    const dataDir = freshDataDir();
    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'no_groups_file');
    const exists = fs.existsSync(path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json'));
    assert.equal(exists, false);
  });

  test('malformed JSON returns invalid_json (no crash, no write)', () => {
    const dataDir = freshDataDir();
    const filePath = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');
    fs.writeFileSync(filePath, '{ not valid');
    const before = fs.readFileSync(filePath, 'utf8');

    const result = migrate(dataDir, { logger: QUIET });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'invalid_json');
    const after = fs.readFileSync(filePath, 'utf8');
    assert.equal(after, before);
  });
});
