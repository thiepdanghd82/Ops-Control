/**
 * Source-level guard for the Cost Structure tier picker.
 *
 * The picker is VIEW-ONLY by decision: it changes which tier the Cost Structure
 * and Detailed Breakdown cards describe, and nothing else. `active_moq_idx` is
 * saved with the quote and drives the summary bar, every other tab, the margin
 * hold and which tier's aggregates count as the quote's own — so "let me look
 * at MOQ 2" must not re-point the quote at MOQ 2.
 *
 * That is exactly the kind of thing a later tidy-up pass undoes in good faith,
 * reaching for consistency with the summary-bar dropdown, which IS global. The
 * result would be a control that quietly edits saved data while claiming to
 * show something, with no test red and no error. Hence a guard that reads the
 * source, because there is no React test infrastructure here to drive the UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABS = join(HERE, '..', 'tabs');

const read = (p) => readFileSync(p, 'utf8');
const STD = read(join(TABS, 'StandardCalc', 'CalcCostBreakdown.jsx'));
const CPX = read(join(TABS, 'ComplexCalc', 'CplxCostBreakdown.jsx'));

const BOTH = [
  ['CalcCostBreakdown (Std)', STD],
  ['CplxCostBreakdown (Cpx)', CPX],
];

/** Code lines only — a bare match would hit the comments explaining the rule. */
const codeLines = (src) =>
  src.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });

for (const [name, src] of BOTH) {
  test(`${name}: resolves the viewed tier with the shared helpers`, () => {
    assert.match(src, /planTierViewSync/, `${name} must use the shared sync helper`);
    assert.match(src, /clampTierIdx/, `${name} must clamp — a deleted tier leaves a stale index`);
  });

  test(`${name}: the picker never writes active_moq_idx`, () => {
    // The whole decision, in one assertion. Nothing in these files may dispatch
    // a tier change: not SET_ACTIVE_MOQ (Std's action), not SET_CPLX_FIELD with
    // active_moq_idx (Complex's), not a direct assignment.
    const offenders = codeLines(src).filter(
      (l) =>
        l.includes('SET_ACTIVE_MOQ') ||
        (l.includes('active_moq_idx') &&
          /:|=(?!=)/.test(l) &&
          !l.includes('cs.active_moq_idx') &&
          !l.includes('st.active_moq_idx'))
    );
    assert.deepEqual(
      offenders,
      [],
      `${name} must not write the active tier — the Cost Structure picker is ` +
        'view-only, and a view action that edits saved quote data is the failure ' +
        'this guard exists to prevent.'
    );
  });

  test(`${name}: Cost Structure and Detailed Breakdown read the SAME tier`, () => {
    // Adjacent cards disagreeing about which MOQ they describe is worse than
    // no picker at all: the header says MOQ 2 and the numbers below are MOQ 1,
    // and nothing says which to believe.
    const code = codeLines(src).join('\n');
    assert.doesNotMatch(
      code,
      /const r = tiers\[(st|cs)\.active_moq_idx \|\| 0\]\.result/,
      `${name} must not leave a card pinned to the active tier`
    );
    assert.match(
      code,
      /cb\.detail_title[^\n]*viewIdx \+ 1/,
      `${name} detail title must show viewIdx`
    );
  });

  test(`${name}: the option list comes from the tiers the cards actually read`, () => {
    assert.match(
      src,
      /tiers\.map\(\(tr\) => \(/,
      `${name} must build options from \`tiers\`, not a second derivation — ` +
        'two sources for one set is how a picker ends up offering a tier the ' +
        'cards cannot show.'
    );
  });

  test(`${name}: a single-tier quote gets no picker`, () => {
    assert.match(
      src,
      /tiers\.length > 1 && \(/,
      `${name} must gate the picker on more than one tier — a dropdown holding ` +
        'one option is a control that cannot act.'
    );
  });
}
