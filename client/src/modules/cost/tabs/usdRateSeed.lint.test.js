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
  test(`${name}: New and Copy inherit the rate`, () => {
    assert.equal(
      (SRC.match(/getLatestUsdRate\(\)/g) || []).length,
      2,
      'once for New, once for Copy — and no more, or some other path is re-rating a quote'
    );
    assert.match(SRC, /action === 'copy'/, 'the copy branch must be explicit');
  });

  test(`${name}: opening a saved quote keeps its own rate`, () => {
    // The seed is the 6th argument of loadQuote. It must appear ONLY inside
    // the copy branch: a quote already sent to a customer must not silently
    // re-price itself when someone opens it to look.
    const seeded = SRC.match(/loadQuote\([^)]*,\s*action,\s*[^)]*\)/g) || [];
    assert.equal(seeded.length, 1, 'exactly one loadQuote call passes a seed');
    const plain = SRC.match(/loadQuote\([^)]*,\s*action\)/g) || [];
    assert.ok(plain.length >= 2, 'the open path and the copy-failure path pass no seed');
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
  assert.match(MODAL, /useEffect\(\(\) => \{\s*setRate\(seeded\);\s*\}, \[seeded\]\)/);
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
