// @ts-check
/**
 * exportQuote() unit tests — uses a hand-built fixture quote so we
 * don't depend on dev DB state. Verifies the workbook structure +
 * key cell contents WITHOUT booting the route stack.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote, QuoteExportError, resolveTierIdxs, pickKpisForTier } from '../index.js';

function makeFixtureQuote(overrides = {}) {
  return {
    id: 9999,
    type: 'standard',
    label: 'RFQ-TEST-001',
    _version: 2,
    saved_at: '2026-05-18T10:00:00Z',
    state: {
      rfq_number: 'RFQ-TEST-001',
      end_cu: 'Test Customer',
      ccl_pn: 'CCL-001',
      end_cu_pn: 'EC-001',
      site: 'VN',
      trade_mode: 'USD(Normal)',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      target_margin: 0.3,
      active_moq_idx: 0,
      web_width_td: 300,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 2,
      parts_in_md: 4,
      part_width: 100,
      part_length_md: 50,
      materials_main: [
        {
          _mid: 'm1',
          code: 'M001',
          ifs_code: 'IFS001',
          desc: 'PET',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 4,
          usage: 1,
          setup_lm: 50,
          latest: 3.5,
          s_price: 3.4,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [
        {
          _mid: 'i1',
          label: 'Ink 1',
          ifs_code: 'INK-W',
          color: 'White',
          print_type: 'Indigo',
          clicks: 4,
          latest: 50,
        },
        {
          _mid: 'i2',
          label: 'Ink 2',
          ifs_code: 'INK-B',
          color: 'Black',
          print_type: 'SS',
          area_pct: 0.3,
          latest: 65,
        },
      ],
      processes: [
        {
          _mid: 'p1',
          process_type: 'Print',
          workcenter: 'Indigo6800',
          speed: 30,
          layout: 8,
          setup_h: 2,
          scrap_pct: 0.03,
        },
      ],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      g_ttl: 0.35,
      gm: 0.3,
      va: 0.4,
      contribution: 0.35,
      s_mat_cost: 0.2,
      g_mat_cost: 0.2,
      overhead: 0.02,
      labor_cost: 0.03,
      tooling: 0.01,
      packing_ship: 0.005,
      vat_loss: 0,
      bd_mat_setup: 0.05,
      bd_mat_run: 0.1,
      bd_ink_setup: 0.02,
      bd_ink_run: 0.03,
      bd_setup_labor: 0.005,
      bd_setup_mach: 0.005,
      bd_extra: 0,
      bd_extra_vat: 0,
      warnings: [],
    },
    ...overrides,
  };
}

async function parseBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

// ── Happy path ──────────────────────────────────────────────────

test('exportQuote: customer variant → single xlsx with 10 sheets', async () => {
  const out = await exportQuote(makeFixtureQuote(), {
    variant: 'customer',
    lang: 'en',
    tiers: 'all',
    exportedBy: 'test',
    now: new Date('2026-05-18T00:00:00Z'),
  });
  assert.equal(out.kind, 'xlsx');
  assert.match(
    out.filename,
    /^Quote_RFQ-TEST-001_Test_Customer_MOQ1000_customer_v2_20260518\.xlsx$/
  );
  assert.ok(Buffer.isBuffer(out.buffer), 'buffer must be a Buffer');
  assert.ok(out.buffer.length > 5000, `expected >5KB xlsx, got ${out.buffer.length}`);

  const wb = await parseBuffer(out.buffer);
  const sheetNames = wb.worksheets.map((s) => s.name);
  assert.equal(
    sheetNames.length,
    10,
    `expected 10 sheets, got ${sheetNames.length}: ${sheetNames}`
  );
  assert.deepEqual(sheetNames, [
    '00 Cover',
    '01 RFQ MOQ',
    '02 Layout',
    '03 Materials',
    '04 Inks',
    '05 Processes',
    '06 Balancing',
    '07 Pack Ship',
    '08 Cost Breakdown',
    '09 Summary',
  ]);
});

test('exportQuote: internal variant produces same sheet count, different filename', async () => {
  const out = await exportQuote(makeFixtureQuote(), {
    variant: 'internal',
    lang: 'en',
    now: new Date('2026-05-18T00:00:00Z'),
  });
  assert.equal(out.kind, 'xlsx');
  assert.match(out.filename, /_internal_v2_/);
  const wb = await parseBuffer(out.buffer);
  assert.equal(wb.worksheets.length, 10);
});

test('exportQuote: Cover sheet contains quote label + version + customer name', async () => {
  const out = await exportQuote(makeFixtureQuote(), {
    variant: 'internal',
    lang: 'en',
    exportedBy: 'thiepdt',
  });
  const wb = await parseBuffer(out.buffer);
  const cover = wb.getWorksheet('00 Cover');
  // Banner at A1
  assert.match(String(cover.getCell('A1').value), /QUOTATION/);
  // Look for the label "Quote ID" (col A) and value "RFQ-TEST-001" (col B)
  const labels = [];
  cover.eachRow((row) => row.eachCell((cell) => labels.push(String(cell.value || ''))));
  assert.ok(labels.includes('RFQ-TEST-001'), 'expected quote label on Cover');
  assert.ok(labels.includes('Test Customer'), 'expected customer on Cover');
});

test('exportQuote: Materials sheet renders main row IFS code', async () => {
  const out = await exportQuote(makeFixtureQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  let foundIfs = false;
  mat.eachRow((row) =>
    row.eachCell((cell) => {
      if (String(cell.value) === 'IFS001') foundIfs = true;
    })
  );
  assert.ok(foundIfs, 'expected IFS code IFS001 on Materials sheet');
});

test('exportQuote: alt-materials section renders when materials_alt non-empty', async () => {
  const q = makeFixtureQuote();
  q.state.materials_alt = [
    {
      _mid: 'a1',
      code: 'ALT001',
      ifs_code: 'IFS-ALT',
      desc: 'Alt PET',
      row_type: 'Main.Mat',
      width: 200,
      cavities: 4,
      usage: 1,
      latest: 4.0,
    },
  ];
  const out = await exportQuote(q, { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  let foundAlt = false;
  mat.eachRow((row) =>
    row.eachCell((cell) => {
      if (String(cell.value) === 'IFS-ALT') foundAlt = true;
    })
  );
  assert.ok(foundAlt, 'expected alt material IFS code on Materials sheet');
});

test('exportQuote: Inks sheet has rows for each visible ink', async () => {
  const out = await exportQuote(makeFixtureQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const inks = wb.getWorksheet('04 Inks');
  const printTypes = [];
  inks.eachRow((row) => {
    const pt = row.getCell(4).value; // Print Type col
    if (pt && pt !== 'Print Type') printTypes.push(String(pt));
  });
  assert.ok(printTypes.includes('Indigo'), 'Indigo row missing');
  assert.ok(printTypes.includes('SS'), 'SS row missing');
});

test('exportQuote: Cost Breakdown internal variant shows ~12 detailed buckets', async () => {
  const out = await exportQuote(makeFixtureQuote(), { variant: 'internal', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const cb = wb.getWorksheet('08 Cost Breakdown');
  let bucketCount = 0;
  cb.eachRow((row, rowIdx) => {
    if (rowIdx < 4) return;
    const v = row.getCell(1).value;
    if (
      typeof v === 'string' &&
      v &&
      !v.startsWith('S.TOTAL') &&
      !v.startsWith('G.TOTAL') &&
      !v.startsWith('Margin') &&
      !v.startsWith('Sell')
    ) {
      bucketCount += 1;
    }
  });
  assert.ok(bucketCount >= 10, `expected ≥10 internal buckets, got ${bucketCount}`);
});

test('exportQuote: Cost Breakdown customer variant collapses to 5 buckets', async () => {
  const out = await exportQuote(makeFixtureQuote(), { variant: 'customer', lang: 'en' });
  const wb = await parseBuffer(out.buffer);
  const cb = wb.getWorksheet('08 Cost Breakdown');
  let bucketCount = 0;
  cb.eachRow((row, rowIdx) => {
    if (rowIdx < 4) return;
    const v = row.getCell(1).value;
    if (typeof v === 'string' && v && !v.startsWith('S.TOTAL') && !v.startsWith('Sell')) {
      bucketCount += 1;
    }
  });
  assert.ok(bucketCount <= 6, `expected ≤6 customer buckets, got ${bucketCount}`);
});

// ── Validation errors ─────────────────────────────────────────

test('exportQuote: missing variant throws QuoteExportError(400)', async () => {
  await assert.rejects(
    () => exportQuote(makeFixtureQuote(), {}),
    (err) => err instanceof QuoteExportError && err.status === 400 && err.code === 'missing-variant'
  );
});

test('exportQuote: missing result snapshot throws 422', async () => {
  const q = makeFixtureQuote();
  delete q.result;
  await assert.rejects(
    () => exportQuote(q, { variant: 'customer' }),
    (err) => err instanceof QuoteExportError && err.status === 422 && err.code === 'no-snapshot'
  );
});

test('exportQuote: bad lang throws 400', async () => {
  await assert.rejects(
    () => exportQuote(makeFixtureQuote(), { variant: 'customer', lang: 'fr' }),
    (err) => err instanceof QuoteExportError && err.status === 400
  );
});

// ── resolveTierIdxs ───────────────────────────────────────────

test('resolveTierIdxs: "all" returns 0..N-1', () => {
  assert.deepEqual(resolveTierIdxs('all', 3), [0, 1, 2]);
  assert.deepEqual(resolveTierIdxs(undefined, 2), [0, 1]);
});

test('resolveTierIdxs: explicit array filters + dedupes', () => {
  assert.deepEqual(resolveTierIdxs([1, 0, 1], 3), [1, 0]);
});

test('resolveTierIdxs: out-of-range index throws 400', () => {
  assert.throws(
    () => resolveTierIdxs([5], 3),
    (err) => err.code === 'bad-tier-index' && err.status === 400
  );
});

test('resolveTierIdxs: empty array → 400 (not silent all)', () => {
  assert.throws(
    () => resolveTierIdxs([], 3),
    (err) => err.code === 'bad-tiers'
  );
});

test('resolveTierIdxs: zero tiers → 400', () => {
  assert.throws(
    () => resolveTierIdxs('all', 0),
    (err) => err.code === 'no-tiers'
  );
});

// ── pickKpisForTier ───────────────────────────────────────────

test('pickKpisForTier: active tier reads gm/va/contribution from result', () => {
  const q = makeFixtureQuote();
  const tiers = [{ idx: 0, label: 'MOQ 1', moq: 1000, eau: 10000, sellingPrice: 0.5 }];
  const kpis = pickKpisForTier(q, 0, tiers[0]);
  assert.equal(kpis.gm, 0.3);
  assert.equal(kpis.va, 0.4);
  assert.equal(kpis.sp, 0.5);
});

test('pickKpisForTier: non-active tier returns null GM/VA/CONTR', () => {
  const q = makeFixtureQuote();
  q.state.active_moq_idx = 0;
  const kpis = pickKpisForTier(q, 1, {
    idx: 1,
    label: 'MOQ 2',
    moq: 5000,
    eau: 10000,
    sellingPrice: 0.45,
  });
  assert.equal(kpis.gm, null);
  assert.equal(kpis.va, null);
  assert.equal(kpis.sp, 0.45, 'sp falls back to tier.sellingPrice');
});

test('pickKpisForTier: targetGm defaults to 0.25 when state.target_margin missing', () => {
  const q = makeFixtureQuote();
  delete q.state.target_margin;
  const kpis = pickKpisForTier(q, 0, {
    idx: 0,
    label: 'MOQ 1',
    moq: 1000,
    eau: 10000,
    sellingPrice: 0.5,
  });
  assert.equal(kpis.targetGm, 0.25);
});
