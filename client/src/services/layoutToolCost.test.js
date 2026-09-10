import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutToolCostSources,
  buildLayoutToolCosts,
  effectiveToolCost,
  availableToolCostSources,
  suggestedSrcForProcess,
  layoutCutContext,
  allowedSourceKinds,
  pickableToolCostSources,
} from './layoutToolCost.js';
import { computePlateCost, getPlateBaseCost } from './plateCost.js';
import { computeCutterCost, effCavity } from './cutterCost.js';

// ── fixtures ────────────────────────────────────────────────────────────────
// Knife/Wood is a PERIMETER type: cost = round2(circumference × base + addon).
// With W=L=50, cavity=2 → perim=(50*2+50*2)/1000=0.2 m, circ=0.2×2=0.4 m,
// base 91 → 0.4×91 = 36.40 (matches the smoke "Cutter 1 · Knife/Wood $36.4").
const lib = {
  ddl: {
    plate_base_cost: { 'Letter Press': 80, Flexo: 340, 'Silk screen': 110, 'Film cost': 5 },
    cutter_cost: { 'Knife/Wood': 91, 'Jig&Fixture': 45 },
    cutter_addon: {},
    cutter_min: {},
  },
};

/** A Std state with a Plate source + Cutter 1 (Knife/Wood) source. */
function stdState() {
  return {
    // plate (Print Design Layout)
    pl_print_type: 'Letter Press',
    pl_num_colors: 2,
    web_width_td: 200,
    sheet_length: 300,
    pl_film_lp_cost: 5,
    // cutting geometry
    part_width: 50,
    part_length_md: 50,
    parts_web_across: 1,
    parts_in_md: 1,
    num_webs: 1,
    slit_after_print: false,
    cutter_types: ['Knife/Wood', '', '', ''],
    cutter_costs: ['', '', '', ''],
    cutter_cavities: ['2', '', '', ''],
  };
}

// ── layoutToolCostSources — plate ────────────────────────────────────────────

test('sources include Plate with correct label + cost matching computePlateCost', () => {
  const s = stdState();
  const srcs = layoutToolCostSources(s, lib);
  const plate = srcs.find((x) => x.id === 'plate');
  assert.ok(plate, 'plate source present');
  assert.equal(plate.kind, 'plate');
  assert.equal(plate.label, 'Plate · Letter Press');
  const expected = computePlateCost(
    { pt: 'Letter Press', colors: 2, webW: 200, sheetL: 300, filmLp: 5 },
    { plateBase: getPlateBaseCost(lib, 'Letter Press') }
  );
  assert.equal(plate.cost, Number(expected));
  // geometry 80×0.24×0.34×2 = 13.056 + C×filmLp(10) = 23.056
  assert.ok(Math.abs(plate.cost - 23.056) < 1e-9, `plate cost ${plate.cost}`);
});

test('Plate excluded when print type missing (cost null → not > 0)', () => {
  const s = stdState();
  s.pl_print_type = '';
  const srcs = layoutToolCostSources(s, lib);
  assert.equal(
    srcs.find((x) => x.id === 'plate'),
    undefined
  );
});

// ── layoutToolCostSources — cutters ──────────────────────────────────────────

test('non-empty cutter → source with computed cost matching CalcLayout formula', () => {
  const s = stdState();
  const srcs = layoutToolCostSources(s, lib);
  const c0 = srcs.find((x) => x.id === 'cutter-0');
  assert.ok(c0, 'cutter-0 present');
  assert.equal(c0.kind, 'cutter');
  assert.equal(c0.label, 'Cutter 1 · Knife/Wood');
  // mirror: computeCutterCost with the per-cutter cavity (override wins over
  // the global Cut Total/Shot) — exactly CalcLayout cutterCostAt(i).
  const { cutTotalPerShot, cutterWmm, cutterLmm } = layoutCutContext(s);
  const expected = computeCutterCost(
    'Knife/Wood',
    {
      widthMm: cutterWmm,
      lengthMm: cutterLmm,
      cavity: effCavity(s.cutter_cavities[0], cutTotalPerShot),
    },
    lib
  );
  assert.equal(c0.cost, Number(expected));
  assert.ok(Math.abs(c0.cost - 36.4) < 1e-9, `cutter cost ${c0.cost}`);
});

test('cutter_costs[i] operator override wins over the computed value', () => {
  const s = stdState();
  s.cutter_costs = ['50', '', '', ''];
  const c0 = layoutToolCostSources(s, lib).find((x) => x.id === 'cutter-0');
  assert.equal(c0.cost, 50);
});

