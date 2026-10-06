/**
 * Source-level guard for the Layout column that follows the Layout tab
 * (2026-10-06). Std and Cpx render one shared ProcessLayoutCell, so the two
 * grids cannot show the synced cavity differently (Lesson 48); the cell takes
 * the cavity from syncedLayoutFor, the function the reducer syncs with; and
 * the Layout tab shows Print Total / Shot through layoutPrintTotal, so the
 * number on that tab and the number a Print row takes cannot differ
 * (Lesson 41).
 *
 * No React test infrastructure in this repo, so source inspection is the only
 * way to assert it — same approach as printPlates.lint and scrapColumn.lint.
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

const std = code('../tabs/StandardCalc/CalcProcesses.jsx');
const cpx = code('../tabs/ComplexCalc/SubProductRow.jsx');
const cell = code('ProcessLayoutCell.jsx');
const layoutTab = code('../tabs/StandardCalc/CalcLayout.jsx');

test('both process grids render the shared ProcessLayoutCell', () => {
  assert.match(std, /<ProcessLayoutCell[\s/>]/, 'Std grid must render ProcessLayoutCell');
  assert.match(cpx, /<ProcessLayoutCell[\s/>]/, 'Cpx grid must render ProcessLayoutCell');
});

test('neither grid keeps a hand-built Layout input of its own', () => {
  assert.doesNotMatch(std, /value=\{proc\.layout/, 'Std must not render proc.layout itself');
  assert.doesNotMatch(cpx, /value=\{p\.layout/, 'Cpx must not render p.layout itself');
});

test('the cell takes the cavity from syncedLayoutFor, the function the reducer uses', () => {
  assert.match(cell, /syncedLayoutFor\(proc, state\)/);
  assert.doesNotMatch(cell, /layoutPrintTotal\(|layoutCutterCavities\(/);
});

test('the Layout tab shows Print Total / Shot through layoutPrintTotal', () => {
  assert.match(layoutTab, /layoutPrintTotal\(state\)/);
  assert.doesNotMatch(
    layoutTab,
    /printCavAcross \* partsInMd/,
    'the Layout tab must not compute Print Total / Shot on its own'
  );
});
