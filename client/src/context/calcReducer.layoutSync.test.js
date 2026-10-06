/**
 * The reducer keeps each process row's Layout on the Layout tab's cavity
 * (2026-10-06). It runs after every change, so a Layout tab edit moves the
 * Processes grid while that tab is unmounted (Lesson 45), and a quote saved
 * before the sync opens with the numbers it was saved with.
 *
 *   node --test src/context/calcReducer.layoutSync.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer, createInitialState, CALC_ACTIONS as A } from './calcReducer.js';

// GH68-56552A: 2 across × 19 in MD on one web → Print Total/Shot 38;
// Cutter 1 = RDC with a blank cavity cell → Cut Total/Shot 38.
const LAYOUT = {
  parts_web_across: 2,
  parts_in_md: 19,
  num_webs: 1,
  slit_after_print: false,
  cutter_types: ['RDC', '', '', ''],
  cutter_cavities: ['', '', '', ''],
};

const procs = () => [
  { process_type: 'Print', workcenter: 'Flexo(Gallus4C)', tool_type: 'Pressplate', layout: 38 },
  { process_type: 'Die_Cut', workcenter: 'RDC350-12', tool_type: 'RDC', layout: 38 },
  { process_type: 'Inspection', workcenter: 'FQC', tool_type: '', layout: 0 },
  {
    process_type: 'Print',
    workcenter: 'SS(Sheet)',
    tool_type: 'Stencil',
    layout: 16,
    layout_ovr: true,
  },
];

function stdStart() {
  const s = createInitialState();
  return { ...s, stdState: { ...s.stdState, ...LAYOUT, processes: procs() } };
}

const run = (state, type, payload) => calcReducer(state, { type, payload });
const layouts = (state) => state.stdState.processes.map((p) => p.layout);

// ── Std: a Layout tab edit moves the rows that follow it ──

test('Std: changing Parts in MD moves the Print row and the RDC row, not the others', () => {
  const next = run(stdStart(), A.SET_STD_FIELD, { field: 'parts_in_md', value: 20 });
  assert.deepEqual(layouts(next), [40, 40, 0, 16]);
});

test('Std: typing Cutter cavities 1 moves only the row whose tool is that cutter', () => {
  const next = run(stdStart(), A.SET_STD_FIELD, {
    field: 'cutter_cavities',
    value: ['24', '', '', ''],
  });
  assert.deepEqual(layouts(next), [38, 24, 0, 16]);
});

test('Std: a field that is not about the layout leaves the process rows untouched', () => {
  const start = stdStart();
  const next = run(start, A.SET_STD_FIELD, { field: 'moq', value: 5000 });
  assert.equal(next.stdState.processes, start.stdState.processes);
});

// ── Std: what the operator does in the grid ──

test('Std: typing another number overrides the Layout tab and survives its edits', () => {
  let s = run(stdStart(), A.SET_PROCESS_FIELD, { idx: 0, field: 'layout', value: 12 });
  assert.equal(s.stdState.processes[0].layout_ovr, true);
  s = run(s, A.SET_STD_FIELD, { field: 'parts_in_md', value: 20 });
  assert.equal(s.stdState.processes[0].layout, 12);
});

test('Std: typing the cavity itself keeps the row following', () => {
  const s = run(stdStart(), A.SET_PROCESS_FIELD, { idx: 0, field: 'layout', value: 38 });
  assert.equal(s.stdState.processes[0].layout_ovr, false);
});

test('Std: ↻ (layout_ovr false) takes the Layout tab number back', () => {
  const s = run(stdStart(), A.SET_PROCESS_FIELD, { idx: 3, field: 'layout_ovr', value: false });
  assert.equal(s.stdState.processes[3].layout, 38);
});

test('Std: picking a tool type drops the override and follows that tool', () => {
  const start = stdStart();
  start.stdState.processes[1] = { ...start.stdState.processes[1], layout: 36, layout_ovr: true };
  const next = run(start, A.SET_PROCESS_FIELD, { idx: 1, field: 'tool_type', value: 'RDC' });
  assert.equal(next.stdState.processes[1].layout_ovr, false);
  assert.equal(next.stdState.processes[1].layout, 38);
});

test('Std: setting a new row to Print fills its Layout from the Layout tab', () => {
  let s = run(stdStart(), A.ADD_PROCESS_ROW, {});
  const idx = s.stdState.processes.length - 1;
  s = run(s, A.SET_PROCESS_FIELD, { idx, field: 'process_type', value: 'Print' });
  assert.equal(s.stdState.processes[idx].layout, 38);
});

// ── Std: a quote saved before the sync keeps its numbers ──

test('Std: opening a quote keeps a saved Layout that differs, as an override', () => {
  const saved = {
    ...LAYOUT,
    processes: procs().map((p, i) => (i === 1 ? { ...p, layout: 36 } : p)),
  };
  saved.processes[3] = { ...saved.processes[3], layout_ovr: undefined };
  const s = run(createInitialState(), A.LOAD_QUOTE, { quoteType: 'std', state: saved, id: 1 });
  assert.deepEqual(layouts(s), [38, 36, 0, 16]);
  assert.equal(s.stdState.processes[1].layout_ovr, true);
  assert.equal(s.stdState.processes[3].layout_ovr, true);
  assert.equal(s.stdState.processes[0].layout_ovr, undefined);
  assert.equal(s.isDirty, false);
});

test('Std: a copied quote keeps its saved Layout numbers too', () => {
  const saved = {
    ...LAYOUT,
    processes: procs().map((p, i) => (i === 1 ? { ...p, layout: 36 } : p)),
  };
  const s = run(createInitialState(), A.LOAD_QUOTE, {
    quoteType: 'std',
    state: saved,
    action: 'copy',
  });
  assert.equal(s.stdState.processes[1].layout, 36);
});

// ── Cpx: the same rule per subproduct, written to cplxState (MES-3-FIX-53) ──

function cpxStart() {
  const s = createInitialState();
  const sp = (procsList) => ({
    ...LAYOUT,
    cutter_types: [],
    cutter_cavities: [],
    processes: procsList,
  });
  return {
    ...s,
    cplxState: {
      ...s.cplxState,
      subproducts: [
        sp([{ process_type: 'Print', tool_type: '', layout: 38 }]),
        sp([{ process_type: 'Print', tool_type: '', layout: 38 }]),
      ],
    },
  };
}

test('Cpx: a subproduct Layout edit moves that subproduct only, in cplxState', () => {
  const start = cpxStart();
  const next = run(start, A.SET_SP_FIELD, { spIdx: 0, field: 'parts_in_md', value: 10 });
  assert.equal(next.cplxState.subproducts[0].processes[0].layout, 20);
  assert.equal(next.cplxState.subproducts[1].processes[0].layout, 38);
  assert.equal(next.stdState, start.stdState);
});

test('Cpx: typing a subproduct Layout overrides it, in cplxState', () => {
  const next = run(cpxStart(), A.SET_SP_PROCESS_FIELD, {
    spIdx: 1,
    idx: 0,
    field: 'layout',
    value: 12,
  });
  assert.equal(next.cplxState.subproducts[1].processes[0].layout_ovr, true);
  assert.equal(next.cplxState.subproducts[1].processes[0].layout, 12);
});

test('Cpx: opening a quote keeps a saved subproduct Layout that differs', () => {
  const saved = {
    subproducts: [{ ...LAYOUT, processes: [{ process_type: 'Print', tool_type: '', layout: 12 }] }],
  };
  const s = run(createInitialState(), A.LOAD_QUOTE, { quoteType: 'cplx', state: saved, id: 2 });
  assert.equal(s.cplxState.subproducts[0].processes[0].layout, 12);
  assert.equal(s.cplxState.subproducts[0].processes[0].layout_ovr, true);
});