test('empty cutter slots are skipped; only non-empty types yield sources', () => {
  const s = stdState();
  s.cutter_types = ['', 'Knife/Wood', '', ''];
  s.cutter_cavities = ['', '2', '', ''];
  const srcs = layoutToolCostSources(s, lib);
  assert.equal(
    srcs.find((x) => x.id === 'cutter-0'),
    undefined
  );
  assert.ok(srcs.find((x) => x.id === 'cutter-1'));
});

test('cutter with insufficient geometry (blank cost) is excluded', () => {
  const s = stdState();
  s.part_width = 0; // perimeter type needs W>0 → computeCutterCost returns ''
  s.print_part_width = 0;
  const srcs = layoutToolCostSources(s, lib);
  assert.equal(
    srcs.find((x) => x.id === 'cutter-0'),
    undefined
  );
});

test('Cpx sub-product (no cutter arrays) yields Plate only', () => {
  const sp = {
    pl_print_type: 'Flexo',
    pl_num_colors: 3,
    web_width_td: 150,
    sheet_length: 200,
    pl_film_lp_cost: 0,
    // no cutter_types / cutter_costs / cutter_cavities
  };
  const srcs = layoutToolCostSources(sp, lib);
  assert.equal(srcs.length, 1);
  assert.equal(srcs[0].id, 'plate');
  assert.equal(srcs[0].label, 'Plate · Flexo');
});

// ── buildLayoutToolCosts ─────────────────────────────────────────────────────

test('buildLayoutToolCosts flattens to id→cost map', () => {
  const map = buildLayoutToolCosts([
    { id: 'plate', cost: 23.056 },
    { id: 'cutter-0', cost: 36.4 },
  ]);
  assert.deepEqual(map, { plate: 23.056, 'cutter-0': 36.4 });
  assert.deepEqual(buildLayoutToolCosts(null), {});
});

// ── effectiveToolCost ────────────────────────────────────────────────────────

test('effectiveToolCost — assigned + present → source cost', () => {
  assert.equal(effectiveToolCost({ tool_cost_src: 'plate', tool_cost: 0 }, { plate: 23 }), 23);
});

test('effectiveToolCost — assigned but source GONE → 0 (force-0)', () => {
  assert.equal(effectiveToolCost({ tool_cost_src: 'cutter-1', tool_cost: 99 }, { plate: 23 }), 0);
  assert.equal(effectiveToolCost({ tool_cost_src: 'plate', tool_cost: 99 }, {}), 0);
});

test('effectiveToolCost — unassigned → manual tool_cost (golden BC)', () => {
  assert.equal(effectiveToolCost({ tool_cost_src: '', tool_cost: 12 }, { plate: 23 }), 12);
  assert.equal(effectiveToolCost({ tool_cost: 7 }, { plate: 23 }), 7);
  assert.equal(effectiveToolCost({}, undefined), 0);
});

// ── availableToolCostSources — no-duplicate invariant ────────────────────────

test('availableToolCostSources excludes sources taken by OTHER rows, keeps own pick', () => {
  const sources = [{ id: 'plate' }, { id: 'cutter-0' }, { id: 'cutter-1' }];
  const processes = [{ tool_cost_src: 'plate' }, { tool_cost_src: 'cutter-0' }, {}];
  // Row 2 (unassigned): plate + cutter-0 taken by 0/1 → only cutter-1 free.
  assert.deepEqual(
    availableToolCostSources(sources, processes, 2).map((s) => s.id),
    ['cutter-1']
  );
  // Row 0 (owns plate): plate visible again (own pick) + cutter-1 free.
  assert.deepEqual(
    availableToolCostSources(sources, processes, 0).map((s) => s.id),
    ['plate', 'cutter-1']
  );
  // No source appears for two different rows simultaneously.
  const forRow1 = availableToolCostSources(sources, processes, 1).map((s) => s.id);
  assert.ok(forRow1.includes('cutter-0')); // own
  assert.ok(!forRow1.includes('plate')); // taken by row 0
});

// ── suggestedSrcForProcess ───────────────────────────────────────────────────

test('suggestedSrcForProcess suggests plate for Pressplate tool_type or Print process_type', () => {
  assert.equal(suggestedSrcForProcess({ tool_type: 'Pressplate' }), 'plate');
  assert.equal(suggestedSrcForProcess({ process_type: 'Print' }), 'plate');
  assert.equal(suggestedSrcForProcess({ tool_type: 'Knife/Wood', process_type: 'Die_Cut' }), null);
  assert.equal(suggestedSrcForProcess({}), null);
  assert.equal(suggestedSrcForProcess(null), null);
});

