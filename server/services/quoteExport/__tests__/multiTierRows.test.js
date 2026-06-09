// @ts-check
/**
 * Multi-tier ROW DIFFERENTIATION — the P0 bug surfaced 2026-05-20.
 *
 * Before the fix, every xlsx inside a multi-tier zip carried the
 * SAME Materials/Inks/Processes/Cost-Breakdown numbers because the
 * sheet builders read `result.rows.<section>` (active-tier mirror)
 * regardless of which tier the filename advertised. This suite cracks
 * each xlsx in the zip open and asserts the per-row totals genuinely
 * differ between tiers.
 *
 * Also covers:
 *   - Cpx subproducts: per-SP per-tier rows render correctly per tier
 *   - [active-tier] footnote: rendered on non-active tier xlsx files
 *     for sheets 05 + 08, omitted on the active tier file
 */

process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { exportQuote } from '../index.js';

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

async function unzipAll(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const out = {};
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  for (const name of names) {
    const buf = await zip.files[name].async('nodebuffer');
    out[name] = await parseXlsx(buf);
  }
  return out;
}

// Std quote with 3 tiers — each tier has DISTINCT setup/run values per
// row so we can verify the right tier landed in the right xlsx.
function makeStdMultiTier() {
  return {
    id: 100,
    label: 'RFQ-MT',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'RFQ-MT',
      end_cu: 'MultiTier Test',
      moq: 500,
      annual_qty: 10000,
      selling_price: 0.6,
      active_moq_idx: 0,
      target_margin: 0.3,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 2,
      parts_in_md: 4,
      web_width_td: 300,
      materials_main: [
        {
          _mid: 'm1',
          ifs_code: 'IFS1',
          desc: 'PET',
          row_type: 'Main.Mat',
          width: 200,
          cavities: 4,
          usage: 1,
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
          print_type: 'Indigo6800',
          clicks: 8,
          latest: 50,
        },
      ],
      processes: [{ _mid: 'p1', process_type: 'Print', workcenter: 'WC1' }],
      extra_moqs: [
        { moq: 1000, selling_price: 0.55, eau: 10000 },
        { moq: 5000, selling_price: 0.5, eau: 10000 },
      ],
    },
    result: {
      sp: 0.6,
      s_ttl: 0.35,
      gm: 0.3,
      va: 0.4,
      contribution: 0.35,
      bd_mat_setup: 0.05,
      bd_mat_run: 0.1,
      bd_ink_setup: 0.003,
      bd_ink_run: 0.012,
      bd_setup_mach: 0.004,
      bd_setup_labor: 0.002,
      bd_overhead: 0.02,
      bd_labor: 0.018,
      tooling: 0.005,
      // Active-tier mirror (tier 0)
      rows: {
        materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
        materials_alt: [],
        inks: [{ setup_cost: 0.003, run_cost: 0.012, total: 0.015, clicks: 8 }],
        processes: [{ setup_cost: 0.006, run_cost: 0.038, total: 0.044 }],
      },
      tiers: [
        // Tier 0 — active. Match the mirror exactly.
        {
          rows: {
            materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
            materials_alt: [],
            inks: [{ setup_cost: 0.003, run_cost: 0.012, total: 0.015, clicks: 8 }],
            processes: [{ setup_cost: 0.006, run_cost: 0.038, total: 0.044 }],
          },
        },
        // Tier 1 — DIFFERENT numbers.
        {
          rows: {
            materials_main: [{ setup_cost: 0.025, run_cost: 0.08, total: 0.105 }],
            materials_alt: [],
            inks: [{ setup_cost: 0.0015, run_cost: 0.01, total: 0.0115, clicks: 8 }],
            processes: [{ setup_cost: 0.003, run_cost: 0.03, total: 0.033 }],
          },
        },
        // Tier 2 — different again.
        {
          rows: {
            materials_main: [{ setup_cost: 0.005, run_cost: 0.06, total: 0.065 }],
            materials_alt: [],
            inks: [{ setup_cost: 0.0003, run_cost: 0.008, total: 0.0083, clicks: 8 }],
            processes: [{ setup_cost: 0.0006, run_cost: 0.024, total: 0.0246 }],
          },
        },
      ],
    },
  };
}

