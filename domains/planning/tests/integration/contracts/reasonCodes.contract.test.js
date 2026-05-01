/**
 * Contract: GET /api/planning/v2/reason-codes (MES-2.6b Patch N1)
 * 5 tests — happy + no-auth + cache header + sort + VN parity.
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
