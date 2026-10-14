// @ts-check
/**
 * The calculator remembers the result each quote was SAVED with, per kind, so
 * the screen can tell the operator when the engine now computes something
 * different — and let them Save it without inventing an edit.
 *
 * Two properties carry the weight:
 *   1. Only a genuine OPEN of a saved quote records a saved result. A copy or
 *      a New is not saved yet, so it has nothing to differ from.
 *   2. After a save the saved result AND the pricing snapshot move together.
 *      Save re-freezes the snapshot from today's library; if the screen kept
 *      computing with the old one, a quote whose library prices had moved
 *      would show the warning again the instant it was saved, and no number
 *      of saves would clear it.
 *
 * Runner: node --test src/context/calcReducer.savedResult.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer, CALC_ACTIONS as A, createInitialState } from './calcReducer.js';

const RESULT = { s_ttl: 0.046762, bd_ink_setup: 0.00226275 };
const load = (st, quoteType, action = 'load', savedResult = RESULT) =>
  calcReducer(st, {
    type: A.LOAD_QUOTE,
    payload: { quoteType, state: {}, id: 221, version: 3, action, savedResult },
  });

test('a fresh calculator remembers no saved result', () => {
  const s = createInitialState();
  assert.equal(s.savedResultStd, null);
  assert.equal(s.savedResultCplx, null);
});

test('opening a saved Standard quote records its saved result', () => {
  const s = load(createInitialState(), 'std');
  assert.deepEqual(s.savedResultStd, RESULT);
  assert.equal(s.savedResultCplx, null, 'Complex slot untouched');
});

test('opening a saved Complex quote records it in the Complex slot only', () => {
  const s = load(createInitialState(), 'cplx');
  assert.deepEqual(s.savedResultCplx, RESULT);
  assert.equal(s.savedResultStd, null, 'Standard slot untouched');
});

test('a COPY is not saved yet, so it has no saved result to differ from', () => {
  assert.equal(load(createInitialState(), 'std', 'copy').savedResultStd, null);
  assert.equal(load(createInitialState(), 'cplx', 'copy').savedResultCplx, null);
});

test('New clears only its own kind', () => {
  let s = load(load(createInitialState(), 'std'), 'cplx');
  s = calcReducer(s, { type: A.RESET_STD, payload: {} });
  assert.equal(s.savedResultStd, null);
  assert.deepEqual(
    s.savedResultCplx,
    RESULT,
    'resetting Standard must not forget the open Complex quote'
  );
  s = calcReducer(s, { type: A.RESET_CPLX, payload: {} });
  assert.equal(s.savedResultCplx, null);
});

test('MARK_SAVED records the new result AND the snapshot that produced it', () => {
  const snap = { _synthesized: false, _captured_at: '2026-09-25T06:37:57Z', coverage: [] };
  const next = { s_ttl: 0.050519, bd_ink_setup: 0.0059892 };
  const s = calcReducer(load(createInitialState(), 'std'), {
    type: A.MARK_SAVED,
    payload: { kind: 'std', result: next, snapshot: snap },
  });
  assert.deepEqual(s.savedResultStd, next);
  assert.deepEqual(s.stdState.pricing_snapshot, snap);
});

test('MARK_SAVED is not an edit — it must not mark the quote dirty', () => {
  const s = calcReducer(load(createInitialState(), 'std'), {
    type: A.MARK_SAVED,
    payload: { kind: 'std', result: RESULT, snapshot: { _synthesized: false } },
  });
  assert.equal(s.isDirty, false);
});

test('MARK_SAVED for Complex touches only the Complex slice', () => {
  const before = load(createInitialState(), 'std');
  const snap = { _synthesized: false };
  const s = calcReducer(before, {
    type: A.MARK_SAVED,
    payload: { kind: 'cplx', result: RESULT, snapshot: snap },
  });
  assert.deepEqual(s.cplxState.pricing_snapshot, snap);
  assert.equal(s.stdState, before.stdState, 'Standard state must be the same object');
  assert.deepEqual(s.savedResultStd, before.savedResultStd);
});
