// @ts-check
/**
 * Cutter-cost block fields (Layout ▸ Cutting Design Layout) — factory
 * defaults + save/load round-trip. Additive UI/state only; these do NOT
 * feed calcEngine yet (Cutter-cost formula pending), so the golden suite
 * is unchanged. Std ONLY — createSubProduct (Cpx) must NOT carry them
 * (parity is a separate follow-up). Runner:
 *   node --test src/services/calcEngine.cutterCostFields.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdState, createEmptyStdState, createSubProduct } from './calcEngine.js';

const CUTTER_FIELDS = ['cutter_types', 'cutter_costs', 'cutter_cavities'];

test('createStdState seeds cutter_types + cutter_costs as 4 empties', () => {
  const s = createStdState();
  for (const f of CUTTER_FIELDS) {
    assert.ok(Array.isArray(s[f]), `${f} is an array`);
    assert.equal(s[f].length, 4, `${f} has 4 slots`);
    assert.deepEqual(s[f], ['', '', '', ''], `${f} defaults to 4 empties`);
  }
});

test('createEmptyStdState seeds cutter_types + cutter_costs as 4 empties', () => {
  const s = createEmptyStdState();
  for (const f of CUTTER_FIELDS) {
    assert.ok(Array.isArray(s[f]));
    assert.deepEqual(s[f], ['', '', '', '']);
  }
});

test('createSubProduct (Cpx) does NOT carry the cutter fields — Std only', () => {
  const sp = createSubProduct('SP A');
  for (const f of CUTTER_FIELDS) {
    assert.equal(Object.hasOwn(sp, f), false, `createSubProduct must not seed ${f}`);
  }
});

test('cutter fields survive a JSON save/load round-trip (Std)', () => {
  const s = createStdState();
  s.cutter_types = ['Knife/ Wood', '', 'Magnetic Rotary', ''];
  s.cutter_costs = ['', '', '', '']; // computed default; override stays empty
  s.cutter_cavities = ['3', '', '', '']; // per-cutter cavity override
  const round = JSON.parse(JSON.stringify(s));
  assert.deepEqual(round.cutter_types, ['Knife/ Wood', '', 'Magnetic Rotary', '']);
  assert.deepEqual(round.cutter_costs, ['', '', '', '']);
  assert.deepEqual(round.cutter_cavities, ['3', '', '', '']);
});

test('summary lists ONLY non-empty cutter types (component filter contract)', () => {
  // Mirrors CutSubTab's summary derivation: one row per non-empty type,
  // cost mirrored from the same index.
  const s = createStdState();
  s.cutter_types = ['Knife/ Wood', '', '  ', 'Die set'];
  s.cutter_costs = ['', '', '', ''];
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const t = String(s.cutter_types?.[i] ?? '').trim();
    if (t) rows.push({ type: t, cost: s.cutter_costs?.[i] });
  }
  assert.equal(rows.length, 2, 'only 2 non-empty (whitespace-only skipped)');
  assert.deepEqual(
    rows.map((r) => r.type),
    ['Knife/ Wood', 'Die set']
  );
});

test('legacy quote without the fields heals to undefined (no crash)', () => {
  // Pre-feature saved state: fields absent. Reading an index off undefined
  // via optional-chaining is undefined; the UI binds `?? ''` so no crash.
  const legacy = JSON.parse(JSON.stringify(createStdState()));
  for (const f of CUTTER_FIELDS) delete legacy[f];
  for (const f of CUTTER_FIELDS) assert.equal(legacy[f], undefined);
  assert.equal(legacy.cutter_types?.[0] ?? '', '');
});
