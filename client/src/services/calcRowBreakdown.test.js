/**
 * calcRowBreakdown / buildStdRowsPayload / buildCpxRowsPayload tests.
 * MES-3-FIX-41 — per-row Setup/Run/Total persisted for export visibility.
 *
 *     node --test src/services/calcRowBreakdown.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcAll,
  calcRowBreakdown,
  buildStdRowsPayload,
  buildCpxRowsPayload,
  createStdState,
  createCplxState,
  createSubProduct,
} from './calcEngine.js';

function makeLib(overrides = {}) {
  return {
    rate: [
      { workcenter: 'Manual', machine_rate: 0, labor_rate: 2.54, crew: 1, speed_uom: '' },
      { workcenter: 'Flexo-A', machine_rate: 40, labor_rate: 10, crew: 2, speed_uom: 'm/min' },
      { workcenter: 'RDC-1', machine_rate: 30, labor_rate: 8, crew: 1, speed_uom: 'm/min' },
    ],
    ddl: {
      coverage: [
        { pt: 'Flexo', cov: 300 },
        { pt: 'Indigo', cov: 400 },
      ],
      click_charges: { 1: 0.03, 4: 0.0074, 8: 0.0084 },
      tool_life: { Knife: 20000, Jig: 1_000_000, Metal: 500_000 },
    },
    ...overrides,
  };
}

function makeStdState(overrides = {}) {
  const base = createStdState();
  return {
    ...base,
    sheet_length: 50,
    min_gap_md: 2,
    rotary_cols: 0,
    num_webs: 1,
    parts_in_md: 4,
    parts_web_across: 2,
    web_width_td: 200,
    moq: 100_000,
    annual_qty: 500_000,
    product_lifetime: 2,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    target_margin: 0.25,
    selling_price: 0.5,
    materials: [
      {
        _mid: 'm1',
        code: 'M001',
        ifs_code: 'IFS001',
        desc: 'PET',
        row_type: 'Main.Mat',
        width: 200,
        cavities: 8,
        usage: 1,
        setup_lm: 50,
        latest: 3.5,
      },
    ],
    materials_main: [
      {
        _mid: 'm1',
        code: 'M001',
        ifs_code: 'IFS001',
        desc: 'PET',
        row_type: 'Main.Mat',
        width: 200,
        cavities: 8,
        usage: 1,
        setup_lm: 50,
        latest: 3.5,
      },
    ],
    materials_alt: [],
    materials_active: 'main',
    inks: [
      {
        _mid: 'i1',
        label: 'Ink 1',
        color: 'White',
        print_type: 'Flexo',
        clicks: 4,
        latest: 50,
        setup_kg: 0.5,
        area_pct: 50,
      },
    ],
    processes: [
      {
        _mid: 'p1',
        process_type: 'Print',
        workcenter: 'Flexo-A',
        speed: 100,
        layout: 1,
        efficiency: 0.85,
        setup_h: 0.5,
        tool_cost: 200,
        tool_type: 'Knife',
      },
    ],
    extra_moqs: [],
    ...overrides,
  };
}

// ── shape & basic plumbing ────────────────────────────────────

test('calcRowBreakdown: returns 4-key shape', () => {
  const lib = makeLib();
  const st = makeStdState();
  const rows = calcRowBreakdown(st, lib);
  assert.ok(rows && typeof rows === 'object');
  assert.ok(Array.isArray(rows.materials_main));
  assert.ok(Array.isArray(rows.materials_alt));
  assert.ok(Array.isArray(rows.inks));
  assert.ok(Array.isArray(rows.processes));
});

test('calcRowBreakdown: row counts match state arrays', () => {
  const lib = makeLib();
  const st = makeStdState();
  const rows = calcRowBreakdown(st, lib);
  assert.equal(rows.materials_main.length, st.materials_main.length);
  assert.equal(rows.inks.length, st.inks.length);
  assert.equal(rows.processes.length, st.processes.length);
});

test('calcRowBreakdown: each material row has setup_cost / run_cost / total Number fields', () => {
  const rows = calcRowBreakdown(makeStdState(), makeLib());
  const m = rows.materials_main[0];
  assert.equal(typeof m.setup_cost, 'number');
  assert.equal(typeof m.run_cost, 'number');
  assert.equal(typeof m.total, 'number');
});

test('calcRowBreakdown: returns empty arrays when state or lib missing', () => {
  const empty = calcRowBreakdown(null, null);
  assert.deepEqual(empty.materials_main, []);
  assert.deepEqual(empty.inks, []);
});

// ── sum invariant (key correctness check) ─────────────────────

test('calcRowBreakdown: Σ material setup_cost equals calcAll bd_mat_setup', () => {
  const lib = makeLib();
  const st = makeStdState();
  const full = calcAll(st, null, lib, null);
  const rows = calcRowBreakdown(st, lib);
  const sumSetup = rows.materials_main.reduce((s, r) => s + r.setup_cost, 0);
  assert.ok(
    Math.abs(sumSetup - full.bd_mat_setup) < 1e-9,
    `Σ row.setup_cost=${sumSetup} should equal bd_mat_setup=${full.bd_mat_setup}`
  );
});

test('calcRowBreakdown: Σ material run_cost equals calcAll bd_mat_run', () => {
  const lib = makeLib();
  const st = makeStdState();
  const full = calcAll(st, null, lib, null);
  const rows = calcRowBreakdown(st, lib);
  const sumRun = rows.materials_main.reduce((s, r) => s + r.run_cost, 0);
  assert.ok(Math.abs(sumRun - full.bd_mat_run) < 1e-9);
});

test('calcRowBreakdown: Σ ink setup_cost equals calcAll bd_ink_setup', () => {
  const lib = makeLib();
  const st = makeStdState();
  const full = calcAll(st, null, lib, null);
  const rows = calcRowBreakdown(st, lib);
  const sumSetup = rows.inks.reduce((s, r) => s + r.setup_cost, 0);
  assert.ok(Math.abs(sumSetup - full.bd_ink_setup) < 1e-9);
});

// ── Indigo clicks attachment ──────────────────────────────────

test('calcRowBreakdown: Indigo ink row attaches clicks field', () => {
  const st = makeStdState({
    inks: [
      {
        _mid: 'i1',
        label: 'Ink 1',
        color: 'White',
        print_type: 'Indigo',
        clicks: 8,
        latest: 50,
      },
    ],
  });
  const rows = calcRowBreakdown(st, makeLib());
  assert.equal(rows.inks[0].clicks, 8);
});

test('calcRowBreakdown: Indigo subtype Indigo6800 also attaches clicks', () => {
  const st = makeStdState({
    inks: [
      {
        _mid: 'i1',
        label: 'Ink',
        color: 'White',
        print_type: 'Indigo6800',
        clicks: 4,
        latest: 50,
      },
    ],
  });
  const rows = calcRowBreakdown(st, makeLib());
  assert.equal(rows.inks[0].clicks, 4);
});

test('calcRowBreakdown: non-Indigo ink omits clicks field', () => {
  const st = makeStdState({
    inks: [
      {
        _mid: 'i1',
        label: 'Ink',
        color: 'White',
        print_type: 'Flexo',
        clicks: 4,
        latest: 50,
      },
    ],
  });
  const rows = calcRowBreakdown(st, makeLib());
  assert.equal(rows.inks[0].clicks, undefined);
});

// ── alt materials ─────────────────────────────────────────────

test('calcRowBreakdown: when alt materials present, both sets are populated', () => {
  const altRow = {
    _mid: 'a1',
    code: 'ALT-PET',
    ifs_code: 'IFS-A',
    desc: 'Alt PET',
    row_type: 'Main.Mat',
    width: 200,
    cavities: 8,
    usage: 1,
    setup_lm: 50,
    latest: 4.0,
  };
  const st = makeStdState({ materials_alt: [altRow] });
  const rows = calcRowBreakdown(st, makeLib());
  assert.equal(rows.materials_main.length, 1);
  assert.equal(rows.materials_alt.length, 1);
  // Alt mat with higher price → higher run_cost
  assert.ok(rows.materials_alt[0].run_cost > 0);
});

test('calcRowBreakdown: empty alt array returns empty materials_alt', () => {
  const rows = calcRowBreakdown(makeStdState(), makeLib());
  assert.deepEqual(rows.materials_alt, []);
});

// ── Std tier walk ─────────────────────────────────────────────

test('buildStdRowsPayload: returns rows for every tier', () => {
  const st = makeStdState({
    extra_moqs: [
      { moq: 200_000, selling_price: 0.45, eau: 500_000 },
      { moq: 500_000, selling_price: 0.4, eau: 500_000 },
    ],
  });
  const payload = buildStdRowsPayload(st, makeLib());
  assert.equal(payload.tiers.length, 3);
  assert.ok(payload.tiers[0].rows.materials_main.length === 1);
  assert.ok(payload.tiers[1].rows.materials_main.length === 1);
  assert.ok(payload.tiers[2].rows.materials_main.length === 1);
  // Higher MOQ → lower setup_cost per unit
  assert.ok(
    payload.tiers[2].rows.materials_main[0].setup_cost <
      payload.tiers[0].rows.materials_main[0].setup_cost
  );
});

test('buildStdRowsPayload: top-level rows equals active tier rows', () => {
  const st = makeStdState({
    active_moq_idx: 1,
    extra_moqs: [{ moq: 200_000, selling_price: 0.45, eau: 500_000 }],
  });
  const payload = buildStdRowsPayload(st, makeLib());
  assert.deepEqual(payload.rows, payload.tiers[1].rows);
});

// ── Cpx ───────────────────────────────────────────────────────

test('buildCpxRowsPayload: returns one entry per subproduct', () => {
  const cs = createCplxState();
  cs.moq = 50_000;
  cs.selling_price = 1.0;
  cs.trade_mode = 'USD(Normal)';
  cs.site = 'VN';
  const sp1 = createSubProduct({ code: 'SP-A' });
  sp1.web_width_td = 200;
  sp1.sheet_length = 50;
  sp1.min_gap_md = 2;
  sp1.num_webs = 1;
  sp1.parts_in_md = 4;
  sp1.parts_web_across = 2;
  sp1.materials_main = [
    {
      _mid: 'm1',
      code: 'M1',
      ifs_code: 'IFS1',
      desc: 'PET',
      row_type: 'Main.Mat',
      width: 200,
      cavities: 8,
      usage: 1,
      setup_lm: 50,
      latest: 3.5,
    },
  ];
  sp1.materials = sp1.materials_main;
  sp1.materials_active = 'main';
  sp1.inks = [];
  sp1.processes = [
    {
      _mid: 'p1',
      process_type: 'Print',
      workcenter: 'Flexo-A',
      speed: 100,
      layout: 1,
      efficiency: 0.85,
      setup_h: 0.5,
      tool_cost: 0,
    },
  ];
  cs.subproducts = [sp1];

  const payload = buildCpxRowsPayload(cs, [sp1], makeLib());
  assert.equal(payload.subproducts.length, 1);
  assert.ok(Array.isArray(payload.subproducts[0].tiers));
  assert.ok(payload.subproducts[0].rows);
  assert.equal(payload.subproducts[0].rows.materials_main.length, 1);
});

test('buildCpxRowsPayload: empty inputs return empty subproducts', () => {
  assert.deepEqual(buildCpxRowsPayload(null, [], makeLib()).subproducts, []);
  assert.deepEqual(buildCpxRowsPayload({}, [], makeLib()).subproducts, []);
});

// ── Numbers are Numbers (not strings) ─────────────────────────

test('calcRowBreakdown: zero values are Number 0, not undefined or string', () => {
  // Empty ink row produces zeros, not missing fields.
  const st = makeStdState({ inks: [{ _mid: 'i1', label: 'Ink', print_type: 'Flexo', latest: 0 }] });
  const rows = calcRowBreakdown(st, makeLib());
  assert.equal(typeof rows.inks[0].setup_cost, 'number');
  assert.equal(typeof rows.inks[0].run_cost, 'number');
});