// Cpx quote with 2 subproducts × 3 tiers.
function makeCpxMultiTier() {
  return {
    id: 101,
    label: 'CPX-MT',
    _version: 1,
    type: 'complex',
    state: {
      rfq_number: 'CPX-MT',
      end_cu: 'Cpx MultiTier',
      moq: 1000,
      annual_qty: 12000,
      selling_price: 1.2,
      active_moq_idx: 0,
      target_margin: 0.3,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 200,
      subproducts: [
        {
          code: 'SP1',
          materials_main: [
            { _mid: 'spm1', ifs_code: 'IFSP1', desc: 'PETp1', row_type: 'Main.Mat', latest: 3 },
          ],
          materials_alt: [],
          materials_active: 'main',
          inks: [{ _mid: 'spi1', label: 'Ink A', color: 'Cyan', print_type: 'Flexo' }],
          processes: [{ _mid: 'spp1', process_type: 'Print', workcenter: 'WC1' }],
        },
        {
          code: 'SP2',
          materials_main: [
            { _mid: 'spm2', ifs_code: 'IFSP2', desc: 'PETp2', row_type: 'Main.Mat', latest: 2 },
          ],
          materials_alt: [],
          materials_active: 'main',
          inks: [],
          processes: [],
        },
      ],
      extra_moqs: [
        { moq: 3000, selling_price: 1.1, eau: 12000 },
        { moq: 8000, selling_price: 1.0, eau: 12000 },
      ],
    },
    result: {
      sp: 1.2,
      s_ttl: 0.7,
      gm: 0.4,
      bd_mat_setup: 0.1,
      bd_mat_run: 0.2,
      subproducts: [
        {
          rows: {
            materials_main: [{ setup_cost: 0.06, run_cost: 0.12, total: 0.18 }],
            materials_alt: [],
            inks: [{ setup_cost: 0.005, run_cost: 0.02, total: 0.025 }],
            processes: [{ setup_cost: 0.01, run_cost: 0.04, total: 0.05 }],
          },
          tiers: [
            {
              rows: {
                materials_main: [{ setup_cost: 0.06, run_cost: 0.12, total: 0.18 }],
                materials_alt: [],
                inks: [{ setup_cost: 0.005, run_cost: 0.02, total: 0.025 }],
                processes: [{ setup_cost: 0.01, run_cost: 0.04, total: 0.05 }],
              },
            },
            {
              rows: {
                materials_main: [{ setup_cost: 0.03, run_cost: 0.1, total: 0.13 }],
                materials_alt: [],
                inks: [{ setup_cost: 0.003, run_cost: 0.015, total: 0.018 }],
                processes: [{ setup_cost: 0.005, run_cost: 0.03, total: 0.035 }],
              },
            },
            {
              rows: {
                materials_main: [{ setup_cost: 0.012, run_cost: 0.085, total: 0.097 }],
                materials_alt: [],
                inks: [{ setup_cost: 0.001, run_cost: 0.012, total: 0.013 }],
                processes: [{ setup_cost: 0.002, run_cost: 0.024, total: 0.026 }],
              },
            },
          ],
        },
        {
          rows: {
            materials_main: [{ setup_cost: 0.04, run_cost: 0.08, total: 0.12 }],
            materials_alt: [],
            inks: [],
            processes: [],
          },
          tiers: [
            {
              rows: {
                materials_main: [{ setup_cost: 0.04, run_cost: 0.08, total: 0.12 }],
                materials_alt: [],
                inks: [],
                processes: [],
              },
            },
            {
              rows: {
                materials_main: [{ setup_cost: 0.022, run_cost: 0.064, total: 0.086 }],
                materials_alt: [],
                inks: [],
                processes: [],
              },
            },
            {
              rows: {
                materials_main: [{ setup_cost: 0.009, run_cost: 0.05, total: 0.059 }],
                materials_alt: [],
                inks: [],
                processes: [],
              },
            },
          ],
        },
      ],
    },
  };
}

