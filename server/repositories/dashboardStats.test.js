/**
 * dashboardStats — tests for the Phase 9B extensions.
 *
 * Runner: node --test. The functions read from SQLite via a singleton;
 * we swap in a fresh in-memory DB per test via a tmp dir + `OPS_DB_PATH`
 * override, seed it with quotes fixtures, then invoke the exports.
 *
 * We test behavior, not implementation:
 *   - time-range filter bounds
 *   - win-rate definition (approved/rejected only count toward the rate)
 *   - per-customer aggregation (revenue, win rate)
 *   - margin trend bucketing
 *   - approval funnel totals
 *   - legacy 'submitted' aliases to pending_sales
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Must set before importing the module under test — db/connection.js
// reads the env at import time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-dash-stats-'));
const dbPath = path.join(tmpDir, 'ops.sqlite');
process.env.OPS_DB_PATH = dbPath;
// loadQuotes() defaults to the file backend (`quote_history.json`).
// dashboardStats.js reads via loadQuotes; this test seeds via SQL, so
// force the sqlite backend here. Without this override every assertion
// reads an empty fixture and reports `actual: 0` (real incident
// 2026-04-30 — surfaced by the post-GA full sweep).
process.env.OPS_DATA_BACKEND = 'sqlite';
process.env.DATA_DIR = tmpDir;

const { getDb } = await import('../db/connection.js');
const {
  getOverview,
  getWinRate,
  getApprovalFunnel,
  getTopCustomers,
  getMonthlyQuoteCount,
  getMarginTrend,
  getMarginHistogram,
} = await import('./dashboardStats.js');

// ── DB setup ──
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY,
    type TEXT,
    rfq_number TEXT,
    ccl_pn TEXT,
    direct_cu TEXT,
    end_cu TEXT,
    npi_owner TEXT,
    sale_owner TEXT,
    saved_at TEXT,
    version TEXT,
    label TEXT,
    result TEXT,
    state_json TEXT,
    raw_json TEXT NOT NULL,
    updated_at DATETIME
  );
`);

function iso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function isoMonthsAgo(m) {
  // Set day=1 BEFORE shifting the month to avoid the JS month-overflow
  // pitfall. Naïve `setMonth(getMonth() - 2)` on April 30 → Feb 30 →
  // rolls forward to March 2, putting the quote in the wrong bucket.
  // Day=15 picks the middle of the target month so DST cusp dates
  // can't shift it into a neighbour.
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - m);
  d.setDate(15);
  return d.toISOString();
}

function seedQuote({ id, type = 'standard', direct_cu, saved_at, gm, sp, moq, approval_status }) {
  // dashboardStats reads via loadQuotes() which JSON.parses raw_json
  // and ignores the per-column projections. So every field the
  // dashboard reduces over (saved_at, direct_cu, ccl_pn, result.*,
  // state.*) MUST live inside raw_json. The column projections below
  // exist only for SQL filter pre-narrowing.
  const payload = {
    id,
    type,
    saved_at,
    direct_cu,
    end_cu: direct_cu,
    ccl_pn: `PN-${id}`,
    result: {
      gm,
      va: gm != null ? gm + 0.05 : null,
      sp,
      contribution: sp != null && moq != null ? sp * moq : null,
    },
    state: {
      direct_cu,
      end_cu: direct_cu,
      selling_price: sp,
      moq,
      approval: approval_status ? { status: approval_status, history: [] } : null,
    },
  };
  db.prepare(
    `INSERT INTO quotes (id, type, saved_at, direct_cu, end_cu, ccl_pn, raw_json)
              VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, saved_at, direct_cu, direct_cu, `PN-${id}`, JSON.stringify(payload));
}

function resetDb() {
  db.prepare(`DELETE FROM quotes`).run();
}

// ── Tests ──

test('getOverview: empty DB returns zeros', () => {
  resetDb();
  const r = getOverview();
  assert.equal(r.total, 0);
  assert.equal(r.avg_gm, null);
  assert.equal(r.pending_count, 0);
  assert.equal(r.revenue_total, 0);
});

test('getOverview: counts, revenue, pending', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'Brady',
    saved_at: iso(5),
    gm: 0.25,
    sp: 0.1,
    moq: 10000,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'Brady',
    saved_at: iso(5),
    gm: 0.15,
    sp: 0.2,
    moq: 5000,
    approval_status: 'pending_sales',
  });
  seedQuote({
    id: 3,
    direct_cu: 'CCL',
    saved_at: iso(5),
    gm: 0.3,
    sp: 0.3,
    moq: 2000,
    approval_status: 'rejected',
  });
  seedQuote({
    id: 4,
    direct_cu: 'CCL',
    saved_at: iso(5),
    gm: null,
    sp: null,
    moq: null,
    approval_status: 'draft',
  });
  const r = getOverview();
  assert.equal(r.total, 4);
  assert.equal(r.pending_count, 1);
  // revenue_total = 0.10*10000 + 0.20*5000 + 0.30*2000 = 1000 + 1000 + 600 = 2600
  assert.equal(r.revenue_total, 2600);
  // avg_gm over 3 non-null rows = (0.25+0.15+0.30)/3
  assert.ok(Math.abs(r.avg_gm - (0.25 + 0.15 + 0.3) / 3) < 1e-9);
});

test('getOverview: days=30 filters older rows out', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'A',
    saved_at: iso(100),
    gm: 0.3,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  const all = getOverview();
  const recent = getOverview({ days: 30 });
  assert.equal(all.total, 2);
  assert.equal(recent.total, 1);
});

test('getWinRate: draft/pending excluded from rate denominator', () => {
  resetDb();
  seedQuote({ id: 1, direct_cu: 'A', saved_at: iso(5), approval_status: 'approved' });
  seedQuote({ id: 2, direct_cu: 'A', saved_at: iso(5), approval_status: 'approved' });
  seedQuote({ id: 3, direct_cu: 'A', saved_at: iso(5), approval_status: 'approved' });
  seedQuote({ id: 4, direct_cu: 'A', saved_at: iso(5), approval_status: 'rejected' });
  seedQuote({ id: 5, direct_cu: 'A', saved_at: iso(5), approval_status: 'pending_sales' });
  seedQuote({ id: 6, direct_cu: 'A', saved_at: iso(5), approval_status: 'draft' });
  const r = getWinRate();
  assert.equal(r.won, 3);
  assert.equal(r.lost, 1);
  assert.equal(r.pending, 1);
  assert.equal(r.draft, 1);
  assert.equal(r.decided, 4);
  assert.equal(r.rate, 0.75);
});

test('getWinRate: null rate when no decided quotes', () => {
  resetDb();
  seedQuote({ id: 1, direct_cu: 'A', saved_at: iso(5), approval_status: 'pending_sales' });
  seedQuote({ id: 2, direct_cu: 'A', saved_at: iso(5), approval_status: 'draft' });
  const r = getWinRate();
  assert.equal(r.rate, null);
  assert.equal(r.decided, 0);
});

test('getWinRate: legacy "submitted" aliases to pending_sales (not counted as decided)', () => {
  resetDb();
  seedQuote({ id: 1, direct_cu: 'A', saved_at: iso(5), approval_status: 'submitted' });
  seedQuote({ id: 2, direct_cu: 'A', saved_at: iso(5), approval_status: 'approved' });
  const r = getWinRate();
  assert.equal(r.won, 1);
  assert.equal(r.pending, 1);
  assert.equal(r.decided, 1);
  assert.equal(r.rate, 1);
});

test('getApprovalFunnel: counts each V2 state', () => {
  resetDb();
  seedQuote({ id: 1, direct_cu: 'A', saved_at: iso(5), approval_status: 'draft' });
  seedQuote({ id: 2, direct_cu: 'A', saved_at: iso(5), approval_status: 'quote_to_sale' });
  seedQuote({ id: 3, direct_cu: 'A', saved_at: iso(5), approval_status: 'price_approved' });
  seedQuote({ id: 4, direct_cu: 'A', saved_at: iso(5), approval_status: 'cancelled' });
  seedQuote({ id: 5, direct_cu: 'A', saved_at: iso(5), approval_status: 'rejected' });
  // Legacy v1 statuses heal-on-read into the V2 buckets.
  seedQuote({ id: 6, direct_cu: 'A', saved_at: iso(5), approval_status: 'pending_sales' });
  seedQuote({ id: 7, direct_cu: 'A', saved_at: iso(5), approval_status: 'pending_finance' });
  seedQuote({ id: 8, direct_cu: 'A', saved_at: iso(5), approval_status: 'approved' });
  const f = getApprovalFunnel();
  assert.deepEqual(f, {
    draft: 1,
    quote_to_sale: 3, // 1 new + 2 healed (pending_sales + pending_finance)
    price_approved: 2, // 1 new + 1 healed (approved)
    cancelled: 1,
    rejected: 1,
  });
});

test('getTopCustomers: revenue sum + win rate per customer', () => {
  resetDb();
  // Brady: 2 won, 1 lost, rev = 1000 + 500 + 200 = 1700, win_rate = 2/3
  seedQuote({
    id: 1,
    direct_cu: 'Brady',
    saved_at: iso(5),
    gm: 0.2,
    sp: 0.1,
    moq: 10000,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'Brady',
    saved_at: iso(5),
    gm: 0.3,
    sp: 0.1,
    moq: 5000,
    approval_status: 'approved',
  });
  seedQuote({
    id: 3,
    direct_cu: 'Brady',
    saved_at: iso(5),
    gm: 0.1,
    sp: 0.1,
    moq: 2000,
    approval_status: 'rejected',
  });
  // CCL: 1 pending — no decided quotes, win_rate null
  seedQuote({
    id: 4,
    direct_cu: 'CCL',
    saved_at: iso(5),
    gm: 0.4,
    sp: 1,
    moq: 100,
    approval_status: 'pending_sales',
  });
  const rows = getTopCustomers(10);
  assert.equal(rows.length, 2);
  const brady = rows.find((r) => r.customer === 'Brady');
  assert.equal(brady.quote_count, 3);
  assert.equal(brady.revenue, 1700);
  assert.equal(brady.won, 2);
  assert.equal(brady.lost, 1);
  assert.ok(Math.abs(brady.win_rate - 2 / 3) < 1e-9);

  const ccl = rows.find((r) => r.customer === 'CCL');
  assert.equal(ccl.win_rate, null);
});

test('getTopCustomers: limit respected, sorted by quote_count desc', () => {
  resetDb();
  for (let i = 0; i < 3; i++) {
    seedQuote({
      id: 100 + i,
      direct_cu: 'A',
      saved_at: iso(5),
      gm: 0.2,
      sp: 1,
      moq: 100,
      approval_status: 'approved',
    });
  }
  seedQuote({
    id: 200,
    direct_cu: 'B',
    saved_at: iso(5),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  const rows = getTopCustomers(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customer, 'A');
  assert.equal(rows[0].quote_count, 3);
});

test('getMonthlyQuoteCount: buckets quotes into N months', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'A',
    saved_at: isoMonthsAgo(0),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'A',
    saved_at: isoMonthsAgo(0),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  seedQuote({
    id: 3,
    direct_cu: 'A',
    saved_at: isoMonthsAgo(2),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  const series = getMonthlyQuoteCount({ months: 3 });
  assert.equal(series.length, 3);
  assert.equal(series[2].count, 2); // current month — last entry
  assert.equal(series[0].count, 1); // 2 months ago — first entry
});

test('getMarginTrend: avg_gm per month; null when no quotes', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'A',
    saved_at: isoMonthsAgo(0),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'A',
    saved_at: isoMonthsAgo(0),
    gm: 0.4,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  const series = getMarginTrend({ months: 3 });
  assert.equal(series.length, 3);
  const current = series[2];
  assert.equal(current.count, 2);
  assert.ok(Math.abs(current.avg_gm - 0.3) < 1e-9);
  const older = series[0];
  assert.equal(older.count, 0);
  assert.equal(older.avg_gm, null);
});

test('getMarginHistogram: bands match thresholds', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: -0.1,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  seedQuote({
    id: 2,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.05,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  seedQuote({
    id: 3,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.15,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  seedQuote({
    id: 4,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.25,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  seedQuote({
    id: 5,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.4,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  seedQuote({
    id: 6,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: null,
    sp: 1,
    moq: 100,
    approval_status: 'draft',
  });
  const h = getMarginHistogram();
  assert.equal(h.negative.count, 1);
  assert.equal(h.low.count, 1);
  assert.equal(h.medium.count, 1);
  assert.equal(h.good.count, 1);
  assert.equal(h.excellent.count, 1);
  assert.equal(h.unknown.count, 1);
});

test('days filter cascades to getWinRate and getTopCustomers', () => {
  resetDb();
  seedQuote({
    id: 1,
    direct_cu: 'A',
    saved_at: iso(5),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'approved',
  });
  seedQuote({
    id: 2,
    direct_cu: 'A',
    saved_at: iso(200),
    gm: 0.2,
    sp: 1,
    moq: 100,
    approval_status: 'rejected',
  });
  // All-time: 1 won, 1 lost, rate 50%
  const allWR = getWinRate();
  assert.equal(allWR.decided, 2);
  assert.equal(allWR.rate, 0.5);
  // Last 30 days: only the won quote
  const recent = getWinRate({ days: 30 });
  assert.equal(recent.decided, 1);
  assert.equal(recent.rate, 1);
  // Customer view: recent only includes the one quote
  const cus = getTopCustomers(10, { days: 30 });
  assert.equal(cus[0].quote_count, 1);
  assert.equal(cus[0].won, 1);
});

// ── Cleanup ──
test('cleanup: remove tmp DB', () => {
  db.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});
