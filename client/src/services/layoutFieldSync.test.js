// @ts-check
/**
 * layoutFieldSync — MES-3-FIX-32 lazy-mirror tests.
 *
 * Reproduces operator's RFQ-2026-S0012 trap (typed Product Size on
 * Print sub-tab, never visited Cut) and verifies the canonical
 * part_width / part_length_md fields auto-populate.
 *
 * Runner: node --test src/services/layoutFieldSync.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPrintToCutSync, healPrintCutMissingCanonical } from './layoutFieldSync.js';

test('FIX-32: writing print_part_width fills canonical part_width when canonical is 0', () => {
  const prev = { part_width: 0, part_length_md: 0 };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 462);
  assert.equal(patch.print_part_width, 462);
  assert.equal(patch.part_width, 462);
});

test('FIX-32: writing print_part_length_md fills canonical part_length_md when canonical is 0', () => {
  const prev = { part_width: 0, part_length_md: 0 };
  const patch = applyPrintToCutSync(prev, 'print_part_length_md', 135);
  assert.equal(patch.print_part_length_md, 135);
  assert.equal(patch.part_length_md, 135);
});

test('FIX-32: canonical part_width already set → NO auto-mirror (preserves divergence-detection UX)', () => {
  const prev = { part_width: 80, part_length_md: 0 };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 462);
  assert.equal(patch.print_part_width, 462);
  assert.equal(patch.part_width, undefined);
});

test('FIX-32: canonical part_length_md already set → NO auto-mirror', () => {
  const prev = { part_width: 0, part_length_md: 50 };
  const patch = applyPrintToCutSync(prev, 'print_part_length_md', 135);
  assert.equal(patch.print_part_length_md, 135);
  assert.equal(patch.part_length_md, undefined);
});

test('FIX-32: writing canonical part_width directly does NOT touch print field', () => {
  const prev = { part_width: 0, print_part_width: 0 };
  const patch = applyPrintToCutSync(prev, 'part_width', 100);
  assert.equal(patch.part_width, 100);
  assert.equal(patch.print_part_width, undefined);
});

test('FIX-32: unrelated field write is a pass-through', () => {
  const prev = { part_width: 0, web_width_td: 0 };
  const patch = applyPrintToCutSync(prev, 'web_width_td', 300);
  assert.deepEqual(patch, { web_width_td: 300 });
});

test('FIX-32: writing print_part_width=0 does NOT clobber an existing canonical part_width', () => {
  const prev = { part_width: 100, print_part_width: 462 };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 0);
  assert.equal(patch.print_part_width, 0);
  assert.equal(patch.part_width, undefined);
});

test('FIX-32: writing print_part_width with non-numeric string is treated as no-op for canonical', () => {
  const prev = { part_width: 0 };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 'abc');
  assert.equal(patch.print_part_width, 'abc');
  assert.equal(patch.part_width, undefined);
});

// ── healPrintCutMissingCanonical ──────────────────────────────────
// Load-path companion: applyPrintToCutSync only fires on live keystrokes.
// A quote saved on pre-FIX-32 build (or saved mid-edit) carries
// print_part_* with canonical part_* = 0 → Layout validator complains
// "Part Width TD là bắt buộc" on load. heal mirrors at upgrade-time.

test('heal: state with print_part_* set + part_* = 0 → mirrors canonical', () => {
  const state = { print_part_width: 462, part_width: 0, print_part_length_md: 135, part_length_md: 0 };
  const next = healPrintCutMissingCanonical(state);
  assert.equal(next.part_width, 462);
  assert.equal(next.part_length_md, 135);
  // Print fields preserved
  assert.equal(next.print_part_width, 462);
  assert.equal(next.print_part_length_md, 135);
});

test('heal: state with both canonical AND print set → no change (divergence preserved)', () => {
  const state = { print_part_width: 462, part_width: 460, print_part_length_md: 135, part_length_md: 130 };
  const next = healPrintCutMissingCanonical(state);
  assert.equal(next.part_width, 460);
  assert.equal(next.part_length_md, 130);
  assert.equal(next, state, 'returns same ref when nothing to heal');
});

test('heal: width only — heals width, leaves length untouched', () => {
  const state = { print_part_width: 462, part_width: 0, part_length_md: 0 };
  const next = healPrintCutMissingCanonical(state);
  assert.equal(next.part_width, 462);
  // print_part_length_md unset → part_length_md stays 0
  assert.equal(next.part_length_md, 0);
});

test('heal: idempotent — running twice yields the same result', () => {
  const state = { print_part_width: 462, part_width: 0 };
  const once = healPrintCutMissingCanonical(state);
  const twice = healPrintCutMissingCanonical(once);
  assert.equal(twice.part_width, 462);
  assert.equal(twice, once, 'second pass is a no-op (returns same ref)');
});

test('heal: null/undefined/non-object inputs → returned unchanged', () => {
  assert.equal(healPrintCutMissingCanonical(null), null);
  assert.equal(healPrintCutMissingCanonical(undefined), undefined);
  assert.equal(healPrintCutMissingCanonical(42), 42);
});

test('heal: zero/empty print_part_* → no heal (does not write 0 over 0)', () => {
  const state = { part_width: 0, print_part_width: 0 };
  const next = healPrintCutMissingCanonical(state);
  assert.equal(next.part_width, 0);
  assert.equal(next, state, 'no-op when nothing to mirror');
});

test('FIX-32: prev=null returns trivial patch (defensive — should never happen in reducer)', () => {
  const patch = applyPrintToCutSync(null, 'print_part_width', 462);
  assert.deepEqual(patch, { print_part_width: 462 });
});

test('FIX-32: canonical part_width is the string "0" (locale input edge) is treated as unset', () => {
  const prev = { part_width: '0' };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 462);
  assert.equal(patch.part_width, 462);
});

test('FIX-32: canonical part_width is empty string is treated as unset', () => {
  const prev = { part_width: '' };
  const patch = applyPrintToCutSync(prev, 'print_part_width', 100);
  assert.equal(patch.part_width, 100);
});
