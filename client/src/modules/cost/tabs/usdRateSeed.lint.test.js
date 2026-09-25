/**
 * Source-level guard for the inherited USD rate.
 *
 * Three things here are decisions rather than mechanics, none of them
 * assertable at runtime in this repo (no React testing infrastructure), and
 * each fails quietly if it drifts.
 *
 * 1. OPENING a saved quote must NOT re-rate it. A quote carries the rate it
 *    was quoted at; replacing it on open would silently re-price work that
 *    has already gone to a customer, and nothing on screen would say so.
 *    Only New and Copy inherit.
 *
 * 2. The notice must NOT live in quote state. It is an acknowledgement, and
 *    persisting it would ride into every save and into the signed `_Schema`
 *    payload of every export for something only this screen reads — exactly
 *    what `target_contr` did for months before anyone noticed it was inert.
 *
 * 3. Standard and Complex must move together. They are twins, and shipping
 *    one and scheduling the other is how they drift (MES-3-FIX-40,
 *    MES-3-FIX-56, Lesson 48).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = {
  Standard: readFileSync(join(HERE, 'StandardCalc', 'StandardCalc.jsx'), 'utf8'),
  Complex: readFileSync(join(HERE, 'ComplexCalc', 'ComplexCalc.jsx'), 'utf8'),
};
const REDUCER = readFileSync(join(HERE, '..', '..', '..', 'context', 'calcReducer.js'), 'utf8');

for (const [name, SRC] of Object.entries(FILES)) {
  test(`${name}: New inherits the rate, and the pending-quote fetch is delegated`, () => {
    assert.match(SRC, /getLatestUsdRate\(\)/, 'New asks for the rate');
    assert.match(
      SRC,
      /fetchPendingQuote\(action, \{/,
      'Open and Copy go through the shared helper, which fetches both in one ' +
        'await -- the nested version resolved AFTER clearPendingQuote() had ' +
        'torn this effect down, so the seeded load never ran'
    );
  });

  test(`${name}: exactly ONE load path, so no branch can diverge`, () => {
    // The bug had three: a seeded load, an unseeded fallback and an open
    // path. Whether opening re-rates a quote is now decided in
    // pendingQuoteLoad.js and covered by a REAL test there ("opening does
    // not ask for the rate at all") rather than by grepping for a branch.
    // Scoped to calls that carry an `action`: the other loadQuote sites in
    // these files (restore-a-version, resolve-a-conflict) are always opens
    // and pass none, so counting every call would flag them too.
    const withAction = SRC.match(/loadQuote\('(std|cplx)',[^;]*?\baction\b[^;]*?\)/g) || [];
    assert.equal(withAction.length, 1, 'one loadQuote call can be a copy, and only one');
    assert.doesNotMatch(
      SRC,
      /loadQuote\('(std|cplx)',[^;]*,\s*action\)/,
      'the unseeded copy fallback is gone -- it was the branch that ran when ' +
        'the nested rate fetch lost its race, and it kept the source rate'
    );
    assert.match(
      SRC,
      // The seed is the 6th argument. Arguments may FOLLOW it — the saved result
      // is passed 7th (savedResultDrift) — so match `,` or `)` after it rather
      // than insisting the call ends there. What this pins is unchanged: the
      // seed passed is the one the helper resolved.
      /loadQuote\('(std|cplx)', q\.state, q\.id, q\._version \|\| 0, action, n \? n\.rate : 0[,)]/,
      'and it passes the seed the helper resolved -- null for an open, so a ' +
        'quote already sent to a customer cannot re-price itself'
    );
  });

  test(`${name}: the notice is component state, never quote state`, () => {
    assert.match(SRC, /const \[rateNotice, setRateNotice\] = useState\(null\)/);
    assert.doesNotMatch(
      SRC,
      /usd_rate_notice|rate_notice_ack|SET_(STD|CPLX)_FIELD'?,\s*payload:\s*\{\s*field:\s*'rateNotice/,
      'putting the acknowledgement in the quote would ride it into every save ' +
        'and into the signed _Schema payload of every export'
    );
  });

  test(`${name}: a failed rate lookup still opens the quote`, () => {
    // A rate is a convenience, never a precondition. Leaving the operator
    // with a dead New button because a lookup 500'd would be worse than the
    // blank field this replaced.
    assert.match(SRC, /\.catch\(\(\) => \{[\s\S]{0,400}?setRateNotice\(null\)/);
  });
}

test('both calculators carry the same wiring — they are twins', () => {
  const shape = (s) => ({
    seed: (s.match(/getLatestUsdRate\(\)/g) || []).length,
    notice: (s.match(/setRateNotice\(/g) || []).length,
    // Trailing class is load-bearing: without it <UsdRateNoticeModalX>
    // still matches and a forked twin passes this assertion.
    modal: (s.match(/<UsdRateNoticeModal[\s/>]/g) || []).length,
    gate: (s.match(/noticeStillApplies\(rateNotice/g) || []).length,
  });
  assert.deepEqual(
    shape(FILES.Standard),
    shape(FILES.Complex),
    'Standard and Complex must gain this together; one shipped alone is how ' +
      'the twins drift (Lesson 48)'
  );
});

test('a seed of 0 leaves the field blank so the old gate still fires', () => {
  // Nothing inheritable -- fresh install, or every prior quote saved without
  // a rate -- must leave usd_rate blank. A 0 would read as a real answer and
  // silently zero both VND mirrors, which is what the gate exists to stop.
  assert.match(
    REDUCER,
    /function withSeededRate\(st, seedUsdRate\) \{[\s\S]{0,260}?if \(!Number\.isFinite\(n\) \|\| n <= 0\) return st;/,
    'withSeededRate must return the state untouched for a non-positive seed'
  );
});

// ── correcting the rate on the confirm dialog ───────────────────────

const MODAL = readFileSync(join(HERE, '..', 'components', 'UsdRateNoticeModal.jsx'), 'utf8');

test('the dialog refuses to confirm a non-positive rate', () => {
  // A zero silently zeroes both VND mirrors (#311). The one dialog whose
  // purpose is to make the operator look at this number must not be the
  // thing that accepts a bad one.
  assert.match(MODAL, /const ok = Number\(rate\) > 0;/);
  assert.match(MODAL, /disabled=\{!ok\}/, 'Confirm is gated on it');
});

test('the dialog edits the rate with the SAME widget as the RFQ card', () => {
  // DecimalInput is what both calculators bind usd_rate to. A hand-rolled
  // input here would parse differently from the field it writes into.
  assert.match(MODAL, /import DecimalInput from/);
  assert.match(MODAL, /<DecimalInput\s/);
});

test('a second notice does not inherit the previous dialog typing', () => {
  // Reset via the remount key the calculators pass, NOT an effect that syncs
  // state to a prop: that renders twice and is what
  // react-hooks/set-state-in-effect flags -- a rule that fires on CI and not
  // locally, so it cost a red build before it cost anything else.
  assert.doesNotMatch(MODAL, /useEffect/, 'no state-sync effect');
  for (const [name, SRC] of Object.entries(FILES)) {
    assert.match(
      SRC,
      /key=\{rateNotice \? rateNotice\.rate : 'none'\}/,
      name + ' must remount the dialog on a new notice'
    );
  }
});

for (const [name, SRC] of Object.entries(FILES)) {
  test(`${name}: Confirm writes the rate the operator confirmed`, () => {
    assert.match(
      SRC,
      /onConfirm=\{\(rate\) => \{[\s\S]{0,400}?set(Std|Cplx)Field\('usd_rate', rate\)/,
      'the dialog may have corrected it, so the confirmed value is what gets written'
    );
  });
}

test('Complex writes through its OWN setter — MES-3-FIX-53', () => {
  // Sending this through the Standard action lands the write in stdState and
  // loses it on save. That cost 36 days of silent data loss in May.
  assert.match(FILES.Complex, /setCplxField\('usd_rate', rate\)/);
  assert.doesNotMatch(FILES.Complex, /setStdField\('usd_rate', rate\)/);
});
