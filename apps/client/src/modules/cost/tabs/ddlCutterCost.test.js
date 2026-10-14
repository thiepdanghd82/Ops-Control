// @ts-check
/**
 * Cutter Cost $ — a DDL section governed by the tool_type list, keyed
 * EXACTLY by tool_type just like Tool Life. It reuses the same generic
 * helpers (reconcileToolLife / renameToolLifeKey / deleteObjectKey), so
 * these tests pin the cutter_cost sync contract via those helpers:
 *   - reconcile seeds a key for every tool_type (blank when new, existing
 *     values preserved)
 *   - a tool_type rename moves the cutter_cost value
 *   - a tool_type delete removes the key
 *   - the render set = exactly the tool_type set
 * Nothing consumes cutter_cost yet (values are Henry-filled later); this is
 * data-shape only — golden calcEngine is unaffected. Runner:
 *   node --test src/modules/cost/tabs/ddlCutterCost.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileToolLife, renameToolLifeKey, deleteObjectKey } from './ddlEntryHelpers.js';

test('reconcile seeds a cutter_cost key for every tool_type — blank when new, existing preserved', () => {
  const toolTypes = ['Knife/ Wood', 'Magnetic Rotary', 'CNC'];
  // Only one existing value; the other two are new.
  const prior = { 'Knife/ Wood': '12.5' };
  const { toolLife: cutterCost, changed } = reconcileToolLife(toolTypes, prior);
  assert.deepEqual(Object.keys(cutterCost).sort(), [...toolTypes].sort());
  assert.equal(cutterCost['Knife/ Wood'], '12.5'); // existing value carried
  assert.equal(cutterCost['Magnetic Rotary'], ''); // new → blank
  assert.equal(cutterCost['CNC'], ''); // new → blank
  assert.equal(changed, true); // added keys → dirty
});

test('reconcile is a no-op (changed=false) once every tool_type already has a cost key', () => {
  const toolTypes = ['Knife/ Wood', 'CNC'];
  const current = { 'Knife/ Wood': '12.5', CNC: '' };
  const { toolLife, changed } = reconcileToolLife(toolTypes, current);
  assert.deepEqual(toolLife, current);
  assert.equal(changed, false);
});

test('reconcile carries a legacy value across a normalized tool_type rename', () => {
  // Legacy cost under "Etching"; tool_type renamed to "Etching/ Pinnacle Die".
  const toolTypes = ['Etching/ Pinnacle Die'];
  const prior = { Etching: '99' };
  const { toolLife } = reconcileToolLife(toolTypes, prior);
  assert.equal(toolLife['Etching/ Pinnacle Die'], '99');
});

test('a tool_type rename moves the cutter_cost value to the new name', () => {
  const cutterCost = { 'Old Name': '42', CNC: '7' };
  const next = renameToolLifeKey(cutterCost, 'Old Name', 'New Name');
  assert.equal(Object.hasOwn(next, 'Old Name'), false);
  assert.equal(next['New Name'], '42'); // value follows the rename
  assert.equal(next['CNC'], '7'); // siblings untouched
});

test('a tool_type delete removes the cutter_cost key', () => {
  const cutterCost = { 'Knife/ Wood': '12.5', CNC: '7' };
  const next = deleteObjectKey(cutterCost, 'CNC');
  assert.deepEqual(Object.keys(next), ['Knife/ Wood']);
});

test('render set = exactly the tool_type set (keys after reconcile match tool_type)', () => {
  const toolTypes = ['A', 'B', 'C'];
  const { toolLife } = reconcileToolLife(toolTypes, { A: '1', Z: 'stale' });
  // Z (no longer a tool type) is dropped; render lists exactly A, B, C.
  assert.deepEqual(Object.keys(toolLife).sort(), ['A', 'B', 'C']);
});
