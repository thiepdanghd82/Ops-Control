/**
 * Multi-drawing reducer routing (Sprint S-MULTI-DRAW).
 *
 * SET_STD_DRAWINGS / SET_SP_DRAWINGS atomically write
 *   [kind]_files + [kind]_active + the singular [kind]_file mirror.
 * An OMITTED files/active falls back to CURRENT state so the append
 * (files-only) → set-active (active-only) sequence never round-trips a
 * stale list.
 *
 *   node --test src/context/calcReducer.drawings.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer, CALC_ACTIONS as A } from './calcReducer.js';

const F = (n) => ({ name: `${n}.png`, type: 'image/png', dataUrl: `data:image/png;base64,${n}` });

function initialState() {
  return {
    isDirty: false,
    stdState: {
      _schema_version: 3,
      layout_files: [],
      layout_active: 0,
      layout_file: null,
      customer_drw_files: [],
      customer_drw_active: 0,
      customer_drw_file: null,
    },
    cplxState: {
      _shape_version: 4,
      subproducts: [
        { code: 'SP A', layout_files: [], layout_active: 0, layout_file: null },
        { code: 'SP B', layout_files: [], layout_active: 0, layout_file: null },
      ],
    },
  };
}

// ── Std ───────────────────────────────────────────────────────────
test('SET_STD_DRAWINGS append (files-only) keeps active, mirrors singular', () => {
  let st = initialState();
  st = calcReducer(st, { type: A.SET_STD_DRAWINGS, payload: { kind: 'layout', files: [F('a')] } });
  assert.equal(st.stdState.layout_files.length, 1);
  assert.equal(st.stdState.layout_active, 0);
  assert.equal(st.stdState.layout_file.name, 'a.png', 'singular mirrors active');
  assert.equal(st.isDirty, true);
});

test('SET_STD_DRAWINGS append-then-set-active does NOT round-trip a stale list', () => {
  let st = initialState();
  // simulate the component: onFilesChange([a,b]) then onActiveChange(1)
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'layout', files: [F('a'), F('b')] },
  });
  st = calcReducer(st, { type: A.SET_STD_DRAWINGS, payload: { kind: 'layout', active: 1 } });
  assert.equal(st.stdState.layout_files.length, 2, 'list preserved (active-only omitted files)');
  assert.equal(st.stdState.layout_active, 1);
  assert.equal(st.stdState.layout_file.name, 'b.png', 'mirror follows new active');
});

test('SET_STD_DRAWINGS set-active clamps out-of-range', () => {
  let st = initialState();
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'layout', files: [F('a'), F('b')] },
  });
  st = calcReducer(st, { type: A.SET_STD_DRAWINGS, payload: { kind: 'layout', active: 9 } });
  assert.equal(st.stdState.layout_active, 1, 'clamped to last');
  assert.equal(st.stdState.layout_file.name, 'b.png');
});

test('SET_STD_DRAWINGS remove-active re-points to first remaining', () => {
  let st = initialState();
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'layout', files: [F('a'), F('b'), F('c')], active: 1 },
  });
  // remove active (b): component computes files=[a,c], active=0
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'layout', files: [F('a'), F('c')] },
  });
  st = calcReducer(st, { type: A.SET_STD_DRAWINGS, payload: { kind: 'layout', active: 0 } });
  assert.deepEqual(
    st.stdState.layout_files.map((f) => f.name),
    ['a.png', 'c.png']
  );
  assert.equal(st.stdState.layout_file.name, 'a.png');
});

test('SET_STD_DRAWINGS customer_drw is independent of layout', () => {
  let st = initialState();
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'layout', files: [F('lay')] },
  });
  st = calcReducer(st, {
    type: A.SET_STD_DRAWINGS,
    payload: { kind: 'customer_drw', files: [F('cust')] },
  });
  assert.equal(st.stdState.layout_file.name, 'lay.png');
  assert.equal(st.stdState.customer_drw_file.name, 'cust.png');
  assert.equal(st.stdState.layout_files.length, 1);
  assert.equal(st.stdState.customer_drw_files.length, 1);
});

// ── Cpx per-SP ────────────────────────────────────────────────────
test('SET_SP_DRAWINGS writes the right subproduct only', () => {
  let st = initialState();
  st = calcReducer(st, {
    type: A.SET_SP_DRAWINGS,
    payload: { spIdx: 1, kind: 'layout', files: [F('spb')] },
  });
  assert.equal(st.cplxState.subproducts[1].layout_file.name, 'spb.png');
  assert.equal(st.cplxState.subproducts[1].layout_files.length, 1);
  assert.equal(st.cplxState.subproducts[0].layout_file, null, 'sibling untouched');
  assert.equal(st.cplxState.subproducts[0].layout_files.length, 0);
});

test('SET_SP_DRAWINGS append-then-set-active per SP (no stale list)', () => {
  let st = initialState();
  st = calcReducer(st, {
    type: A.SET_SP_DRAWINGS,
    payload: { spIdx: 0, kind: 'layout', files: [F('a'), F('b')] },
  });
  st = calcReducer(st, {
    type: A.SET_SP_DRAWINGS,
    payload: { spIdx: 0, kind: 'layout', active: 1 },
  });
  assert.equal(st.cplxState.subproducts[0].layout_files.length, 2);
  assert.equal(st.cplxState.subproducts[0].layout_active, 1);
  assert.equal(st.cplxState.subproducts[0].layout_file.name, 'b.png');
});

test('unknown kind is a no-op (returns same state ref)', () => {
  const st = initialState();
  const next = calcReducer(st, { type: A.SET_STD_DRAWINGS, payload: { kind: 'bogus', files: [] } });
  assert.equal(next, st);
});
