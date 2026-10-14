import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutToolCostSources,
  layoutToolsTotal,
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
  // Numbered like the cutters since Prints 2-4 exist; the saved id stays 'plate'.
  assert.equal(plate.label, 'Plate 1 · Letter Press');
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

// ── layoutToolCostSources — Print 1–4 (2026-10-05) ───────────────────────────

test('Prints 2-4 add plate sources beside Print 1, numbered like the cutters', () => {
  const s = stdState();
  s.pl_plates = [
    { print_type: 'Silk screen', num_colors: 3 },
    {},
    { print_type: 'Flexo', num_colors: 1 },
  ];
  const plates = layoutToolCostSources(s, lib).filter((x) => x.kind === 'plate');
  assert.deepEqual(
    plates.map((p) => [p.id, p.label]),
    [
      ['plate', 'Plate 1 · Letter Press'],
      ['plate-1', 'Plate 2 · Silk screen'],
      ['plate-3', 'Plate 4 · Flexo'],
    ]
  );
  assert.equal(plates[1].cost, 330, 'Silk screen: base 110 × 3 colors');
  // Flexo: 340 × (240/1000) × (340/1000) × 1 + 7.5 = 35.244
  assert.ok(Math.abs(plates[2].cost - 35.244) < 1e-9, `flexo ${plates[2].cost}`);
});

test('an override sets a plate cost, also for a type the formula cannot price', () => {
  const s = stdState();
  s.pl_plate_cost = '40';
  s.pl_plates = [{ print_type: 'Indigo6800', num_colors: 4 }];
  const ids = () =>
    layoutToolCostSources(s, lib)
      .filter((x) => x.kind === 'plate')
      .map((p) => [p.id, p.cost]);
  assert.deepEqual(ids(), [['plate', 40]], 'Indigo has no plate formula, so no source yet');
  s.pl_plates[0].plate_cost = '15';
  assert.deepEqual(ids(), [
    ['plate', 40],
    ['plate-1', 15],
  ]);
});

test('a quote saved before Prints 2-4 existed yields exactly the plate source it had', () => {
  const plates = layoutToolCostSources(stdState(), lib).filter((x) => x.kind === 'plate');
  assert.equal(plates.length, 1);
  assert.equal(plates[0].id, 'plate');
  assert.ok(Math.abs(plates[0].cost - 23.056) < 1e-9, `plate ${plates[0].cost}`);
});

test('a Complex sub-product offers its own plates 1-4 and no cutters', () => {
  const sp = {
    pl_print_type: 'Flexo',
    pl_num_colors: 1,
    web_width_td: 200,
    sheet_length: 300,
    pl_plates: [{ print_type: 'Silk screen', num_colors: 2 }],
  };
  assert.deepEqual(
    layoutToolCostSources(sp, lib).map((x) => x.id),
    ['plate', 'plate-1']
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
  assert.equal(srcs[0].label, 'Plate 1 · Flexo');
});

// ── buildLayoutToolCosts ─────────────────────────────────────────────────────

// ── layoutToolsTotal — Total tools cost per side (2026-10-05) ───────────────
// The last row of each Layout summary table totals that table's own tools —
// the plates on the Print side, the cutters on the Cut side — each counted once
// at its price in cents, the figure each row shows, so a total equals the rows
// above it.

test('each side totals its own tools: the plates on Print, the cutters on Cut', () => {
  // Plate 1 Letter Press 23.056 shows as 23.06; Cutter 1 Knife/Wood 36.40.
  assert.equal(layoutToolsTotal(stdState(), lib, 'plate'), 23.06);
  assert.equal(layoutToolsTotal(stdState(), lib, 'cutter'), 36.4);
});

test('Total tools cost adds each tool as its row shows it, in cents', () => {
  const s = stdState();
  s.pl_plates = [{ print_type: 'Letter Press', num_colors: 2, film_lp_cost: 5 }];
  // Two plates of 23.056 show as 23.06 each: 23.06 + 23.06 = 46.12, where
  // rounding the raw sum (46.112) would read a cent short of the rows.
  assert.equal(layoutToolsTotal(s, lib, 'plate'), 46.12);
});

test('Total tools cost counts overrides and Prints 2-4', () => {
  const s = stdState();
  s.pl_plates = [{ print_type: 'Silk screen', num_colors: 3 }];
  s.cutter_costs = ['25', '', '', ''];
  assert.equal(layoutToolsTotal(s, lib, 'plate'), 353.06, '23.06 + 330');
  assert.equal(layoutToolsTotal(s, lib, 'cutter'), 25);
});

test('a tool with no cost adds nothing to Total tools cost', () => {
  const s = stdState();
  s.pl_plates = [{ print_type: 'Indigo6800', num_colors: 4 }];
  s.cutter_types = ['Knife/Wood', 'Knife/Wood', '', ''];
  s.cutter_cavities = ['2', '', '', ''];
  s.part_width = 0; // no geometry: the computed cutters have no cost yet
  s.print_part_width = 0;
  assert.equal(layoutToolsTotal(s, lib, 'plate'), 23.06);
  assert.equal(layoutToolsTotal(s, lib, 'cutter'), 0);
});

test('a Complex sub-product totals its plates, having no cutters', () => {
  const sp = {
    pl_print_type: 'Silk screen',
    pl_num_colors: 2,
    pl_plates: [{ print_type: 'Silk screen', num_colors: 1 }],
  };
  assert.equal(layoutToolsTotal(sp, lib, 'plate'), 330);
  assert.equal(layoutToolsTotal(sp, lib, 'cutter'), 0);
});

test('Total tools cost is 0 when the Layout prices no tool', () => {
  assert.equal(layoutToolsTotal({}, lib, 'plate'), 0);
  assert.equal(layoutToolsTotal(undefined, lib, 'cutter'), 0);
});

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
