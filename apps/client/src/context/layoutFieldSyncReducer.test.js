/**
 * Reducer-level integration tests for FIX-32 lazy print → cut mirror.
 *
 * Verifies the wiring through SET_STD_FIELD + SET_SP_FIELD goes through
 * applyPrintToCutSync correctly. Pure-function unit tests for
 * applyPrintToCutSync itself live in
 * client/src/services/layoutFieldSync.test.js — these tests guard the
 * call-site contract.
 *
 * Runner: node --test src/context/layoutFieldSyncReducer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

test('FIX-32: SET_STD_FIELD print_part_width on fresh Std state fills both fields', () => {
  const s = createInitialState();
  assert.equal(s.stdState.part_width, 0, 'precondition: canonical empty');
  assert.equal(s.stdState.print_part_width, 0, 'precondition: print empty');

  const next = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'print_part_width', value: 462 },
  });
  assert.equal(next.stdState.print_part_width, 462);
  assert.equal(next.stdState.part_width, 462, 'auto-mirror to canonical');
});

test('FIX-32: SET_STD_FIELD print_part_length_md on fresh Std state fills both fields', () => {
  const s = createInitialState();
  const next = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'print_part_length_md', value: 135 },
  });
  assert.equal(next.stdState.print_part_length_md, 135);
  assert.equal(next.stdState.part_length_md, 135);
});

test('FIX-32: SET_STD_FIELD print_part_width does NOT clobber an existing canonical part_width', () => {
  const s = createInitialState();
  s.stdState.part_width = 80;
  const next = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'print_part_width', value: 462 },
  });
  assert.equal(next.stdState.print_part_width, 462);
  assert.equal(next.stdState.part_width, 80, 'canonical preserved for divergence banner');
});

test('FIX-32: SET_STD_FIELD on an unrelated field does not touch part_*', () => {
  const s = createInitialState();
  const next = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'web_width_td', value: 300 },
  });
  assert.equal(next.stdState.web_width_td, 300);
  assert.equal(next.stdState.part_width, 0);
});

test('FIX-32: SET_SP_FIELD print_part_width on a Cpx SP mirrors per-subproduct', () => {
  const s = createInitialState();
  const sp = s.cplxState.subproducts[0];
  assert.ok(sp);
  assert.equal(Number(sp.part_width) || 0, 0);

  const next = calcReducer(s, {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 0, field: 'print_part_width', value: 250 },
  });
  const spNext = next.cplxState.subproducts[0];
  assert.equal(spNext.print_part_width, 250);
  assert.equal(spNext.part_width, 250);
});

test('FIX-32: SET_SP_FIELD on SP-B does not leak into SP-A', () => {
  const s = createInitialState();
  // createCplxState seeds 1 SP — add a second via reducer for the test.
  let st = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: {} });
  assert.ok(st.cplxState.subproducts.length >= 2);
  st = calcReducer(st, {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 1, field: 'print_part_width', value: 99 },
  });
  assert.equal(st.cplxState.subproducts[1].print_part_width, 99);
  assert.equal(st.cplxState.subproducts[1].part_width, 99);
  assert.equal(Number(st.cplxState.subproducts[0].print_part_width) || 0, 0);
  assert.equal(Number(st.cplxState.subproducts[0].part_width) || 0, 0);
});

test('FIX-32: SET_SP_FIELD print_part_length_md preserves an existing canonical part_length_md', () => {
  const s = createInitialState();
  s.cplxState.subproducts[0].part_length_md = 50;
  const next = calcReducer(s, {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 0, field: 'print_part_length_md', value: 135 },
  });
  const spNext = next.cplxState.subproducts[0];
  assert.equal(spNext.print_part_length_md, 135);
  assert.equal(spNext.part_length_md, 50);
});

test('FIX-32: SET_STD_FIELD marks isDirty true on print → cut auto-mirror', () => {
  const s = createInitialState();
  assert.equal(s.isDirty, false);
  const next = calcReducer(s, {
    type: A.SET_STD_FIELD,
    payload: { field: 'print_part_width', value: 462 },
  });
  assert.equal(next.isDirty, true);
});
