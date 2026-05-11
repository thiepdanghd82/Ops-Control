// @ts-check
/**
 * MaterialActiveBadge summary helper (Sprint S-ALT-MAT, PR #C).
 *
 * Exhaustive coverage of the 4 edge cases per amendment B + 2 boundary
 * cases (null state, pre-PR-A quote with no materials_active field).
 *
 * Runner: node --test src/components/Shared/MaterialActiveBadge.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { summariseMaterialActive } from './materialActiveBadgeSummary.js';

test('summariseMaterialActive: Std with materials_active=main → main', () => {
  const s = { materials_active: 'main' };
  assert.deepEqual(summariseMaterialActive(s, 'standard'), { kind: 'main' });
});

test('summariseMaterialActive: Std with materials_active=alt → alt', () => {
  const s = { materials_active: 'alt' };
  assert.deepEqual(summariseMaterialActive(s, 'standard'), { kind: 'alt' });
});

test('summariseMaterialActive: Std pre-PR-A quote (no materials_active) → null (no badge)', () => {
  const s = { materials: [{ code: 'M001' }] };
  assert.equal(summariseMaterialActive(s, 'standard'), null);
});

test('summariseMaterialActive: Cpx with 0 subproducts → null (no badge)', () => {
  const s = { subproducts: [] };
  assert.equal(summariseMaterialActive(s, 'complex'), null);
});

test('summariseMaterialActive: Cpx with 1 SP active=main → main (NOT Mixed (1/0))', () => {
  const s = { subproducts: [{ materials_active: 'main' }] };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), { kind: 'main' });
});

test('summariseMaterialActive: Cpx with 1 SP active=alt → alt (single-SP corner case)', () => {
  const s = { subproducts: [{ materials_active: 'alt' }] };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), { kind: 'alt' });
});

test('summariseMaterialActive: Cpx with all SPs main → main', () => {
  const s = {
    subproducts: [
      { materials_active: 'main' },
      { materials_active: 'main' },
      { materials_active: 'main' },
    ],
  };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), { kind: 'main' });
});

test('summariseMaterialActive: Cpx with all SPs alt → alt', () => {
  const s = {
    subproducts: [{ materials_active: 'alt' }, { materials_active: 'alt' }],
  };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), { kind: 'alt' });
});

test('summariseMaterialActive: Cpx with mixed → mixed + counts', () => {
  const s = {
    subproducts: [
      { materials_active: 'main' },
      { materials_active: 'alt' },
      { materials_active: 'main' },
      { materials_active: 'alt' },
      { materials_active: 'alt' },
    ],
  };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), {
    kind: 'mixed',
    altCount: 3,
    mainCount: 2,
  });
});

test('summariseMaterialActive: Cpx with SP missing materials_active → counted as main (default)', () => {
  // A pre-PR-B Cpx quote where migration hasn\'t run yet (lazy on load).
  // The badge should still render — treat absent flag as main.
  const s = {
    subproducts: [
      { code: 'X' }, // no materials_active
      { materials_active: 'alt' },
    ],
  };
  assert.deepEqual(summariseMaterialActive(s, 'complex'), {
    kind: 'mixed',
    altCount: 1,
    mainCount: 1,
  });
});

test('summariseMaterialActive: null / undefined state → null', () => {
  assert.equal(summariseMaterialActive(null, 'standard'), null);
  assert.equal(summariseMaterialActive(undefined, 'complex'), null);
});

test('summariseMaterialActive: Std quote type passed as undefined → still resolves via materials_active', () => {
  // Defensive: callers may not pass quoteType. Default branch should
  // treat as Standard (top-level materials_active wins).
  const s = { materials_active: 'alt' };
  assert.deepEqual(summariseMaterialActive(s, undefined), { kind: 'alt' });
});
