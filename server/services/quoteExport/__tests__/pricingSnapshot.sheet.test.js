// @ts-check
/**
 * Phase 4 — `10 Pricing Snapshot` sheet integration tests.
 *
 * Verifies the operator-facing audit metadata is written correctly:
 *   - All 11 field/value rows present
 *   - Status label reflects snapshot._synthesized / _captured_at
 *   - Counts roll up materials / rates / coverage
 *   - Warnings cell wraps newline-separated entries
 *   - Distinct from the hidden _Audit sheet (different name, visible)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { exportQuote } from '../index.js';

const HMAC_KEY = 'a'.repeat(64);
process.env.OPS_EXPORT_HMAC_KEY = HMAC_KEY;

function makeQuoteWithSnapshot(snapshot) {
  return {
    id: 'q-test',
    _version: 1,
    saved_at: '2026-06-10T14:30:00.000Z',
    saved_by: 'henry',
    type: 'standard',
    state: {
      rfq_number: 'RFQ-PHASE4-001',
      direct_cu: 'Test Customer',
      moq: 1000,
      num_moq: 1,
      active_moq_idx: 0,
      site: 'VN',
      selling_price: 0.5,
      annual_qty: 5000,
      usd_rate: 24500,
      materials_main: [{ _mid: 'm1', code: 'MAT-A', usage: 1, s_price: 5 }],
      materials_alt: [],
      materials_active: 'main',
      materials: [{ _mid: 'm1', code: 'MAT-A', usage: 1, s_price: 5 }],
      inks: [],
      processes: [{ _mid: 'p1', workcenter: 'Slit' }],
      pricing_snapshot: snapshot,
      part_width: 50,
      part_length_md: 30,
      part_net_width: 50,
      part_net_length_md: 30,
      web_width_td: 200,
      sheet_length: 300,
      num_webs: 1,
      parts_in_md: 1,
      parts_web_across: 1,
    },
    result: {
      sp: 0.5,
      s_ttl: 0.12,
      gm: 0.2,
      va: 0.3,
      contribution: 0.1,
      s_mat_cost: 0.05,
      overhead: 0.02,
      labor_cost: 0.01,
      tooling: 0.005,
      packing_ship: 0.005,
      bd_mat_setup: 0,
      bd_mat_run: 0.05,
      bd_ink_setup: 0,
      bd_ink_run: 0,
      bd_overhead: 0.02,
      bd_labor: 0.01,
      bd_extra: 0,
      bd_extra_vat: 0,
      bd_setup_mach: 0,
      bd_setup_labor: 0,
      rows: {
        materials_main: [{ code: 'MAT-A', setup: 0, run: 0.05, total: 0.05, qpa_lm: 1 }],
        materials_alt: [],
        inks: [],
        processes: [{ workcenter: 'Slit', setup: 0, run: 0.01, total: 0.01 }],
      },
      tiers: [
        {
          rows: {
            materials_main: [{ code: 'MAT-A', setup: 0, run: 0.05, total: 0.05, qpa_lm: 1 }],
            materials_alt: [],
            inks: [],
            processes: [{ workcenter: 'Slit', setup: 0, run: 0.01, total: 0.01 }],
          },
        },
      ],
    },
  };
}

async function readSnapshotSheet(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet('10 Pricing Snapshot');
  assert.ok(sheet, 'sheet "10 Pricing Snapshot" must exist');
  // Build a {label: value} dict from rows 3..13.
  const dict = {};
  for (let i = 3; i <= 14; i++) {
    const r = sheet.getRow(i);
    const label = r.getCell('A').value;
    const value = r.getCell('B').value;
    if (label) dict[String(label)] = value == null ? null : value;
  }
  return { sheet, dict };
}

test('pricing snapshot sheet — persisted snapshot stamps all metadata', async () => {
  const snap = {
    _captured_at: '2026-06-09T10:00:00.000Z',
    _captured_by: 'henry',
    _synthesized: false,
    _lib_version: 'v3.1',
    _site: 'VN',
    materials: { 'MAT-A': { s_price: 5 }, 'MAT-B': { s_price: 3 } },
    coverage: [{ pt: 'Flexo', cov: 0.5 }],
    rates: { Slit: { labor_rate: 3.08 }, Pre_Cut: { labor_rate: 2.54 } },
  };
  const out = await exportQuote(makeQuoteWithSnapshot(snap), {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
    now: new Date('2026-06-10T16:00:00Z'),
  });
  const { dict } = await readSnapshotSheet(out.buffer);
  assert.equal(dict['Quote ID'], 'q-test');
  assert.match(String(dict['Quote saved at']), /^10\/06\/2026 \d{2}:\d{2}$/);
  assert.match(String(dict['Pricing captured at']), /^09\/06\/2026 \d{2}:\d{2}$/);
  assert.equal(dict['Pricing captured by'], 'henry');
  assert.equal(dict['Site'], 'VN');
  assert.equal(dict['Library version'], 'v3.1');
  assert.match(String(dict['Snapshot status']), /Frozen at save time/);
  assert.equal(dict['Materials frozen'], 2);
  assert.equal(dict['Workcenters frozen'], 2);
  assert.equal(dict['Coverage rows'], 1);
  assert.equal(dict['Warnings'], '—');
});

test('pricing snapshot sheet — synthesized snapshot labelled "Live rates"', async () => {
  const snap = {
    _captured_at: null,
    _captured_by: null,
    _synthesized: true,
    _lib_version: null,
    _site: 'VN',
    materials: {},
    coverage: [],
    rates: {},
  };
  const out = await exportQuote(makeQuoteWithSnapshot(snap), {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
  });
  const { dict } = await readSnapshotSheet(out.buffer);
  assert.match(String(dict['Snapshot status']), /Live rates/);
  assert.equal(dict['Pricing captured at'], '—');
  assert.equal(dict['Pricing captured by'], '—');
});

test('pricing snapshot sheet — empty snapshot labelled "No snapshot"', async () => {
  const snap = {
    _captured_at: null,
    _captured_by: null,
    _synthesized: false,
    _lib_version: null,
    _site: null,
    materials: {},
    coverage: [],
    rates: {},
  };
  const out = await exportQuote(makeQuoteWithSnapshot(snap), {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
  });
  const { dict } = await readSnapshotSheet(out.buffer);
  assert.match(String(dict['Snapshot status']), /No snapshot/);
});

test('pricing snapshot sheet — distinct from hidden _Audit sheet (Phase 4 visible vs MVP-2 hidden)', async () => {
  const snap = {
    _captured_at: '2026-06-09T10:00:00.000Z',
    _captured_by: 'henry',
    _synthesized: false,
    _lib_version: null,
    _site: 'VN',
    materials: {},
    coverage: [],
    rates: {},
  };
  const out = await exportQuote(makeQuoteWithSnapshot(snap), {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buffer);
  const pricingSheet = wb.getWorksheet('10 Pricing Snapshot');
  const auditSheet = wb.getWorksheet('_Audit');
  assert.ok(pricingSheet, 'visible 10 Pricing Snapshot exists');
  assert.ok(auditSheet, 'hidden _Audit (MVP-2 forensic) still exists');
  assert.notEqual(pricingSheet.state, 'hidden', 'Pricing Snapshot is visible to operator');
  assert.equal(auditSheet.state, 'hidden', '_Audit is hidden (MVP-2 contract preserved)');
});

test('pricing snapshot sheet — surfaces _warnings from active-tier result', async () => {
  const snap = {
    _captured_at: '2026-06-09T10:00:00.000Z',
    _captured_by: 'henry',
    _synthesized: false,
    _lib_version: null,
    _site: 'VN',
    materials: {},
    coverage: [],
    rates: {},
  };
  const quote = makeQuoteWithSnapshot(snap);
  quote.result._warnings = [
    {
      type: 'site_mismatch',
      snapshot_site: 'VN',
      state_site: 'India',
      message: "Site mismatch: snapshot frozen under 'VN', current state.site = 'India'",
    },
  ];
  const out = await exportQuote(quote, {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
  });
  const { dict } = await readSnapshotSheet(out.buffer);
  assert.match(String(dict['Warnings']), /Site mismatch/);
});

test('pricing snapshot sheet — null pricing_snapshot handled gracefully (no crash)', async () => {
  const quote = makeQuoteWithSnapshot(null);
  const out = await exportQuote(quote, {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'tester',
  });
  const { dict } = await readSnapshotSheet(out.buffer);
  assert.match(String(dict['Snapshot status']), /No snapshot/);
  assert.equal(dict['Materials frozen'], 0);
  assert.equal(dict['Workcenters frozen'], 0);
  assert.equal(dict['Coverage rows'], 0);
});
