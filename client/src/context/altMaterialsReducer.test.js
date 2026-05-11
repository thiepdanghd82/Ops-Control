// @ts-check
/**
 * Reducer regression for alt-materials feature (Sprint S-ALT-MAT, PR #A).
 *
 * Locks in the contract for:
 *   - SET_MATERIAL_FIELD / ADD_MATERIAL_ROW / REMOVE_MATERIAL_ROW now
 *     route writes to the active set (materials_main or materials_alt)
 *     based on stdState.materials_active. The legacy state.materials
 *     field is kept as a mirror of the active set so existing readers
 *     (calcAll, validators, CalcHeader, ink base-mat lookups) keep
 *     working without callsite changes.
 *   - SET_MATERIALS_ACTIVE swaps the discriminator + remirrors materials.
 *   - COPY_MATERIALS deep-clones source → dest, syncs mirror if dest
 *     is active, and attaches an ephemeral _alt_materials_op signal
 *     the server consumes for MATERIALS_COPY audit on next save.
 *   - Deep clone — mutating a row in the destination set after copy
 *     MUST NOT bleed into the source set (spec §2.1).
 *
 * Runner: node --test src/context/altMaterialsReducer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

function stdState(s) {
  return s.stdState;
}

test('alt-materials: createInitialState seeds materials_main + empty alt + active=main + mirror', () => {
  const s = createInitialState();
  const st = stdState(s);
  assert.ok(Array.isArray(st.materials_main), 'materials_main array');
  assert.ok(st.materials_main.length > 0, 'main has seed rows');
  assert.deepEqual(st.materials_alt, [], 'alt empty');
  assert.equal(st.materials_active, 'main');
  // Mirror points at active set. We compare via length+code to avoid
  // reference brittleness — createStdState may seed _mid uniquely per
  // array, but the row shape must match.
  assert.equal(st.materials.length, st.materials_main.length);
});

test('alt-materials: SET_MATERIAL_FIELD with active=main writes to materials_main + mirror', () => {
  const s = createInitialState();
  const after = calcReducer(s, {
    type: A.SET_MATERIAL_FIELD,
    payload: { idx: 0, field: 'code', value: 'M001' },
  });
  assert.equal(stdState(after).materials_main[0].code, 'M001');
  assert.equal(stdState(after).materials[0].code, 'M001', 'mirror in sync');
  assert.equal(stdState(after).materials_active, 'main');
  assert.equal(stdState(after).materials_alt.length, 0, 'alt untouched');
});

test('alt-materials: SET_MATERIALS_ACTIVE switches discriminator + remirrors', () => {
  const s = createInitialState();
  // Seed alt with one row so we can verify the mirror swap.
  const seeded = calcReducer(s, {
    type: A.COPY_MATERIALS,
    payload: { direction: 'main_to_alt' },
  });
  const switched = calcReducer(seeded, {
    type: A.SET_MATERIALS_ACTIVE,
    payload: { value: 'alt' },
  });
  assert.equal(stdState(switched).materials_active, 'alt');
  assert.equal(
    stdState(switched).materials.length,
    stdState(switched).materials_alt.length,
    'mirror swaps to alt'
  );
  // Switch back.
  const back = calcReducer(switched, {
    type: A.SET_MATERIALS_ACTIVE,
    payload: { value: 'main' },
  });
  assert.equal(stdState(back).materials_active, 'main');
  assert.equal(stdState(back).materials.length, stdState(back).materials_main.length);
});

test('alt-materials: SET_MATERIAL_FIELD with active=alt writes to materials_alt, not _main', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.COPY_MATERIALS, payload: { direction: 'main_to_alt' } });
  s = calcReducer(s, { type: A.SET_MATERIALS_ACTIVE, payload: { value: 'alt' } });
  const mainBefore = stdState(s)
    .materials_main.map((m) => m.code)
    .join('|');
  const after = calcReducer(s, {
    type: A.SET_MATERIAL_FIELD,
    payload: { idx: 0, field: 'code', value: 'ALT-EDIT' },
  });
  assert.equal(stdState(after).materials_alt[0].code, 'ALT-EDIT');
  assert.equal(stdState(after).materials[0].code, 'ALT-EDIT', 'mirror in sync');
  // Main set unchanged — critical invariant per spec ("KHÔNG để edit alt
  // materials ghi đè main").
  const mainAfter = stdState(after)
    .materials_main.map((m) => m.code)
    .join('|');
  assert.equal(mainAfter, mainBefore);
});

test('alt-materials: COPY_MATERIALS main_to_alt deep-clones rows (no shared refs)', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.SET_MATERIAL_FIELD,
    payload: { idx: 0, field: 'code', value: 'M001' },
  });
  s = calcReducer(s, { type: A.COPY_MATERIALS, payload: { direction: 'main_to_alt' } });
  const st = stdState(s);
  assert.equal(st.materials_alt.length, st.materials_main.length);
  assert.equal(st.materials_alt[0].code, 'M001');
  // Reference inequality — alt row MUST be a separate object so mutating
  // it doesn't bleed back into main.
  assert.notEqual(st.materials_alt[0], st.materials_main[0]);
  // Sanity: mutate alt[0] in a follow-up dispatch, main[0] stays put.
  const next = calcReducer(
    { ...s, stdState: { ...st, materials_active: 'alt', materials: st.materials_alt } },
    { type: A.SET_MATERIAL_FIELD, payload: { idx: 0, field: 'code', value: 'MUTATED' } }
  );
  assert.equal(stdState(next).materials_main[0].code, 'M001', 'main unaffected');
  assert.equal(stdState(next).materials_alt[0].code, 'MUTATED');
});

test('alt-materials: COPY_MATERIALS emits _alt_materials_op signal for server audit', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.COPY_MATERIALS, payload: { direction: 'main_to_alt' } });
  const op = stdState(s)._alt_materials_op;
  assert.ok(op, 'signal present');
  assert.equal(op.type, 'copy');
  assert.equal(op.direction, 'main_to_alt');
  assert.equal(op.source_count, stdState(s).materials_main.length);
  assert.equal(op.dest_count_before, 0, 'alt was empty pre-copy');
  assert.ok(typeof op.ts === 'number');
});

test('alt-materials: COPY_MATERIALS rejects invalid direction (no-op)', () => {
  const s = createInitialState();
  const result = calcReducer(s, {
    type: A.COPY_MATERIALS,
    payload: { direction: 'banana' },
  });
  // No-op when direction is unknown — state must be returned unchanged.
  assert.equal(result, s);
});

test('alt-materials: ADD_MATERIAL_ROW with active=alt grows alt only', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.SET_MATERIALS_ACTIVE, payload: { value: 'alt' } });
  const mainLenBefore = stdState(s).materials_main.length;
  const altLenBefore = stdState(s).materials_alt.length;
  const after = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  assert.equal(stdState(after).materials_main.length, mainLenBefore, 'main untouched');
  assert.equal(stdState(after).materials_alt.length, altLenBefore + 1, 'alt grew by 1');
  assert.equal(
    stdState(after).materials.length,
    stdState(after).materials_alt.length,
    'mirror tracks alt'
  );
});

test('alt-materials: REMOVE_MATERIAL_ROW with active=alt shrinks alt only', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.COPY_MATERIALS, payload: { direction: 'main_to_alt' } });
  s = calcReducer(s, { type: A.SET_MATERIALS_ACTIVE, payload: { value: 'alt' } });
  const mainLenBefore = stdState(s).materials_main.length;
  const altLenBefore = stdState(s).materials_alt.length;
  const after = calcReducer(s, { type: A.REMOVE_MATERIAL_ROW, payload: { idx: 0 } });
  assert.equal(stdState(after).materials_main.length, mainLenBefore, 'main untouched');
  assert.equal(stdState(after).materials_alt.length, altLenBefore - 1);
});

test('alt-materials: switching to same active is a no-op (reference equality)', () => {
  const s = createInitialState();
  const after = calcReducer(s, { type: A.SET_MATERIALS_ACTIVE, payload: { value: 'main' } });
  assert.equal(after, s, 'no churn when switching to current active');
});

// ─── PR #B — Per-subproduct alt-materials (Sprint S-ALT-MAT) ──────────
// Same contract as Std actions above but scoped to a single subproduct.
// Each SP carries its own materials_main / materials_alt / materials_active
// plus the legacy sp.materials mirror. Reducer enforces the mirror
// invariant on every per-SP write so aggregateComplex + applyCplxTierToSp
// (which still read sp.materials directly) keep producing correct output.

function cplxState(s) {
  return s.cplxState;
}

test('alt-materials SP: createCplxState seeds each subproduct with main + empty alt + active=main + mirror', () => {
  const s = createInitialState();
  const cs = cplxState(s);
  assert.ok(Array.isArray(cs.subproducts));
  assert.ok(cs.subproducts.length > 0);
  const sp = cs.subproducts[0];
  assert.ok(Array.isArray(sp.materials_main), 'sp.materials_main is an array');
  assert.deepEqual(sp.materials_alt, [], 'sp.materials_alt empty');
  assert.equal(sp.materials_active, 'main');
  assert.equal(sp.materials.length, sp.materials_main.length, 'mirror matches active set');
});

test('alt-materials SP: SET_SP_MATERIAL_FIELD with active=main writes to sp.materials_main + mirror', () => {
  const s = createInitialState();
  const after = calcReducer(s, {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'code', value: 'SP-M001' },
  });
  const sp = cplxState(after).subproducts[0];
  assert.equal(sp.materials_main[0].code, 'SP-M001');
  assert.equal(sp.materials[0].code, 'SP-M001', 'mirror in sync');
  assert.equal(sp.materials_active, 'main');
  assert.equal(sp.materials_alt.length, 0, 'alt untouched');
});

test('alt-materials SP: SET_SP_MATERIALS_ACTIVE switches discriminator + remirrors per-SP', () => {
  let s = createInitialState();
  // Seed SP[0] alt via copy so toggle has something to swap to.
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  const switched = calcReducer(s, {
    type: A.SET_SP_MATERIALS_ACTIVE,
    payload: { spIdx: 0, value: 'alt' },
  });
  const sp = cplxState(switched).subproducts[0];
  assert.equal(sp.materials_active, 'alt');
  assert.equal(sp.materials.length, sp.materials_alt.length, 'mirror swaps to alt');
});

test('alt-materials SP: SET_SP_MATERIAL_FIELD with active=alt writes to materials_alt, not _main', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  s = calcReducer(s, { type: A.SET_SP_MATERIALS_ACTIVE, payload: { spIdx: 0, value: 'alt' } });
  const mainBefore = cplxState(s)
    .subproducts[0].materials_main.map((m) => m.code)
    .join('|');
  const after = calcReducer(s, {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'code', value: 'SP-ALT-EDIT' },
  });
  const sp = cplxState(after).subproducts[0];
  assert.equal(sp.materials_alt[0].code, 'SP-ALT-EDIT');
  assert.equal(sp.materials[0].code, 'SP-ALT-EDIT', 'mirror in sync');
  // Main set unchanged — critical invariant per spec.
  const mainAfter = sp.materials_main.map((m) => m.code).join('|');
  assert.equal(mainAfter, mainBefore);
});

test('alt-materials SP: COPY_SP_MATERIALS deep-clones rows (no shared refs)', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.SET_SP_MATERIAL_FIELD,
    payload: { spIdx: 0, idx: 0, field: 'code', value: 'SP-M001' },
  });
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  const sp = cplxState(s).subproducts[0];
  assert.equal(sp.materials_alt.length, sp.materials_main.length);
  assert.equal(sp.materials_alt[0].code, 'SP-M001');
  // Reference inequality — alt row MUST be a separate object so mutating
  // it doesn't bleed back into main.
  assert.notEqual(sp.materials_alt[0], sp.materials_main[0]);
});

test('alt-materials SP: COPY_SP_MATERIALS emits per-SP _alt_materials_op signal', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  const sp = cplxState(s).subproducts[0];
  const op = sp._alt_materials_op;
  assert.ok(op, 'signal present on the SP, not at cplxState top level');
  assert.equal(op.type, 'copy');
  assert.equal(op.direction, 'main_to_alt');
  assert.equal(op.source_count, sp.materials_main.length);
  assert.equal(op.dest_count_before, 0);
  assert.ok(typeof op.ts === 'number');
});

test('alt-materials SP: ADD_SP_MATERIAL_ROW with active=alt grows alt only', () => {
  let s = createInitialState();
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  s = calcReducer(s, { type: A.SET_SP_MATERIALS_ACTIVE, payload: { spIdx: 0, value: 'alt' } });
  const sp0 = cplxState(s).subproducts[0];
  const mainLenBefore = sp0.materials_main.length;
  const altLenBefore = sp0.materials_alt.length;
  const after = calcReducer(s, { type: A.ADD_SP_MATERIAL_ROW, payload: { spIdx: 0 } });
  const sp = cplxState(after).subproducts[0];
  assert.equal(sp.materials_main.length, mainLenBefore, 'main untouched');
  assert.equal(sp.materials_alt.length, altLenBefore + 1);
  assert.equal(sp.materials.length, sp.materials_alt.length, 'mirror tracks alt');
});

test('alt-materials SP: COPY_SP_MATERIALS rejects invalid direction (no-op)', () => {
  const s = createInitialState();
  const result = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'banana' },
  });
  assert.equal(result, s);
});

test('alt-materials SP: switching SP[0] alt does NOT affect SP[1] active', () => {
  // Per-SP isolation guarantee — each SP carries its own active flag.
  let s = createInitialState();
  // Make sure cplxState has at least 2 subproducts. createCplxState
  // typically seeds 1; add a second via ADD_SUBPRODUCT if needed.
  if (cplxState(s).subproducts.length < 2) {
    s = calcReducer(s, { type: A.ADD_SUBPRODUCT, payload: { code: 'SP-B' } });
  }
  s = calcReducer(s, {
    type: A.COPY_SP_MATERIALS,
    payload: { spIdx: 0, direction: 'main_to_alt' },
  });
  s = calcReducer(s, { type: A.SET_SP_MATERIALS_ACTIVE, payload: { spIdx: 0, value: 'alt' } });
  assert.equal(cplxState(s).subproducts[0].materials_active, 'alt');
  assert.equal(cplxState(s).subproducts[1].materials_active, 'main', 'SP[1] unaffected');
});
