// @ts-check
/**
 * Plate cost (Print Design Layout) — pure formula + DDL lookups.
 * DISPLAY-ONLY; golden calcEngine unaffected. Runner:
 *   node --test src/services/plateCost.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePlateCost,
  getPlateBaseCost,
  getPlateFilmCost,
  normPrintType,
  DEFAULT_PLATE_BASE,
  PLATE_COUNT,
  plateAt,
  plateFieldPatch,
  plateCostAt,
  plateSourceId,
} from './plateCost.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const LIB = { ddl: { plate_base_cost: { ...DEFAULT_PLATE_BASE } } };

// ── Formula branches ─────────────────────────────────────────────

test('Letter Press = geometry + C*F', () => {
  // 80 * (140/1000) * (240/1000) * 2  +  2*5 = 5.376 + 10 = 15.376
  const r = computePlateCost(
    { pt: 'Letter Press', colors: 2, webW: 100, sheetL: 200, filmLp: 5 },
    { plateBase: 80 }
  );
  assert.ok(near(r, 15.376), `got ${r}`);
});

test('Flexo = geometry + 7.5', () => {
  // 340 * 0.14 * 0.24 * 2 = 22.848  +  7.5 = 30.348
  const r = computePlateCost(
    { pt: 'Flexo', colors: 2, webW: 100, sheetL: 200 },
    { plateBase: 340 }
  );
  assert.ok(near(r, 30.348), `got ${r}`);
});

test('Silk screen = PB * C (no geometry needed)', () => {
  const r = computePlateCost({ pt: 'Silkscreen', colors: 3 }, { plateBase: 110 });
  assert.equal(r, 330);
  // Even with W/L absent it still resolves.
  const r2 = computePlateCost(
    { pt: 'Silk screen', colors: 3, webW: 0, sheetL: 0 },
    { plateBase: 110 }
  );
  assert.equal(r2, 330);
});

test('missing W or L → null for Letter Press / Flexo', () => {
  assert.equal(
    computePlateCost(
      { pt: 'Letter Press', colors: 2, webW: 0, sheetL: 200, filmLp: 5 },
      { plateBase: 80 }
    ),
    null
  );
  assert.equal(
    computePlateCost({ pt: 'Flexo', colors: 2, webW: 100, sheetL: 0 }, { plateBase: 340 }),
    null
  );
});

test('PB<=0, C<=0, or empty print type → null', () => {
  assert.equal(
    computePlateCost({ pt: 'Letter Press', colors: 2, webW: 100, sheetL: 200 }, { plateBase: 0 }),
    null
  );
  assert.equal(
    computePlateCost({ pt: 'Letter Press', colors: 0, webW: 100, sheetL: 200 }, { plateBase: 80 }),
    null
  );
  assert.equal(
    computePlateCost({ pt: '', colors: 2, webW: 100, sheetL: 200 }, { plateBase: 80 }),
    null
  );
});

test('Indigo6800 (and any unknown type) → null even if a base is passed', () => {
  assert.equal(
    computePlateCost({ pt: 'Indigo6800', colors: 2, webW: 100, sheetL: 200 }, { plateBase: 99 }),
    null
  );
});

test('print-type match is whitespace/case-insensitive', () => {
  assert.equal(normPrintType('Letter press'), 'letterpress');
  assert.equal(normPrintType('Letter Press'), 'letterpress');
  assert.equal(normPrintType('Silkscreen'), normPrintType('Silk screen'));
  const r = computePlateCost(
    { pt: 'letter press', colors: 2, webW: 100, sheetL: 200, filmLp: 5 },
    { plateBase: 80 }
  );
  assert.ok(near(r, 15.376));
});

// ── DDL lookups ──────────────────────────────────────────────────

test('getPlateBaseCost resolves normalized print types; skips "Film cost"; fallback 0', () => {
  assert.equal(getPlateBaseCost(LIB, 'Letter press'), 80);
  assert.equal(getPlateBaseCost(LIB, 'Flexo'), 340);
  assert.equal(getPlateBaseCost(LIB, 'Silkscreen'), 110); // matches "Silk screen"
  assert.equal(getPlateBaseCost(LIB, 'Indigo6800'), 0); // missing key
  assert.equal(getPlateBaseCost(LIB, 'Film cost'), 0); // reserved row never resolves
  assert.equal(getPlateBaseCost({}, 'Letter Press'), 0); // no section
});

test('getPlateFilmCost reads the "Film cost" row; fallback 0', () => {
  assert.equal(getPlateFilmCost(LIB), 5);
  assert.equal(getPlateFilmCost({}), 0);
  assert.equal(getPlateFilmCost({ ddl: { plate_base_cost: {} } }), 0);
});

test('end-to-end: lib lookup feeds the formula', () => {
  const pb = getPlateBaseCost(LIB, 'Silkscreen');
  assert.equal(computePlateCost({ pt: 'Silkscreen', colors: 4 }, { plateBase: pb }), 440);
});

// ── Print 1–4 (2026-10-05): one plate per print type, like Cutter 1–4 ──────

test('there are four plates, as there are four cutters', () => {
  assert.equal(PLATE_COUNT, 4);
});

test('Print 1 reads the fields every quote already stores', () => {
  const s = { pl_print_type: 'Flexo', pl_num_colors: 3, pl_film_lp_cost: '', pl_plate_cost: '' };
  assert.deepEqual(plateAt(s, 0), {
    print_type: 'Flexo',
    num_colors: 3,
    film_lp_cost: '',
    plate_cost: '',
  });
});

test('Prints 2-4 read pl_plates, and a quote without it has three empty plates', () => {
  const s = { pl_plates: [{ print_type: 'Silk screen', num_colors: 2 }] };
  assert.equal(plateAt(s, 1).print_type, 'Silk screen');
  assert.equal(plateAt(s, 1).num_colors, 2);
  assert.equal(plateAt(s, 2).print_type, '');
  assert.equal(plateAt({}, 3).print_type, '');
});

test('a field of Print 1 is written to its own field, of Prints 2-4 to the pl_plates array', () => {
  assert.deepEqual(plateFieldPatch({}, 0, 'print_type', 'Flexo'), ['pl_print_type', 'Flexo']);
  assert.deepEqual(plateFieldPatch({}, 0, 'plate_cost', '12'), ['pl_plate_cost', '12']);
  const s = { pl_plates: [{ print_type: 'Flexo' }] };
  const [key, value] = plateFieldPatch(s, 3, 'num_colors', 4);
  assert.equal(key, 'pl_plates');
  assert.deepEqual(value, [{ print_type: 'Flexo' }, {}, { num_colors: 4 }]);
  assert.deepEqual(s.pl_plates, [{ print_type: 'Flexo' }], 'the state is not mutated');
});

test('plate cost: the formula by default, the override when one is entered', () => {
  const s = {
    web_width_td: 100,
    sheet_length: 200,
    pl_plates: [{ print_type: 'Letter Press', num_colors: 2, film_lp_cost: 5 }],
  };
  const auto = plateCostAt(s, 1, LIB);
  assert.ok(near(auto.cost, 15.376), `got ${auto.cost}`);
  assert.equal(auto.overridden, false);
  s.pl_plates[0].plate_cost = '12,5'; // typed the Vietnamese way
  const ovr = plateCostAt(s, 1, LIB);
  assert.equal(ovr.cost, 12.5);
  assert.equal(ovr.overridden, true);
  assert.ok(near(ovr.auto, 15.376), 'the formula value stays available for display');
});

test('a blank override is no override; Print 1 overrides through pl_plate_cost', () => {
  const s = {
    web_width_td: 100,
    sheet_length: 200,
    pl_print_type: 'Letter Press',
    pl_num_colors: 2,
    pl_film_lp_cost: 5,
    pl_plate_cost: '  ',
  };
  assert.equal(plateCostAt(s, 0, LIB).overridden, false);
  s.pl_plate_cost = 30;
  assert.equal(plateCostAt(s, 0, LIB).cost, 30);
});

test('source ids: Print 1 keeps "plate", the id saved process rows already point at', () => {
  assert.deepEqual([0, 1, 2, 3].map(plateSourceId), ['plate', 'plate-1', 'plate-2', 'plate-3']);
});
