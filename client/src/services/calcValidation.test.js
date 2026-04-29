/**
 * calcValidation — regression tests covering 3 bugs reported by the
 * factory during UAT dry-run:
 *
 *   1. "Width must be greater than 0" false-positive when the user
 *      didn't override width per-row but Layout has a non-zero TD
 *      (CalcMaterials.jsx shows the layout value, validator used to
 *      check row-only `m.width` and error out).
 *
 *   2. Setup Hours required for FQC / labor-only workcenters even when
 *      their Machine USD/H is 0 in the Rate Table. Real-world: FQC is
 *      labor-only inspection, no machine setup time applies.
 *
 * Engine-side changes live in calcValidation.js. This file pins the
 * new behaviour with hard-coded fixtures.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStandard, validateComplex } from './calcValidation.js';

// ── Helpers ───────────────────────────────────────────────────────

function baseStd(overrides = {}) {
  return {
    ccl_pn: 'UAT-TEST-001',
    moq: 1000,
    annual_qty: 10000,
    trade_mode: 'USD Normal',
    site: 'VN01',
    selling_price: 1,
    part_width: 320,       // Layout TD — simulates screenshot scenario
    part_length_md: 50,
    parts_in_md: 10,
    parts_web_across: 2,
    materials: [{ code: 'MAT-1', usage: 1, width: 0, s_price: 10 }],
    processes: [{ workcenter: 'PRINT', speed: 100, efficiency: 85 }],
    ...overrides,
  };
}

function findWarn(warnings, pattern) {
  return warnings.find(w => pattern.test(w.message));
}

// ── Bug 1 — Width validation with layout fallback ────────────────

test('Bug 1: material row with m.width=0 and layout part_width>0 → no "Width must be greater than 0" error', () => {
  const st = baseStd({
    part_width: 320,
    materials: [{ code: 'Huynh De PET', usage: 1, width: 0, s_price: 10 }],
  });
  const warnings = validateStandard(st);
  const widthWarn = findWarn(warnings, /Width must be greater than 0/);
  assert.equal(widthWarn, undefined, 'layoutWidth fallback should satisfy width validation');
});

test('Bug 1: row.width>0 (override) → no width error regardless of layout', () => {
  const st = baseStd({
    part_width: 0,  // layout blank
    materials: [{ code: 'MAT-1', usage: 1, width: 50, s_price: 10 }],
  });
  const warnings = validateStandard(st);
  const widthWarn = findWarn(warnings, /Material row.*Width must be greater/);
  assert.equal(widthWarn, undefined, 'per-row override should satisfy validation');
});

test('Bug 1: row.width=0 AND layout=0 → still errors (guard preserved)', () => {
  const st = baseStd({
    part_width: 0,
    materials: [{ code: 'MAT-1', usage: 1, width: 0, s_price: 10 }],
  });
  const warnings = validateStandard(st);
  const widthWarn = findWarn(warnings, /Material row.*Width must be greater/);
  assert.ok(widthWarn, 'both zero → error must still fire');
});

test('Bug 1 (Complex): per-subproduct part_width fallback', () => {
  const cplx = {
    ccl_pn: 'CPLX-001',
    moq: 1000,
    annual_qty: 10000,
    trade_mode: 'USD Normal',
    site: 'VN01',
    selling_price: 1,
    subproducts: [{
      code: 'SPA',
      part_width: 200,
      part_length_md: 100,
      parts_in_md: 5,
      parts_web_across: 2,
      materials: [{ code: 'M1', usage: 1, width: 0, s_price: 5 }],
      processes: [{ workcenter: 'WC1', speed: 100, efficiency: 85 }],
    }],
  };
  const warnings = validateComplex(cplx);
  const widthWarn = findWarn(warnings, /Width must be greater than 0/);
  assert.equal(widthWarn, undefined, 'sub-product layout fallback should work');
});

// ── Bug 2 — Setup Hours conditional on machine_rate ───────────────

test('Bug 2: Hrs-UOM workcenter with machine_rate=0 → Setup Hours NOT required (FQC case)', () => {
  const lib = { rate: [{ workcenter: 'FQC', speed_uom: 'Hrs', machine_rate: 0, labor_rate: 5 }] };
  const st = baseStd({
    processes: [{ workcenter: 'FQC', setup_h: 0, efficiency: 85 }],
  });
  const warnings = validateStandard(st, lib);
  const setupWarn = findWarn(warnings, /Setup Hours is required/);
  assert.equal(setupWarn, undefined, 'labor-only workcenter should not require Setup Hours');
});

test('Bug 2: Hrs-UOM workcenter with machine_rate>0 AND setup_h=0 → error (original behavior preserved)', () => {
  const lib = { rate: [{ workcenter: 'HEATPRESS', speed_uom: 'Hrs', machine_rate: 12, labor_rate: 5 }] };
  const st = baseStd({
    processes: [{ workcenter: 'HEATPRESS', setup_h: 0, efficiency: 85 }],
  });
  const warnings = validateStandard(st, lib);
  const setupWarn = findWarn(warnings, /Setup Hours is required.*HEATPRESS/);
  assert.ok(setupWarn, 'machine-priced Hrs workcenter still requires Setup Hours');
});

test('Bug 2: Hrs-UOM workcenter with machine_rate>0 AND setup_h>0 → no error', () => {
  const lib = { rate: [{ workcenter: 'HEATPRESS', speed_uom: 'Hrs', machine_rate: 12, labor_rate: 5 }] };
  const st = baseStd({
    processes: [{ workcenter: 'HEATPRESS', setup_h: 2, efficiency: 85 }],
  });
  const warnings = validateStandard(st, lib);
  const setupWarn = findWarn(warnings, /Setup Hours is required/);
  assert.equal(setupWarn, undefined, 'setup_h supplied → no error');
});

test('Bug 2: non-Hrs workcenter unaffected (still requires Speed)', () => {
  const lib = { rate: [{ workcenter: 'PRINT', speed_uom: 'm/min', machine_rate: 10 }] };
  const st = baseStd({
    processes: [{ workcenter: 'PRINT', speed: 0, efficiency: 85 }],
  });
  const warnings = validateStandard(st, lib);
  const speedWarn = findWarn(warnings, /Speed.*must be greater/);
  assert.ok(speedWarn, 'non-Hrs path still enforces Speed > 0');
});

// ── Bug 3 — Layout required only for machine workcenters ─────────

test('Bug 3: machine workcenter (machine_rate>0) with layout=0 → Layout required error', () => {
  const lib = { rate: [{ workcenter: 'PRESS', speed_uom: 'pcs/hr', machine_rate: 15 }] };
  const st = baseStd({
    processes: [{ workcenter: 'PRESS', speed: 100, efficiency: 0.85, layout: 0 }],
  });
  const warnings = validateStandard(st, lib);
  const layoutWarn = findWarn(warnings, /Layout is required.*PRESS/);
  assert.ok(layoutWarn, 'machine workcenter with empty layout must error');
});

test('Bug 3: labor-only workcenter (machine_rate=0) with layout=0 → NO error', () => {
  const lib = { rate: [{ workcenter: 'FQC', speed_uom: 'Hrs', machine_rate: 0, labor_rate: 5 }] };
  const st = baseStd({
    processes: [{ workcenter: 'FQC', setup_h: 1, efficiency: 0.85, layout: 0 }],
  });
  const warnings = validateStandard(st, lib);
  const layoutWarn = findWarn(warnings, /Layout is required/);
  assert.equal(layoutWarn, undefined, 'labor-only workcenter should not require Layout');
});

test('Bug 3: machine workcenter with layout>0 → no error', () => {
  const lib = { rate: [{ workcenter: 'PRESS', speed_uom: 'pcs/hr', machine_rate: 15 }] };
  const st = baseStd({
    processes: [{ workcenter: 'PRESS', speed: 100, efficiency: 0.85, layout: 4 }],
  });
  const warnings = validateStandard(st, lib);
  const layoutWarn = findWarn(warnings, /Layout is required/);
  assert.equal(layoutWarn, undefined, 'layout filled → no error');
});

test('Bug 3: blank workcenter → no Layout error (would spam until WC picked)', () => {
  const lib = { rate: [{ workcenter: 'PRESS', machine_rate: 15 }] };
  const st = baseStd({
    processes: [{ workcenter: '', speed: 100, layout: 0 }],
  });
  const warnings = validateStandard(st, lib);
  const layoutWarn = findWarn(warnings, /Layout is required/);
  assert.equal(layoutWarn, undefined, 'no workcenter → no Layout error yet');
});

test('Bug 3 (Complex): machine workcenter per sub-product requires Layout', () => {
  const lib = { rate: [{ workcenter: 'PRESS', speed_uom: 'pcs/hr', machine_rate: 15 }] };
  const cplx = {
    ccl_pn: 'CPLX-001', moq: 1000, annual_qty: 10000, trade_mode: 'USD Normal', site: 'VN01', selling_price: 1,
    subproducts: [{
      code: 'SPA', part_width: 100, part_length_md: 50, parts_in_md: 5, parts_web_across: 2,
      materials: [{ code: 'M1', usage: 1, width: 10, s_price: 5 }],
      processes: [{ workcenter: 'PRESS', speed: 100, efficiency: 0.85, layout: 0 }],
    }],
  };
  const warnings = validateComplex(cplx, lib);
  const layoutWarn = findWarn(warnings, /Layout is required.*PRESS/);
  assert.ok(layoutWarn, 'Complex path enforces Layout on machine workcenter');
});

test('Bug 2 (Complex): FQC in subproduct with machine_rate=0 → no setup-hours error', () => {
  const lib = { rate: [{ workcenter: 'FQC', speed_uom: 'Hrs', machine_rate: 0, labor_rate: 5 }] };
  const cplx = {
    ccl_pn: 'CPLX-001', moq: 1000, annual_qty: 10000, trade_mode: 'USD Normal', site: 'VN01', selling_price: 1,
    subproducts: [{
      code: 'SPA', part_width: 100, part_length_md: 50, parts_in_md: 5, parts_web_across: 2,
      materials: [{ code: 'M1', usage: 1, width: 10, s_price: 5 }],
      processes: [{ workcenter: 'FQC', setup_h: 0, efficiency: 85 }],
    }],
  };
  const warnings = validateComplex(cplx, lib);
  const setupWarn = findWarn(warnings, /Setup Hours is required/);
  assert.equal(setupWarn, undefined, 'Complex path also respects labor-only exemption');
});
