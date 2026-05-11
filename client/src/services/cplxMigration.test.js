/**
 * cplxMigration tests — run with:
 *   node --test src/services/cplxMigration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeCplxState, findAssemblyIndex, CPLX_SHAPE_VERSION } from './cplxMigration.js';

test('upgradeCplxState: null/undefined passes through', () => {
  assert.equal(upgradeCplxState(null), null);
  assert.equal(upgradeCplxState(undefined), undefined);
});

test('upgradeCplxState: v1 state gets version marker + defaults', () => {
  const v1 = {
    subproducts: [{ code: 'SP A' }, { code: 'FG Z' }],
    moq: 1000,
  };
  const v2 = upgradeCplxState(v1);
  assert.equal(v2._shape_version, CPLX_SHAPE_VERSION);
  assert.equal(v2.subproducts[0].is_assembly, false);
  assert.equal(v2.subproducts[1].is_assembly, true);
  assert.ok(Array.isArray(v2.bom));
  assert.ok(Array.isArray(v2.tooling_alloc));
  // Legacy fields preserved
  assert.equal(v2.moq, 1000);
});

test('upgradeCplxState: BOM derived with qty=1 for every non-assembly SP', () => {
  const v1 = {
    subproducts: [{ code: 'SP A' }, { code: 'SP B' }, { code: 'FG Z' }],
  };
  const v2 = upgradeCplxState(v1);
  assert.equal(v2.bom.length, 2);
  assert.equal(v2.bom[0].qty, 1);
  assert.equal(v2.bom[1].qty, 1);
  assert.equal(v2.bom[0].sp_index, 0);
  assert.equal(v2.bom[1].sp_index, 1);
});

test('upgradeCplxState: no FG SP → empty BOM (sum fallback)', () => {
  const v1 = { subproducts: [{ code: 'SP A' }, { code: 'SP B' }] };
  const v2 = upgradeCplxState(v1);
  assert.deepEqual(v2.bom, []);
  assert.equal(
    v2.subproducts.every((sp) => sp.is_assembly === false),
    true
  );
});

test('upgradeCplxState: preserves existing is_assembly flag (explicit wins over FG prefix)', () => {
  const v1 = {
    subproducts: [
      { code: 'FG_LEGACY', is_assembly: false }, // user said "no" explicitly
      { code: 'MAIN', is_assembly: true },
    ],
  };
  const v2 = upgradeCplxState(v1);
  assert.equal(v2.subproducts[0].is_assembly, false);
  assert.equal(v2.subproducts[1].is_assembly, true);
});

test('upgradeCplxState: idempotent — running twice is a no-op', () => {
  const v1 = { subproducts: [{ code: 'FG_Z' }] };
  const v2 = upgradeCplxState(v1);
  const v2b = upgradeCplxState(v2);
  assert.equal(v2, v2b, 'second call returns same reference');
});

test('upgradeCplxState: preserves user-supplied bom / tooling_alloc', () => {
  const v1 = {
    subproducts: [{ code: 'FG' }, { code: 'SP_A' }],
    bom: [{ sp_index: 1, qty: 3, notes: 'triple up' }],
    tooling_alloc: [{ tool_id: 'die_a', sp_index: 1, share_pct: 100 }],
  };
  const v2 = upgradeCplxState(v1);
  // User's BOM preserved exactly
  assert.equal(v2.bom.length, 1);
  assert.equal(v2.bom[0].qty, 3);
  assert.equal(v2.tooling_alloc.length, 1);
});

test('findAssemblyIndex: prefers is_assembly flag', () => {
  const state = {
    subproducts: [
      { code: 'FG_LEGACY', is_assembly: false },
      { code: 'MAIN', is_assembly: true },
    ],
  };
  assert.equal(findAssemblyIndex(state), 1);
});

test('findAssemblyIndex: falls back to FG prefix when no flags set', () => {
  const state = { subproducts: [{ code: 'SP A' }, { code: 'FG Z' }] };
  assert.equal(findAssemblyIndex(state), 1);
});

test('findAssemblyIndex: returns -1 when no assembly', () => {
  const state = { subproducts: [{ code: 'SP A' }, { code: 'SP B' }] };
  assert.equal(findAssemblyIndex(state), -1);
});

test('findAssemblyIndex: empty / missing subproducts → -1', () => {
  assert.equal(findAssemblyIndex({}), -1);
  assert.equal(findAssemblyIndex({ subproducts: [] }), -1);
  assert.equal(findAssemblyIndex(null), -1);
});

// ── Alt-materials per-subproduct (Sprint S-ALT-MAT, PR #B) ──────────
// v2 → v3 migration: each SP gains materials_main + materials_alt +
// materials_active. Legacy sp.materials becomes the mirror of the
// active set. Pre-v3 quotes lazy-migrate on load.

test('upgradeCplxState v3: pre-v3 SP with materials gets split into _main + _alt + active=main', () => {
  const v2 = {
    _shape_version: 2,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'FG-1',
        is_assembly: true,
        materials: [{ _mid: 'm_a', code: 'PET-50' }],
      },
      {
        code: 'SP-B',
        is_assembly: false,
        materials: [{ _mid: 'm_b', code: 'GLU-AC' }],
      },
    ],
  };
  const next = upgradeCplxState(v2);
  assert.equal(next._shape_version, CPLX_SHAPE_VERSION);
  const a = next.subproducts[0];
  assert.ok(Array.isArray(a.materials_main));
  assert.equal(a.materials_main.length, 1);
  assert.equal(a.materials_main[0].code, 'PET-50');
  assert.deepEqual(a.materials_alt, []);
  assert.equal(a.materials_active, 'main');
  // Mirror equals active set.
  assert.equal(a.materials, a.materials_main);
  const b = next.subproducts[1];
  assert.equal(b.materials_main[0].code, 'GLU-AC');
  assert.deepEqual(b.materials_alt, []);
  assert.equal(b.materials_active, 'main');
});

test('upgradeCplxState v3: unversioned legacy quote also splits per-SP', () => {
  const legacy = {
    subproducts: [{ code: 'FG-1', materials: [{ _mid: 'm_a', code: 'M001' }] }],
  };
  const next = upgradeCplxState(legacy);
  assert.equal(next._shape_version, CPLX_SHAPE_VERSION);
  const sp = next.subproducts[0];
  assert.equal(sp.materials_main.length, 1);
  assert.deepEqual(sp.materials_alt, []);
  assert.equal(sp.materials_active, 'main');
  assert.equal(sp.is_assembly, true, 'FG-prefix → is_assembly auto-set');
});

test('upgradeCplxState v3: post-v3 SP with active=alt keeps alt set + mirrors correctly', () => {
  const v3 = {
    _shape_version: 3,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'SP-A',
        is_assembly: false,
        materials_main: [{ _mid: 'mm_a', code: 'M001' }],
        materials_alt: [
          { _mid: 'ma_a', code: 'ALT-001' },
          { _mid: 'ma_b', code: 'ALT-002' },
        ],
        materials_active: 'alt',
        materials: [
          { _mid: 'ma_a', code: 'ALT-001' },
          { _mid: 'ma_b', code: 'ALT-002' },
        ],
      },
    ],
  };
  const next = upgradeCplxState(v3);
  const sp = next.subproducts[0];
  assert.equal(sp.materials_active, 'alt');
  assert.equal(sp.materials_main[0].code, 'M001');
  assert.equal(sp.materials_alt.length, 2);
  // Mirror tracks alt set when active='alt'.
  assert.equal(sp.materials[0].code, 'ALT-001');
});

test('upgradeCplxState v3: SP with empty materials → empty _main + empty _alt + active=main', () => {
  const v2 = {
    _shape_version: 2,
    bom: [],
    tooling_alloc: [],
    subproducts: [{ code: 'SP-X', is_assembly: false, materials: [] }],
  };
  const next = upgradeCplxState(v2);
  const sp = next.subproducts[0];
  assert.deepEqual(sp.materials_main, []);
  assert.deepEqual(sp.materials_alt, []);
  assert.equal(sp.materials_active, 'main');
});

test('upgradeCplxState v3: mixed active sets across SPs handled independently', () => {
  // SP-A: post-v3 active=main; SP-B: post-v3 active=alt. Migration must
  // respect each SP's own active flag — no cross-SP leak.
  const v3 = {
    _shape_version: 3,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'SP-A',
        is_assembly: false,
        materials_main: [{ _mid: 'a1', code: 'A-MAIN' }],
        materials_alt: [{ _mid: 'a2', code: 'A-ALT' }],
        materials_active: 'main',
        materials: [{ _mid: 'a1', code: 'A-MAIN' }],
      },
      {
        code: 'SP-B',
        is_assembly: false,
        materials_main: [{ _mid: 'b1', code: 'B-MAIN' }],
        materials_alt: [{ _mid: 'b2', code: 'B-ALT' }],
        materials_active: 'alt',
        materials: [{ _mid: 'b2', code: 'B-ALT' }],
      },
    ],
  };
  const next = upgradeCplxState(v3);
  assert.equal(next.subproducts[0].materials_active, 'main');
  assert.equal(next.subproducts[0].materials[0].code, 'A-MAIN');
  assert.equal(next.subproducts[1].materials_active, 'alt');
  assert.equal(next.subproducts[1].materials[0].code, 'B-ALT');
});
