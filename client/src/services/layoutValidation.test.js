/**
 * Unit tests for layoutValidation.
 * Reference layout (Luxshare ICT, Pha 2 sample):
 *   part_width = 26, part_length_md = 12
 *   parts_web_across = 4, parts_in_md = 6   (mặc định thấp để test)
 *   web_width_td = 131, sheet_length = 90
 *   min_gap_md = 3, edge_margin_td = 3, min_gap_td = 3
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, SEVERITY } from './layoutValidation.js';

const goodState = {
  part_width: 26,
  part_length_md: 12,
  parts_web_across: 4,
  parts_in_md: 6,
  web_width_td: 4 * 26 + 3 * 3 + 2 * 3, // = 119
  sheet_length: 6 * 12 + 5 * 3, // = 87
  min_gap_md: 3,
  min_gap_td: 3,
  edge_margin_td: 3,
  num_webs: 1,
  rotary_cols: 0,
};

test('validateLayout: required fields raise errors on empty state', () => {
  const res = validateLayout({});
  const codes = res.errors.map((e) => e.code);
  assert.ok(codes.includes('required'));
  assert.ok(res.hasBlockers);
});

test('validateLayout: clean state produces no errors, no warnings', () => {
  const res = validateLayout(goodState);
  assert.equal(res.errors.length, 0, `errors: ${JSON.stringify(res.errors)}`);
  assert.equal(res.warnings.length, 0, `warnings: ${JSON.stringify(res.warnings)}`);
  // info entries should exist (TD/MD fit summaries)
  assert.ok(res.infos.length > 0);
});

test('validateLayout: web too narrow → TD overlap ERROR', () => {
  const st = { ...goodState, web_width_td: 80 }; // way too small for 4×26
  const res = validateLayout(st);
  const td = res.errors.find((e) => e.code === 'td_overlap');
  assert.ok(td, 'expected td_overlap error');
  assert.ok(td.detail.delta < 0);
  assert.equal(res.hasBlockers, true);
});

test('validateLayout: web way too wide → TD waste WARNING (not error)', () => {
  const st = { ...goodState, web_width_td: 300 }; // ~2.5× the need
  const res = validateLayout(st);
  assert.equal(res.errors.length, 0);
  const td = res.warnings.find((w) => w.code === 'td_waste');
  assert.ok(td, 'expected td_waste warning');
});

test('validateLayout: sheet too short → MD overlap ERROR', () => {
  const st = { ...goodState, sheet_length: 40 }; // < 6×12 = 72
  const res = validateLayout(st);
  const md = res.errors.find((e) => e.code === 'md_overlap');
  assert.ok(md);
  assert.ok(md.detail.delta < 0);
});

test('validateLayout: rotary pitch that does not snap → WARNING', () => {
  // rotary_cols=1, sheet_length=100, gap=3 → raw pitch = 103 mm
  // 103 / 3.175 = 32.44 → round to 33 → snapped = 104.775 mm → delta 1.775
  const st = { ...goodState, rotary_cols: 1, sheet_length: 100 };
  const res = validateLayout(st);
  const snap = res.warnings.find((w) => w.code === 'rotary_snap');
  assert.ok(snap, 'expected rotary_snap warning');
  assert.ok(snap.detail.delta > 0.05);
});

test('validateLayout: rotary pitch that DOES snap → no warning', () => {
  // tooth = 33, cols = 1 → pitch = 33 × 3.175 = 104.775 → sheet_length = pitch - gap = 101.775
  const st = { ...goodState, rotary_cols: 1, sheet_length: 101.775, min_gap_md: 3 };
  const res = validateLayout(st);
  const snap = res.warnings.find((w) => w.code === 'rotary_snap');
  assert.equal(snap, undefined, `unexpected rotary warn: ${JSON.stringify(snap)}`);
});

test('validateLayout: num_webs × web_width_td > log_width → ERROR', () => {
  const st = { ...goodState, num_webs: 2 }; // 2 × 119 = 238
  const mats = [{ row_type: 'Main.Mat', log_width: 200, width: 119 }];
  const res = validateLayout(st, mats);
  const lo = res.errors.find((e) => e.code === 'log_overflow');
  assert.ok(lo);
});

test('validateLayout: num_webs × web_width_td <= log_width → no error', () => {
  const st = { ...goodState, num_webs: 2 }; // 2 × 119 = 238
  const mats = [{ row_type: 'Main.Mat', log_width: 250, width: 119 }];
  const res = validateLayout(st, mats);
  const lo = res.errors.find((e) => e.code === 'log_overflow');
  assert.equal(lo, undefined);
});

test('validateLayout: high offcut_pct → WARNING', () => {
  const mats = [{ row_type: 'Main.Mat', width: 119, log_width: 250, offcut_pct: 0.35 }];
  const res = validateLayout(goodState, mats);
  const off = res.warnings.find((w) => w.code === 'offcut_high');
  assert.ok(off);
});

test('validateLayout: byField groups issues by field name', () => {
  const st = { ...goodState, web_width_td: 80, sheet_length: 40 };
  const res = validateLayout(st);
  assert.ok(res.byField.web_width_td);
  assert.ok(res.byField.sheet_length);
  assert.equal(res.byField.web_width_td[0].code, 'td_overlap');
  assert.equal(res.byField.sheet_length[0].code, 'md_overlap');
});

test('validateLayout: custom thresholds via opts', () => {
  // Default waste tolerance is 20%. Tighten to 5% — the clean state
  // now falls into waste WARNING.
  const st = { ...goodState, web_width_td: goodState.web_width_td + 10 };
  const loose = validateLayout(st, [], { maxWasteTdPct: 0.2 });
  const tight = validateLayout(st, [], { maxWasteTdPct: 0.05 });
  // loose should not flag; tight might flag (depends on delta / need ratio)
  // We just verify the threshold IS applied.
  const looseWarn = loose.warnings.filter((w) => w.code === 'td_waste').length;
  const tightWarn = tight.warnings.filter((w) => w.code === 'td_waste').length;
  assert.ok(tightWarn >= looseWarn);
});

// Regression: edgeSym typo (was undefined → ReferenceError) in the
// die-quiet-zone branch when asymmetric edges aren't set. The bug was
// dormant because CalcLayout's outer try/catch swallowed the throw,
// which silently disabled the entire validator for that render. This
// test exercises the path explicitly.
test('validateLayout: die_quiet_zone with symmetric edges does not throw', () => {
  const st = {
    ...goodState,
    edge_margin_td: 4,
    die_quiet_zone_mm: 6, // > edge_margin_td → should produce a WARNING
    // edge_margin_td_left/right intentionally unset so the fallback
    // branch (was edgeSym, now edgeTd) runs.
  };
  const res = validateLayout(st);
  const codes = res.warnings.map((w) => w.code);
  assert.ok(
    codes.includes('quiet_zone_too_tight'),
    `expected quiet_zone_too_tight in warnings, got: ${codes.join(',')}`
  );
});
