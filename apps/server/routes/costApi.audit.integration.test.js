/**
 * Audit-emit integration tests — P0-8 from D-6 readiness audit.
 *
 * Verifies that the two compliance-critical mutation routes emit
 * audit_log rows BEFORE the SSE notification fires:
 *
 *   - POST   /api/quotes        → QUOTE_SAVE
 *   - PATCH  /api/quotes/:id    → QUOTE_SAVE (is_new=false)
 *   - POST   /api/save-all      → LIBRARY_SAVE per dataset
 *
 * Without these emits, audit_log cannot answer "who changed material
 * cost on date X?" — VN Decree 13/2023 PII + Law on Accounting Art. 41
 * (10-yr forensic trail) compliance gap.
 *
 * Harness mirrors server/routes/chat.integration.test.js: temp DATA_DIR
 * + ephemeral port + Bearer-token session bypassing the full TOTP flow.
 *
 * audit() writes synchronously to an in-memory ring buffer (+ file +
 * lazy-imported SQLite via fail-open async path). getAuditLog reads
 * SQLite first then falls back to the ring — either path captures rows
 * emitted by audit() in the same process.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-audit-emit-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
// Quote-export MVP-2 preflight requires OPS_EXPORT_HMAC_KEY; stub it so
// boot doesn't refuse. 64 hex chars per validation rule.
process.env.OPS_EXPORT_HMAC_KEY ||= 'a'.repeat(64);

// Seed users BEFORE auth service initializes. role='cost' + no
// permission_group_id → backward-compat 'edit' on every tab per
// CLAUDE.md authorization-model section.
fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  JSON.stringify(
    [
      {
        id: 1,
        username: 'tester',
        role: 'cost',
        pwd: 'x',
        pwd_bcrypt: '$2b$10$test',
        approval_roles: [],
      },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { createSession, getAuditLog } = await import('../services/authService.js');

let server, baseUrl;
const token = createSession(1, { totpVerified: true });

test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(() => new Promise((resolve) => server.close(resolve)));

function h() {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Count QUOTE_SAVE / LIBRARY_SAVE rows BEFORE a request — let each test
// assert the delta rather than a fixed total (test ordering doesn't
// matter, and warm-up audit calls from server boot are filtered out).
function auditCount(event) {
  return getAuditLog(1000, { event }).length;
}

// ── Fix 1: POST /api/quotes (create) ──

test('POST /api/quotes — emits QUOTE_SAVE with is_new=true + parseable detail JSON', async () => {
  const before = auditCount('QUOTE_SAVE');

  const r = await fetch(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({
      type: 'standard',
      label: 'TEST-RFQ-001 / CCL-A1',
      state: { rfq_number: 'TEST-RFQ-001', ccl_pn: 'CCL-A1', site: 'VN' },
      result: {},
    }),
  });
  assert.equal(
    r.status,
    200,
    `quote POST should be 200, got ${r.status}: ${await r.clone().text()}`
  );
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.ok(body.quote?.id, 'response must include quote.id');

  const after = auditCount('QUOTE_SAVE');
  assert.equal(after, before + 1, 'exactly 1 QUOTE_SAVE row should be appended');

  // Newest-first: row 0 is the just-emitted one
  const rows = getAuditLog(1000, { event: 'QUOTE_SAVE' });
  const newest = rows[0];
  assert.equal(newest.user, 'tester');
  assert.ok(newest.ip, 'ip should be populated');

  const detail = JSON.parse(newest.detail);
  assert.equal(detail.type, 'standard');
  assert.equal(detail.label, 'TEST-RFQ-001 / CCL-A1');
  assert.equal(detail.is_new, true);
  assert.equal(typeof detail.id, 'number', 'detail.id must be numeric');
  assert.equal(typeof detail.version, 'number', 'detail.version must be numeric');
});

// ── Fix 2a: POST /api/save-all single dataset ──

test('POST /api/save-all with matDB — emits 1 LIBRARY_SAVE with key=matDB', async () => {
  const before = auditCount('LIBRARY_SAVE');

  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ matDB: [] }),
  });
  assert.equal(r.status, 200, `save-all should be 200, got ${r.status}: ${await r.clone().text()}`);
  const body = await r.json();
  assert.equal(body.ok, true);

  const after = auditCount('LIBRARY_SAVE');
  assert.equal(after, before + 1, 'exactly 1 LIBRARY_SAVE row should be appended');

  const rows = getAuditLog(1000, { event: 'LIBRARY_SAVE' });
  const detail = JSON.parse(rows[0].detail);
  assert.equal(detail.key, 'matDB');
  assert.ok(detail.timestamp, 'detail.timestamp must be present');
  assert.equal(
    detail.removed_unknown_keys,
    undefined,
    'no unknown keys in this request — field must be absent'
  );
});

// ── Fix 2b: POST /api/save-all multi-dataset (one row per dataset) ──

test('POST /api/save-all with matDB + rateDB — emits 2 LIBRARY_SAVE rows (per-dataset)', async () => {
  const before = auditCount('LIBRARY_SAVE');

  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ matDB: [], rateDB: [] }),
  });
  assert.equal(r.status, 200, `save-all should be 200, got ${r.status}: ${await r.clone().text()}`);

  const after = auditCount('LIBRARY_SAVE');
  assert.equal(
    after,
    before + 2,
    'should emit 2 rows (one per saved dataset, not one per request)'
  );

  const rows = getAuditLog(1000, { event: 'LIBRARY_SAVE' });
  const lastTwoKeys = rows
    .slice(0, 2)
    .map((row) => JSON.parse(row.detail).key)
    .sort();
  assert.deepEqual(lastTwoKeys, ['matDB', 'rateDB'], 'both saved keys must be audited');
});

// ── Fix 2c: unknown key → audit row carries removed_unknown_keys[] ──

test('POST /api/save-all with matDB + unknown key — LIBRARY_SAVE detail.removed_unknown_keys lists the stripped key', async () => {
  const before = auditCount('LIBRARY_SAVE');

  const r = await fetch(`${baseUrl}/api/save-all`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ matDB: [], bogusKey_zz: 'nope' }),
  });
  assert.equal(r.status, 200, `save-all should be 200, got ${r.status}: ${await r.clone().text()}`);

  const after = auditCount('LIBRARY_SAVE');
  assert.equal(after, before + 1, 'unknown key should NOT trigger its own audit row');

  const rows = getAuditLog(1000, { event: 'LIBRARY_SAVE' });
  const detail = JSON.parse(rows[0].detail);
  assert.equal(detail.key, 'matDB');
  assert.deepEqual(
    detail.removed_unknown_keys,
    ['bogusKey_zz'],
    'unknown key must be recorded in the surviving dataset audit row'
  );
});
