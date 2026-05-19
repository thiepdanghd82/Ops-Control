/**
 * stdMigration — schema version + _mid back-fill tests.
 *
 * Mirrors cplxMigration.test.js shape. Exercises the contract that:
 *   - Unversioned (legacy) state migrates to v1 cleanly.
 *   - Already-v1 state is returned by reference (React memo friendly).
 *   - Migration is idempotent — running twice === running once.
 *   - _mid back-fill covers every material row without clobbering
 *     existing _mid values.
 *   - Bad inputs (null, non-object, array) pass through untouched.
 *
 * Runner: node --test src/services/stdMigration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeStdState, STD_SHAPE_VERSION } from './stdMigration.js';

test('upgradeStdState: null / non-object / array pass through unchanged', () => {
  assert.equal(upgradeStdState(null), null);
  assert.equal(upgradeStdState(undefined), undefined);
  assert.equal(upgradeStdState('state'), 'state');
  const arr = [1, 2, 3];
  assert.equal(upgradeStdState(arr), arr);
});

test('upgradeStdState: legacy state without _schema_version gets version 1', () => {
  const legacy = {
    moq: 1000,
    selling_price: 0.2,
    materials: [{ code: 'M001' }],
    inks: [],
    processes: [],
  };
  const next = upgradeStdState(legacy);
  assert.equal(next._schema_version, STD_SHAPE_VERSION);
  assert.not = assert.notEqual || assert.notEqual;
  assert.ok(next !== legacy, 'must return a new object on upgrade');
});

test('upgradeStdState: _mid back-filled on every material row', () => {
  const legacy = {
    materials: [
      { code: 'M001' }, // missing _mid
      { code: 'M002', _mid: 'existing-mid' },
      { code: 'M003' },
    ],
  };
  const next = upgradeStdState(legacy);
  assert.equal(next.materials.length, 3);
  assert.ok(next.materials[0]._mid, 'row 0 got _mid');
  assert.equal(next.materials[1]._mid, 'existing-mid', 'row 1 kept existing _mid');
  assert.ok(next.materials[2]._mid, 'row 2 got _mid');
  // New _mids follow the `m_<ts>_<rand>` shape produced by the factory.
  assert.match(next.materials[0]._mid, /^m_\d+_[a-z0-9]+$/);
});

test('upgradeStdState: numeric defaults filled when missing', () => {
  const legacy = {};
  const next = upgradeStdState(legacy);
  assert.equal(next.active_moq_idx, 0);
  assert.equal(next.num_moq, 1);
  assert.deepEqual(next.extra_moqs, []);
});

test('upgradeStdState: preserves explicit numeric values (no clobber)', () => {
  const explicit = {
    active_moq_idx: 2,
    num_moq: 3,
    extra_moqs: [{ moq: 1000 }],
  };
  const next = upgradeStdState(explicit);
  assert.equal(next.active_moq_idx, 2);
  assert.equal(next.num_moq, 3);
  assert.equal(next.extra_moqs.length, 1);
});

test('upgradeStdState: already-current state returned by reference (short-circuit)', () => {
  const current = {
    _schema_version: STD_SHAPE_VERSION,
    active_moq_idx: 0,
    num_moq: 1,
    extra_moqs: [],
    materials: [{ code: 'M001', _mid: 'm_0_a' }],
  };
  const next = upgradeStdState(current);
  assert.equal(next, current, 'no-op when fully upgraded (reference equality)');
});

test('upgradeStdState: idempotent — re-running produces same result (deep equal)', () => {
  const legacy = {
    moq: 1000,
    materials: [{ code: 'M001' }, { code: 'M002' }],
    inks: [{ color: 'C' }],
    processes: [{ workcenter: 'Flexo-A' }],
  };
  const once = upgradeStdState(legacy);
  const twice = upgradeStdState(once);
  // Second run short-circuits → identity match.
  assert.equal(twice, once);
});

test('upgradeStdState: v1-stamped but materials missing _mid → re-backfills', () => {
  // Guards against a stale dev build that stamped _schema_version=1
  // without running ensureMids. upgradeStdState notices + heals.
  const halfMigrated = {
    _schema_version: 1,
    active_moq_idx: 0,
    num_moq: 1,
    extra_moqs: [],
    materials: [{ code: 'M001' }], // no _mid despite version stamp
  };
  const next = upgradeStdState(halfMigrated);
  assert.ok(next.materials[0]._mid, 'missing _mid healed on current-version state');
});

test('upgradeStdState: preserves user fields untouched through migration', () => {
  const legacy = {
    rfq_number: 'RFQ-001',
    ccl_pn: 'T9999',
    selling_price: 0.05,
    description: 'Test part',
    materials: [{ code: 'M001', usage: 2, s_price: 5 }],
  };
  const next = upgradeStdState(legacy);
  assert.equal(next.rfq_number, 'RFQ-001');
  assert.equal(next.ccl_pn, 'T9999');
  assert.equal(next.selling_price, 0.05);
  assert.equal(next.description, 'Test part');
  assert.equal(next.materials[0].usage, 2);
  assert.equal(next.materials[0].s_price, 5);
});

// ─── Alt-materials feature (Sprint S-ALT-MAT, PR #A) ──────────────────
// Splits the single materials list into materials_main + materials_alt
// + materials_active. Old quotes lazy-migrate on load: their materials
// field becomes materials_main, alt starts empty, active defaults 'main'.
// state.materials is kept as a mirror of the active set so legacy readers
// (calcAll, validators, ink base-mat lookups) work without callsite churn.

test('upgradeStdState v2: pre-v2 quote with materials gets split into _main + _alt + active=main', () => {
  const v1 = {
    _schema_version: 1,
    active_moq_idx: 0,
    num_moq: 1,
    extra_moqs: [],
    materials: [
      { _mid: 'm_existing_a', code: 'M001', usage: 1 },
      { _mid: 'm_existing_b', code: 'M002', usage: 2 },
    ],
  };
  const next = upgradeStdState(v1);
  assert.equal(next._schema_version, STD_SHAPE_VERSION);
  assert.ok(Array.isArray(next.materials_main));
  assert.equal(next.materials_main.length, 2);
  assert.equal(next.materials_main[0].code, 'M001');
  assert.equal(next.materials_main[1].code, 'M002');
  assert.deepEqual(next.materials_alt, []);
  assert.equal(next.materials_active, 'main');
  // Mirror points at the active set so existing readers stay green.
  assert.equal(next.materials, next.materials_main);
});

test('upgradeStdState v2: unversioned legacy quote also splits to _main', () => {
  const legacy = {
    materials: [{ code: 'M001', usage: 1, s_price: 5 }],
  };
  const next = upgradeStdState(legacy);
  assert.equal(next._schema_version, STD_SHAPE_VERSION);
  assert.equal(next.materials_main.length, 1);
  assert.equal(next.materials_main[0].code, 'M001');
  assert.deepEqual(next.materials_alt, []);
  assert.equal(next.materials_active, 'main');
  assert.equal(next.materials, next.materials_main);
});

test('upgradeStdState v2: post-v2 quote with active=alt keeps the alt set + mirrors correctly', () => {
  // A quote that was saved on a build with the feature flag ON and the
  // operator chose Alternative. The migrator must respect the saved
  // active flag and point the mirror at materials_alt.
  const v2 = {
    _schema_version: 2,
    active_moq_idx: 0,
    num_moq: 1,
    extra_moqs: [],
    materials_main: [{ _mid: 'm_main_a', code: 'M001' }],
    materials_alt: [
      { _mid: 'm_alt_a', code: 'ALT001' },
      { _mid: 'm_alt_b', code: 'ALT002' },
    ],
    materials_active: 'alt',
    materials: [
      { _mid: 'm_alt_a', code: 'ALT001' },
      { _mid: 'm_alt_b', code: 'ALT002' },
    ],
  };
  const next = upgradeStdState(v2);
  assert.equal(next.materials_active, 'alt');
  assert.equal(next.materials_main[0].code, 'M001');
  assert.equal(next.materials_alt.length, 2);
  assert.equal(next.materials_alt[1].code, 'ALT002');
  // Mirror tracks alt set when active='alt'.
  assert.equal(next.materials[0].code, 'ALT001');
});

test('upgradeStdState v2: pre-v2 quote with no materials field at all → empty _main + empty _alt', () => {
  // A blank quote (createStdState round-trip on a fresh install) before
  // any rows are added. Migration must not crash on missing materials.
  const empty = { _schema_version: 1, active_moq_idx: 0, num_moq: 1, extra_moqs: [] };
  const next = upgradeStdState(empty);
  assert.equal(next._schema_version, STD_SHAPE_VERSION);
  assert.deepEqual(next.materials_main, []);
  assert.deepEqual(next.materials_alt, []);
  assert.equal(next.materials_active, 'main');
});

test('upgradeStdState: already-upgraded quote → returns same ref', () => {
  const quote = {
    _schema_version: STD_SHAPE_VERSION,
    materials_main: [{ _mid: 'm1', code: 'M001' }],
    materials_alt: [],
    materials_active: 'main',
    materials: [{ _mid: 'm1', code: 'M001' }],
    part_width: 462,
    part_length_md: 135,
  };
  const next = upgradeStdState(quote);
  assert.equal(next, quote, 'short-circuit when nothing needs healing');
});

// Option 2 anti-flash: _mid back-fill on inks + processes (in addition
// to materials). Without _mid, React keys fall back to index and rows
// remount on data refresh / save / sync → input loses focus mid-typing,
// row visually flashes. Heal pass ensures legacy quotes get IDs on load.
test('upgradeStdState: heals missing _mid on inks rows', () => {
  const quote = {
    _schema_version: 2,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    materials: [],
    inks: [
      { color: 'Red', ifs_code: 'I001' },
      { color: 'Blue', _mid: 'i_already' },
    ],
    processes: [],
  };
  const next = upgradeStdState(quote);
  assert.ok(next.inks[0]._mid, 'first ink should be back-filled with _mid');
  assert.equal(next.inks[1]._mid, 'i_already', 'second ink _mid preserved');
});

test('upgradeStdState: heals missing _mid on processes rows', () => {
  const quote = {
    _schema_version: 2,
    materials_main: [],
    materials_alt: [],
    materials_active: 'main',
    materials: [],
    inks: [],
    processes: [{ workcenter: 'Flexo-A' }, { workcenter: 'RDC-1', _mid: 'p_already' }],
  };
  const next = upgradeStdState(quote);
  assert.ok(next.processes[0]._mid, 'first process should be back-filled');
  assert.equal(next.processes[1]._mid, 'p_already', 'second process _mid preserved');
});

test('upgradeStdState: short-circuit when all _mid populated (no churn)', () => {
  const quote = {
    _schema_version: STD_SHAPE_VERSION,
    materials_main: [{ _mid: 'm1', code: 'M1' }],
    materials_alt: [],
    materials_active: 'main',
    materials: [{ _mid: 'm1', code: 'M1' }],
    inks: [{ _mid: 'i1', color: 'R' }],
    processes: [{ _mid: 'p1', workcenter: 'X' }],
    part_width: 100,
    part_length_md: 50,
  };
  const next = upgradeStdState(quote);
  assert.equal(next, quote, 'no _mid gaps + no print-cut mismatch → same ref');
});

// v3 (MES-3-FIX-41): per-row breakdown shape bump. Migration is idempotent
// and adds NO state fields — `result.rows` is populated on save, not on
// read (calcEngine is client-only, read-side heal needs orchestration).
test('upgradeStdState v3: legacy v2 quote bumps to v3 without state changes', () => {
  const v2 = {
    _schema_version: 2,
    materials_main: [{ _mid: 'm1', code: 'M1' }],
    materials_alt: [],
    materials_active: 'main',
    materials: [{ _mid: 'm1', code: 'M1' }],
    inks: [{ _mid: 'i1', color: 'R' }],
    processes: [{ _mid: 'p1', workcenter: 'X' }],
    part_width: 100,
    part_length_md: 50,
  };
  const next = upgradeStdState(v2);
  assert.equal(next._schema_version, 3);
  assert.deepEqual(next.materials_main, v2.materials_main);
  assert.deepEqual(next.inks, v2.inks);
  assert.deepEqual(next.processes, v2.processes);
});

test('upgradeStdState v3: idempotent — applying twice returns same shape', () => {
  const v2 = {
    _schema_version: 2,
    materials_main: [{ _mid: 'm1', code: 'M1' }],
    materials_alt: [],
    materials_active: 'main',
    materials: [{ _mid: 'm1', code: 'M1' }],
    inks: [{ _mid: 'i1', color: 'R' }],
    processes: [{ _mid: 'p1', workcenter: 'X' }],
    part_width: 100,
    part_length_md: 50,
  };
  const once = upgradeStdState(v2);
  const twice = upgradeStdState(once);
  assert.equal(once._schema_version, 3);
  assert.equal(twice._schema_version, 3);
  assert.equal(twice, once, 'second call returns same ref (short-circuit at v3)');
});
