/**
 * Tests for backfill-quote-results.js — the one-shot migration that
 * recomputes quote.result for historical rows saved before Sprint 14's
 * expanded save shape.
 *
 * Runner: node --test scripts/backfill-quote-results.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isThinResult, recomputeQuote, backfillQuotes, loadLib } from './backfill-quote-results.js';

// Minimal lib shape calcEngine understands.
function makeLib() {
  return {
    rate: [
      { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
      { workcenter: 'RDC-1', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
    ],
    mat: [{ code: 'M001', s_price: 5, g_price: 5, latest: 0 }],
    ddl: { coverage: [{ pt: 'Flexo', cov: 300 }], tool_life: { 'RDC Die': 100000 } },
    finance: { summary: { sga_rate_pct_by_site: {} } },
    inkCalc: {},
  };
}

// Minimal std state just rich enough for calcAll to produce a full result.
function stdState(overrides = {}) {
  return {
    moq: 1000,
    annual_qty: 10000,
    selling_price: 0.2,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    product_lifetime: 1,
    active_moq_idx: 0,
    extra_moqs: [],
    num_moq: 1,
    part_width: 80,
    part_length_md: 50,
    web_width_td: 80,
    sheet_length: 50,
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    min_gap_md: 2,
    rotary_cols: 0,
    pcs_per_roll: 0,
    materials: [
      {
        code: 'M001',
        width: 80,
        usage: 1,
        s_price: 5,
        g_price: 5,
        latest: 0,
        offcut_pct: 0,
        offcut_yn: 'N',
        slitting_yn: 'N',
      },
    ],
    inks: [],
    processes: [
      {
        workcenter: 'Flexo-A',
        process_type: 'Flexo',
        speed: 10,
        layout: 4,
        efficiency: 0.85,
        setup_h: 0.5,
        scrap_pct: 0.03,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      },
    ],
    pcs_per_bag: 100,
    bags_per_box: 10,
    container_cost: 0.5,
    box_cost: 0.5,
    other_packing: 0,
    shipping_cost: 100,
    other_ship: 0,
    ship_qty: 1000,
    ...overrides,
  };
}

test('isThinResult: null or missing s_mat_cost → true', () => {
  assert.equal(isThinResult(null), true);
  assert.equal(isThinResult({}), true);
  assert.equal(isThinResult({ gm: 0.5, va: 0.5, s_ttl: 0.05 }), true, 'minimal schema is thin');
  assert.equal(isThinResult({ s_mat_cost: 0.01, gm: 0.5 }), false, 'has breakdown → not thin');
});

test('recomputeQuote: standard quote without result → full breakdown produced', () => {
  const lib = makeLib();
  const q = { id: 1, type: 'standard', state: stdState(), result: null };
  const r = recomputeQuote(q, lib);
  assert.ok(r, 'result returned');
  assert.ok(typeof r.s_mat_cost === 'number', 'has s_mat_cost');
  assert.ok(typeof r.tooling === 'number', 'has tooling');
  assert.ok(typeof r.packing_ship === 'number', 'has packing_ship');
  assert.ok(typeof r.gm === 'number', 'has gm');
  assert.ok(typeof r.va === 'number', 'has va');
});

test('recomputeQuote: quote without state → null (cannot recompute)', () => {
  const lib = makeLib();
  const r = recomputeQuote({ id: 99, type: 'standard', state: null }, lib);
  assert.equal(r, null);
});

test('recomputeQuote: calcAll throw is captured as __error marker', () => {
  const lib = makeLib();
  // Pass a state missing `materials` array to make calcAll throw when it maps.
  const q = { id: 1, type: 'standard', state: { moq: 1000, selling_price: 0.2 } };
  const r = recomputeQuote(q, lib);
  assert.ok(r && r.__error, 'error surfaced via __error marker');
});

test('backfillQuotes: thin quotes updated, full-schema untouched, bad ones skipped', () => {
  const lib = makeLib();
  const alreadyFull = {
    id: 2,
    type: 'standard',
    state: stdState(),
    result: {
      sp: 0.2,
      s_ttl: 0.05,
      gm: 0.75,
      va: 0.8,
      s_mat_cost: 0.02,
      tooling: 0,
      packing_ship: 0.01,
      labor_cost: 0.003,
    },
  };
  const thin = {
    id: 1,
    type: 'standard',
    state: stdState(),
    result: { gm: 0.1, va: 0.2, s_ttl: 0.05 },
  };
  const bad = { id: 3, type: 'standard', state: null, result: null };
  const { next, report } = backfillQuotes([alreadyFull, thin, bad], lib);
  assert.equal(report.already_full, 1);
  assert.equal(report.updated, 1);
  assert.equal(report.skipped, 1);
  // Full-schema row unchanged (same reference OK for this test).
  assert.equal(next[0].result.gm, 0.75);
  // Thin row upgraded — s_mat_cost now present.
  assert.ok(typeof next[1].result.s_mat_cost === 'number');
  // Bad row preserved as-is.
  assert.deepEqual(next[2], bad);
});

test('backfillQuotes: idempotent — re-run after successful backfill is a no-op', () => {
  const lib = makeLib();
  const q = {
    id: 1,
    type: 'standard',
    state: stdState(),
    result: { gm: 0.5, va: 0.5, s_ttl: 0.05 },
  };
  const first = backfillQuotes([q], lib);
  assert.equal(first.report.updated, 1);
  const second = backfillQuotes(first.next, lib);
  assert.equal(second.report.updated, 0);
  assert.equal(second.report.already_full, 1);
});

test('loadLib: missing files → safe defaults (never throws)', () => {
  // Point at a non-existent dir — loadLib should return an empty-but-shaped lib.
  const lib = loadLib('/tmp/ops-backfill-nowhere-' + Date.now());
  assert.ok(Array.isArray(lib.rate));
  assert.equal(lib.rate.length, 0);
  assert.ok(Array.isArray(lib.mat));
  assert.ok(typeof lib.ddl === 'object');
  assert.ok(lib.finance && typeof lib.finance.summary === 'object');
});
