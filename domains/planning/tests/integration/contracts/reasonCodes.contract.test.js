/**
 * Contract: /api/planning/v2/reason-codes
 *
 * GET surface — 5 tests covering MES-2.6b Patch N1 contract: happy
 * + no-auth + cache header + sort + VN parity.
 *
 * Admin CRUD surface (MES-3-V2 KIOSK-002) — POST/PATCH/disable/enable
 * with audit + role gate. Tests live in the second describe block;
 * harness builds a fresh app with audit + authMiddleware so the
 * mutation routes mount.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createReasonCodesV2Router } from '../../../server/routes/reasonCodesV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../server/db/schema.sql'),
  'utf-8'
);

let baseUrl, server;
before(async () => {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const app = express();
  app.use('/api/planning/v2/reason-codes', createReasonCodesV2Router({ db }));
  server = await new Promise((r) =>
    app.listen(0, '127.0.0.1', function () {
      r(this);
    })
  );
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});
after(() => new Promise((r) => server.close(r)));

const get = async (path) => {
  const r = await fetch(`${baseUrl}${path}`);
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
};

describe('GET /reason-codes — contract', () => {
  test('1. 200 happy: 8 seeded codes returned, sorted by sort_order ASC', async () => {
    const r = await get('/api/planning/v2/reason-codes');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.items));
    assert.equal(r.json.items.length, 8);
    const sorts = r.json.items.map((x) => x.sort_order);
    assert.deepEqual(
      [...sorts],
      [...sorts].sort((a, b) => a - b)
    );
  });

  test('2. no Authorization header still returns 200 (public reference data)', async () => {
    const r = await get('/api/planning/v2/reason-codes');
    assert.equal(r.status, 200);
  });

  test('3. Cache-Control: public, max-age=300', async () => {
    const r = await get('/api/planning/v2/reason-codes');
    assert.match(r.headers.get('cache-control') || '', /public.*max-age=300/);
  });

  test('4. only active=1 codes returned (none with active=0 in seed)', async () => {
    const r = await get('/api/planning/v2/reason-codes');
    // Schema has no active=0 seed rows; assert by checking row count
    // matches the seed count and every row's category is one of the 4
    // valid categories defined by the CHECK constraint.
    assert.equal(r.json.items.length, 8);
    for (const row of r.json.items) {
      assert.match(row.category, /^(downtime|quality|planned|other)$/);
    }
  });

  test('5. VN labels present and non-empty for all rows', async () => {
    const r = await get('/api/planning/v2/reason-codes');
    for (const row of r.json.items) {
      assert.equal(typeof row.label_en, 'string');
      assert.equal(typeof row.label_vn, 'string');
      assert.ok(row.label_en.length > 0, `${row.code}: missing label_en`);
      assert.ok(row.label_vn.length > 0, `${row.code}: missing label_vn`);
    }
  });
});

// ─── MES-3-V2 KIOSK-002 admin CRUD ──────────────────────────────────
//
// Separate test fixture: builds a fresh in-memory DB + app with
// audit + authMiddleware so the mutation routes mount. Auth stub
// reads `x-test-user` header in the same shape as the workOrder
// _harness.js helper.

const ADMIN = JSON.stringify({ username: 'admin1', role: 'admin', modules: { planning: true } });
const VIEWER = JSON.stringify({
  username: 'viewer1',
  role: 'viewonly',
  modules: { planning: true },
});

let crudUrl, crudServer, crudDb;
before(async () => {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  crudDb = db;
  const audit = (row) =>
    db
      .prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)')
      .run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  const authMiddleware = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res
        .status(401)
        .type('application/problem+json')
        .json({ type: 'urn:ops:auth-required', status: 401 });
    }
    const user = JSON.parse(header);
    req.user = { user, role: user.role, modules: user.modules || {} };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/planning/v2/reason-codes',
    createReasonCodesV2Router({ db, audit, authMiddleware })
  );
  crudServer = await new Promise((r) =>
    app.listen(0, '127.0.0.1', function () {
      r(this);
    })
  );
  const { port } = crudServer.address();
  crudUrl = `http://127.0.0.1:${port}`;
});
after(() => new Promise((r) => crudServer.close(r)));

async function adminReq(method, p, { user, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers['x-test-user'] = user;
  const r = await fetch(crudUrl + p, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: r.status, json, text };
}

describe('POST /reason-codes — create (MES-3-V2)', () => {
  test('401 — no auth header', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      body: { code: 'TEST_NEW', label_en: 'x', label_vn: 'x', category: 'other' },
    });
    assert.equal(r.status, 401);
  });

  test('403 — viewer role rejected', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: VIEWER,
      body: { code: 'TEST_VIEW', label_en: 'x', label_vn: 'x', category: 'other' },
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.type, 'urn:ops:insufficient-role');
  });

  test('201 — admin creates a new reason code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: ADMIN,
      body: {
        code: 'TEST_NEW',
        label_en: 'Test new',
        label_vn: 'Thử nghiệm mới',
        category: 'other',
        sort_order: 80,
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.code, 'TEST_NEW');
    assert.equal(r.json.label_en, 'Test new');
    assert.equal(r.json.label_vn, 'Thử nghiệm mới');
    assert.equal(r.json.category, 'other');
    assert.equal(r.json.active, 1);
  });

  test('audit row REASON_CODE_CREATE was emitted', () => {
    const row = crudDb
      .prepare("SELECT detail FROM audit_log WHERE event = 'REASON_CODE_CREATE'")
      .get();
    assert.ok(row);
    const detail = JSON.parse(row.detail);
    assert.equal(detail.code, 'TEST_NEW');
    assert.equal(detail.category, 'other');
  });

  test('409 — duplicate code (already in seed)', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: ADMIN,
      body: { code: 'MACHINE_DOWN', label_en: 'x', label_vn: 'x', category: 'other' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:reason-code-collision');
    assert.equal(r.json.code, 'MACHINE_DOWN');
  });

  test('400 — code violates regex (lowercase)', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: ADMIN,
      body: { code: 'lowercase', label_en: 'x', label_vn: 'x', category: 'other' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    const fields = r.json.errors.map((e) => e.field);
    assert.ok(fields.includes('code'));
  });

  test('400 — missing label_vn (EN+VN parity)', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: ADMIN,
      body: { code: 'NO_VN', label_en: 'EN only', label_vn: '', category: 'other' },
    });
    assert.equal(r.status, 400);
    const fields = r.json.errors.map((e) => e.field);
    assert.ok(fields.includes('label_vn'));
  });

  test('400 — invalid category', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes', {
      user: ADMIN,
      body: { code: 'BAD_CAT', label_en: 'x', label_vn: 'x', category: 'severity' },
    });
    assert.equal(r.status, 400);
    const fields = r.json.errors.map((e) => e.field);
    assert.ok(fields.includes('category'));
  });
});

describe('PATCH /reason-codes/:code — update (MES-3-V2)', () => {
  test('200 — admin updates label_en + sort_order', async () => {
    const r = await adminReq('PATCH', '/api/planning/v2/reason-codes/TEST_NEW', {
      user: ADMIN,
      body: { label_en: 'Test updated', sort_order: 85 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.label_en, 'Test updated');
    assert.equal(r.json.sort_order, 85);
  });

  test('audit REASON_CODE_UPDATE detail.fields_changed lists the changed columns', () => {
    const row = crudDb
      .prepare(
        `SELECT detail FROM audit_log WHERE event = 'REASON_CODE_UPDATE' ORDER BY id DESC LIMIT 1`
      )
      .get();
    const detail = JSON.parse(row.detail);
    assert.deepEqual([...detail.fields_changed].sort(), ['label_en', 'sort_order']);
    assert.equal(detail.changes.label_en.from, 'Test new');
    assert.equal(detail.changes.label_en.to, 'Test updated');
  });

  test('400 — patch carries `code` (immutable identifier)', async () => {
    const r = await adminReq('PATCH', '/api/planning/v2/reason-codes/TEST_NEW', {
      user: ADMIN,
      body: { code: 'RENAMED' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:reason-code-forbidden-fields');
    assert.deepEqual(r.json.forbidden_fields, ['code']);
  });

  test('404 — patch on missing code', async () => {
    const r = await adminReq('PATCH', '/api/planning/v2/reason-codes/DOES_NOT_EXIST', {
      user: ADMIN,
      body: { label_en: 'x' },
    });
    assert.equal(r.status, 404);
    assert.equal(r.json.type, 'urn:ops:reason-code-not-found');
  });

  test('200 — patch with unchanged values is a no-op (no audit row)', async () => {
    const before = crudDb.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    const r = await adminReq('PATCH', '/api/planning/v2/reason-codes/TEST_NEW', {
      user: ADMIN,
      body: { label_en: 'Test updated' },
    });
    assert.equal(r.status, 200);
    const after = crudDb.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    assert.equal(after, before, 'no audit row on no-op patch');
  });

  test('400 — empty patch body', async () => {
    const r = await adminReq('PATCH', '/api/planning/v2/reason-codes/TEST_NEW', {
      user: ADMIN,
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
  });
});

describe('POST /reason-codes/:code/disable — soft-delete (MES-3-V2)', () => {
  test('200 — admin disables an active code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes/TEST_NEW/disable', {
      user: ADMIN,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.code, 'TEST_NEW');
    assert.equal(r.json.active, 0);
  });

  test('audit REASON_CODE_DISABLE row emitted', () => {
    const row = crudDb
      .prepare("SELECT detail FROM audit_log WHERE event = 'REASON_CODE_DISABLE'")
      .get();
    assert.ok(row);
    const detail = JSON.parse(row.detail);
    assert.equal(detail.code, 'TEST_NEW');
  });

  test('after disable — default GET excludes the disabled code (kiosk contract)', async () => {
    const r = await fetch(`${crudUrl}/api/planning/v2/reason-codes`).then((x) => x.json());
    const codes = r.items.map((x) => x.code);
    assert.equal(codes.includes('TEST_NEW'), false);
  });

  test('after disable — ?include_disabled=1 surfaces the disabled code', async () => {
    const r = await fetch(`${crudUrl}/api/planning/v2/reason-codes?include_disabled=1`).then((x) =>
      x.json()
    );
    const target = r.items.find((x) => x.code === 'TEST_NEW');
    assert.ok(target);
    assert.equal(target.active, 0);
  });

  test('409 — disabling an already-disabled code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes/TEST_NEW/disable', {
      user: ADMIN,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:reason-code-already-disabled');
  });

  test('404 — disabling a missing code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes/NOPE/disable', {
      user: ADMIN,
    });
    assert.equal(r.status, 404);
  });
});

describe('POST /reason-codes/:code/enable — restore (MES-3-V2)', () => {
  test('200 — admin re-enables a disabled code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes/TEST_NEW/enable', {
      user: ADMIN,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.active, 1);
  });

  test('audit REASON_CODE_ENABLE row emitted', () => {
    const row = crudDb
      .prepare("SELECT detail FROM audit_log WHERE event = 'REASON_CODE_ENABLE'")
      .get();
    assert.ok(row);
    const detail = JSON.parse(row.detail);
    assert.equal(detail.code, 'TEST_NEW');
  });

  test('409 — enabling an already-active code', async () => {
    const r = await adminReq('POST', '/api/planning/v2/reason-codes/MACHINE_DOWN/enable', {
      user: ADMIN,
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.type, 'urn:ops:reason-code-already-enabled');
  });
});
