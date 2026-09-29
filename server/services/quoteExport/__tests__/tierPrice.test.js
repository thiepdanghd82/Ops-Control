// @ts-check
/**
 * A tier's selling price reaches the workbook (2026-09-29).
 *
 * The app stores an extra MOQ tier's price as `state.extra_moqs[i].price`
 * (CalcHeader / ComplexCalc, SET_EXTRA_MOQ / SET_CPLX_EXTRA_MOQ). The exporter read
 * `em.selling_price ?? em.sp`, fields the app never writes — measured on live data,
 * all 77 extra-tier prices on 38 quotes sit in `price` and none in `selling_price`.
 * The missing value then became 0 (`Number(null)`), so the RFQ table printed "—"
 * (the cost format hides a zero) and the Cover of a MOQ 2 file printed 0.
 *
 * The older fixtures in multiTier.test.js carry `selling_price` on extra_moqs, the
 * exporter's shape rather than the app's, which is why they stayed green. This file
 * uses the shape the app actually saves.
 */

process.env.OPS_EXPORT_HMAC_KEY = process.env.OPS_EXPORT_HMAC_KEY || 'a'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';
import { enumerateTiers } from '../tierUtils.js';
import { section } from './sections.js';

function makeQuote(extra) {
  return {
    id: 7,
    label: 'TP-1',
    _version: 1,
    state: {
      rfq_number: 'TP-1',
      end_cu: 'Tier Price Test',
      moq: 100000,
      annual_qty: 600000,
      selling_price: 0.0045,
      active_moq_idx: 0,
      target_margin: 0.25,
      sheet_length: 100,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 100,
      part_width: 90,
      part_length_md: 90,
      materials_main: [],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: extra,
    },
    result: {
      sp: 0.0045,
      s_ttl: 0.0036,
      gm: 0.2,
      va: 0.27,
      contribution: 0.25,
      rows: { materials_main: [], materials_alt: [], inks: [], processes: [] },
    },
  };
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

/** The value in column D (Selling price) of the RFQ row labelled `label`. */
function rfqPrice(wb, label) {
  let v;
  section(wb, 'RFQ Information').eachRow((row) => {
    if (row.getCell('A').value === label) v = row.getCell('D').value;
  });
  return v;
}

/** Every numeric cell value on the Cover sheet. */
function coverNumbers(wb) {
  const out = [];
  wb.worksheets[0].eachRow((row) =>
    row.eachCell((c) => {
      if (typeof c.value === 'number') out.push(c.value);
    })
  );
  return out;
}

test('enumerateTiers reads the price the app stores on extra_moqs', () => {
  const tiers = enumerateTiers(makeQuote([{ moq: 200000, eau: 600000, price: 0.00443 }]).state);
  assert.equal(tiers[1].sellingPrice, 0.00443);
});

test('a tier with no price reads null, not 0', () => {
  const tiers = enumerateTiers(makeQuote([{ moq: 200000, eau: 600000 }]).state);
  assert.equal(tiers[1].sellingPrice, null);
  const blank = enumerateTiers(makeQuote([{ moq: 200000, price: '' }]).state);
  assert.equal(blank[1].sellingPrice, null);
});

test('legacy exporter-shaped fixtures still read', () => {
  const tiers = enumerateTiers(makeQuote([{ moq: 1000, selling_price: 0.55 }]).state);
  assert.equal(tiers[1].sellingPrice, 0.55);
});

test('the RFQ table shows the MOQ 2 price', async () => {
  const q = makeQuote([{ moq: 200000, eau: 600000, price: 0.00443 }]);
  const out = await exportQuote(q, { variant: 'internal', lang: 'en', tiers: [0] });
  const wb = await parse(out.buffer);
  assert.equal(rfqPrice(wb, 'MOQ 1'), 0.0045);
  assert.equal(rfqPrice(wb, 'MOQ 2'), 0.00443);
});

test('the Cover of a MOQ 2 file shows that tier price, not 0', async () => {
  const q = makeQuote([{ moq: 200000, eau: 600000, price: 0.00443 }]);
  const out = await exportQuote(q, { variant: 'internal', lang: 'en', tiers: [1] });
  const nums = coverNumbers(await parse(out.buffer));
  assert.ok(nums.includes(0.00443), `Cover numbers: ${nums.join(', ')}`);
  assert.ok(!nums.includes(0), 'no price or margin cell may read 0');
  // A non-active tier has no persisted GM / VA / Contr, so the Cover shows dashes. Before
  // 2026-09-29 `num(null)` read 0, printing GM 0.0%, VA 0.0%, Contr 0.0% and a −25.0%
  // delta to target on every MOQ 2+ file.
  assert.ok(!nums.includes(-0.25), 'no delta computed from a missing GM');
});

test('a tier with no price shows a dash on the Cover, not 0', async () => {
  const q = makeQuote([{ moq: 200000, eau: 600000 }]);
  const out = await exportQuote(q, { variant: 'internal', lang: 'en', tiers: [1] });
  const wb = await parse(out.buffer);
  assert.ok(!coverNumbers(wb).includes(0), 'a missing price must not become 0');
  assert.equal(rfqPrice(wb, 'MOQ 2'), '—');
});
