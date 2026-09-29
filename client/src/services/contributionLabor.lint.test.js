// @ts-check
/**
 * Contribution subtracts ALL labor — run plus setup — everywhere it is computed
 * (Henry, 2026-09-29). calcAll does it on its own full `labor_cost`; the four other
 * sites rebuild the figure from a result, where `labor_cost` is run-only (Lesson 21),
 * and must go through laborFull(). A site left on `labor_cost` alone would show a
 * Complex quote, a what-if or a Summarize tier a Contr% higher than calcAll's, with
 * nothing red — these twins are how that drift starts (Lesson 48).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laborFull } from './calcEngine.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// File → how many Contribution formulas it holds.
const SITES = {
  'services/cplxTierAggregate.js': 1,
  // One since 2026-09-29: the save path margins through aggregateForTier (cplxTierAggregate).
  'modules/cost/tabs/ComplexCalc/ComplexCalc.jsx': 1,
  'modules/cost/tabs/StandardCalc/costStructureWhatIf.js': 2, // canonical + labor bucket
  'modules/cost/tabs/Summarize.jsx': 1,
};

test('laborFull is run labor plus setup labor', () => {
  assert.equal(laborFull({ labor_cost: 6, bd_setup_labor: 4 }), 10);
  assert.equal(laborFull({ labor_cost: 6 }), 6);
  assert.equal(laborFull(null), 0);
});

test('every Contribution site outside calcAll uses laborFull', () => {
  for (const [rel, n] of Object.entries(SITES)) {
    const calls = (read(rel).match(/laborFull\(/g) || []).length;
    assert.ok(calls >= n, `${rel}: expected ${n} laborFull() call(s), found ${calls}`);
  }
});

test('no Contribution site subtracts run labor alone', () => {
  // The shape every site had before 2026-09-29: `(x.labor_cost || 0)` as the last
  // term of the Contribution numerator.
  const RUN_ONLY = /\(\s*\w+\.labor_cost\s*\|\|\s*0\s*\)\s*\)\s*\//;
  for (const rel of Object.keys(SITES)) {
    assert.doesNotMatch(read(rel), RUN_ONLY, `${rel} still subtracts run labor only`);
  }
});

test('calcAll no longer carries the run-only Contribution term', () => {
  assert.doesNotMatch(read('services/calcEngine.js'), /run_labor_only/);
});
