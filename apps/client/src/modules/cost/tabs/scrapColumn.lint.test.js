/**
 * Source-level guard that the Scrap% column shows the scrap factor the engine
 * prices with, in all three grids that show it.
 *
 * The column used to add the processes' scrap_pct up, while every cost the
 * engine computes divides by the compound factor calcMatScrapFactor() returns,
 * 1 − ∏(1 − scrap_i) — the formula the Legend has always printed for it. One
 * process gives the same number either way; five processes at 10% showed 50.0%
 * on RFQ-2026-S0049 while its material, ink and tooling were priced at 41.0%
 * (2026-10-02). The Standard grids also summed the base processes while the
 * engine reads the active MOQ tier's, whose rows can override scrap.
 *
 * No React test infrastructure in this repo, so source inspection is the only
 * way to assert it — same approach as toolLifeUnit.lint and quotedBy.lint.
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

const GRIDS = [
  ['Standard materials', 'StandardCalc/CalcMaterials.jsx', /calcMatScrapFactor\(tierSt\)/],
  ['Standard inks', 'StandardCalc/CalcInks.jsx', /calcMatScrapFactor\(tierSt\)/],
  [
    'Complex materials + inks',
    'ComplexCalc/SubProductRow.jsx',
    /calcMatScrapFactor\(\s*applyCplxTierToSp\(/,
  ],
];

test('each grid shows the engine scrap factor, read from the state the engine prices', () => {
  for (const [name, file, call] of GRIDS) {
    assert.match(code(file), call, `${name} must show calcMatScrapFactor of the priced state`);
  }
});

test('no grid adds scrap_pct up for display', () => {
  for (const [name, file] of GRIDS) {
    assert.doesNotMatch(
      code(file),
      /acc\s*\+\s*\(?\s*p\.scrap_pct/,
      `${name} must not sum scrap_pct — the engine compounds it`
    );
  }
});
