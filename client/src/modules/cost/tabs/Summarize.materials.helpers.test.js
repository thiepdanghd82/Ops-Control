import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { collectDrwMaterials, collectQuoteMaterials } from './Summarize.materials.helpers.js';

describe('collectDrwMaterials', () => {
  test('Std quote — joins drw_material across rows in source order', () => {
    const state = {
      materials: [
        { drw_material: 'MAT-A', desc: 'BOPP 50um' },
        { drw_material: 'MAT-B', desc: 'PET 12um' },
      ],
    };
    assert.equal(collectDrwMaterials(state), 'MAT-A, MAT-B');
  });

  test('Std quote — empty drw_material entries silently dropped', () => {
    const state = {
      materials: [
        { drw_material: 'MAT-A' },
        { drw_material: '' },
        { drw_material: null },
        { drw_material: 'MAT-C' },
      ],
    };
    assert.equal(collectDrwMaterials(state), 'MAT-A, MAT-C');
  });

  test('Std quote — no materials → empty string', () => {
    assert.equal(collectDrwMaterials({}), '');
    assert.equal(collectDrwMaterials({ materials: [] }), '');
    assert.equal(collectDrwMaterials({ materials: null }), '');
  });

  test('Cpx quote — walks every subproduct, preserves duplicates intentionally', () => {
    const state = {
      subproducts: [
        { materials: [{ drw_material: 'MAT-A' }, { drw_material: 'MAT-B' }] },
        { materials: [{ drw_material: 'MAT-A' }, { drw_material: 'MAT-C' }] },
      ],
    };
    // Duplicate MAT-A across sub-products is KEPT — Henry's confirm
    // (Q-supplement): operator wants to see literal BOM, not deduped.
    assert.equal(collectDrwMaterials(state), 'MAT-A, MAT-B, MAT-A, MAT-C');
  });

  test('Cpx quote — empty subproduct.materials handled', () => {
    const state = {
      subproducts: [
        { materials: [] },
        { materials: [{ drw_material: 'MAT-X' }] },
        {},
        null,
      ],
    };
    assert.equal(collectDrwMaterials(state), 'MAT-X');
  });

  test('Cpx quote — empty subproducts array falls through to Std path', () => {
    // Per spec: only branch into Cpx walk when subproducts has length.
    // Empty array means quote is structurally Cpx but unpopulated;
    // fall back to top-level state.materials (which is the mirror).
    const state = { subproducts: [], materials: [{ drw_material: 'TOP' }] };
    assert.equal(collectDrwMaterials(state), 'TOP');
  });

  test('null/undefined state — empty string, never throws', () => {
    assert.equal(collectDrwMaterials(null), '');
    assert.equal(collectDrwMaterials(undefined), '');
    assert.equal(collectDrwMaterials('not-an-object'), '');
  });

  test('non-string drw_material values filtered out (defense)', () => {
    const state = {
      materials: [
        { drw_material: 'OK' },
        { drw_material: 123 }, // number, not string
        { drw_material: { obj: true } }, // object
        { drw_material: 'ALSO' },
      ],
    };
    assert.equal(collectDrwMaterials(state), 'OK, ALSO');
  });
});

describe('collectQuoteMaterials', () => {
  test('Std quote — joins desc across rows in source order', () => {
    const state = {
      materials: [
        { drw_material: 'MAT-A', desc: 'BOPP 50um' },
        { drw_material: 'MAT-B', desc: 'PET 12um' },
      ],
    };
    assert.equal(collectQuoteMaterials(state), 'BOPP 50um, PET 12um');
  });

  test('Std quote — drops empty + non-string desc', () => {
    const state = {
      materials: [
        { desc: 'BOPP' },
        { desc: '' },
        { desc: null },
        { desc: 'PET' },
      ],
    };
    assert.equal(collectQuoteMaterials(state), 'BOPP, PET');
  });

  test('Cpx quote — joins desc across all subproducts', () => {
    const state = {
      subproducts: [
        { materials: [{ desc: 'Film' }, { desc: 'Adhesive' }] },
        { materials: [{ desc: 'Liner' }] },
      ],
    };
    assert.equal(collectQuoteMaterials(state), 'Film, Adhesive, Liner');
  });

  test('empty / null state — empty string', () => {
    assert.equal(collectQuoteMaterials({}), '');
    assert.equal(collectQuoteMaterials(null), '');
    assert.equal(collectQuoteMaterials(undefined), '');
  });

  test('drw_material and desc are read independently — no cross-talk', () => {
    // Same row, both fields present — each collector picks its own.
    const state = {
      materials: [{ drw_material: 'CODE-A', desc: 'Display name A' }],
    };
    assert.equal(collectDrwMaterials(state), 'CODE-A');
    assert.equal(collectQuoteMaterials(state), 'Display name A');
  });

  test('Cpx quote with mixed empty desc — REGRESSION GUARD for legacy materials', () => {
    // Pre-PR-110 materials (before drw_material field) may have desc
    // populated but drw_material undefined. Both collectors should
    // tolerate the asymmetry without crashing.
    const state = {
      subproducts: [
        { materials: [{ desc: 'Legacy mat 1' }, { desc: 'Legacy mat 2' }] },
        { materials: [{ drw_material: 'NEW-1', desc: 'New mat' }] },
      ],
    };
    assert.equal(collectQuoteMaterials(state), 'Legacy mat 1, Legacy mat 2, New mat');
    assert.equal(collectDrwMaterials(state), 'NEW-1');
  });
});
