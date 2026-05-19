// @ts-check
/**
 * Multi-tier ZIP: 3 tiers → 3 xlsx files in a single zip, correct names.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { exportQuote } from '../index.js';

function makeThreeTierQuote() {
  return {
    id: 7,
    label: 'RFQ-3T',
    _version: 4,
    state: {
      rfq_number: 'RFQ-3T',
      end_cu: 'TripleTier Customer',
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
          code: 'M1',
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
      inks: [{ _mid: 'i1', label: 'Ink 1', color: 'White', print_type: 'Indigo' }],
      processes: [],
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
      rows: {
        materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
        materials_alt: [],
        inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
        processes: [],
      },
      tiers: [
        {
          rows: {
            materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
            materials_alt: [],
            inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
            processes: [],
          },
        },
        {
          rows: {
            materials_main: [{ setup_cost: 0.04, run_cost: 0.09, total: 0.13 }],
            materials_alt: [],
            inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
            processes: [],
          },
        },
        {
          rows: {
            materials_main: [{ setup_cost: 0.03, run_cost: 0.08, total: 0.11 }],
            materials_alt: [],
            inks: [{ setup_cost: 0, run_cost: 0, total: 0 }],
            processes: [],
          },
        },
      ],
    },
  };
}

test('multiTier: 3 tiers → zip with 3 xlsx entries', async () => {
  const out = await exportQuote(makeThreeTierQuote(), {
    variant: 'internal',
    lang: 'en',
    tiers: 'all',
    now: new Date('2026-05-18T00:00:00Z'),
  });
  assert.equal(out.kind, 'zip');
  assert.match(out.filename, /\.zip$/);
  assert.match(out.filename, /^Quote_RFQ-3T_TripleTier_Customer_v4_20260518\.zip$/);

  const zip = await JSZip.loadAsync(out.buffer);
  const names = Object.keys(zip.files).filter((n) => zip.files[n] && !zip.files[n].dir);
  assert.equal(names.length, 3, `expected 3 files in zip, got ${names.length}`);
});

test('multiTier: each xlsx in zip has tier-stamped filename', async () => {
  const out = await exportQuote(makeThreeTierQuote(), {
    variant: 'customer',
    lang: 'en',
    now: new Date('2026-05-18T00:00:00Z'),
  });
  const zip = await JSZip.loadAsync(out.buffer);
  const names = Object.keys(zip.files);
  // Alphabetical sort puts MOQ1000 before MOQ500 — check by inclusion
  // rather than positional order.
  assert.ok(
    names.some((n) => /MOQ500_customer/.test(n)),
    'MOQ500 file missing'
  );
  assert.ok(
    names.some((n) => /MOQ1000_customer/.test(n)),
    'MOQ1000 file missing'
  );
  assert.ok(
    names.some((n) => /MOQ5000_customer/.test(n)),
    'MOQ5000 file missing'
  );
  names.forEach((n) => assert.match(n, /^Quote_/));
  names.forEach((n) => assert.match(n, /\.xlsx$/));
});

test('multiTier: explicit tiers=[0,2] returns zip with 2 files in order', async () => {
  const out = await exportQuote(makeThreeTierQuote(), {
    variant: 'internal',
    lang: 'en',
    tiers: [0, 2],
  });
  assert.equal(out.kind, 'zip');
  const zip = await JSZip.loadAsync(out.buffer);
  const names = Object.keys(zip.files);
  assert.equal(names.length, 2);
  assert.ok(names.some((n) => n.includes('MOQ500')));
  assert.ok(names.some((n) => n.includes('MOQ5000')));
  assert.ok(!names.some((n) => n.includes('MOQ1000')), 'tier 1 should be excluded');
});

test('multiTier: explicit single tier → xlsx (not zip)', async () => {
  const out = await exportQuote(makeThreeTierQuote(), {
    variant: 'internal',
    lang: 'en',
    tiers: [0],
  });
  assert.equal(out.kind, 'xlsx');
  assert.match(out.filename, /MOQ500_internal/);
});

test('multiTier: single-tier quote (no extra_moqs) → xlsx not zip', async () => {
  const q = makeThreeTierQuote();
  q.state.extra_moqs = [];
  const out = await exportQuote(q, { variant: 'internal', lang: 'en' });
  assert.equal(out.kind, 'xlsx');
});
