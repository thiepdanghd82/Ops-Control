/**
 * Regression guard for SP-scope field reducer actions.
 *
 * Imports the REAL reducer + action types from calcReducer.js — not a
 * replica. Prior version of this file maintained a hand-written replica
 * that drifted from production code: the replica used the correct
 * {spIdx, idx} keys while SubProductRow.jsx and ComplexCalc.jsx shipped
 * with {spi, mi} keys. Tests passed but production crashed. Extracting
 * the reducer (Sprint 10) + importing it here closes that loophole.
 *
 * Covers both the happy-path (correct payload shape) and the legacy
 * broken shape that shipped to production. The negative tests lock in
 * the reducer contract: if someone "fixes" the reducer to accept the
 * old {spi, mi} keys without fixing the callers, this test fails.
 *
 * Also exercises REMOVE_SUBPRODUCT where the caller shipped a bare
 * number instead of {idx} — the reducer silently kept every SP.
 *
 * Runner: node --test src/context/spFieldReducer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

function makeState() {
  const s = createInitialState();
  // createCplxState gives us subproducts: [createSubProduct('SP A')].
  // Pre-seed the first SP with one material/ink/process row so the
  // field-setter actions have a target.
  const sp = s.cplxState.subproducts[0];
  assert.ok(sp, 'expected initial cplxState to have SP A');
  assert.ok(sp.materials?.length, 'expected SP A to have a default material row');
  assert.ok(sp.inks?.length, 'expected SP A to have a default ink row');
  assert.ok(sp.processes?.length, 'expected SP A to have a default process row');
  return s;
}

// ── Happy path — correct payload shape ──

test('SET_SP_FIELD {spIdx, field, value}: updates the SP layout field', () => {
  const s = calcReducer(makeState(), {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 0, field: 'part_width', value: 82 },
  });
  assert.equal(s.cplxState.subproducts[0].part_width, 82);
  assert.equal(s.isDirty, true);
});

test('SET_SP_MATERIAL_FIELD {spIdx, idx, field, value}: updates the target mat row', () => {
  const s = calcReducer(makeState(), {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'width', value: 100 },
  });
  assert.equal(s.cplxState.subproducts[0].materials[0].width, 100);
});

test('SET_SP_INK_FIELD {spIdx, idx, field, value}: updates the target ink row', () => {
  const s = calcReducer(makeState(), {
    type: A.SET_SP_INK_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'area_pct', value: 0.3 },
  });
  assert.equal(s.cplxState.subproducts[0].inks[0].area_pct, 0.3);
});

test('SET_SP_PROCESS_FIELD {spIdx, idx, field, value}: updates the target process row', () => {
  const s = calcReducer(makeState(), {
    type: A.SET_SP_PROCESS_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'speed', value: 25 },
  });
  assert.equal(s.cplxState.subproducts[0].processes[0].speed, 25);
});

// ── Negative guards — legacy broken shape must not be accidentally
// accepted if someone "fixes" the reducer without fixing the callers. ──

test('SET_SP_FIELD {spi, field, value}: legacy key is a silent no-op (contract guard)', () => {
  const before = makeState();
  const after = calcReducer(before, {
    type: A.SET_SP_FIELD,
    payload: { spi: 0, field: 'part_width', value: 82 },
  });
  assert.equal(
    after.cplxState.subproducts[0].part_width ?? 0,
    before.cplxState.subproducts[0].part_width ?? 0,
    'wrong key must not update state'
  );
});

test('SET_SP_MATERIAL_FIELD {spi, mi}: legacy key throws TypeError (contract guard)', () => {
  assert.throws(
    () =>
      calcReducer(makeState(), {
        type: A.SET_SP_MATERIAL_FIELD,
        payload: { spi: 0, mi: 0, field: 'width', value: 100 },
      }),
    /Cannot read properties of undefined/
  );
});

// ── REMOVE_SUBPRODUCT — caller shipped bare number instead of {idx}.
// Reducer read `payload.idx` on a number (undefined), then
// `filter(i => i !== undefined)` kept every SP. Silent bug. ──

test('REMOVE_SUBPRODUCT {idx: 1}: removes the target SP', () => {
  let s = makeState();
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'SP B' } });
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'FG Z' } });
  assert.equal(s.cplxState.subproducts.length, 3);
  const after = calcReducer(s, { type: A.REMOVE_SUBPRODUCT, payload: { idx: 1 } });
  assert.deepEqual(
    after.cplxState.subproducts.map((sp) => sp.code),
    ['SP A', 'FG Z']
  );
});

test('REMOVE_SUBPRODUCT bare number: legacy payload is a silent no-op (contract guard)', () => {
  let s = makeState();
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'SP B' } });
  const after = calcReducer(s, { type: A.REMOVE_SUBPRODUCT, payload: 1 });
  assert.equal(
    after.cplxState.subproducts.length,
    2,
    'bare-number payload must not remove anything'
  );
});

// ── Integration test — full Complex workflow exercised through the
// real reducer. Simulates: user opens Cplx, adds a second SP, edits
// SP A's layout, adds a material to SP A, edits that material, and
// finally removes SP A. The resulting state should reflect every
// single edit via the production dispatch contract. ──

test('Cplx workflow: add SP → edit layout → add material → edit material → remove SP', () => {
  let s = createInitialState();
  assert.equal(s.cplxState.subproducts.length, 1, 'starts with SP A');

  // 1. Add SP B
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'SP B' } });
  assert.deepEqual(
    s.cplxState.subproducts.map((sp) => sp.code),
    ['SP A', 'SP B']
  );

  // 2. Edit SP A layout (part_width + sheet_length)
  s = calcReducer(s, {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 0, field: 'part_width', value: 82 },
  });
  s = calcReducer(s, {
    type: A.SET_SP_FIELD,
    payload: { spIdx: 0, field: 'sheet_length', value: 52 },
  });
  assert.equal(s.cplxState.subproducts[0].part_width, 82);
  assert.equal(s.cplxState.subproducts[0].sheet_length, 52);

  // 3. Add a second material row to SP A
  const matsBefore = s.cplxState.subproducts[0].materials.length;
  s = calcReducer(s, { type: A.ADD_SP_MATERIAL_ROW, payload: { spIdx: 0 } });
  assert.equal(s.cplxState.subproducts[0].materials.length, matsBefore + 1);

  // 4. Edit the newly-added material (last one)
  const newMatIdx = matsBefore; // 0-indexed
  s = calcReducer(s, {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: newMatIdx, field: 'code', value: 'M001' },
  });
  s = calcReducer(s, {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: newMatIdx, field: 'width', value: 200 },
  });
  assert.equal(s.cplxState.subproducts[0].materials[newMatIdx].code, 'M001');
  assert.equal(s.cplxState.subproducts[0].materials[newMatIdx].width, 200);

  // 5. Remove SP A — SP B shifts to index 0
  s = calcReducer(s, { type: A.REMOVE_SUBPRODUCT, payload: { idx: 0 } });
  assert.equal(s.cplxState.subproducts.length, 1);
  assert.equal(s.cplxState.subproducts[0].code, 'SP B');

  // 6. Final isDirty should be true (we made mutating edits)
  assert.equal(s.isDirty, true);
});

test('Cplx workflow: BOM entries survive SP removal with index shift', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'SP B' } });
  s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'FG Z' } });
  // Point BOM at SP A (0), SP B (1), FG Z (2).
  s = calcReducer(s, { type: A.ADD_BOM_ENTRY, payload: { sp_index: 0, qty: 1 } });
  s = calcReducer(s, { type: A.ADD_BOM_ENTRY, payload: { sp_index: 1, qty: 2 } });
  s = calcReducer(s, { type: A.ADD_BOM_ENTRY, payload: { sp_index: 2, qty: 3 } });
  assert.equal(s.cplxState.bom.length, 3);

  // Remove SP B (idx=1). BOM entry pointing at 1 drops; entry pointing at 2
  // decrements to 1. Entry pointing at 0 is unchanged.
  s = calcReducer(s, { type: A.REMOVE_SUBPRODUCT, payload: { idx: 1 } });
  const shifted = s.cplxState.bom.map((e) => ({ sp_index: e.sp_index, qty: e.qty }));
  assert.deepEqual(shifted, [
    { sp_index: 0, qty: 1 }, // SP A
    { sp_index: 1, qty: 3 }, // was FG Z at 2, now at 1
  ]);
});
