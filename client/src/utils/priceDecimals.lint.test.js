// @ts-check
/**
 * Prices keep PRICE_DP = 5 decimals everywhere (Henry, 2026-09-29).
 *
 * At 4 decimals a 0.0001 step on a sub-cent price moved Contr% by about 2.3pp:
 * RFQ-2026-S0078, cost 0.0033225, Contr 25% typed, price solved as 0.00443 and
 * stored as 0.0044, which reads back 24.49%. The fix is one constant used by the
 * solver, the VND→USD mirror and every price display. A file that goes back to a
 * literal 4 would round or show differently from its neighbours, and nothing else
 * would notice — so this pins each site to the constant.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICE_DP, roundPrice } from './format.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every file that rounds or displays a selling, target, material or ink unit price.
const PRICE_SITES = [
  'services/priceSolver.js',
  'modules/cost/components/MarginPriceCells.helpers.js',
  'modules/cost/tabs/StandardCalc/CalcHeader.jsx',
  'modules/cost/tabs/ComplexCalc/ComplexCalc.jsx',
  'components/Shared/CostSummaryBar.jsx',
  'modules/cost/tabs/Summarize.jsx',
  'modules/cost/tabs/StandardCalc/SummaryBox.jsx',
  'modules/cost/tabs/StandardCalc/CalcSummarize.jsx',
  'modules/cost/tabs/StandardCalc/CalcCostBreakdown.jsx',
  'modules/cost/tabs/ComplexCalc/CplxCostBreakdown.jsx',
  'modules/cost/tabs/QuoteHistory.jsx',
  'modules/cost/tabs/PendingApprovalsInbox.jsx',
  'modules/cost/tabs/NpiPartsList.jsx',
  'modules/cost/tabs/MaterialLibrary.jsx',
  'components/LibraryPicker/pickerShared.js',
];

// The shapes the 4-decimal code took. Code lines only, so a comment explaining the
// history does not trip the guard (Lesson 46).
const FOUR_DP = [/toFixed\(4\)/, /fmtN\([^)]*,\s*4\)/, /maximumFractionDigits:\s*4\b/];

function codeLines(src) {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  });
}

test('PRICE_DP is 5 and roundPrice rounds to it', () => {
  assert.equal(PRICE_DP, 5);
  assert.equal(roundPrice(0.004430049), 0.00443);
  assert.equal(roundPrice(0.991234567), 0.99123);
  assert.equal(roundPrice('0.12345678'), 0.12346);
});

test('every price site reads the shared constant', () => {
  for (const rel of PRICE_SITES) {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    assert.match(src, /\b(PRICE_DP|roundPrice)\b/, `${rel} must use PRICE_DP or roundPrice`);
  }
});

test('no price site keeps a literal 4-decimal rounding or display', () => {
  for (const rel of PRICE_SITES) {
    const lines = codeLines(fs.readFileSync(path.join(SRC, rel), 'utf8'));
    for (const re of FOUR_DP) {
      const hit = lines.find((l) => re.test(l));
      assert.equal(hit, undefined, `${rel} still has a 4-decimal price: ${hit?.trim()}`);
    }
  }
});
