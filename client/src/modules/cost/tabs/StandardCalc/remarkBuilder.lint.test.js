/**
 * What the REMARK field SHOWS and what it SAVES must be built by the same
 * function.
 *
 * They were not. The shared Lead time & Notice component renders
 * `buildRemarkBlock(rows, selection, product_tolerance)` — the "1. Clear
 * materials MOQ." header, one bullet per checked row, and the
 * "2. Product tolerance: +/- <n>mm" footer. Both save paths called
 * `buildRemarkFromSelection`, which is only the middle third: bullets, no
 * header, no tolerance.
 *
 * So the operator saw the full block on screen while the quote persisted a
 * fragment, and every downstream reader — Cost Breakdown, its CSV, the xlsx
 * — showed the fragment. Measured on the live library when this was found:
 * of the 37 saved quotes carrying a remark, **37 were missing both lines and
 * 0 were complete**, e.g. quote 197 (RFQ-2026-S0050) held `- BW-7513: —`
 * with product_tolerance 0.2 sitting right beside it, unused.
 *
 * No React test infrastructure exists in this repo, so the wiring is pinned
 * at the source level — the same approach as `libraryRefresh.lint.test.js`
 * and `deadCode.lint.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABS = path.resolve(HERE, '..');

const SAVERS = [
  ['StandardCalc/StandardCalc.jsx', path.join(TABS, 'StandardCalc/StandardCalc.jsx')],
  ['ComplexCalc/ComplexCalc.jsx', path.join(TABS, 'ComplexCalc/ComplexCalc.jsx')],
];
const VIEW = [
  'StandardCalc/CalcLeadTimeNotice.jsx',
  path.join(TABS, 'StandardCalc/CalcLeadTimeNotice.jsx'),
];

const read = (p) => fs.readFileSync(p, 'utf8');

test('the shared Lead time component builds the FULL remark block', () => {
  assert.match(read(VIEW[1]), /buildRemarkBlock\(/, VIEW[0]);
});

test('every save path builds the remark with the same function the screen uses', () => {
  for (const [label, file] of SAVERS) {
    assert.match(read(file), /buildRemarkBlock\(/, `${label} must persist buildRemarkBlock()`);
  }
});

test('no save path uses the bullets-only builder — that is what dropped the two lines', () => {
  for (const [label, file] of SAVERS) {
    assert.doesNotMatch(
      read(file),
      /buildRemarkFromSelection\s*\(/,
      `${label} still calls buildRemarkFromSelection() — the header and the tolerance footer will not be saved`
    );
  }
});

test('the persisted block is given the per-quote product tolerance, not the default', () => {
  for (const [label, file] of SAVERS) {
    const src = read(file);
    const call = /buildRemarkBlock\(([^)]*)\)/.exec(src);
    assert.ok(call, `${label}: no buildRemarkBlock call found`);
    assert.match(
      call[1],
      /product_tolerance/,
      `${label}: buildRemarkBlock must receive lead_time.product_tolerance, else every quote saves the default`
    );
  }
});
