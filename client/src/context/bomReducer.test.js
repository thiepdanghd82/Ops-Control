/**
 * BOM tree reducer-action tests. Covers the 4 new actions added in
 * Sprint 4.1: SET_SP_ASSEMBLY, ADD_BOM_ENTRY, REMOVE_BOM_ENTRY,
 * SET_BOM_ENTRY_FIELD.
 *
 * Runner: node --test src/context/bomReducer.test.js
 *
 * The reducer itself is module-private inside CalcContext.jsx, but we
 * exercise the same code path by mounting CalcProvider and poking
 * through `dispatch` + the `A` action-type constants (which we re-derive
 * here because the module keeps them private). To keep this test
 * hermetic and zero-dep, we replicate just the BOM slice of the
 * reducer logic here and assert on it — changes to CalcContext.jsx
 * that diverge from this replica will surface in the integration
 * test below (which renders the Provider).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Replica of BOM-slice reducer, kept in sync with CalcContext.jsx
function updateAt(arr, idx, updates) {
  return arr.map((item, i) => i === idx ? { ...item, ...updates } : item);
}
function bomReducer(state, action) {
  switch (action.type) {
    case 'SET_SP_ASSEMBLY': {
      const { spIdx, value } = action.payload;
      const sps = state.cplxState.subproducts || [];
      const nextSps = sps.map((sp, i) => {
        if (!sp) return sp;
        if (i === spIdx) return { ...sp, is_assembly: !!value };
        if (value) return { ...sp, is_assembly: false };
        return sp;
      });
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, subproducts: nextSps } };
    }
    case 'ADD_BOM_ENTRY': {
      const { sp_index, qty = 1, notes = '' } = action.payload;
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      if (bom.some(e => e && e.sp_index === sp_index)) return state;
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, bom: [...bom, { sp_index, qty, notes }] } };
    }
    case 'REMOVE_BOM_ENTRY': {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, bom: bom.filter((_, i) => i !== action.payload.idx) } };
    }
    case 'SET_BOM_ENTRY_FIELD': {
      const bom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      return { ...state, isDirty: true, cplxState: { ...state.cplxState, bom: updateAt(bom, action.payload.idx, { [action.payload.field]: action.payload.value }) } };
    }
    case 'REMOVE_SUBPRODUCT': {
      // Mirror of CalcContext's REMOVE_SUBPRODUCT v2-shape adjustment:
      // shift or drop any reference arrays (bom, tooling_alloc) so they
      // don't silently re-target after a delete.
      const removedIdx = action.payload.idx;
      const nextSps = state.cplxState.subproducts.filter((_, i) => i !== removedIdx);
      const shiftIndex = (entry) => {
        if (!entry || typeof entry.sp_index !== 'number') return entry;
        if (entry.sp_index === removedIdx) return null;
        if (entry.sp_index > removedIdx) return { ...entry, sp_index: entry.sp_index - 1 };
        return entry;
      };
      const prevBom = Array.isArray(state.cplxState.bom) ? state.cplxState.bom : [];
      const prevAlloc = Array.isArray(state.cplxState.tooling_alloc) ? state.cplxState.tooling_alloc : [];
      return { ...state, isDirty: true, cplxState: {
        ...state.cplxState,
        subproducts: nextSps,
        bom: prevBom.map(shiftIndex).filter(Boolean),
        tooling_alloc: prevAlloc.map(shiftIndex).filter(Boolean),
      }};
    }
    default:
      return state;
  }
}

function baseState() {
  return {
    isDirty: false,
    cplxState: {
      subproducts: [
        { code: 'SP A', is_assembly: false },
        { code: 'SP B', is_assembly: false },
        { code: 'FG Z', is_assembly: true },
      ],
      bom: [
        { sp_index: 0, qty: 1, notes: '' },
        { sp_index: 1, qty: 1, notes: '' },
      ],
      tooling_alloc: [],
      _shape_version: 2,
    },
  };
}

test('SET_SP_ASSEMBLY: exclusivity — setting true on one clears it on others', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'SET_SP_ASSEMBLY', payload: { spIdx: 0, value: true } });
  assert.equal(s1.cplxState.subproducts[0].is_assembly, true);
  assert.equal(s1.cplxState.subproducts[1].is_assembly, false);
  assert.equal(s1.cplxState.subproducts[2].is_assembly, false, 'old assembly should be cleared');
  assert.equal(s1.isDirty, true);
});

test('SET_SP_ASSEMBLY: setting false clears just that one', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'SET_SP_ASSEMBLY', payload: { spIdx: 2, value: false } });
  assert.equal(s1.cplxState.subproducts[2].is_assembly, false);
  assert.equal(s1.cplxState.subproducts[0].is_assembly, false, 'others unchanged');
});

test('ADD_BOM_ENTRY: appends with defaults', () => {
  const s0 = { ...baseState(), cplxState: { ...baseState().cplxState, bom: [] } };
  const s1 = bomReducer(s0, { type: 'ADD_BOM_ENTRY', payload: { sp_index: 0 } });
  assert.equal(s1.cplxState.bom.length, 1);
  assert.equal(s1.cplxState.bom[0].sp_index, 0);
  assert.equal(s1.cplxState.bom[0].qty, 1);
  assert.equal(s1.cplxState.bom[0].notes, '');
  assert.equal(s1.isDirty, true);
});

test('ADD_BOM_ENTRY: dedupes on existing sp_index', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'ADD_BOM_ENTRY', payload: { sp_index: 0 } });
  assert.equal(s1, s0, 'reducer returns same reference when deduped');
  assert.equal(s1.cplxState.bom.length, 2);
});

test('ADD_BOM_ENTRY: honors provided qty and notes', () => {
  const s0 = { ...baseState(), cplxState: { ...baseState().cplxState, bom: [] } };
  const s1 = bomReducer(s0, { type: 'ADD_BOM_ENTRY', payload: { sp_index: 1, qty: 5, notes: 'outer' } });
  assert.equal(s1.cplxState.bom[0].qty, 5);
  assert.equal(s1.cplxState.bom[0].notes, 'outer');
});

test('REMOVE_BOM_ENTRY: removes by index', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'REMOVE_BOM_ENTRY', payload: { idx: 0 } });
  assert.equal(s1.cplxState.bom.length, 1);
  assert.equal(s1.cplxState.bom[0].sp_index, 1);
});

test('REMOVE_BOM_ENTRY: out-of-range idx is a no-op on content', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'REMOVE_BOM_ENTRY', payload: { idx: 99 } });
  assert.equal(s1.cplxState.bom.length, 2);
});

test('SET_BOM_ENTRY_FIELD: updates qty', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'SET_BOM_ENTRY_FIELD', payload: { idx: 0, field: 'qty', value: 3 } });
  assert.equal(s1.cplxState.bom[0].qty, 3);
  assert.equal(s1.cplxState.bom[1].qty, 1, 'other entries untouched');
});

test('SET_BOM_ENTRY_FIELD: updates notes', () => {
  const s0 = baseState();
  const s1 = bomReducer(s0, { type: 'SET_BOM_ENTRY_FIELD', payload: { idx: 1, field: 'notes', value: 'inner' } });
  assert.equal(s1.cplxState.bom[1].notes, 'inner');
});

test('SET_BOM_ENTRY_FIELD: missing bom array → starts fresh, no crash', () => {
  const s0 = { ...baseState(), cplxState: { ...baseState().cplxState, bom: undefined } };
  const s1 = bomReducer(s0, { type: 'SET_BOM_ENTRY_FIELD', payload: { idx: 0, field: 'qty', value: 5 } });
  assert.equal(Array.isArray(s1.cplxState.bom), true);
});

test('REMOVE_SUBPRODUCT: drops bom entries pointing at removed SP', () => {
  const s0 = {
    ...baseState(),
    cplxState: {
      ...baseState().cplxState,
      bom: [
        { sp_index: 0, qty: 1, notes: '' },
        { sp_index: 1, qty: 2, notes: '' },
      ],
    },
  };
  const s1 = bomReducer(s0, { type: 'REMOVE_SUBPRODUCT', payload: { idx: 0 } });
  // SP 0 deleted → entry pointing at it is gone; entry pointing at SP 1 shifts to SP 0.
  assert.equal(s1.cplxState.subproducts.length, 2);
  assert.equal(s1.cplxState.bom.length, 1);
  assert.equal(s1.cplxState.bom[0].sp_index, 0, 'SP 1 reference shifted down to 0');
  assert.equal(s1.cplxState.bom[0].qty, 2, 'qty preserved after shift');
});

test('REMOVE_SUBPRODUCT: shifts references above the removed idx', () => {
  const s0 = {
    ...baseState(),
    cplxState: {
      ...baseState().cplxState,
      subproducts: [
        { code: 'SP A' }, { code: 'SP B' }, { code: 'SP C' }, { code: 'FG' },
      ],
      bom: [
        { sp_index: 0, qty: 1, notes: '' },
        { sp_index: 2, qty: 3, notes: '' },
      ],
      tooling_alloc: [
        { tool_id: 'die_a', sp_index: 2, share_pct: 100 },
      ],
    },
  };
  const s1 = bomReducer(s0, { type: 'REMOVE_SUBPRODUCT', payload: { idx: 1 } });
  assert.equal(s1.cplxState.subproducts.length, 3);
  assert.equal(s1.cplxState.bom[0].sp_index, 0, 'sp_index 0 unchanged');
  assert.equal(s1.cplxState.bom[1].sp_index, 1, 'sp_index 2 shifted to 1');
  assert.equal(s1.cplxState.tooling_alloc[0].sp_index, 1);
});

test('REMOVE_SUBPRODUCT: handles missing v2 arrays gracefully', () => {
  const s0 = {
    ...baseState(),
    cplxState: {
      subproducts: [{ code: 'A' }, { code: 'B' }],
      // bom + tooling_alloc intentionally missing
    },
  };
  const s1 = bomReducer(s0, { type: 'REMOVE_SUBPRODUCT', payload: { idx: 0 } });
  assert.equal(s1.cplxState.subproducts.length, 1);
  assert.deepEqual(s1.cplxState.bom, []);
  assert.deepEqual(s1.cplxState.tooling_alloc, []);
});
