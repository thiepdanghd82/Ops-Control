/**
 * processLayoutSync — the Processes grid's Layout column follows the Layout tab
 * (2026-10-06). A Print row takes Print Total/Shot; a Print or Die_Cut row
 * whose tool type names a Layout cutter takes that cutter's cavities; a typed
 * value is an override that survives until ↻ or a new tool/process type.
 *
 *   node --test src/services/processLayoutSync.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutPrintTotal,
  layoutCutterCavities,
  syncedLayoutFor,
  syncProcessLayouts,
  healLayoutOverrides,
  layoutOverrideFlag,
} from './processLayoutSync.js';

// Henry's GH68-56552A: 2 across × 19 in MD on one web, Cutter 1 = RDC.
const base = () => ({
  parts_web_across: 2,
  parts_in_md: 19,
  num_webs: 1,
  slit_after_print: false,
  cutter_types: ['RDC', '', '', ''],
  cutter_cavities: ['', '', '', ''],
});

// ── layoutPrintTotal — the Print Design Layout's Print Total / Shot ──

test('layoutPrintTotal: webs × parts across × parts in MD', () => {
  assert.equal(layoutPrintTotal(base()), 38);
  assert.equal(layoutPrintTotal({ ...base(), num_webs: 2 }), 76);
});

test('layoutPrintTotal: slit on prints slit lanes × parts across × parts in MD', () => {
  const st = { ...base(), slit_after_print: true, slit_lane_count: 3, num_webs: 5 };
  assert.equal(layoutPrintTotal(st), 114);
});

test('layoutPrintTotal: a blank layout reads 1 × 1 × 1, never 0 or NaN', () => {
  assert.equal(layoutPrintTotal({}), 1);
  assert.equal(layoutPrintTotal(null), 1);
});

// ── layoutCutterCavities — Cutter type N with its cavities ──

test('layoutCutterCavities: a blank cavity cell reads Cut Total / Shot', () => {
  assert.deepEqual(layoutCutterCavities(base()), [{ index: 0, type: 'RDC', cavity: 38 }]);
});

test('layoutCutterCavities: a typed cavity wins, and empty cutter types are skipped', () => {
  const st = {
    ...base(),
    cutter_types: ['RDC', '', 'Magnetic Rotary', ''],
    cutter_cavities: ['', '', '24', ''],
  };
  assert.deepEqual(layoutCutterCavities(st), [
    { index: 0, type: 'RDC', cavity: 38 },
    { index: 2, type: 'Magnetic Rotary', cavity: 24 },
  ]);
});

// ── syncedLayoutFor — which cavity a row follows ──

test('syncedLayoutFor: a Print row follows Print Total / Shot, with or without a tool', () => {
  assert.deepEqual(syncedLayoutFor({ process_type: 'Print', tool_type: '' }, base()), {
    value: 38,
    kind: 'print',
  });
  assert.deepEqual(syncedLayoutFor({ process_type: 'Print', tool_type: 'Pressplate' }, base()), {
    value: 38,
    kind: 'print',
  });
});

test('syncedLayoutFor: a Die_Cut row follows the cutter its tool type names', () => {
  assert.deepEqual(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'RDC' }, base()), {
    value: 38,
    kind: 'cutter',
    index: 0,
    type: 'RDC',
  });
});

test('syncedLayoutFor: the matched cutter is found by type, not by position', () => {
  const st = { ...base(), cutter_types: ['Knife/ Wood', 'RDC'], cutter_cavities: ['', '12'] };
  assert.deepEqual(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'RDC' }, st), {
    value: 12,
    kind: 'cutter',
    index: 1,
    type: 'RDC',
  });
});

test('syncedLayoutFor: a Print row whose tool names a cutter takes that cutter', () => {
  const st = { ...base(), cutter_cavities: ['20'] };
  assert.equal(syncedLayoutFor({ process_type: 'Print', tool_type: 'RDC' }, st).value, 20);
});

test('syncedLayoutFor: tool types match after trimming', () => {
  assert.equal(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'RDC ' }, base()).value, 38);
});

test('syncedLayoutFor: a Die_Cut row with no tool, or a tool no cutter has, follows nothing', () => {
  assert.equal(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: '' }, base()), null);
  assert.equal(
    syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'Knife/ Wood' }, base()),
    null
  );
});

test('syncedLayoutFor: other process types follow nothing', () => {
  assert.equal(syncedLayoutFor({ process_type: 'Inspection', tool_type: 'RDC' }, base()), null);
  assert.equal(syncedLayoutFor({ process_type: '', tool_type: '' }, base()), null);
  assert.equal(syncedLayoutFor(null, base()), null);
});

test('syncedLayoutFor: two cutters of one type with different cavities are not guessed', () => {
  const st = { ...base(), cutter_types: ['RDC', 'RDC'], cutter_cavities: ['38', '24'] };
  assert.equal(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'RDC' }, st), null);
});

test('syncedLayoutFor: two cutters of one type with the same cavities agree', () => {
  const st = { ...base(), cutter_types: ['RDC', 'RDC'], cutter_cavities: ['', '38'] };
  assert.equal(syncedLayoutFor({ process_type: 'Die_Cut', tool_type: 'RDC' }, st).value, 38);
});

// ── syncProcessLayouts — write the cavity into rows that follow ──

test('syncProcessLayouts: a following row takes the cavity as a number', () => {
  const procs = [{ process_type: 'Die_Cut', tool_type: 'RDC', layout: 1 }];
  const out = syncProcessLayouts(procs, base());
  assert.equal(out[0].layout, 38);
  assert.equal(typeof out[0].layout, 'number');
});

test('syncProcessLayouts: a typed-over row keeps its number', () => {
  const procs = [{ process_type: 'Print', layout: 16, layout_ovr: true }];
  assert.equal(syncProcessLayouts(procs, base())[0].layout, 16);
});

test('syncProcessLayouts: rows that follow nothing are left alone', () => {
  const procs = [
    { process_type: 'Inspection', layout: 0 },
    { process_type: 'Die_Cut', layout: 4 },
  ];
  assert.equal(syncProcessLayouts(procs, base()), procs);
});

test('syncProcessLayouts: returns the same array when every row already matches', () => {
  const procs = [{ process_type: 'Print', layout: 38 }, null];
  assert.equal(syncProcessLayouts(procs, base()), procs);
});

// ── healLayoutOverrides — a quote saved before the sync keeps its numbers ──

test('healLayoutOverrides: a saved number that differs from the Layout tab becomes an override', () => {
  const procs = [{ process_type: 'Die_Cut', tool_type: 'RDC', layout: 36 }];
  const out = healLayoutOverrides(procs, base());
  assert.equal(out[0].layout_ovr, true);
  assert.equal(out[0].layout, 36);
  // …and so the sync leaves it where it was saved.
  assert.equal(syncProcessLayouts(out, base())[0].layout, 36);
});

test('healLayoutOverrides: a saved number equal to the Layout tab is left to follow', () => {
  const procs = [{ process_type: 'Print', layout: 38 }];
  assert.equal(healLayoutOverrides(procs, base()), procs);
});

test('healLayoutOverrides: a row that already carries a flag is not re-decided', () => {
  const procs = [{ process_type: 'Print', layout: 40, layout_ovr: false }];
  assert.equal(healLayoutOverrides(procs, base()), procs);
});

test('healLayoutOverrides: rows that follow nothing are left alone', () => {
  const procs = [{ process_type: 'Die_Cut', tool_type: 'Knife', layout: 3 }];
  assert.equal(healLayoutOverrides(procs, base()), procs);
});

// ── layoutOverrideFlag — what typing into the cell means ──

test('layoutOverrideFlag: typing a number other than the cavity overrides it', () => {
  const proc = { process_type: 'Print' };
  assert.equal(layoutOverrideFlag(proc, base(), 40), true);
  assert.equal(layoutOverrideFlag(proc, base(), 0), true);
});

test('layoutOverrideFlag: typing the cavity itself keeps following', () => {
  assert.equal(layoutOverrideFlag({ process_type: 'Print' }, base(), 38), false);
  assert.equal(layoutOverrideFlag({ process_type: 'Print' }, base(), '38'), false);
});

test('layoutOverrideFlag: a row that follows nothing gets no flag', () => {
  assert.equal(layoutOverrideFlag({ process_type: 'Inspection' }, base(), 4), undefined);
});