// Helpers — find Materials row 5 (first data row after section banner +
// header) Setup Cost cell (col O=15 after drw_material column insertion
// shifted it +1). For Cpx the section banner adds one extra row per SP
// so the first data row drifts; the helpers below scan defensively.
function readFirstMaterialSetupCost(sheet) {
  // Walk rows 3..30 looking for the first row where col O is a number.
  for (let r = 3; r <= 30; r++) {
    const v = sheet.getCell(r, 15).value;
    if (typeof v === 'number') return v;
  }
  return null;
}

function readFirstInkSetupCost(sheet) {
  // Inks header is row 3; data starts row 4 (Std) or 5 (Cpx — extra
  // section banner). Walk defensively from row 4.
  for (let r = 4; r <= 30; r++) {
    const v = sheet.getCell(r, 14).value;
    if (typeof v === 'number') return v;
  }
  return null;
}

function findSubtotalRow(sheet, label = 'Subtotal') {
  for (let r = 1; r <= 60; r++) {
    const a = sheet.getCell(`A${r}`).value;
    if (typeof a === 'string' && a.includes(label)) return r;
  }
  return null;
}

function pickXlsxByMoq(zipMap, moqStr) {
  const entry = Object.entries(zipMap).find(([name]) => name.includes(`MOQ${moqStr}_`));
  if (!entry)
    throw new Error(
      `Could not find MOQ${moqStr} xlsx in zip — names: ${Object.keys(zipMap).join(', ')}`
    );
  return entry[1];
}

// Std differential — Materials Setup Cost
test('multi-tier Std: Materials Setup Cost differs per tier xlsx', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
    now: new Date('2026-05-20T00:00:00Z'),
  });
  assert.equal(out.kind, 'zip');
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '500');
  const t1 = pickXlsxByMoq(zip, '1000');
  const t2 = pickXlsxByMoq(zip, '5000');

  const m0 = readFirstMaterialSetupCost(t0.getWorksheet('03 Materials'));
  const m1 = readFirstMaterialSetupCost(t1.getWorksheet('03 Materials'));
  const m2 = readFirstMaterialSetupCost(t2.getWorksheet('03 Materials'));

  assert.equal(m0, 0.05, 'tier 0 (MOQ500, active) Materials setup mismatch');
  assert.equal(m1, 0.025, 'tier 1 (MOQ1000) Materials setup mismatch');
  assert.equal(m2, 0.005, 'tier 2 (MOQ5000) Materials setup mismatch');
  assert.notEqual(m0, m1, 'P0 bug regression — tier 0 and tier 1 should differ');
  assert.notEqual(m1, m2, 'P0 bug regression — tier 1 and tier 2 should differ');
});

// Std differential — Inks Setup Cost
test('multi-tier Std: Inks Setup Cost differs per tier xlsx', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '500');
  const t2 = pickXlsxByMoq(zip, '5000');
  const i0 = readFirstInkSetupCost(t0.getWorksheet('04 Inks'));
  const i2 = readFirstInkSetupCost(t2.getWorksheet('04 Inks'));
  assert.equal(i0, 0.003);
  assert.equal(i2, 0.0003);
  assert.notEqual(i0, i2);
});

// Std differential — Processes
test('multi-tier Std: Processes Setup Cost differs per tier xlsx', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '500');
  const t1 = pickXlsxByMoq(zip, '1000');
  // Processes Setup Cost = col 17 (Q). Header row 3; data row 4 (Std).
  const p0 = t0.getWorksheet('05 Processes').getCell(4, 17).value;
  const p1 = t1.getWorksheet('05 Processes').getCell(4, 17).value;
  assert.equal(p0, 0.006);
  assert.equal(p1, 0.003);
});