// ── allowedSourceKinds — Print→plate, Cut→cutter, else none ──────────────────

test('allowedSourceKinds — Print process → {plate}', () => {
  assert.deepEqual([...allowedSourceKinds({ process_type: 'Print' })], ['plate']);
});

test('allowedSourceKinds — cutting processes → {cutter}', () => {
  for (const pt of ['Pre_Cut', 'Die_Cut', 'Special_cut']) {
    assert.deepEqual([...allowedSourceKinds({ process_type: pt })], ['cutter'], pt);
  }
});

test('allowedSourceKinds — Assembly/Inspection/ManualWork → none (no fallback)', () => {
  for (const pt of ['Assembly', 'Inspection', 'ManualWork']) {
    // even with a plate-ish tool_type, an explicit non-tool process → none.
    assert.equal(allowedSourceKinds({ process_type: pt, tool_type: 'Pressplate' }).size, 0, pt);
  }
});

test('allowedSourceKinds — Others/blank falls back to tool_type', () => {
  assert.deepEqual(
    [...allowedSourceKinds({ process_type: 'Others', tool_type: 'Pressplate' })],
    ['plate']
  );
  assert.deepEqual([...allowedSourceKinds({ process_type: '', tool_type: 'Knife' })], ['cutter']);
  assert.deepEqual(
    [...allowedSourceKinds({ process_type: 'Others', tool_type: 'Pinnacle Die' })],
    ['cutter']
  );
  assert.equal(allowedSourceKinds({ process_type: 'Others', tool_type: 'Jig' }).size, 0);
  assert.equal(allowedSourceKinds({}).size, 0);
});

// ── pickableToolCostSources — kind filter + no-dup pool ───────────────────────

const KIND_SOURCES = [
  { id: 'plate', kind: 'plate', label: 'Plate · Letter Press', cost: 23 },
  { id: 'cutter-0', kind: 'cutter', label: 'Cutter 1 · Knife/Wood', cost: 36.4 },
  { id: 'cutter-1', kind: 'cutter', label: 'Cutter 2 · Knife/Wood', cost: 54.6 },
];

test('pickable — a Print row sees ONLY the plate (no dao-cut costs)', () => {
  const procs = [{ process_type: 'Print' }];
  assert.deepEqual(
    pickableToolCostSources(KIND_SOURCES, procs, 0, procs[0]).map((s) => s.id),
    ['plate']
  );
});

test('pickable — a Die_Cut row sees ONLY cutters (no plate)', () => {
  const procs = [{ process_type: 'Die_Cut' }];
  assert.deepEqual(
    pickableToolCostSources(KIND_SOURCES, procs, 0, procs[0]).map((s) => s.id),
    ['cutter-0', 'cutter-1']
  );
});

test('pickable — an Inspection row sees NOTHING', () => {
  const procs = [{ process_type: 'Inspection' }];
  assert.deepEqual(pickableToolCostSources(KIND_SOURCES, procs, 0, procs[0]), []);
});

test('pickable — kind filter composes with the no-duplicate pool', () => {
  // cutter-0 taken by row 1; the Die_Cut row 0 then only sees cutter-1.
  const procs = [
    { process_type: 'Die_Cut' },
    { process_type: 'Die_Cut', tool_cost_src: 'cutter-0' },
  ];
  assert.deepEqual(
    pickableToolCostSources(KIND_SOURCES, procs, 0, procs[0]).map((s) => s.id),
    ['cutter-1']
  );
});

// ── layoutCutContext — geometry mirror ───────────────────────────────────────

test('layoutCutContext reproduces CalcLayout cutTotalPerShot (slit off = numWebs × cavity)', () => {
  const s = { parts_web_across: 2, parts_in_md: 3, num_webs: 2, slit_after_print: false };
  const { cutTotalPerShot } = layoutCutContext(s);
  // cavityAuto = 2×3 = 6; slit off → 2 × 6 = 12
  assert.equal(cutTotalPerShot, 12);
});

test('layoutCutContext — slit on → cavity only; explicit cutter_cavity wins', () => {
  const s = {
    parts_web_across: 2,
    parts_in_md: 3,
    num_webs: 4,
    slit_after_print: true,
    cutter_cavity: 5,
  };
  const { cutTotalPerShot } = layoutCutContext(s);
  assert.equal(cutTotalPerShot, 5); // explicit cavity, slit on → 5
});
