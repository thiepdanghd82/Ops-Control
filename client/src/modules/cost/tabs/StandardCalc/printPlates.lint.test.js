/**
 * Source-level guard that the Print Design Layout shows each plate's cost
 * through the same function that charges it (2026-10-05).
 *
 * Plates 1~4 are Layout tool-cost sources, like Cutters 1~4: a Print process
 * row assigned to one is charged the cost layoutToolCostSources gives it,
 * which comes from plateCostAt — the operator's override, else the formula.
 * The Layout cell must read the same plateCostAt, or the cost the operator
 * sees and the cost the quote carries are free to differ (Lesson 41). And it
 * must write through plateFieldPatch, which keeps Print 1 in the pl_* fields
 * saved quotes already carry and Prints 2~4 in pl_plates.
 *
 * Both summary tables — plates on the Print side, cutters on the Cut side —
 * end in the same Total tools cost, so both must take it from layoutToolsTotal
 * and render through the one ToolSummaryTable; a second table built by hand is
 * free to total differently.
 *
 * No React test infrastructure in this repo, so source inspection is the only
 * way to assert it — same approach as quotedBy.lint and scrapColumn.lint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = (p) =>
  readFileSync(path.join(here, p), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const layout = code('CalcLayout.jsx');
const sources = code('../../../../services/layoutToolCost.js');

test('the Layout cell and the tool-cost source both read plateCostAt', () => {
  assert.match(layout, /PLATE_COUNT/, 'the Layout must render every plate');
  assert.match(layout, /plateCostAt\(state, i, lib\)/, 'the Layout cell must read plateCostAt');
  assert.match(sources, /plateCostAt\(s, i, lib\)/, 'the tool-cost source must read plateCostAt');
});

test('neither computes a plate cost on its own', () => {
  assert.doesNotMatch(
    layout,
    /computePlateCost\(/,
    'the Layout must leave the formula to plateCostAt'
  );
  assert.doesNotMatch(
    sources,
    /computePlateCost\(/,
    'the source must leave the formula to plateCostAt'
  );
});

test('the Layout writes each plate through plateFieldPatch', () => {
  assert.match(layout, /plateFieldPatch\(state, i, field, v\)/);
  assert.doesNotMatch(
    layout,
    /onField\(\s*'pl_/,
    'no plate field is written around plateFieldPatch'
  );
  assert.doesNotMatch(layout, /state\.pl_/, 'no plate field is read around plateAt');
});

test('both summary tables end in one Total tools cost, from layoutToolsTotal', () => {
  const count = (re) => (layout.match(re) || []).length;
  assert.equal(count(/<ToolSummaryTable\b/g), 2, 'the Print and the Cut table share one component');
  assert.equal(count(/layoutToolsTotal\(state, lib\)/g), 2, 'each side takes the total from it');
  assert.equal(count(/className="sc-cutter-summary"/g), 1, 'no table is built beside it by hand');
});
