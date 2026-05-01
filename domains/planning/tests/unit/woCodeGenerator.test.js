/**
 * MES-1.3 — woCodeGenerator unit tests.
 *
 * Drives the generator against an in-memory better-sqlite3 (no
 * connection.js singleton involvement). Verifies format, sequential
 * monotonicity at sustained call rate, and counter reset at month/year
 * boundaries via injected Date.
 *
 * Runner:
 *   node --test domains/planning/tests/unit/woCodeGenerator.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWoCodeGenerator } from '../../server/services/woCodeGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

function freshDb() {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

const FORMAT = /^WO-\d{4}-\d{2}-\d{5}$/;

describe('woCodeGenerator — format', () => {
  test('generated code matches WO-YYYY-MM-NNNNN', () => {
    const db = freshDb();
    const gen = createWoCodeGenerator(db);
    const code = gen.generateCode(new Date(Date.UTC(2026, 4, 1, 0, 0, 0)));
    assert.match(code, FORMAT);
    assert.equal(code, 'WO-2026-05-00001');
  });
});

describe('woCodeGenerator — monotonicity at sustained rate (≥1000 calls)', () => {
  test('1000 sequential calls in same month yield unique monotonic codes', () => {
    const db = freshDb();
    const gen = createWoCodeGenerator(db);
    const fixed = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    const seen = new Set();
    let prev = 0;
    for (let i = 0; i < 1000; i++) {
      const code = gen.generateCode(fixed);
      assert.match(code, FORMAT);
      assert.ok(!seen.has(code), `duplicate code ${code} at i=${i}`);
      seen.add(code);
      const n = Number(code.slice(-5));
      assert.equal(n, prev + 1, `expected monotonic +1 at i=${i}, got ${n}`);
      prev = n;
    }
    assert.equal(seen.size, 1000);
    // Last code is …-01000 (5-digit zero-padded).
    assert.ok([...seen].some((c) => c === 'WO-2026-05-01000'));
  });
});

describe('woCodeGenerator — month rollover resets counter', () => {
  test('moving from May → June resets NNNNN to 00001 with updated month part', () => {
    const db = freshDb();
    const gen = createWoCodeGenerator(db);
    const may = new Date(Date.UTC(2026, 4, 31, 23, 59, 59));
    const jun = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));
    assert.equal(gen.generateCode(may), 'WO-2026-05-00001');
    assert.equal(gen.generateCode(may), 'WO-2026-05-00002');
    assert.equal(gen.generateCode(jun), 'WO-2026-06-00001');
    assert.equal(gen.generateCode(jun), 'WO-2026-06-00002');
    // Going back to May continues from where May left off (each ym has its own row).
    assert.equal(gen.generateCode(may), 'WO-2026-05-00003');
  });
});

describe('woCodeGenerator — year rollover resets counter, year part updates', () => {
  test('Dec 2026 → Jan 2027 resets NNNNN and bumps year part', () => {
    const db = freshDb();
    const gen = createWoCodeGenerator(db);
    const dec = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    const jan = new Date(Date.UTC(2027, 0, 1, 0, 0, 0));
    assert.equal(gen.generateCode(dec), 'WO-2026-12-00001');
    assert.equal(gen.generateCode(jan), 'WO-2027-01-00001');
    assert.equal(gen.generateCode(jan), 'WO-2027-01-00002');
  });
});

describe('woCodeGenerator — UTC, not local-zone', () => {
  test('Date constructed from local time string still uses UTC components', () => {
    const db = freshDb();
    const gen = createWoCodeGenerator(db);
    // 23:30 UTC on Apr 30 — depending on local TZ this could read as
    // May 1 in local time, but the generator must use UTC.
    const apr30 = new Date('2026-04-30T23:30:00Z');
    assert.equal(gen.generateCode(apr30), 'WO-2026-04-00001');
  });
});
