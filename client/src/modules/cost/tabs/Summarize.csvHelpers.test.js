/**
 * Summarize CSV cell-formatter unit tests.
 *
 * RED-first contract for MES-3-FIX-60 (2026-06-19): CSV export was
 * emitting raw float values (`0.13627072986281700`) and raw fractions
 * (`0.241034350685914`) instead of the UI-formatted display values
 * (`0.13627` / `24.1%`). These tests pin the fixed read order so the
 * same drift can't re-introduce silently.
 *
 *   node --test src/modules/cost/tabs/Summarize.csvHelpers.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatCsvCell, formatCsvRows } from './Summarize.csvHelpers.js';
import { fmtN, pct } from '../../../utils/format.js';
import { fmtUsd, fmtVnd } from './StandardCalc/CalcLeadTimeNotice.helpers.js';

describe('formatCsvCell', () => {
  test('applies fmt when colDef.fmt is a function — pct (VA% / Contr% / GM%)', () => {
    assert.equal(formatCsvCell(0.241, { fmt: (v) => pct(v) }), '24.1%');
    assert.equal(formatCsvCell(0.218712849840498, { fmt: (v) => pct(v) }), '21.9%');
    assert.equal(formatCsvCell(-0.685882400405173, { fmt: (v) => pct(v) }), '-68.6%');
  });

  test('applies fmt when colDef.fmt is a function — fmtN (Material / Overhead / Labor / Pack&Ship)', () => {
    // fmtN(v, d=5) → toFixed(5). Literals kept short of JS precision
    // boundary (no trailing zeros past 15 sig digits) per ESLint
    // no-loss-of-precision; the bug reproduces with shorter literals
    // since the issue was toFixed-vs-raw, not precision loss.
    assert.equal(formatCsvCell(0.136270729862817, { fmt: (v) => fmtN(v) }), '0.13627');
    assert.equal(formatCsvCell(0.00446430016908329, { fmt: (v) => fmtN(v) }), '0.00446');
    assert.equal(formatCsvCell(0.02008, { fmt: (v) => fmtN(v) }), '0.02008');
  });

  test('applies fmt when colDef.fmt is a function — fmtN with explicit precision (Target / USD price)', () => {
    // SUMMARIZE_COLUMNS for target/usd_price uses fmt: (v) => fmtN(v, 4)
    assert.equal(formatCsvCell(0.2883, { fmt: (v) => fmtN(v, 4) }), '0.2883');
    assert.equal(formatCsvCell(2.8, { fmt: (v) => fmtN(v, 4) }), '2.8000');
  });

  test('applies fmt when colDef.fmt is a function — fmtVnd (Price VND)', () => {
    // fmtVnd → en-US thousand-separators, no decimals; '—' for 0/NaN
    assert.equal(formatCsvCell(10450, { fmt: (v) => fmtVnd(v) }), '10,450');
    assert.equal(formatCsvCell(7562, { fmt: (v) => fmtVnd(v) }), '7,562');
    assert.equal(formatCsvCell(0, { fmt: (v) => fmtVnd(v) }), '—');
  });

  test('applies fmt when colDef.fmt is a function — fmtUsd (Tooling Cost USD)', () => {
    // fmtUsd → '$' prefix + thousand-separators; '—' for 0/NaN
    assert.equal(formatCsvCell(95, { fmt: (v) => fmtUsd(v) }), '$95.00');
    assert.equal(formatCsvCell(1182, { fmt: (v) => fmtUsd(v) }), '$1,182.00');
    assert.equal(formatCsvCell(0, { fmt: (v) => fmtUsd(v) }), '—');
  });

  test('fmt collapses null / undefined / 0 / NaN to em-dash per format.js contract', () => {
    assert.equal(formatCsvCell(null, { fmt: (v) => pct(v) }), '—');
    assert.equal(formatCsvCell(undefined, { fmt: (v) => pct(v) }), '—');
    assert.equal(formatCsvCell(NaN, { fmt: (v) => fmtN(v) }), '—');
    assert.equal(formatCsvCell(0, { fmt: (v) => fmtN(v) }), '—');
  });

  test('returns value unchanged when colDef is undefined (audit-prefix slot has no entry)', () => {
    assert.equal(formatCsvCell('2026-06-10T13:54:34.845Z', undefined), '2026-06-10T13:54:34.845Z');
    assert.equal(formatCsvCell('standard', undefined), 'standard');
    assert.equal(formatCsvCell('Henry', undefined), 'Henry');
  });

  test("returns value unchanged when colDef has render but no fmt — render is NOT invoked (JSX can't serialize to CSV)", () => {
    // update_date has render: (r) => <DateCell ... /> but no fmt → emit
    // raw ISO. drw_materials has render: (r) => <MultilineCell ... />
    // but no fmt → emit raw bullet string (row builder pre-formats).
    const renderOnlyCol = { render: () => '<this should NOT appear in CSV>' };
    assert.equal(
      formatCsvCell('2026-06-10T13:54:34.845Z', renderOnlyCol),
      '2026-06-10T13:54:34.845Z'
    );
    assert.equal(
      formatCsvCell('- 3M Tape\n- transparent Protector\n- Paper Liner', renderOnlyCol),
      '- 3M Tape\n- transparent Protector\n- Paper Liner'
    );
  });

  test('returns value unchanged when colDef has neither fmt nor render (plain text cols)', () => {
    // rfq_no, direct_cu, project, project_name, end_cu_pn, description,
    // production_size, trade_mode, npi_owner — all plain-text cols.
    assert.equal(formatCsvCell('Q28', { label: 'RFQ NO' }), 'Q28');
    assert.equal(formatCsvCell('USD(Normal)', { label: 'Trade' }), 'USD(Normal)');
  });
});

describe('formatCsvRows', () => {
  test('transforms every row × every col through formatCsvCell — full Summarize-shaped fixture', () => {
    const colByKey = new Map([
      ['update_date', { label: 'DATE' }], // render-only, no fmt → raw
      ['rfq_no', { label: 'RFQ NO' }], // plain text → raw
      ['sale_owner', undefined], // audit-prefix slot, no entry → raw
      ['s_mat_cost', { label: 'Material', fmt: (v) => fmtN(v) }],
      ['vnd_price', { label: 'Price (VND)', fmt: (v) => fmtVnd(v) }],
      ['va_pct', { label: 'VA%', fmt: (v) => pct(v) }],
      ['contr_pct', { label: 'Contr. %', fmt: (v) => pct(v) }],
      ['gm_pct', { label: 'GM%', fmt: (v) => pct(v) }],
    ]);
    const cols = [
      'update_date',
      'rfq_no',
      'sale_owner',
      's_mat_cost',
      'vnd_price',
      'va_pct',
      'contr_pct',
      'gm_pct',
    ];
    const rows = [
      {
        update_date: '2026-06-10T13:54:34.845Z',
        rfq_no: 'Q28',
        sale_owner: 'Yen',
        s_mat_cost: 0.32173984873294,
        vnd_price: 10450,
        va_pct: 0.135394734884959,
        contr_pct: -0.136716343172126,
        gm_pct: -0.685882400405173,
      },
      {
        update_date: '2026-03-10T13:48:50.463Z',
        rfq_no: 'Q43',
        sale_owner: '',
        s_mat_cost: 0.136270729862817,
        vnd_price: 0,
        va_pct: 0.241034350685914,
        contr_pct: 0.218712849840498,
        gm_pct: 0.218682049840498,
      },
    ];
    const out = formatCsvRows(rows, cols, colByKey);
    assert.deepEqual(out, [
      {
        update_date: '2026-06-10T13:54:34.845Z',
        rfq_no: 'Q28',
        sale_owner: 'Yen',
        s_mat_cost: '0.32174',
        vnd_price: '10,450',
        va_pct: '13.5%',
        contr_pct: '-13.7%',
        gm_pct: '-68.6%',
      },
      {
        update_date: '2026-03-10T13:48:50.463Z',
        rfq_no: 'Q43',
        sale_owner: '',
        s_mat_cost: '0.13627',
        vnd_price: '—',
        va_pct: '24.1%',
        contr_pct: '21.9%',
        gm_pct: '21.9%',
      },
    ]);
  });

  test('preserves cols order in output objects (key order matches cols array)', () => {
    const colByKey = new Map([
      ['a', { fmt: (v) => `A:${v}` }],
      ['b', { fmt: (v) => `B:${v}` }],
    ]);
    const out = formatCsvRows([{ a: 1, b: 2 }], ['b', 'a'], colByKey);
    assert.deepEqual(Object.keys(out[0]), ['b', 'a']);
  });

  test('row with missing key — formatCsvCell receives undefined; fmt collapses to em-dash', () => {
    const colByKey = new Map([['va_pct', { fmt: (v) => pct(v) }]]);
    const out = formatCsvRows([{}], ['va_pct'], colByKey);
    assert.equal(out[0].va_pct, '—');
  });
});
