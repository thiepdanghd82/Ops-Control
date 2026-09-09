// @ts-check
/**
 * Server sheet consumers — read quote.result.rows when present, fall back
 * to em-dash for legacy quotes. MES-3-FIX-41.
 */

// MVP-2: ensure HMAC key is set for tests that pre-date MVP-2.
process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote, QuoteExportError } from '../index.js';

function makeQuoteWithRows() {
  return {
    id: 1,
    label: 'ROW-1',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'ROW-1',
      end_cu: 'Row Test',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      active_moq_idx: 0,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 2,
      parts_in_md: 4,
      web_width_td: 300,
      materials_main: [
        {
          _mid: 'm1',
          code: 'M1',
          ifs_code: 'IFS1',
          desc: 'PET',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 4,
          usage: 1,
          latest: 3.5,
        },
        {
          _mid: 'm2',
          code: 'M2',
          ifs_code: 'IFS2',
          desc: 'PE',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 4,
          usage: 1,
          latest: 2.0,
        },
      ],
      materials_alt: [],
      materials_active: 'main',
      inks: [
        {
          _mid: 'i1',
          label: 'Ink 1',
          color: 'White',
          print_type: 'Indigo6800',
          clicks: 8,
          latest: 50,
        },
        { _mid: 'i2', label: 'Ink 2', color: 'Cyan', print_type: 'Flexo', latest: 45 },
      ],
      processes: [
        { _mid: 'p1', process_type: 'Print', workcenter: 'WC1', tool_cost: 200, tool_life: 50000 },
      ],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      gm: 0.3,
      bd_mat_setup: 0.02,
      bd_mat_run: 0.1,
      bd_ink_setup: 0.005,
      bd_ink_run: 0.02,
      bd_setup_mach: 0.003,
      bd_setup_labor: 0.002,
      bd_overhead: 0.005,
      bd_labor: 0.008,
      tooling: 0.003,
      // FIX-41 per-row payload
      rows: {
        materials_main: [
          {
            setup_cost: 0.012,
            run_cost: 0.06,
            total: 0.072,
            qpa_m2: 0.5,
            qpa_lm: 0.3,
            mats_moq_m2: 250,
            mats_moq_lm: 150,
          },
          { setup_cost: 0.008, run_cost: 0.04, total: 0.048 },
        ],
        materials_alt: [],
        inks: [
          { setup_cost: 0.003, run_cost: 0.012, total: 0.015, clicks: 8 },
          { setup_cost: 0.002, run_cost: 0.008, total: 0.01 },
        ],
        processes: [
          {
            setup_cost: 0.005,
            run_cost: 0.016,
            total: 0.021,
            setup_mach: 0.002,
            setup_labor: 0.003,
            run_mach: 0.01,
            run_labor: 0.006,
            tooling: 0.003,
            uph: 5000,
            manual_uph: 0,
            total_time: 12,
            crew: 2,
            speed_uom: 'm/min',
          },
        ],
      },
      tiers: [
        {
          rows: {
            materials_main: [
              {
                setup_cost: 0.012,
                run_cost: 0.06,
                total: 0.072,
                qpa_m2: 0.5,
                qpa_lm: 0.3,
                mats_moq_m2: 250,
                mats_moq_lm: 150,
                pitch: 3.175,
                width: 320,
                cavities: 8,
              },
              { setup_cost: 0.008, run_cost: 0.04, total: 0.048 },
            ],
            materials_alt: [],
            inks: [
              { setup_cost: 0.003, run_cost: 0.012, total: 0.015, clicks: 8 },
              { setup_cost: 0.002, run_cost: 0.008, total: 0.01 },
            ],
            processes: [
              {
                setup_cost: 0.005,
                run_cost: 0.016,
                total: 0.021,
                setup_mach: 0.002,
                setup_labor: 0.003,
                run_mach: 0.01,
                run_labor: 0.006,
                tooling: 0.003,
                uph: 5000,
                manual_uph: 0,
                total_time: 12,
                crew: 2,
                speed_uom: 'm/min',
              },
            ],
          },
        },
      ],
    },
  };
}

function makeLegacyQuote() {
  // Pre-FIX-41 quote — result has aggregates but no `rows`.
  const q = makeQuoteWithRows();
  delete q.result.rows;
  delete q.result.tiers;
  return q;
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('rows: 03-materials renders real setup_cost from result.rows', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // Header at row 4; first data row 5. Full-parity order pushed the money
  // columns right: Setup Cost = T (20), Run Cost = U (21), Total = V (22).
  const setup1 = mat.getCell('T5').value;
  const run1 = mat.getCell('U5').value;
  const total1 = mat.getCell('V5').value;
  assert.equal(setup1, 0.012);
  assert.equal(run1, 0.06);
  assert.equal(total1, 0.072);
});

test('rows: 03-materials renders second material row from result.rows[1]', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  const setup2 = mat.getCell('T6').value;
  assert.equal(setup2, 0.008);
});

test('rows: 03-materials renders QPA + Mats/MOQ derived columns from result.rows', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // First data row 5: QPA m² = O (15), QPA lm = P (16), Mats/MOQ m² = Q (17),
  // Mats/MOQ lm = R (18).
  assert.equal(mat.getCell('O5').value, 0.5);
  assert.equal(mat.getCell('P5').value, 0.3);
  assert.equal(mat.getCell('Q5').value, 250);
  assert.equal(mat.getCell('R5').value, 150);
});

