/**
 * Multi-drawing heal-on-read (Sprint S-MULTI-DRAW) — verifies the
 * migrators wrap a legacy single layout_file / customer_drw_file into a
 * [file] + active list, keep the singular mirrored, and are idempotent.
 * Std (top-level cover) + Cpx (per-subproduct) parity + JSON round-trip.
 *
 *   node --test src/services/drawingHeal.migration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeStdState } from './stdMigration.js';
import { upgradeCplxState } from './cplxMigration.js';

const F = (n) => ({ name: `${n}.png`, type: 'image/png', dataUrl: `data:image/png;base64,${n}` });

// ── Std ───────────────────────────────────────────────────────────
test('Std heal: legacy single layout_file → [file] active 0, singular kept', () => {
  const legacy = {
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    layout_file: F('old'),
    customer_drw_file: F('cust'),
  };
  const up = upgradeStdState(legacy);
  assert.equal(up.layout_files.length, 1);
  assert.equal(up.layout_files[0].name, 'old.png');
  assert.equal(up.layout_active, 0);
  assert.equal(up.layout_file.name, 'old.png', 'singular mirror preserved');
  assert.equal(up.customer_drw_files[0].name, 'cust.png');
  assert.equal(up.customer_drw_file.name, 'cust.png');
  // Heal-on-read ALSO strips inline base64 → {name,type}: bytes re-fetched
  // by name thereafter, so a legacy inline-dataUrl quote can't bloat state.
  assert.equal(/base64/.test(JSON.stringify(up)), false, 'no base64 after heal');
});

test('Std heal strips inline dataUrl already present in the list', () => {
  const legacy = {
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    layout_files: [
      { name: 'a.png', type: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
      { name: 'b.png', type: 'image/png', dataUrl: 'data:image/png;base64,BBBB' },
    ],
    layout_active: 1,
  };
  const up = upgradeStdState(legacy);
  assert.equal(/base64/.test(JSON.stringify(up)), false, 'inline list bytes stripped on read');
  assert.equal(up.layout_files[1].name, 'b.png', 'names + order preserved');
  assert.equal(up.layout_file.name, 'b.png', 'mirror follows active, lightened');
});

test('Std heal: no drawings → empty lists, null singular', () => {
  const legacy = {
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
  };
  const up = upgradeStdState(legacy);
  assert.deepEqual(up.layout_files, []);
  assert.equal(up.layout_active, 0);
  assert.equal(up.layout_file, null);
  assert.deepEqual(up.customer_drw_files, []);
  assert.equal(up.customer_drw_file, null);
});

test('Std heal: idempotent (second upgrade === first ref)', () => {
  const legacy = {
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    layout_file: F('a'),
  };
  const once = upgradeStdState(legacy);
  const twice = upgradeStdState(once);
  assert.equal(twice, once, 'already-healed state returns same reference');
});

test('Std heal: existing list re-mirrors singular to active', () => {
  const s = {
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    layout_files: [F('a'), F('b')],
    layout_active: 1,
    layout_file: F('stale'),
  };
  const up = upgradeStdState(s);
  assert.equal(up.layout_file.name, 'b.png', 'singular re-mirrored to files[active]');
});

test('Std heal: JSON round-trip preserves files + active + mirror', () => {
  const s = upgradeStdState({
    _schema_version: 3,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    layout_files: [F('a'), F('b'), F('c')],
    layout_active: 2,
  });
  const round = JSON.parse(JSON.stringify(s));
  assert.equal(round.layout_files.length, 3);
  assert.equal(round.layout_active, 2);
  assert.equal(round.layout_file.name, 'c.png');
});

// ── Cpx per-SP ────────────────────────────────────────────────────
test('Cpx heal: legacy single sp.layout_file → per-SP [file] active 0', () => {
  const legacy = {
    _shape_version: 4,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'SP A',
        is_assembly: false,
        materials_main: [],
        materials_alt: [],
        materials_active: 'main',
        layout_file: F('spA'),
      },
      {
        code: 'SP B',
        is_assembly: false,
        materials_main: [],
        materials_alt: [],
        materials_active: 'main',
        customer_drw_file: F('spBcust'),
      },
    ],
  };
  const up = upgradeCplxState(legacy);
  assert.equal(up.subproducts[0].layout_files[0].name, 'spA.png');
  assert.equal(up.subproducts[0].layout_active, 0);
  assert.equal(up.subproducts[0].layout_file.name, 'spA.png');
  assert.equal(up.subproducts[1].customer_drw_files[0].name, 'spBcust.png');
  assert.equal(up.subproducts[1].customer_drw_file.name, 'spBcust.png');
});

test('Cpx heal: idempotent (second upgrade === first ref)', () => {
  const legacy = {
    _shape_version: 4,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'SP A',
        is_assembly: false,
        materials_main: [],
        materials_alt: [],
        materials_active: 'main',
        layout_file: F('a'),
      },
    ],
  };
  const once = upgradeCplxState(legacy);
  const twice = upgradeCplxState(once);
  assert.equal(twice, once, 'already-healed cplx returns same reference');
});

test('Cpx heal: JSON round-trip preserves per-SP files + active', () => {
  const up = upgradeCplxState({
    _shape_version: 4,
    bom: [],
    tooling_alloc: [],
    subproducts: [
      {
        code: 'SP A',
        is_assembly: false,
        materials_main: [],
        materials_alt: [],
        materials_active: 'main',
        layout_files: [F('a'), F('b')],
        layout_active: 1,
      },
    ],
  });
  const round = JSON.parse(JSON.stringify(up));
  assert.equal(round.subproducts[0].layout_files.length, 2);
  assert.equal(round.subproducts[0].layout_active, 1);
  assert.equal(round.subproducts[0].layout_file.name, 'b.png');
});
