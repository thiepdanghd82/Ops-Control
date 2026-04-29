/**
 * withHistory / UNDO-REDO — unit tests. No React, pure reducer logic.
 *   node --test src/context/calcHistory.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  withHistory,
  initialHistory,
  canUndo,
  canRedo,
  HISTORY_ACTIONS,
} from './calcHistory.js';

// Toy reducer: { v } where any SET bumps v to action.payload.
function baseReducer(state, action) {
  switch (action.type) {
    case 'SET':        return { v: action.payload };
    case 'LOAD_QUOTE': return { v: action.payload };   // boundary
    case 'RESET_STD':  return { v: 0 };                // boundary
    case 'NOOP':       return state;                   // triggers no-push path
    default:           return state;
  }
}

test('initial history has empty past + future', () => {
  const h = initialHistory({ v: 0 });
  assert.deepEqual(h.past, []);
  assert.deepEqual(h.future, []);
  assert.deepEqual(h.present, { v: 0 });
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});

test('SET pushes to past + clears future', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  assert.equal(h.present.v, 1);
  assert.deepEqual(h.past.map(p => p.v), [0]);
  assert.equal(canUndo(h), true);

  // Simulate a stale redo stack — then SET should clear it.
  h = { ...h, future: [{ v: 99 }] };
  h = r(h, { type: 'SET', payload: 2 });
  assert.deepEqual(h.future, [], 'future cleared on new action');
});

test('UNDO rewinds present, moves undone state to future', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  h = r(h, { type: 'SET', payload: 2 });
  h = r(h, { type: 'SET', payload: 3 });

  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  assert.equal(h.present.v, 2);
  assert.deepEqual(h.future.map(f => f.v), [3]);

  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  assert.equal(h.present.v, 1);

  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  assert.equal(h.present.v, 0);

  // No further undo available — should be a no-op.
  const before = h;
  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  assert.equal(h, before, 'no-op returns same reference');
});

test('REDO replays future; stops at end', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  h = r(h, { type: 'SET', payload: 2 });
  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  h = r(h, { type: HISTORY_ACTIONS.UNDO });

  assert.equal(canRedo(h), true);
  h = r(h, { type: HISTORY_ACTIONS.REDO });
  assert.equal(h.present.v, 1);
  h = r(h, { type: HISTORY_ACTIONS.REDO });
  assert.equal(h.present.v, 2);

  const before = h;
  h = r(h, { type: HISTORY_ACTIONS.REDO });
  assert.equal(h, before, 'redo at end returns same reference');
});

test('LOAD_QUOTE clears history (boundary)', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  h = r(h, { type: 'SET', payload: 2 });
  h = r(h, { type: 'LOAD_QUOTE', payload: 99 });
  assert.equal(h.present.v, 99);
  assert.deepEqual(h.past, []);
  assert.deepEqual(h.future, []);
  assert.equal(canUndo(h), false);
});

test('RESET_STD clears history (boundary)', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 5 });
  h = r(h, { type: 'SET', payload: 10 });
  h = r(h, { type: 'RESET_STD' });
  assert.equal(h.present.v, 0);
  assert.deepEqual(h.past, []);
});

test('NOOP (no state change) does not push history', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  const before = h;
  h = r(h, { type: 'NOOP' });
  assert.equal(h, before, 'no-op returns same reference');
});

test('history cap: past trimmed to limit', () => {
  const r = withHistory(baseReducer, { limit: 3 });
  let h = initialHistory({ v: 0 });
  for (let i = 1; i <= 10; i++) {
    h = r(h, { type: 'SET', payload: i });
  }
  // Past should only contain the last 3 states BEFORE present (v=10).
  // Those are v=7, v=8, v=9 (present is v=10).
  assert.equal(h.past.length, 3);
  assert.deepEqual(h.past.map(p => p.v), [7, 8, 9]);
});

test('HISTORY_RESET wipes past + future without changing present', () => {
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  h = r(h, { type: 'SET', payload: 2 });
  h = r(h, { type: HISTORY_ACTIONS.UNDO });
  assert.ok(canUndo(h) && canRedo(h));
  h = r(h, { type: HISTORY_ACTIONS.RESET });
  assert.equal(h.present.v, 1);
  assert.deepEqual(h.past, []);
  assert.deepEqual(h.future, []);
});

test('Interleaved SET + UNDO + SET drops the redo branch', () => {
  // Standard undo-branch semantics: if you SET after UNDO, the redo
  // chain is abandoned (future cleared).
  const r = withHistory(baseReducer);
  let h = initialHistory({ v: 0 });
  h = r(h, { type: 'SET', payload: 1 });
  h = r(h, { type: 'SET', payload: 2 });
  h = r(h, { type: HISTORY_ACTIONS.UNDO });   // present=1, future=[2]
  h = r(h, { type: 'SET', payload: 99 });     // new branch: past=[0,1], present=99, future=[]
  assert.equal(h.present.v, 99);
  assert.deepEqual(h.past.map(p => p.v), [0, 1]);
  assert.deepEqual(h.future, []);
});
