/**
 * Source-level guard on WHERE the margin-hold driver runs.
 *
 * This exists because the bug it pins was invisible to every unit test and to
 * the whole suite: the logic was correct, the pure helpers were green, and the
 * feature still did nothing. The driver had been written inside
 * CalcCostBreakdown, and sub-tabs mount exclusively — so it was unmounted
 * precisely when the operator was on Materials & Process changing the costs it
 * exists to react to. Correct code in the wrong component is still a
 * non-feature, and only the placement can be asserted here.
 *
 * With no React test infrastructure in this repo, source inspection is the
 * only way to hold that line — the same approach as libraryRefresh.lint and
 * remarkBuilder.lint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const tabs = path.join(here, '..', 'tabs');
const read = (p) => readFileSync(path.join(tabs, p), 'utf8');

const CALCULATORS = ['StandardCalc/StandardCalc.jsx', 'ComplexCalc/ComplexCalc.jsx'];
const BREAKDOWNS = ['StandardCalc/CalcCostBreakdown.jsx', 'ComplexCalc/CplxCostBreakdown.jsx'];

test('both calculators drive the hold — they stay mounted across every sub-tab', () => {
  for (const f of CALCULATORS) {
    const src = read(f);
    assert.match(src, /useMarginHold\s*\(/, `${f} must call useMarginHold`);
    assert.match(src, /from '\.\.\/\.\.\/hooks\/useMarginHold'/, `${f} must import it`);
  }
});

test('neither Cost Breakdown tab drives it — that component unmounts while costs are edited', () => {
  for (const f of BREAKDOWNS) {
    const src = read(f);
    assert.doesNotMatch(src, /useMarginHold\s*\(/, `${f} must NOT call useMarginHold`);
    assert.doesNotMatch(
      src,
      /planAutoHold/,
      `${f} must not re-grow its own auto-write; one driver, not two`
    );
  }
});

test('the calculators pass the tier price so the guard can compare against it', () => {
  // planAutoHold stops when the solved price already IS the tier's price.
  // Feeding it anything else (a remembered write, say) both re-opens the
  // spin risk and makes a hand-typed price uncorrectable.
  for (const f of CALCULATORS) {
    assert.match(read(f), /\bsp\b/, `${f} must forward each tier's selling price`);
  }
});