// Subtotal differential — non-active tier derives from rows, not bd_*
test('multi-tier Std: Materials Subtotal derived from per-tier rows', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t1 = pickXlsxByMoq(zip, '1000');
  const matT1 = t1.getWorksheet('03 Materials');
  const subRow = findSubtotalRow(matT1);
  assert.ok(subRow, 'Subtotal row missing on tier 1 Materials');
  // Tier 1 has setup_cost=0.025, run_cost=0.08
  assert.equal(matT1.getCell(subRow, 15).value, 0.025);
  assert.equal(matT1.getCell(subRow, 16).value, 0.08);
});

// Active-tier subtotal still uses bd_* (rounding-free aggregate)
test('multi-tier Std: active-tier Materials Subtotal uses bd_mat_* (not row sum)', async () => {
  // Build a quote where row sum ≠ bd_* to prove the active path keeps
  // using bd_*. Active idx = 0; bd_mat_setup = 0.05, but rows[0] setup
  // is also 0.05 in our fixture. Tweak rows[0] to verify.
  const q = makeStdMultiTier();
  q.result.rows.materials_main[0].setup_cost = 0.999; // bogus
  q.result.tiers[0].rows.materials_main[0].setup_cost = 0.999;
  const out = await exportQuote(q, {
    variant: 'internal',
    lang: 'en',
    tiers: [0],
  });
  assert.equal(out.kind, 'xlsx');
  const wb = await parseXlsx(out.buffer);
  const mat = wb.getWorksheet('03 Materials');
  const subRow = findSubtotalRow(mat);
  // Active tier subtotal must still be bd_mat_setup = 0.05, not 0.999
  assert.equal(mat.getCell(subRow, 15).value, 0.05);
});

// Cpx differential
test('multi-tier Cpx: per-SP per-tier Materials cells differ', async () => {
  const out = await exportQuote(makeCpxMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  assert.equal(out.kind, 'zip');
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '1000');
  const t1 = pickXlsxByMoq(zip, '3000');
  const t2 = pickXlsxByMoq(zip, '8000');

  // SP1 Materials first data row Setup Cost (col N=14). With Cpx the
  // section banner adds an extra row, so first data row is row 5.
  const matT0 = t0.getWorksheet('03 Materials');
  const matT1 = t1.getWorksheet('03 Materials');
  const matT2 = t2.getWorksheet('03 Materials');

  // Read first numeric in col N across rows — should be SP1's first
  // material setup cost.
  const sp1_t0 = readFirstMaterialSetupCost(matT0);
  const sp1_t1 = readFirstMaterialSetupCost(matT1);
  const sp1_t2 = readFirstMaterialSetupCost(matT2);
  assert.equal(sp1_t0, 0.06, 'Cpx tier 0 SP1 Materials setup mismatch');
  assert.equal(sp1_t1, 0.03, 'Cpx tier 1 SP1 Materials setup mismatch');
  assert.equal(sp1_t2, 0.012, 'Cpx tier 2 SP1 Materials setup mismatch');
});

// [active-tier] footnote on non-active tier sheet 05
test('multi-tier: 05-Processes shows [active-tier] footnote on NON-active tier xlsx', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '500'); // active
  const t1 = pickXlsxByMoq(zip, '1000'); // non-active

  const procT0 = t0.getWorksheet('05 Processes');
  const procT1 = t1.getWorksheet('05 Processes');

  // Search for "[active-tier]" across all cells in col A.
  function hasFootnote(sheet) {
    for (let r = 1; r <= 80; r++) {
      const v = sheet.getCell(`A${r}`).value;
      if (typeof v === 'string' && v.includes('[active-tier]')) return true;
    }
    return false;
  }
  assert.equal(hasFootnote(procT0), false, 'active tier should NOT show footnote');
  assert.equal(hasFootnote(procT1), true, 'non-active tier MUST show footnote');
});

