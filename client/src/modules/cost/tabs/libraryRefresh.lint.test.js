/**
 * A tab that saves a LIBRARY dataset must refresh the shared CostLibContext.
 *   node --test client/src/modules/cost/tabs/libraryRefresh.lint.test.js
 *
 * Why this exists (2026-09-16): Henry added material `KCW/RPS6/KDL` in
 * Material Cost, saw it on that screen, then searched for it in the pricing
 * material picker and got "0 results".
 *
 * The picker reads `lib.npiDB` from CostLibContext, which loads ONCE on mount
 * and has no SSE subscription; the server's save-all emits no data event for
 * materials. `MaterialLibrary.jsx` kept its own `useState` copy, fetched its
 * own data and saved straight through `costApi.saveAll` — so its screen was
 * right and every calculator in the app was stale until the next app restart.
 *
 * LibRate, LibDDL, LibFinance and InkCalculator all call `refreshLib()` after
 * saving. Material Cost was the only library editor that did not, which makes
 * it an omission rather than a decision — and exactly the kind a structural
 * test catches for the NEXT editor somebody adds.
 *
 * Deliberately NOT flagged: SampleTracking / RFQTracker / QuoteHistory also
 * call saveAll, but they persist tracking data no calculator reads out of the
 * library context. A guard that fired on those would cry wolf, and a check
 * people learn to ignore is worse than no check (Lesson 0).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Dataset keys CostLibContext serves to the calculators + the picker. */
const LIBRARY_KEYS = [
  'matDB',
  'npiDB',
  'ifsDB',
  'sourcingDB',
  'rateDB',
  'rateSitesDB',
  'ddlDB',
  'ddlSitesDB',
  'financeDB',
  'financeSumDB',
  'inkCalcDB',
];

/** Any of these means the tab put its save back into the shared context. */
const REFRESHERS = [
  'refreshLib',
  'setMaterials',
  'setRawRates',
  'setRawDDL',
  'setFinance',
  'setInkCalc',
];

function tabFiles() {
  return fs
    .readdirSync(HERE)
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => ({ name: f, src: fs.readFileSync(path.join(HERE, f), 'utf-8') }));
}

test('every tab that saves a library dataset refreshes the shared context', () => {
  const offenders = [];
  for (const { name, src } of tabFiles()) {
    const saveCalls = src.match(/saveAll\(\s*\{[^}]*\}/gs) || [];
    const savesLibrary = saveCalls.some((call) => LIBRARY_KEYS.some((k) => call.includes(k)));
    if (!savesLibrary) continue;
    if (!REFRESHERS.some((r) => src.includes(r))) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `these tabs save a library dataset but never push it back into CostLibContext, ` +
      `so every calculator and the material picker stay stale until the app restarts: ` +
      offenders.join(', ')
  );
});

test('the guard actually looks at something — library savers exist to check', () => {
  // Without this, deleting LIBRARY_KEYS would make the test above vacuously
  // pass and nobody would notice.
  const savers = tabFiles().filter(({ src }) =>
    (src.match(/saveAll\(\s*\{[^}]*\}/gs) || []).some((c) =>
      LIBRARY_KEYS.some((k) => c.includes(k))
    )
  );
  assert.ok(
    savers.length >= 4,
    `expected the known library editors (rate, DDL, finance, ink, materials); found ${savers.length}`
  );
});

test('tracking tabs are out of scope — the guard must not cry wolf', () => {
  for (const n of ['SampleTracking.jsx', 'RFQTracker.jsx']) {
    const src = fs.readFileSync(path.join(HERE, n), 'utf-8');
    const saveCalls = src.match(/saveAll\(\s*\{[^}]*\}/gs) || [];
    assert.ok(
      !saveCalls.some((c) => LIBRARY_KEYS.some((k) => c.includes(k))),
      `${n} would now be flagged — re-check whether it really saves library data`
    );
  }
});
