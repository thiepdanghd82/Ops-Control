/**
 * Persist round-trip guard for the validation ignore-list feature.
 *
 * The ignore-list is stored as `state.ignored_validations` on the calc
 * state and saved verbatim with the quote (server stores quote.state as
 * raw_json — no per-field columns, no DB migration). This test locks in
 * that contract end-to-end at the reducer layer:
 *   - SET_CPLX_FIELD / SET_STD_FIELD store the array + mark dirty,
 *   - LOAD_QUOTE (after a JSON serialize that mimics the server) restores
 *     it on a fresh state (i.e. "reopen on another machine"),
 *   - un-ignore (replacing the array) brings the error back.
 *
 * Uses the REAL reducer — if a future migration starts whitelisting
 * state fields and drops ignored_validations, this test fails loudly.
 *
 * Runner: node --test src/context/validationIgnoreReducer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

test('SET_CPLX_FIELD stores ignored_validations + marks dirty (so it saves)', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.SET_CPLX_FIELD,
    payload: { field: 'ignored_validations', value: ['mat-price-0-sp2'] },
  });
  assert.deepEqual(s.cplxState.ignored_validations, ['mat-price-0-sp2']);
  assert.equal(s.isDirty, true);
});

test('ignored_validations survives save -> LOAD_QUOTE round-trip (cross-machine persist)', () => {
  let s = createInitialState();
  const ids = ['lay-width-sp1', 'mat-price-0-sp1', 'lay-length-sp1'];
  s = calcReducer(s, {
    type: A.SET_CPLX_FIELD,
    payload: { field: 'ignored_validations', value: ids },
  });
  // Mimic the server: buildQuoteData saves cplxState verbatim as
  // quote.state (raw_json); reopening dispatches LOAD_QUOTE with it.
  const savedState = JSON.parse(JSON.stringify(s.cplxState));
  let reopened = createInitialState();
  reopened = calcReducer(reopened, {
    type: A.LOAD_QUOTE,
    payload: { quoteType: 'cplx', state: savedState, id: 7, version: 1 },
  });
  assert.deepEqual(
    reopened.cplxState.ignored_validations,
    ids,
    'ignore-list must be restored intact after reload'
  );
});

test('un-ignore (replace array minus one id) brings that error back', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.SET_CPLX_FIELD,
    payload: { field: 'ignored_validations', value: ['a', 'b'] },
  });
  s = calcReducer(s, {
    type: A.SET_CPLX_FIELD,
    payload: { field: 'ignored_validations', value: ['a'] },
  });
  assert.deepEqual(s.cplxState.ignored_validations, ['a']);
});

test('Standard: ignored_validations also persists on stdState', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'ignored_validations', value: ['hdr-moq'] },
  });
  assert.deepEqual(s.stdState.ignored_validations, ['hdr-moq']);
});