// [active-tier] footnote on 08-Cost-Breakdown
test('multi-tier: 08-CostBreakdown shows [active-tier] footnote on NON-active tier xlsx', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t1 = pickXlsxByMoq(zip, '1000');
  const cbT1 = t1.getWorksheet('08 Cost Breakdown');
  let found = false;
  for (let r = 1; r <= 80; r++) {
    const v = cbT1.getCell(`A${r}`).value;
    if (typeof v === 'string' && v.includes('[active-tier]')) {
      found = true;
      // Verify the MOQ substitution actually happened
      assert.ok(v.includes('MOQ 500'), 'active MOQ substitution missing');
      assert.ok(v.includes('MOQ 1,000'), 'this-tier MOQ substitution missing');
      break;
    }
  }
  assert.ok(found, 'CostBreakdown footnote should be present on non-active tier');
});

// Bilingual footnote contains both EN + VN markers
test('multi-tier: [active-tier] footnote bilingual variant carries EN + VN', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'bilingual',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t1 = pickXlsxByMoq(zip, '1000');
  const cbT1 = t1.getWorksheet('08 Cost Breakdown');
  let combined = '';
  for (let r = 1; r <= 80; r++) {
    const v = cbT1.getCell(`A${r}`).value;
    if (typeof v === 'string' && (v.includes('[active-tier]') || v.includes('[tier-hoạt-động]'))) {
      combined = v;
      break;
    }
  }
  assert.ok(combined.includes('[active-tier]'), 'EN marker missing in bilingual footnote');
  assert.ok(combined.includes('[tier-hoạt-động]'), 'VN marker missing in bilingual footnote');
});

// VN-only variant
test('multi-tier: [active-tier] footnote VN-only variant uses Vietnamese only', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'vi',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t1 = pickXlsxByMoq(zip, '1000');
  const cbT1 = t1.getWorksheet('08 Cost Breakdown');
  let footnote = '';
  for (let r = 1; r <= 80; r++) {
    const v = cbT1.getCell(`A${r}`).value;
    if (typeof v === 'string' && v.includes('[tier-hoạt-động]')) {
      footnote = v;
      break;
    }
  }
  assert.ok(footnote.length > 0, 'VN footnote missing');
  assert.ok(!footnote.includes('[active-tier]'), 'EN marker should NOT appear in VN-only export');
});

// Cost Breakdown rows reflect per-tier mat+ink (internal variant)
test('multi-tier: Cost Breakdown material_setup row reflects per-tier value', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t1 = pickXlsxByMoq(zip, '1000'); // non-active
  const cbT1 = t1.getWorksheet('08 Cost Breakdown');
  // Find the "Material — Setup" row label.
  let matSetupRow = null;
  for (let r = 1; r <= 30; r++) {
    const v = cbT1.getCell(`A${r}`).value;
    if (typeof v === 'string' && v.includes('Material — Setup')) {
      matSetupRow = r;
      break;
    }
  }
  assert.ok(matSetupRow, 'Material — Setup row missing in Cost Breakdown');
  // Tier 1 materials_main[0].setup_cost = 0.025
  assert.equal(cbT1.getCell(`B${matSetupRow}`).value, 0.025);
});

// Active-tier file has NO footnote on either sheet
test('multi-tier: active-tier xlsx has NO [active-tier] footnote anywhere', async () => {
  const out = await exportQuote(makeStdMultiTier(), {
    variant: 'internal',
    lang: 'bilingual',
    tiers: 'all',
  });
  const zip = await unzipAll(out.buffer);
  const t0 = pickXlsxByMoq(zip, '500'); // active
  for (const sheetName of ['05 Processes', '08 Cost Breakdown']) {
    const sheet = t0.getWorksheet(sheetName);
    for (let r = 1; r <= 80; r++) {
      const v = sheet.getCell(`A${r}`).value;
      if (typeof v === 'string') {
        assert.ok(!v.includes('[active-tier]'), `${sheetName} row ${r} unexpected EN footnote`);
        assert.ok(!v.includes('[tier-hoạt-động]'), `${sheetName} row ${r} unexpected VN footnote`);
      }
    }
  }
});