test('rows: 03-materials renders effective Pitch/Width/Cav from result.rows (not raw 0)', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // Pitch = G (7), Width = H (8), Cav = I (9). Persisted effective values.
  assert.equal(mat.getCell('G5').value, 3.175);
  assert.equal(mat.getCell('H5').value, 320);
  assert.equal(mat.getCell('I5').value, 8);
});

test('rows: 05-processes renders UOM from persisted speed_uom (rateLookup not wired)', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const proc = wb.getWorksheet('05 Processes');
  // UOM = col F (6).
  assert.equal(proc.getCell('F4').value, 'm/min');
});

test('rows: 06-balancing renders MOQ/EAU run time + bottleneck from persisted total_time', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const bal = wb.getWorksheet('06 Balancing');
  // MOQ 1000, EAU 10000. Header row 6; first WC data row 7. total_time 12 min
  // → MOQ run time 0.2h; EAU run time 0.2 × (10000/1000) = 2h; shifts 2/8=0.25.
  assert.equal(bal.getCell('E7').value, 0.2); // MOQ run time
  assert.equal(bal.getCell('F7').value, 2); // EAU run time
  assert.equal(bal.getCell('G7').value, 0.25); // # shifts
  assert.equal(bal.getCell('H7').value, '◄ BN'); // sole process → bottleneck
});

test('rows: 04-inks renders setup_cost + clicks for Indigo row', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const inks = wb.getWorksheet('04 Inks');
  // First ink data row 4 (header row 3). scrap_pct inserted after clicks
  // pushes setup_cost to col O (15); clicks stays col K (11).
  const setup = inks.getCell('O4').value;
  const clicks = inks.getCell('K4').value;
  assert.equal(setup, 0.003);
  assert.equal(clicks, 8);
});

test('rows: 04-inks non-Indigo row shows clicks from ink.clicks state (legacy fallback)', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const inks = wb.getWorksheet('04 Inks');
  // Second ink is Flexo — rowCost has no `clicks` field; falls back to
  // ink.clicks (undefined in our fixture → em-dash).
  const clicks = inks.getCell('K5').value;
  assert.equal(clicks, '—');
});

test('rows: 05-processes renders setup + run + total from result.rows', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const proc = wb.getWorksheet('05 Processes');
  // First data row 4 (header row 3). Full-parity columns (app order):
  //   D crew · K MC UPH · P Prod Time(h) · Q S.Mach · R S.Labor · S R.Mach
  //   · T R.Labor · U Tooling.
  assert.equal(proc.getCell('D4').value, 2); // crew
  assert.equal(proc.getCell('K4').value, 5000); // MC UPH (uph)
  assert.equal(proc.getCell('P4').value, 0.2); // Prod time = total_time 12 / 60
  assert.equal(proc.getCell('Q4').value, 0.002); // setup_mach
  assert.equal(proc.getCell('R4').value, 0.003); // setup_labor
  assert.equal(proc.getCell('S4').value, 0.01); // run_mach
  assert.equal(proc.getCell('T4').value, 0.006); // run_labor
  assert.equal(proc.getCell('U4').value, 0.003); // tooling
});

test('rows: legacy quote (no result.rows) → 422 legacy_no_rows', async () => {
  await assert.rejects(
    () => exportQuote(makeLegacyQuote(), { variant: 'internal', lang: 'en' }),
    (err) => {
      assert.ok(err instanceof QuoteExportError);
      assert.equal(err.code, 'legacy_no_rows');
      assert.equal(err.status, 422);
      return true;
    }
  );
});

test('rows: quote with no result entirely → 422 no-snapshot (not legacy_no_rows)', async () => {
  const q = makeLegacyQuote();
  delete q.result;
  await assert.rejects(
    () => exportQuote(q, { variant: 'internal', lang: 'en' }),
    (err) => {
      assert.ok(err instanceof QuoteExportError);
      assert.equal(err.code, 'no-snapshot');
      return true;
    }
  );
});

test('rows: complex quote with result.subproducts present passes the legacy gate', async () => {
  const q = {
    id: 2,
    label: 'CPX-1',
    _version: 1,
    type: 'complex',
    state: {
      rfq_number: 'CPX-1',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 1,
      active_moq_idx: 0,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 100,
      target_margin: 0.25,
      subproducts: [
        {
          code: 'SP1',
          materials_main: [],
          materials_alt: [],
          materials_active: 'main',
          inks: [],
          processes: [],
        },
      ],
      extra_moqs: [],
    },
    result: {
      sp: 1,
      s_ttl: 0.5,
      gm: 0.5,
      bd_mat_setup: 0,
      bd_mat_run: 0,
      subproducts: [
        { rows: { materials_main: [], materials_alt: [], inks: [], processes: [] }, tiers: [] },
      ],
    },
  };
  // Should NOT throw legacy_no_rows
  const out = await exportQuote(q, { variant: 'internal', lang: 'en' });
  assert.equal(out.kind, 'xlsx');
});

// Regression: subtotal row from MVP-1 fix still works alongside per-row.
test('rows: aggregate subtotal row coexists with per-row data', async () => {
  const out = await exportQuote(makeQuoteWithRows(), { variant: 'internal', lang: 'en' });
  const wb = await parse(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  // Find the Subtotal row label
  let subtotalRow = null;
  for (let r = 1; r <= 30; r++) {
    const a = mat.getCell(`A${r}`).value;
    if (typeof a === 'string' && /Subtotal/.test(a)) {
      subtotalRow = r;
      break;
    }
  }
  assert.ok(subtotalRow, 'Subtotal row should still be present');
  assert.equal(mat.getCell(`T${subtotalRow}`).value, 0.02);
  assert.equal(mat.getCell(`U${subtotalRow}`).value, 0.1);
});
