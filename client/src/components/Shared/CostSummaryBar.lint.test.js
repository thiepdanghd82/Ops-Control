/**
 * Source-level guard for the summary-bar TIER dropdown.
 *
 * No unit test can assert this. Both calculators render the SAME shared
 * <CostSummaryBar>, and the failure being prevented is not a wrong value
 * — it is one wrapper wiring the dropdown and the other not, or the two
 * deriving the tier list differently. Either way the suite stays green
 * and an operator on the other calculator is the one who finds out
 * (Lesson 48; MES-3-FIX-40 is the same drift one screen over).
 *
 * The other half is MES-3-FIX-53: Standard and Complex write
 * `active_moq_idx` through DIFFERENT actions. Complex reusing Standard's
 * SET_ACTIVE_MOQ lands the write in `stdState`, where it is silently lost
 * on save — no error, no red test, just a tier that will not stick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABS = join(HERE, '..', '..', 'modules', 'cost', 'tabs');

const read = (p) => readFileSync(p, 'utf8');
const STD = read(join(TABS, 'StandardCalc', 'CalcSummaryBar.jsx'));
const CPX = read(join(TABS, 'ComplexCalc', 'CplxSummaryBar.jsx'));
const CPX_PARENT = read(join(TABS, 'ComplexCalc', 'ComplexCalc.jsx'));
const SHARED = read(join(HERE, 'CostSummaryBar.jsx'));

const WRAPPERS = [
  ['CalcSummaryBar (Std)', STD],
  ['CplxSummaryBar (Cpx)', CPX],
];

for (const [name, src] of WRAPPERS) {
  test(`${name}: builds its tier list with the shared helper`, () => {
    assert.match(
      src,
      /buildTierOptions/,
      `${name} must derive tiers from buildTierOptions, not its own expression — ` +
        'two derivations of one set is how the dropdown starts offering ' +
        'tiers the RFQ radio does not.'
    );
  });

  test(`${name}: hands the shared bar both tiers and a setter`, () => {
    assert.match(src, /tiers=\{/, `${name} must pass tiers=`);
    assert.match(
      src,
      /onTierChange=\{/,
      `${name} must pass onTierChange= — without it the shared bar falls ` +
        'back to the read-only badge and the dropdown silently disappears ' +
        'on that calculator only.'
    );
  });

  test(`${name}: does not re-derive the tier count from num_moq`, () => {
    assert.doesNotMatch(
      src,
      /num_moq/,
      `${name} must not read num_moq — extra_moqs is what the RFQ radios ` +
        'iterate, so it is the authoritative tier set.'
    );
  });
}

test('Complex passes a setter that routes through SET_CPLX_FIELD', () => {
  assert.match(
    CPX_PARENT,
    /onTierChange=\{setActiveMoqTier\}/,
    'ComplexCalc must supply the summary bar a tier setter.'
  );
  assert.match(
    CPX_PARENT,
    /setActiveMoqTier\s*=\s*useCallback\(\s*\(idx\)\s*=>\s*setCplxField\('active_moq_idx'/,
    'The Complex setter must write via setCplxField (SET_CPLX_FIELD).'
  );
});

/**
 * Lines that are prose, not code. A bare /SET_ACTIVE_MOQ/ over the file
 * flags the comment explaining why Complex must NOT use it — the guard
 * firing on its own rationale. A check that cries wolf is the one people
 * learn to ignore (Lesson 0), so it looks at code lines only.
 */
const codeLines = (src) =>
  src.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });

test("Complex never reuses Standard's SET_ACTIVE_MOQ (MES-3-FIX-53)", () => {
  for (const [name, src] of [
    ['CplxSummaryBar', CPX],
    ['ComplexCalc', CPX_PARENT],
  ]) {
    const offenders = codeLines(src).filter((l) => l.includes('SET_ACTIVE_MOQ'));
    assert.deepEqual(
      offenders,
      [],
      `${name} must not dispatch SET_ACTIVE_MOQ — that reducer case writes ` +
        'stdState, so on a Complex quote the tier change is lost on save.'
    );
  }
});

test('that guard still catches a real Complex dispatch of the Std action', () => {
  // Without this, the comment-stripping above could be loosened until the
  // guard matches nothing at all and still reports green.
  const sabotaged = CPX_PARENT.replace(
    "setCplxField('active_moq_idx', idx)",
    "dispatch({ type: 'SET_ACTIVE_MOQ', payload: { idx } })"
  );
  assert.notEqual(sabotaged, CPX_PARENT, 'sabotage anchor drifted — update this test');
  assert.equal(codeLines(sabotaged).filter((l) => l.includes('SET_ACTIVE_MOQ')).length, 1);
});

test('the shared bar stays presentational — it dispatches nothing itself', () => {
  assert.doesNotMatch(
    SHARED,
    /dispatch\(/,
    'CostSummaryBar must not dispatch: the two calculators write the same ' +
      'field through different actions, so the setter belongs to the wrapper.'
  );
});

test('the shared bar keeps the badge for a single-tier quote', () => {
  assert.match(
    SHARED,
    /sc-sumbar-tier-badge/,
    'The badge branch must survive — 112 of 147 live quotes are single-tier, ' +
      'and a dropdown holding one option is a control that cannot act.'
  );
  assert.match(
    SHARED,
    /tiers\.length > 1 && onTierChange/,
    'The dropdown must be gated on having more than one tier AND a setter.'
  );
});
