// @ts-check
/**
 * Source-level guard for the saved-result drift warning, in BOTH calculators.
 *
 * No React test infrastructure in this repo, so the wiring is pinned where it
 * lives — the same approach as useMarginHold.lint and tierSelect.lint. What it
 * protects, each of which fails silently if lost:
 *
 *   - the Save button and Cmd+S share ONE condition, or a drifted quote is
 *     savable by one and not the other (the cue and the remedy must agree);
 *   - EVERY successful save records what it persisted, or the warning comes
 *     back the moment a quote is saved through the path that forgot;
 *   - each calculator writes and reads ITS OWN slot. Complex routing through the
 *     Standard slot is MES-3-FIX-53's shape: the write lands where nothing reads
 *     it, nothing errors, and the feature quietly stops working for Complex.
 *
 * Code lines only (Lesson 46): the comments explaining these rules name the
 * very identifiers the assertions look for.
 *
 * Runner: node --test src/modules/cost/savedResultDrift.lint.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const code = (rel) =>
  readFileSync(path.join(HERE, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join('\n');

const TWINS = [
  {
    name: 'StandardCalc',
    file: 'tabs/StandardCalc/StandardCalc.jsx',
    kind: 'std',
    slot: 'savedResultStd',
    other: 'savedResultCplx',
  },
  {
    name: 'ComplexCalc',
    file: 'tabs/ComplexCalc/ComplexCalc.jsx',
    kind: 'cplx',
    slot: 'savedResultCplx',
    other: 'savedResultStd',
  },
];

for (const tw of TWINS) {
  const src = code(tw.file);

  test(`${tw.name}: renders the shared banner, fed by the drift memo`, () => {
    assert.match(src, /import\s*\{\s*savedResultDrift\s*\}/);
    assert.match(src, /<SavedResultDriftBanner\s+drift=\{savedDrift\}\s*\/>/);
  });

  test(`${tw.name}: the Save button AND Cmd+S use the same condition`, () => {
    assert.match(src, /disabled=\{!\(isDirty \|\| driftCanSave\) \|\| saving\}/, 'Save button');
    assert.match(src, /if \(\(isDirty \|\| driftCanSave\) && !saving\) handleSave\(\)/, 'Cmd+S');
    assert.doesNotMatch(
      src,
      /disabled=\{!isDirty \|\| saving\}/,
      'the old dirty-only gate must be gone'
    );
  });

  test(`${tw.name}: an implausible drift does not light Save`, () => {
    // One click would write numbers like $444/pc into every file; the banner
    // still says the two differ, but saving takes an edit first.
    assert.match(src, /const driftCanSave = !!savedDrift && !savedDrift\.implausible;/);
    assert.doesNotMatch(src, /isDirty \|\| savedDrift\)/, 'no gate may use the raw drift');
  });

  test(`${tw.name}: Save checks what it is about to write against the saved result`, () => {
    // The banner hides once anything is edited, and an edit re-enables Save —
    // so on 2026-09-28 fixing a tool type let a labour misread through. The
    // check has to run on the result Save is about to write.
    assert.match(src, new RegExp(`savedResultDrift\\(${tw.slot}, pending\\.result\\)`));
    assert.match(src, /<SaveChoiceModal[\s\S]*?drift=\{saveDrift\}/);
  });

  test(`${tw.name}: warns only on an unedited saved quote`, () => {
    assert.match(src, /activeQuoteId != null && !isDirty \? savedResultDrift\(/);
  });

  test(`${tw.name}: every successful save records what it persisted`, () => {
    const saves = (src.match(/costApi\.(saveQuote|updateQuote)\(/g) || []).length;
    const marks = (src.match(/type: 'MARK_SAVED'/g) || []).length;
    assert.ok(saves >= 3, `expected the three save paths, found ${saves}`);
    assert.equal(marks, saves, `${saves} save calls but ${marks} MARK_SAVED — a save path forgot`);
  });

  test(`${tw.name}: writes and reads its OWN slot (MES-3-FIX-53's shape)`, () => {
    const kinds = [...src.matchAll(/type: 'MARK_SAVED',\s*payload: \{ kind: '(\w+)'/g)].map(
      (m) => m[1]
    );
    assert.ok(kinds.length > 0);
    assert.deepEqual([...new Set(kinds)], [tw.kind], `MARK_SAVED kinds: ${kinds}`);
    assert.match(src, new RegExp(`savedResultDrift\\(${tw.slot},`));
    assert.doesNotMatch(src, new RegExp(tw.other), `must not read the ${tw.other} slot`);
  });

  test(`${tw.name}: opening a quote hands over its saved result`, () => {
    // The reducer normalises a missing result to null, so the call passes it
    // bare — which also keeps the call on one line for usdRateSeed.lint.
    assert.match(src, /q\._version \|\| 0, action, n \? n\.rate : 0, q\.result\)/);
  });
}

test('the shared banner switches to its blocked form for an implausible drift', () => {
  const src = code('components/SavedResultDriftBanner.jsx');
  assert.match(src, /drift\.implausible/);
  assert.match(src, /srd-banner--blocked/);
  assert.match(src, /'pricing\.drift\.blocked_title'/);
  assert.match(src, /'pricing\.drift\.blocked_body'/);
  const css = readFileSync(path.join(HERE, 'components/SavedResultDriftBanner.css'), 'utf8');
  assert.match(css, /\.srd-banner--blocked\s*\{/, 'the banner owns the blocked style (#309)');
});

test('SaveChoiceModal: a far-off save is explained, and Enter goes back rather than saving', () => {
  const src = code('../../utils/SaveChoiceModal.jsx');
  assert.match(src, /'savechoice\.drift_title'/);
  assert.match(src, /'savechoice\.drift_body'/);
  // Modal autofocuses the first .op-btn-primary, so while drifted only the
  // go-back button may carry it.
  assert.match(src, /drift \? 'op-btn op-btn-primary' : 'op-btn op-btn-ghost'/);
  assert.match(src, /drift \? 'op-btn op-btn-secondary' : 'op-btn op-btn-primary'/);
});
