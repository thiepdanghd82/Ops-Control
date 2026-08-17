// @ts-check
/**
 * DDL editor: table-title overrides + Cutter Cost per-row exclusion.
 * Pure helpers only (vanilla node:test). Golden calcEngine is unaffected —
 * cutter_cost is still not consumed by calc. Runner:
 *   node --test src/modules/cost/tabs/ddlTitleAndExclusion.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTitleOverride,
  addExcludedType,
  dropExcludedType,
  renameExcludedType,
  reconcileCutterCost,
} from './ddlEntryHelpers.js';

// ── Title overrides ──────────────────────────────────────────────

test('applyTitleOverride writes the override; the label resolve then prefers it', () => {
  const names = applyTitleOverride({}, 'cutter_cost', '  Cutter Fee  ', 'Cutter Cost $');
  assert.equal(names.cutter_cost, 'Cutter Fee'); // trimmed + written
  // Simulate the LibDDL label resolve: _custom_names wins over the default.
  const defaultLabel = 'Cutter Cost $';
  const resolved = names['cutter_cost'] || defaultLabel || 'cutter_cost';
  assert.equal(resolved, 'Cutter Fee');
});

test('applyTitleOverride removes the override when the new title equals the built-in default', () => {
  const names = applyTitleOverride(
    { cutter_cost: 'Cutter Fee' },
    'cutter_cost',
    'Cutter Cost $',
    'Cutter Cost $'
  );
  assert.equal(Object.hasOwn(names, 'cutter_cost'), false); // falls back cleanly
});

test('applyTitleOverride removes the override on an empty title (defensive)', () => {
  const names = applyTitleOverride({ coverage: 'X' }, 'coverage', '   ', 'Coverage Table');
  assert.equal(Object.hasOwn(names, 'coverage'), false);
});

test('applyTitleOverride is pure — does not mutate the source', () => {
  const src = { a: '1' };
  applyTitleOverride(src, 'b', 'Two');
  assert.deepEqual(src, { a: '1' });
});

// ── Cutter Cost exclusion ────────────────────────────────────────

test('addExcludedType adds + dedupes + trims; dropExcludedType removes', () => {
  let ex = addExcludedType([], 'CNC');
  assert.deepEqual(ex, ['CNC']);
  ex = addExcludedType(ex, '  CNC  '); // dedupe (trimmed match)
  assert.deepEqual(ex, ['CNC']);
  ex = addExcludedType(ex, 'RDC');
  assert.deepEqual(ex, ['CNC', 'RDC']);
  assert.deepEqual(dropExcludedType(ex, 'CNC'), ['RDC']);
});

test('renameExcludedType moves an excluded entry to the new name (no-op if not excluded)', () => {
  assert.deepEqual(renameExcludedType(['CNC', 'RDC'], 'CNC', 'CNC v2'), ['CNC v2', 'RDC']);
  assert.deepEqual(renameExcludedType(['RDC'], 'CNC', 'CNC v2'), ['RDC']); // not excluded → unchanged
});

test('reconcileCutterCost does NOT re-add excluded types but DOES add a brand-new tool type', () => {
  const toolTypes = ['Knife/ Wood', 'CNC', 'RDC', 'NEW Tool'];
  const excluded = ['CNC', 'RDC'];
  const existing = { 'Knife/ Wood': '12.5' };
  const { toolLife } = reconcileCutterCost(toolTypes, existing, excluded);
  assert.deepEqual(Object.keys(toolLife).sort(), ['Knife/ Wood', 'NEW Tool']);
  assert.equal(toolLife['Knife/ Wood'], '12.5'); // existing preserved
  assert.equal(toolLife['NEW Tool'], ''); // brand-new → blank, auto-added
  assert.equal(Object.hasOwn(toolLife, 'CNC'), false); // excluded → stays gone
  assert.equal(Object.hasOwn(toolLife, 'RDC'), false);
});

test('reconcileCutterCost with an empty exclusion set behaves like a full sync', () => {
  const { toolLife } = reconcileCutterCost(['A', 'B'], { A: '1' }, []);
  assert.deepEqual(Object.keys(toolLife).sort(), ['A', 'B']);
});

test('deleting a tool type cleans its excluded entry (tool_type delete cascade)', () => {
  // Simulate the TOOL_TYPE delete cascade: drop the removed name from excluded.
  const excluded = ['CNC', 'RDC'];
  assert.deepEqual(dropExcludedType(excluded, 'CNC'), ['RDC']);
});
