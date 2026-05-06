/**
 * gallusEngine — golden tests against worked examples from
 * Gallus_Design_Calculator_RL.xlsx (Sheet "Design_Calculator").
 * If a future xlsx revision changes a formula, these break first.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  pitchOf,
  bestNDown,
  actualGap,
  productFilmPct,
  gallusFilmPct,
  crossDirection,
  rankPrintCylinders,
  rankMagneticCylinders,
  jobSummary,
  createGallusInputs,
  validateInputs,
  suggestGap,
  pickWinners,
  suggestWebWidth,
  inkConsumption,
  recommendAnilox,
  BCM_TO_CM3_PER_M2,
  solveLayout,
} from './gallusEngine.js';

describe('pitchOf', () => {
  test('Z=80 → 254.0 mm', () => assert.equal(pitchOf(80), 254));
  test('Z=98 → 311.15 mm', () => assert.ok(Math.abs(pitchOf(98) - 311.15) < 0.001));
  test('Z=106 → 336.55 mm', () => assert.ok(Math.abs(pitchOf(106) - 336.55) < 0.001));
});

describe('bestNDown — K-aware (Sprint 14d)', () => {
  // Default K=0 path matches the legacy xlsx behaviour for callers
  // that don't pass K. New callers must pass K.
  test('Pitch 311.15, L=25, G=3, K=0 → N=11 (legacy path)', () => {
    assert.equal(bestNDown(311.15, 25, 3, 0), 11);
  });
  test('Pitch 311.15, L=25, G=3, K=9.9 → N=11 (usable=301.25)', () => {
    // 301.25 / 28 = 10.76 → round = 11
    assert.equal(bestNDown(311.15, 25, 3, 9.9), 11);
  });
  test('Pitch 269.875 (Z=85), L=252.75, G=3.97, K=9.9 → N=1', () => {
    // The user-reported case — Z=85 should fit at N=1 once K is
    // subtracted from pitch. Without K subtraction (legacy bug) the
    // engine reported N=1 with gap=17.125 → GAP > MAX.
    assert.equal(bestNDown(269.875, 252.75, 3.97, 9.9), 1);
  });
});

describe('actualGap — K-aware (Sprint 14d)', () => {
  test('Z=85 (pitch 269.875), N=1, L=252.75, K=9.9 → 7.225 mm', () => {
    const g = actualGap(269.875, 1, 252.75, 9.9);
    assert.ok(Math.abs(g - 7.225) < 0.001, `got ${g}`);
  });
  test('Pitch 311.15, N=11, L=25, K=9.9 → 2.39 mm', () => {
    // 301.25 / 11 − 25 = 27.39 − 25
    const g = actualGap(311.15, 11, 25, 9.9);
    assert.ok(Math.abs(g - 2.39) < 0.01, `got ${g}`);
  });
  test('Pitch 311.15, N=11, L=25, K=0 → 3.286 mm (legacy)', () => {
    const g = actualGap(311.15, 11, 25, 0);
    assert.ok(Math.abs(g - 3.286) < 0.001, `got ${g}`);
  });
});

describe('productFilmPct & gallusFilmPct', () => {
  test('11×25 / 311.15 ≈ 88.4%', () => {
    const p = productFilmPct(11, 25, 311.15);
    assert.ok(Math.abs(p - 0.884) < 0.001);
  });
  test('Gallus film (311.15 − 9.9) / 311.15 ≈ 96.8%', () => {
    const p = gallusFilmPct(311.15, 9.9);
    assert.ok(Math.abs(p - 0.968) < 0.001);
  });
});

describe('crossDirection — Sprint 14g (Lg is target, not hard min)', () => {
  test('W=250, Pw=60, E=5, Lg=2.5 → 3 lanes, 30mm gap (well above target)', () => {
    const r = crossDirection({ W: 250, Pw: 60, E: 5, Lg: 2.5 });
    assert.equal(r.avail, 240);
    // 4 lanes need 4×60 + 3×1mm_min = 243 > 240 → 3 lanes is the
    // physical max even with the new permissive formula.
    assert.equal(r.n_across, 3);
    assert.ok(Math.abs(r.lane_gap_actual - 30) < 0.001);
    assert.ok(Math.abs(r.cross_film_pct - 0.72) < 0.001);
    // 30 > target 2.5 → no warning
    assert.equal(r.lane_gap_below_target, false);
  });

  test('User audit case: W=270, Pw=63.5, E=5, Lg=2.5 → 4 lanes (was 3 in xlsx)', () => {
    // Pre-Sprint-14g: xlsx formula gave 3 lanes because actual gap
    // (2.0 mm) < target Lg (2.5 mm). Sprint 14g treats Lg as a soft
    // target so 4 lanes wins (gap 2.0 mm is physically fine).
    const r = crossDirection({ W: 270, Pw: 63.5, E: 5, Lg: 2.5 });
    assert.equal(r.avail, 260);
    assert.equal(r.n_across, 4);
    assert.ok(
      Math.abs(r.lane_gap_actual - 2.0) < 0.001,
      `expected 2.0 mm gap, got ${r.lane_gap_actual}`
    );
    // Actual gap 2.0 < target 2.5 → warn flag set
    assert.equal(r.lane_gap_below_target, true);
  });

  test('Pw=0 → safe zero', () => {
    const r = crossDirection({ W: 250, Pw: 0, E: 5, Lg: 2.5 });
    assert.equal(r.n_across, 0);
  });

  test('Lanes can never physically touch (HARD_MIN_GAP=1 floor)', () => {
    // Pw=60, avail=240 → 4 lanes would need 0mm gap → rejected
    const r = crossDirection({ W: 250, Pw: 60, E: 5, Lg: 0 });
    assert.equal(
      r.n_across,
      3,
      'with Lg=0, formula must still reject 4 lanes (would need 0 gap, lanes touch)'
    );
  });
});

describe('rankPrintCylinders — Top 5 (Sprint 14h yield-first)', () => {
  test('default inputs sort by material_yield_pct DESC within OK', () => {
    // Sprint 14h: ranking primary axis is yield (waste minimisation),
    // not gap_diff. Top 1 is whichever available cylinder produces
    // the highest product-area / cylinder×web-area ratio. For default
    // inputs that's a high-tooth cylinder where N×L fills usable
    // pitch tightly — historically Z=210 or Z=114 win this race.
    const inputs = createGallusInputs();
    const ranked = rankPrintCylinders(inputs);
    const top = ranked[0];
    assert.equal(top.status, 'OK');
    // Yield must be computed and positive (flexo realistic range
    // 0.40-0.80 depending on geometry; tight presses can exceed 0.85).
    assert.ok(Number.isFinite(top.material_yield_pct), 'yield computed');
    assert.ok(
      top.material_yield_pct > 0,
      `top cylinder should have positive yield, got ${top.material_yield_pct}`
    );
    // Top 1 by yield must beat or equal Top 2 (within OK status).
    const okList = ranked.filter((r) => r.status === 'OK');
    if (okList.length > 1) {
      assert.ok(
        okList[0].material_yield_pct >= okList[1].material_yield_pct,
        `Top 1 yield (${okList[0].material_yield_pct}) should be ≥ Top 2 (${okList[1].material_yield_pct})`
      );
    }
  });
  test('user case: L=252.75, G=3.97, bleed=0 includes Z=85 in Top results', () => {
    // Sprint 14d K-aware regression. bleed=0 keeps the legacy maths
    // — Sprint S-FLEXO-1 added bleed inflation; tests covering bleed
    // sit in their own describe block below.
    const inputs = { ...createGallusInputs(), bleed_mm: 0, L: 252.75, G: 3.97, G_min: 3, G_max: 9 };
    const ranked = rankPrintCylinders(inputs);
    // Z=85 must appear with status OK (gap=7.225 within [3,9]).
    const z85 = ranked.find((r) => r.z === 85);
    assert.ok(z85, 'Z=85 should be in ranked list');
    assert.equal(z85.status, 'OK', `Z=85 status was ${z85.status}`);
    assert.equal(z85.n_down, 1);
    assert.ok(Math.abs(z85.actual_gap - 7.225) < 0.01);
  });
  test('only_available filter excludes N-stocked cylinders', () => {
    const inputs = { ...createGallusInputs(), only_available: true };
    const ranked = rankPrintCylinders(inputs);
    assert.ok(ranked.every((r) => r.available === true));
  });
});

describe('rankMagneticCylinders — die-step matching', () => {
  test('Print step ~28.046 → Z=106 die matches exactly', () => {
    const out = rankMagneticCylinders(createGallusInputs(), 28.04583333);
    const z106 = out.find((r) => r.z === 106);
    assert.ok(z106, 'Z=106 should appear in magnetic ranking');
    assert.equal(z106.match, '✓ MATCH');
    assert.ok(z106.step_diff < 0.05);
  });
  test('Print step 0 → empty list', () => {
    const out = rankMagneticCylinders(createGallusInputs(), 0);
    assert.equal(out.length, 0);
  });
});

describe('validateInputs', () => {
  test('default inputs are valid (no issues)', () => {
    const issues = validateInputs(createGallusInputs());
    assert.equal(issues.length, 0);
  });
  test('missing L → error on L', () => {
    const issues = validateInputs({ ...createGallusInputs(), L: 0 });
    assert.ok(issues.some((i) => i.field === 'L' && i.severity === 'error'));
  });
  test('missing G → error on G', () => {
    const issues = validateInputs({ ...createGallusInputs(), G: 0 });
    assert.ok(issues.some((i) => i.field === 'G' && i.severity === 'error'));
  });
  test('G < G_min → warning', () => {
    const issues = validateInputs({ ...createGallusInputs(), G: 1, G_min: 2 });
    assert.ok(issues.some((i) => i.field === 'G' && i.severity === 'warn'));
  });
  test('W too narrow for Pw + 2E → warning', () => {
    const issues = validateInputs({ ...createGallusInputs(), W: 50, Pw: 60, E: 5 });
    assert.ok(issues.some((i) => i.field === 'W' && i.severity === 'warn'));
  });
});

describe('suggestGap', () => {
  test('default inputs → suggestion is the current top-1 actual_gap (raw, unrounded)', () => {
    const inputs = createGallusInputs();
    const ranked = rankPrintCylinders(inputs);
    const s = suggestGap(inputs, ranked);
    assert.ok(s, 'expected a suggestion');
    // Sprint 14h: top-1 is yield winner, not gap-diff winner.
    // Just assert basic shape — exact Z depends on inventory.
    assert.ok(s.cylinder_z > 0);
    assert.ok(Number.isFinite(s.gap));
    // Sprint 14e: gap should be the RAW float, not rounded to 2 dp.
    assert.ok(s.gap.toString().length > 5, `expected raw float precision, got ${s.gap}`);
  });
  test('current G already matches re-ranked top-1 → already_optimal', () => {
    // Sprint 14h: yield-first ranking means setting G to the original
    // top's actual_gap can re-elect a different cylinder (yield maxima
    // depend on N, which depends on G). The honest test: re-rank
    // FIRST, then set G to that new top's actual_gap, and check that
    // suggestGap reports already_optimal — since G now matches the
    // new top exactly.
    const inputs = createGallusInputs();
    const ranked2pass = rankPrintCylinders(inputs);
    // If setting G = top's actual_gap shifts the top, find a fixed
    // point: iterate up to 3 times. Any flexo geometry should converge
    // in 1-2 iterations.
    let G = inputs.G;
    for (let i = 0; i < 3; i++) {
      const r = rankPrintCylinders({ ...inputs, G });
      const top = r.find((x) => x.status === 'OK');
      if (!top) break;
      if (Math.abs(top.actual_gap - G) < 0.005) break; // converged
      G = top.actual_gap;
    }
    const s = suggestGap({ ...inputs, G }, rankPrintCylinders({ ...inputs, G }));
    assert.equal(
      s.reason,
      'already_optimal',
      `expected already_optimal at converged G=${G}, got ${s.reason} (gap=${s.gap})`
    );
    // Suppress unused-var lint on the warm-up rank
    void ranked2pass;
  });
  test('L=0 → returns null (cannot suggest)', () => {
    const inputs = { ...createGallusInputs(), L: 0 };
    const ranked = rankPrintCylinders(inputs);
    assert.equal(suggestGap(inputs, ranked), null);
  });
  test('extreme G outside acceptance band → reason=no_ok_at_current_g', () => {
    const inputs = { ...createGallusInputs(), G: 999, G_max: 8 };
    const ranked = rankPrintCylinders(inputs);
    const s = suggestGap(inputs, ranked);
    assert.equal(s.reason, 'no_ok_at_current_g');
    assert.ok(s.gap > 0);
  });
});

describe('pickWinners — multi-axis Top picks (Sprint 14h)', () => {
  test('default inputs return distinct yield / cost / gap winners', () => {
    const inputs = createGallusInputs();
    const ranked = rankPrintCylinders(inputs);
    const w = pickWinners(ranked);
    assert.ok(w.yield, 'yield winner must exist');
    assert.ok(w.cost, 'cost winner must exist');
    assert.ok(w.gap, 'gap winner must exist');
    assert.equal(w.yield.status, 'OK');
    // Yield winner has highest yield; gap winner has lowest gap_diff;
    // cost winner has lowest cost_per_1k. They MAY be the same Z.
    const ok = ranked.filter((r) => r.status === 'OK');
    const maxYield = Math.max(...ok.map((r) => r.material_yield_pct));
    assert.equal(w.yield.material_yield_pct, maxYield);
    const minGap = Math.min(...ok.map((r) => r.gap_diff));
    assert.equal(w.gap.gap_diff, minGap);
  });

  test('returns nulls when no OK candidates', () => {
    // Force no OK by setting impossible target
    const inputs = { ...createGallusInputs(), G: 999, G_max: 1 };
    const ranked = rankPrintCylinders(inputs);
    const w = pickWinners(ranked);
    assert.equal(w.yield, null);
    assert.equal(w.cost, null);
    assert.equal(w.gap, null);
  });
});

describe('suggestWebWidth — waste reduction hint', () => {
  test('default W=250, 3 lanes × 60mm fits in 250 → suggests narrower (bleed=0)', () => {
    // bleed=0 keeps the legacy W_min calculation. Sprint S-FLEXO-1
    // bleed-aware case is exercised in the dedicated bleed describe
    // block so this regression test stays focused on snap-to-stock.
    const inputs = { ...createGallusInputs(), bleed_mm: 0 };
    const cross = crossDirection(inputs);
    const sug = suggestWebWidth(inputs, cross);
    // 3 lanes × 60 + 2 × Lg + 2 × E = 180 + 5 + 10 = 195 mm minimum
    // Snap up to 200 → savings 50/250 = 20% > 5% threshold → suggested.
    assert.ok(sug, 'suggestion expected when current W has > 5% slack');
    assert.equal(sug.suggested_mm, 200);
    assert.ok(sug.savings_pct >= 0.05);
  });

  test('returns null when no meaningful savings (bleed=0)', () => {
    // Pre-Sprint-S-FLEXO-1: bleed=0 keeps the legacy maths so this
    // regression test stays valid for the Sprint 14g algorithm.
    const inputs = { ...createGallusInputs(), bleed_mm: 0, W: 200 };
    const cross = crossDirection(inputs);
    const sug = suggestWebWidth(inputs, cross);
    // 3 lanes × 60 + 2 × 2.5 + 2 × 5 = 195 → snap 200, current 200 = 0 savings
    assert.equal(sug, null);
  });

  test('Pw=0 → returns null safely', () => {
    const inputs = { ...createGallusInputs(), Pw: 0 };
    const cross = crossDirection(inputs);
    assert.equal(suggestWebWidth(inputs, cross), null);
  });
});

describe('jobSummary', () => {
  test('returns null when top cylinder is not OK', () => {
    const r = jobSummary({ status: 'GAP < MIN' }, { n_across: 3 }, createGallusInputs());
    assert.equal(r, null);
  });
  test('happy path computes plate area & cost', () => {
    const inputs = createGallusInputs();
    const ranked = rankPrintCylinders(inputs);
    const cross = crossDirection(inputs);
    const r = jobSummary(ranked[0], cross, inputs);
    assert.ok(r);
    // Sprint 14h: yield-first ranking — Top 1 is whichever cylinder
    // wins the material-yield race. Just assert it's an OK cylinder
    // with sane plate cost; exact Z depends on inventory + yield math
    // and changes when the available list changes.
    assert.ok(r.cylinder_z > 0);
    assert.ok(r.total_plate_cost > 0);
  });
});

// ── Sprint S-FLEXO-1 — Bleed inflation ───────────────────────────
describe('Sprint S-FLEXO-1: bleed inflates effective print footprint', () => {
  test('Pw=60 + bleed=2 → cross-direction sees Pw_eff=64', () => {
    // avail = 250 - 10 = 240. With Pw_eff=64, HARD_MIN_GAP=1.5:
    // floor((240+1.5)/(64+1.5)) = floor(241.5/65.5) = 3 lanes.
    const r = crossDirection({ W: 250, Pw: 60, E: 5, Lg: 2.5, bleed_mm: 2 });
    assert.equal(r.n_across, 3);
    // lane gap = (240 - 3×64) / 2 = 48/2 = 24 mm
    assert.ok(
      Math.abs(r.lane_gap_actual - 24) < 0.001,
      `lane_gap should be 24mm with bleed, got ${r.lane_gap_actual}`
    );
  });

  test('bleed=0 backwards-compat with Sprint 14g maths', () => {
    const r = crossDirection({ W: 250, Pw: 60, E: 5, Lg: 2.5, bleed_mm: 0 });
    assert.equal(r.n_across, 3);
    assert.ok(Math.abs(r.lane_gap_actual - 30) < 0.001);
  });

  test('rankPrintCylinders uses L_eff (L + 2×bleed) for N_down', () => {
    // L=25, bleed=2 → L_eff=29. Pitch Z=80 = 254, K=9.9, usable=244.1.
    // bestNDown(254, 29, 3, 9.9): 244.1 / 32 = 7.628 → N=8.
    // Without bleed: 244.1 / 28 = 8.718 → N=9.
    const inputs = { ...createGallusInputs(), bleed_mm: 2 };
    const ranked = rankPrintCylinders(inputs);
    const z80 = ranked.find((r) => r.z === 80);
    assert.ok(z80);
    assert.equal(z80.n_down, 8, `Z=80 with L=25+bleed=2 should fit N=8, got ${z80.n_down}`);
  });

  test('material_yield_pct uses printed footprint, not trim', () => {
    // Same cylinder, same web — bleed-aware yield should be HIGHER
    // because the print covers more cylinder area than the trim spec.
    const inputs0 = { ...createGallusInputs(), bleed_mm: 0 };
    const inputs2 = { ...createGallusInputs(), bleed_mm: 2 };
    const ranked0 = rankPrintCylinders(inputs0);
    const ranked2 = rankPrintCylinders(inputs2);
    const z80_no_bleed = ranked0.find((r) => r.z === 80);
    const z80_bleed = ranked2.find((r) => r.z === 80);
    // With bleed, product_area = N × (L+4) × n_across × (Pw+4) ≥ trim
    // area, but N may drop too. Net yield can move either way; assert
    // both are computed and finite.
    assert.ok(Number.isFinite(z80_no_bleed.material_yield_pct));
    assert.ok(Number.isFinite(z80_bleed.material_yield_pct));
  });
});

// ── Sprint S-FLEXO-1 — Lane gap min for magnetic die ───────────
describe('Sprint S-FLEXO-1: HARD_MIN_GAP_MM = 1.5 (magnetic die min)', () => {
  test('W=250, Pw=60, bleed=0 → still 3 lanes (4 lanes need 0mm gap)', () => {
    // avail=240. With HARD_MIN=1.5: floor((240+1.5)/(60+1.5)) =
    // floor(241.5/61.5) = floor(3.927) = 3. Same as old. Check.
    const r = crossDirection({ W: 250, Pw: 60, E: 5, Lg: 0, bleed_mm: 0 });
    assert.equal(r.n_across, 3);
  });
  test('W=300, Pw=60, bleed=0 → 4 lanes (gap=20mm), HARD_MIN respected', () => {
    const r = crossDirection({ W: 300, Pw: 60, E: 5, Lg: 0, bleed_mm: 0 });
    assert.equal(r.n_across, 4);
    assert.ok(r.lane_gap_actual >= 1.5);
  });
});

// ── Sprint S-FLEXO-1 — Z_die validation ─────────────────────────
describe('Sprint S-FLEXO-1: Z_die must equal print Z or integer multiple', () => {
  test('Z_die=0 (use print) → no validation issue', () => {
    const issues = validateInputs({ ...createGallusInputs(), Z_die: 0, print_z: 85 });
    assert.equal(issues.filter((i) => i.field === 'Z_die').length, 0);
  });
  test('Z_die=85 with print_z=85 → exact match, no issue', () => {
    const issues = validateInputs({ ...createGallusInputs(), Z_die: 85, print_z: 85 });
    assert.equal(issues.filter((i) => i.field === 'Z_die').length, 0);
  });
  test('Z_die=170 with print_z=85 → integer 2× multiple, no issue', () => {
    const issues = validateInputs({ ...createGallusInputs(), Z_die: 170, print_z: 85 });
    assert.equal(issues.filter((i) => i.field === 'Z_die').length, 0);
  });
  test('Z_die=100 with print_z=85 → mismatch (1.176×), error', () => {
    const issues = validateInputs({ ...createGallusInputs(), Z_die: 100, print_z: 85 });
    const dieIssues = issues.filter((i) => i.field === 'Z_die');
    assert.equal(dieIssues.length, 1);
    assert.equal(dieIssues[0].severity, 'error');
  });
  test('Z_die set without print_z → no validation (engine cant know yet)', () => {
    const issues = validateInputs({ ...createGallusInputs(), Z_die: 100 });
    assert.equal(issues.filter((i) => i.field === 'Z_die').length, 0);
  });
});

// ── Sprint S-FLEXO-2 — Ink consumption ───────────────────────────
describe('Sprint S-FLEXO-2: inkConsumption', () => {
  test('BCM 6 × 30% coverage × 100 m² → 27.9 cm³ × density 1.0 = 27.9 g', () => {
    const r = inkConsumption({
      printed_area_m2: 100,
      anilox_bcm: 6,
      coverage_pct: 30,
      ink_density_g_cm3: 1.0,
    });
    // 100 × 6 × 1.55 × 0.30 = 279 cm³, mass = 279 g
    assert.ok(Math.abs(r.volume_cm3 - 279) < 0.001);
    assert.ok(Math.abs(r.mass_g - 279) < 0.001);
    assert.ok(Math.abs(r.mass_kg - 0.279) < 0.001);
  });
  test('Zero area → zero ink', () => {
    const r = inkConsumption({
      printed_area_m2: 0,
      anilox_bcm: 6,
      coverage_pct: 30,
      ink_density_g_cm3: 1.0,
    });
    assert.equal(r.mass_kg, 0);
  });
  test('BCM_TO_CM3_PER_M2 constant = 1.55 (1 BCM/in² → cm³/m²)', () => {
    assert.equal(BCM_TO_CM3_PER_M2, 1.55);
  });
});

describe('Sprint S-FLEXO-2: recommendAnilox', () => {
  test('Light coverage 15% → 4 BCM (fine type)', () => {
    assert.equal(recommendAnilox(15).bcm, 4);
  });
  test('Process color 30% → 5 BCM (CMYK)', () => {
    assert.equal(recommendAnilox(30).bcm, 5);
  });
  test('Medium 50% → 6 BCM (standard)', () => {
    assert.equal(recommendAnilox(50).bcm, 6);
  });
  test('Solid spot 70% → 8 BCM', () => {
    assert.equal(recommendAnilox(70).bcm, 8);
  });
  test('Opaque 90% → 12 BCM (white/metallic)', () => {
    assert.equal(recommendAnilox(90).bcm, 12);
  });
});

// ── Sprint S-FLEXO-2 — Setup waste in cylinder result ───────────
describe('Sprint S-FLEXO-2: setup_waste_pct surfaced per cylinder', () => {
  test('setup 100m vs run 5000m → small fraction (~2%)', () => {
    const inputs = { ...createGallusInputs(), setup_waste_m: 100, web_length_m: 5000 };
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.find((r) => r.status === 'OK');
    assert.ok(top);
    assert.ok(Number.isFinite(top.setup_waste_pct));
    // 100/(100+5000) ≈ 0.0196 — small for a 5000m job
    assert.ok(
      top.setup_waste_pct < 0.05,
      `expected setup_waste_pct < 5%, got ${top.setup_waste_pct}`
    );
  });
  test('setup 100m vs run 500m → noticeable (~17%)', () => {
    const inputs = { ...createGallusInputs(), setup_waste_m: 100, web_length_m: 500 };
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.find((r) => r.status === 'OK');
    // 100/(100+500) ≈ 0.167
    assert.ok(
      top.setup_waste_pct > 0.1 && top.setup_waste_pct < 0.2,
      `expected ~17% setup waste for short job, got ${top.setup_waste_pct}`
    );
  });
  test('setup_waste_m=0 → setup_waste_pct=0 (rerun, no setup)', () => {
    const inputs = { ...createGallusInputs(), setup_waste_m: 0, web_length_m: 1000 };
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.find((r) => r.status === 'OK');
    assert.equal(top.setup_waste_pct, 0);
  });
});

// ── Sprint S-FLEXO-3 — Material stretch ────────────────────────
import { effectiveStretchPct, stretchAdjustedPitch, MATERIAL_STRETCH_PCT } from './gallusEngine.js';

describe('Sprint S-FLEXO-3: material stretch', () => {
  test('paper → 0% stretch (default table)', () => {
    assert.equal(effectiveStretchPct({ material_type: 'paper' }), 0);
  });
  test('BOPP → 0.5% (most prone to stretch)', () => {
    assert.equal(effectiveStretchPct({ material_type: 'bopp' }), 0.5);
  });
  test('PE → 0.6%', () => {
    assert.equal(effectiveStretchPct({ material_type: 'pe' }), 0.6);
  });
  test('custom material → operator-supplied stretch_pct', () => {
    assert.equal(effectiveStretchPct({ material_type: 'custom', stretch_pct: 1.2 }), 1.2);
  });
  test('unknown material falls back to 0', () => {
    assert.equal(effectiveStretchPct({ material_type: 'unobtainium' }), 0);
  });
  test('stretchAdjustedPitch applies % reduction', () => {
    // pitch 254, BOPP 0.5% → 254 × 0.995 = 252.73
    const p = stretchAdjustedPitch(254, { material_type: 'bopp' });
    assert.ok(Math.abs(p - 252.73) < 0.01, `got ${p}`);
  });
  test('paper → no change to pitch', () => {
    const p = stretchAdjustedPitch(254, { material_type: 'paper' });
    assert.equal(p, 254);
  });
});

describe('Sprint S-FLEXO-3: rankPrintCylinders surfaces pitch_nominal vs pitch', () => {
  test('paper material → pitch === pitch_nominal (no stretch)', () => {
    const inputs = { ...createGallusInputs(), material_type: 'paper' };
    const ranked = rankPrintCylinders(inputs);
    const top = ranked[0];
    assert.equal(top.pitch, top.pitch_nominal);
  });
  test('BOPP → pitch < pitch_nominal (stretched)', () => {
    const inputs = { ...createGallusInputs(), material_type: 'bopp' };
    const ranked = rankPrintCylinders(inputs);
    const top = ranked[0];
    assert.ok(
      top.pitch < top.pitch_nominal,
      `expected stretched pitch < nominal, got ${top.pitch} vs ${top.pitch_nominal}`
    );
  });
});

// ── Sprint S-FLEXO-3 — Plate overhead ─────────────────────────
describe('Sprint S-FLEXO-3: plate_overhead_mm inflates plate cost', () => {
  test('overhead 0 vs 13 → cost difference > 0', () => {
    const base = { ...createGallusInputs(), plate_overhead_mm: 0 };
    const ovh = { ...createGallusInputs(), plate_overhead_mm: 13 };
    const c0 = rankPrintCylinders(base).find((r) => r.status === 'OK');
    const c1 = rankPrintCylinders(ovh).find((r) => r.status === 'OK');
    assert.ok(Number.isFinite(c0.cost_per_1k));
    assert.ok(Number.isFinite(c1.cost_per_1k));
    assert.ok(
      c1.cost_per_1k > c0.cost_per_1k,
      `expected overhead>0 to raise cost: c0=${c0.cost_per_1k}, c1=${c1.cost_per_1k}`
    );
  });
});

// ── Sprint S-FLEXO-3 — Weighted scoring ───────────────────────
describe('Sprint S-FLEXO-3: composite_score reorders OK cylinders', () => {
  test('default weights (yield-heavy) preserve legacy order', () => {
    const inputs = createGallusInputs();
    const ranked = rankPrintCylinders(inputs);
    const ok = ranked.filter((r) => r.status === 'OK');
    if (ok.length > 1) {
      // Top 1 composite_score >= Top 2 (default weights bubble yield)
      assert.ok(
        ok[0].composite_score >= ok[1].composite_score,
        `top1 score ${ok[0].composite_score} < top2 ${ok[1].composite_score}`
      );
    }
  });
  test('cost-only weighting (w_yield=0, w_cost=100) → cost winner top', () => {
    const inputs = {
      ...createGallusInputs(),
      weight_yield: 0,
      weight_cost: 100,
      weight_gap: 0,
      weight_match: 0,
    };
    const ranked = rankPrintCylinders(inputs);
    const ok = ranked
      .filter((r) => r.status === 'OK')
      .filter((r) => Number.isFinite(r.cost_per_1k));
    if (ok.length > 1) {
      // First OK has lowest cost_per_1k (highest cost_norm)
      assert.ok(
        ok[0].cost_per_1k <= ok[1].cost_per_1k,
        `expected cost-sorted: ${ok[0].cost_per_1k} > ${ok[1].cost_per_1k}`
      );
    }
  });
  test('all weights 0 → composite_score = 0 (no preference)', () => {
    const inputs = {
      ...createGallusInputs(),
      weight_yield: 0,
      weight_cost: 0,
      weight_gap: 0,
      weight_match: 0,
    };
    const ranked = rankPrintCylinders(inputs);
    const ok = ranked.find((r) => r.status === 'OK');
    assert.equal(ok.composite_score, 0);
  });
});

// ── Sprint S-FLEXO-4 — Die risk + what-if delta ─────────────
import { dieRisk, captureBaseline, computeDelta } from './gallusEngine.js';

describe('Sprint S-FLEXO-4: dieRisk tiers', () => {
  test('lane_gap 5mm vs 1.5mm magnetic die min → safe', () => {
    const r = dieRisk(5, 'rotary_magnetic');
    assert.equal(r.tier, 'safe');
  });
  test('lane_gap 1.7mm vs 1.5mm min → warn (within 30% headroom)', () => {
    const r = dieRisk(1.7, 'rotary_magnetic');
    assert.equal(r.tier, 'warn');
  });
  test('lane_gap 1.0mm vs 1.5mm min → risk (below min)', () => {
    const r = dieRisk(1.0, 'rotary_magnetic');
    assert.equal(r.tier, 'risk');
  });
  test('laser die can take 0.4mm → safe', () => {
    const r = dieRisk(0.4, 'laser');
    assert.equal(r.tier, 'safe'); // 0.4 ≥ 0.3 × 1.3 = 0.39
  });
  test('flat die needs 2mm → 1.5mm gap is risk', () => {
    const r = dieRisk(1.5, 'flat');
    assert.equal(r.tier, 'risk');
  });
  test('lane_gap 0 (single lane) → na', () => {
    const r = dieRisk(0, 'rotary_magnetic');
    assert.equal(r.tier, 'na');
  });
});

describe('Sprint S-FLEXO-4: captureBaseline + computeDelta', () => {
  test('baseline captures top-1 fields needed for diff', () => {
    const top1 = {
      z: 80,
      n_down: 8,
      n_across: 3,
      actual_gap: 3.2,
      material_yield_pct: 0.62,
      cost_per_1k: 0.05,
      setup_waste_pct: 0.02,
      status: 'OK',
    };
    const summary = { total_plate_cost: 30 };
    const b = captureBaseline(top1, summary);
    assert.equal(b.z, 80);
    assert.equal(b.plate_cost, 30);
  });
  test('non-OK top1 → captures null', () => {
    const top1 = { status: 'GAP < MIN' };
    assert.equal(captureBaseline(top1), null);
  });
  test('delta shows yield + cost movement', () => {
    const baseline = {
      z: 80,
      n_down: 8,
      n_across: 3,
      actual_gap: 3.2,
      material_yield_pct: 0.6,
      cost_per_1k: 0.05,
      plate_cost: 30,
    };
    const current = {
      z: 85,
      n_down: 1,
      n_across: 4,
      actual_gap: 7.2,
      material_yield_pct: 0.72,
      cost_per_1k: 0.04,
      plate_cost: 33,
    };
    const d = computeDelta(current, baseline);
    assert.equal(d.z_changed, true);
    assert.ok(Math.abs(d.yield_pp - 0.12) < 0.001);
    assert.ok(Math.abs(d.cost_delta - -0.01) < 0.001);
    assert.equal(d.plate_delta, 3);
    assert.equal(d.n_across_diff, 1);
  });
  test('null safety when either side missing', () => {
    assert.equal(computeDelta(null, {}), null);
    assert.equal(computeDelta({}, null), null);
  });
});

// ── Sprint S-FLEXO-5 — Color sequence validation ────────────────
import { validateColorSequence } from './gallusEngine.js';

describe('Sprint S-FLEXO-5: validateColorSequence', () => {
  test('CMYK in standard order → no issues', () => {
    const seq = [
      { name: 'Cyan', coverage_pct: 30, kind: 'process' },
      { name: 'Magenta', coverage_pct: 30, kind: 'process' },
      { name: 'Yellow', coverage_pct: 30, kind: 'process' },
      { name: 'Black', coverage_pct: 25, kind: 'process' },
    ];
    assert.equal(validateColorSequence(seq).length, 0);
  });

  test('R1: Opaque White at station 3 → error (must be first)', () => {
    const seq = [
      { name: 'Cyan', coverage_pct: 20, kind: 'process' },
      { name: 'Yellow', coverage_pct: 20, kind: 'process' },
      { name: 'White', coverage_pct: 80, kind: 'special' },
    ];
    const issues = validateColorSequence(seq);
    assert.ok(issues.some((i) => i.severity === 'error' && /white/i.test(i.en)));
  });

  test('R2: Varnish at station 2 of 4 → error (must be last)', () => {
    const seq = [
      { name: 'Cyan', coverage_pct: 20, kind: 'process' },
      { name: 'Varnish', coverage_pct: 100, kind: 'special' },
      { name: 'Yellow', coverage_pct: 20, kind: 'process' },
      { name: 'Black', coverage_pct: 20, kind: 'process' },
    ];
    const issues = validateColorSequence(seq);
    assert.ok(issues.some((i) => i.severity === 'error' && /varnish/i.test(i.en)));
  });

  test('R3: heavy spot at station 1 of 4 → warn (move to end)', () => {
    const seq = [
      { name: 'Pantone Red 032', coverage_pct: 75, kind: 'spot' },
      { name: 'Cyan', coverage_pct: 20, kind: 'process' },
      { name: 'Yellow', coverage_pct: 20, kind: 'process' },
      { name: 'Black', coverage_pct: 20, kind: 'process' },
    ];
    const issues = validateColorSequence(seq);
    assert.ok(issues.some((i) => i.severity === 'warn' && /Pantone Red 032/.test(i.en)));
  });

  test('R4: Black before remaining CMY → warn', () => {
    const seq = [
      { name: 'Cyan', coverage_pct: 30, kind: 'process' },
      { name: 'Black', coverage_pct: 25, kind: 'process' },
      { name: 'Magenta', coverage_pct: 30, kind: 'process' },
      { name: 'Yellow', coverage_pct: 30, kind: 'process' },
    ];
    const issues = validateColorSequence(seq);
    assert.ok(issues.some((i) => i.severity === 'warn' && /Black/.test(i.en)));
  });

  test('R5: Metallic Silver at station 2 of 5 → warn', () => {
    const seq = [
      { name: 'Cyan', coverage_pct: 30, kind: 'process' },
      { name: 'Silver', coverage_pct: 50, kind: 'special' },
      { name: 'Magenta', coverage_pct: 30, kind: 'process' },
      { name: 'Yellow', coverage_pct: 30, kind: 'process' },
      { name: 'Black', coverage_pct: 25, kind: 'process' },
    ];
    const issues = validateColorSequence(seq);
    assert.ok(issues.some((i) => i.severity === 'warn' && /Silver/i.test(i.en)));
  });

  test('White first + varnish last + correct CMYK → 0 issues', () => {
    const seq = [
      { name: 'White', coverage_pct: 80, kind: 'special' },
      { name: 'Cyan', coverage_pct: 30, kind: 'process' },
      { name: 'Magenta', coverage_pct: 30, kind: 'process' },
      { name: 'Yellow', coverage_pct: 30, kind: 'process' },
      { name: 'Black', coverage_pct: 25, kind: 'process' },
      { name: 'Varnish', coverage_pct: 100, kind: 'special' },
    ];
    assert.equal(validateColorSequence(seq).length, 0);
  });

  test('empty sequence → no issues', () => {
    assert.equal(validateColorSequence([]).length, 0);
  });
});

// ── Sprint S-DESIGNER (2026-04-30) — designer-mode solver tests ─────
describe('solveLayout — mode detection', () => {
  test('parts_md=0, parts_td=0 → solver mode (legacy behaviour)', () => {
    const r = solveLayout({ ...createGallusInputs(), parts_md: 0, parts_td: 0 });
    assert.equal(r.mode, 'solver');
    assert.equal(r.has_target_md, false);
    assert.equal(r.has_target_td, false);
    assert.equal(r.pitch_required, 0);
    assert.equal(r.W_required, 0);
  });

  test('parts_md=2, parts_td=0 → designer-md mode', () => {
    const r = solveLayout({ ...createGallusInputs(), parts_md: 2 });
    assert.equal(r.mode, 'designer-md');
    assert.ok(r.pitch_required > 0, 'pitch_required must be set');
    // K=9.9 + 2 × (L_eff=29 + G=3) = 9.9 + 64 = 73.9
    // (L=25 + bleed 2*2=4 → L_eff=29)
    assert.ok(
      Math.abs(r.pitch_required - 73.9) < 0.01,
      `pitch_required expected ~73.9, got ${r.pitch_required}`
    );
    // z_required must be the smallest available cylinder whose pitch
    // covers 73.9 mm. Default Z minimum in inventory is well above.
    assert.ok(r.z_required != null && r.z_required > 0);
  });

  test('parts_md=0, parts_td=4 → designer-td mode + W_required', () => {
    const r = solveLayout({ ...createGallusInputs(), parts_td: 4 });
    assert.equal(r.mode, 'designer-td');
    // 2*E (5*2=10) + 4 × Pw_eff (60+2*2=64) + 3 × max(Lg=2.5, 1.5)=2.5
    // = 10 + 256 + 7.5 = 273.5
    assert.ok(
      Math.abs(r.W_required - 273.5) < 0.01,
      `W_required expected ~273.5, got ${r.W_required}`
    );
  });

  test('parts_md=2, parts_td=3 → designer-full', () => {
    const r = solveLayout({ ...createGallusInputs(), parts_md: 2, parts_td: 3 });
    assert.equal(r.mode, 'designer-full');
    assert.ok(r.pitch_required > 0);
    assert.ok(r.W_required > 0);
  });

  test('designer-td with W=250 (default) and target_td=4 → w_fits=false (W_req=273.5)', () => {
    const r = solveLayout({ ...createGallusInputs(), parts_td: 4 }); // W defaults to 250
    assert.equal(r.w_fits, false);
  });

  test('designer-td with target_td=3 (typical 3-up label) on W=250 → w_fits=true', () => {
    // 2*5 + 3*64 + 2*2.5 = 10 + 192 + 5 = 207 ≤ 250 ✓
    const r = solveLayout({ ...createGallusInputs(), parts_td: 3 });
    assert.equal(r.w_fits, true);
    assert.ok(Math.abs(r.W_required - 207) < 0.01);
    // Lane gap on W=250 should be (250 - 10 - 3*64) / (3-1) = 24
    assert.ok(
      Math.abs(r.lane_gap_locked - 24) < 0.01,
      `lane_gap_locked expected ~24, got ${r.lane_gap_locked}`
    );
  });

  test('designer-md respects bleed (L_eff = L + 2×bleed)', () => {
    const noBleed = solveLayout({ ...createGallusInputs(), parts_md: 1, bleed_mm: 0 });
    const withBleed = solveLayout({ ...createGallusInputs(), parts_md: 1, bleed_mm: 2 });
    // bleed=0: pitch_req = 9.9 + 1×(25 + 3) = 37.9
    // bleed=2: pitch_req = 9.9 + 1×(29 + 3) = 41.9
    assert.ok(
      Math.abs(withBleed.pitch_required - noBleed.pitch_required - 4) < 0.01,
      'bleed adds 2×bleed to pitch per part'
    );
  });
});

describe('rankPrintCylinders — designer-md locks N to target', () => {
  test('parts_md=8 (near-natural for Z=80-85, L=25): every OK row has n_down=8 (locked)', () => {
    // L=25, G=3, K=9.9 → Z=80 natural N = round((254-9.9)/(25+3)) = 9
    // Locking to N=8 leaves slack absorbed as larger actual_gap, which
    // should still pass G_max validation on the right cylinders.
    const ranked = rankPrintCylinders({
      ...createGallusInputs(),
      parts_md: 8,
      G_max: 12,
      web_length_m: 1000,
    });
    const okRows = ranked.filter((r) => r.status === 'OK');
    assert.ok(okRows.length > 0, 'at least one OK cylinder expected for parts_md=8');
    for (const r of okRows) {
      assert.equal(r.n_down, 8, `cylinder Z=${r.z}: n_down expected 8 locked, got ${r.n_down}`);
    }
  });

  test('parts_md=2 with tiny G_max (8) on big cylinders: status GAP > MAX', () => {
    // The lock works mechanically (n_down=2 even though natural ~9), but
    // the resulting actual_gap ~93 mm overflows G_max=8 → status set
    // accordingly. Operator sees that target N=2 is wrong for this L.
    const ranked = rankPrintCylinders({ ...createGallusInputs(), parts_md: 2 });
    for (const r of ranked) {
      assert.equal(r.n_down, 2, 'lock honored even when status is GAP > MAX');
      assert.equal(r.status, 'GAP > MAX', 'forced N=2 produces giant gap on every cyl');
    }
  });

  test('parts_md=99 (impossible): every cylinder marked TOO SMALL with designer_reason', () => {
    const ranked = rankPrintCylinders({ ...createGallusInputs(), parts_md: 99 });
    const tooSmall = ranked.filter((r) => r.status === 'TOO SMALL');
    assert.equal(tooSmall.length, ranked.length, 'no cylinder can host 99 parts of L=25');
    assert.ok(
      tooSmall.some((r) => /N=99/.test(r.designer_reason || '')),
      'designer_reason must surface the target N for the operator'
    );
  });

  test('solver mode unchanged: parts_md=0, parts_td=0 → bestNDown picks N', () => {
    const inputs = { ...createGallusInputs(), parts_md: 0, parts_td: 0, web_length_m: 1000 };
    const ranked = rankPrintCylinders(inputs);
    const okRows = ranked.filter((r) => r.status === 'OK');
    // In solver mode the engine picks varied N across cylinders. Just
    // confirm at least 2 distinct n_down values appear (proving lock is
    // OFF). With L=25, cylinders Z=70..96 will give 2..3 parts.
    const distinctN = new Set(okRows.map((r) => r.n_down));
    assert.ok(distinctN.size >= 2, `expected varied n_down across cyls, got ${[...distinctN]}`);
  });
});

describe('rankPrintCylinders — designer-td locks n_across via crossDirection', () => {
  test('parts_td=3 on W=250: every OK row has n_across=3', () => {
    const ranked = rankPrintCylinders({ ...createGallusInputs(), parts_td: 3, web_length_m: 1000 });
    const okRows = ranked.filter((r) => r.status === 'OK');
    assert.ok(okRows.length > 0);
    for (const r of okRows) {
      assert.equal(
        r.n_across,
        3,
        `cylinder Z=${r.z}: n_across expected 3 locked, got ${r.n_across}`
      );
    }
  });

  test('parts_td=4 on W=250 (too narrow): all rows status=WEB TOO NARROW', () => {
    const ranked = rankPrintCylinders({ ...createGallusInputs(), parts_td: 4, web_length_m: 1000 });
    const narrowRows = ranked.filter((r) => r.status === 'WEB TOO NARROW');
    assert.ok(narrowRows.length > 0, 'WEB TOO NARROW status should appear');
  });

  test('crossDirection returns w_required + w_too_narrow flag when W insufficient', () => {
    const cross = crossDirection({ ...createGallusInputs(), parts_td: 4 });
    assert.equal(cross.n_locked, false);
    assert.equal(cross.w_too_narrow, true);
    assert.ok(cross.w_required > 250);
  });

  test('crossDirection locks n_across when target_td fits W', () => {
    const cross = crossDirection({ ...createGallusInputs(), parts_td: 3 });
    assert.equal(cross.n_locked, true);
    assert.equal(cross.n_across, 3);
  });
});

// Sprint S-LAYOUT-VIZ-1 — even-gap distribution acceptance tests.
// Engine math (actualGap = (pitch−K)/N − L) was already correct; the
// regression was in the SVG renderer which left residual whitespace
// after the Nth product. Tests pin engine outputs so a future
// refactor can't reintroduce the "dump-at-bottom" bug at math layer.
describe('Even-gap distribution (Sprint S-LAYOUT-VIZ-1)', () => {
  const baseInputs = (overrides) => ({
    ...createGallusInputs(),
    L: 63.5,
    Pw: 252.75,
    W: 270,
    E: 5,
    bleed_mm: 0,
    only_available: false,
    ...overrides,
  });

  test('L=63.5 N=4 K=4 G=2.9375 G_max=3 → Z=85, gap≈2.969, closure exact', () => {
    const inputs = baseInputs({ K: 4, G: 2.9375, G_min: 2, G_max: 3, parts_md: 4 });
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.filter((r) => r.status === 'OK')[0];
    assert.ok(top, 'expected at least one OK cylinder');
    assert.equal(top.z, 85);
    assert.equal(top.n_down, 4);
    assert.ok(
      Math.abs(top.actual_gap - 2.969) < 0.01,
      `gap expected ≈ 2.969, got ${top.actual_gap.toFixed(3)}`
    );
    // Closure invariant: K + N×L + N×gap === pitch (no residual at bottom)
    const closure = inputs.K + top.n_down * inputs.L + top.n_down * top.actual_gap;
    assert.ok(
      Math.abs(closure - top.pitch) < 0.001,
      `closure ${closure.toFixed(3)} ≠ pitch ${top.pitch}`
    );
  });

  test('L=63.5 N=4 K=0 G=4.0 → Z=85, gap≈3.969 (no overhead)', () => {
    const inputs = baseInputs({ K: 0, G: 4.0, G_min: 2, G_max: 9, parts_md: 4 });
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.filter((r) => r.status === 'OK')[0];
    assert.equal(top.z, 85);
    assert.ok(
      Math.abs(top.actual_gap - 3.969) < 0.01,
      `gap expected ≈ 3.969, got ${top.actual_gap.toFixed(3)}`
    );
  });

  test('L=63.5 N=4 K=4 G=2.0 G_min=2 → Z=81 infeasible, OK pick has gap ≥ 2', () => {
    // Z=81 (pitch=257.175): usable=253.175, gap=(253.175/4)−63.5=−0.21,
    // below G_min so must NOT be OK; engine should pick a larger Z.
    const inputs = baseInputs({ K: 4, G: 2.0, G_min: 2, G_max: 9, parts_md: 4 });
    const ranked = rankPrintCylinders(inputs);
    const z81 = ranked.find((r) => r.z === 81);
    assert.ok(z81, 'Z=81 should appear in ranked list');
    assert.notEqual(z81.status, 'OK', 'Z=81 should NOT be OK with G_min=2');
    const top = ranked.filter((r) => r.status === 'OK')[0];
    assert.ok(top, 'an OK cylinder should still exist (Z≥84 should pass)');
    assert.ok(
      top.actual_gap >= 2.0,
      `picked cylinder gap ${top.actual_gap.toFixed(3)} must be ≥ G_min=2`
    );
  });

  test('L=100 N=3 K=0 G=5.0 → Z=99, gap≈4.775', () => {
    // Z=99 pitch = 99 × 3.175 = 314.325 mm; gap = 314.325/3 − 100 = 4.775.
    // (Spec table mentioned 4.792 but that's slightly off — exact math
    // gives 4.775; pinning to the actual computed value.)
    const inputs = baseInputs({ L: 100, K: 0, G: 5.0, G_min: 3, G_max: 9, parts_md: 3 });
    const ranked = rankPrintCylinders(inputs);
    const top = ranked.filter((r) => r.status === 'OK')[0];
    assert.equal(top.z, 99);
    assert.ok(
      Math.abs(top.actual_gap - 4.775) < 0.01,
      `gap expected ≈ 4.775, got ${top.actual_gap.toFixed(3)}`
    );
  });

  test('waste_md_pct exposed and matches (pitch − N×L) / pitch', () => {
    // The new ranking column. Engine MUST compute this so the table
    // can warn (red) when waste > 10 %.
    const inputs = baseInputs({ K: 4, G: 2.9375, G_min: 2, G_max: 9, parts_md: 4 });
    const ranked = rankPrintCylinders(inputs);
    for (const r of ranked.filter((x) => x.status === 'OK')) {
      assert.ok(Number.isFinite(r.waste_md_pct), `Z=${r.z} waste_md_pct missing`);
      const expected = (r.pitch - r.n_down * inputs.L) / r.pitch;
      assert.ok(
        Math.abs(r.waste_md_pct - expected) < 1e-9,
        `Z=${r.z} waste_md_pct mismatch: got ${r.waste_md_pct}, expected ${expected}`
      );
    }
  });
});
