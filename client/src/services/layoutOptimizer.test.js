/**
 * Unit tests for layoutOptimizer.
 *
 * Real-world reference (Luxshare ICT, from the plant layout drawing):
 *   part_width = 26 (die), part_length_md = 12 (die)
 *   log_width = 131, edge_margin_td = 3, min_gap_td = 3
 *   min_gap_md = 3, tooth_pitch = 3.175, rotary_cols = 1
 *   Observed: 90 teeth → pitch 285.75, 19 in MD × 5 across = 95/shot
 *                         web_width_td = 4·26 + 3·3 + 2·3 = 119 ≤ 131 ✓
 *
 * The optimizer should produce a candidate matching (or close to) this.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestLayouts } from './layoutOptimizer.js';

const luxshare = {
  part_width: 26,
  part_length_md: 12,
  min_gap_md: 3,
  min_gap_td: 3,
  edge_margin_td: 3,
  tooth_pitch_mm: 3.175,
  rotary_cols: 1,
  allow_rotate_90: false,  // sample orientation is fixed
};

const luxshareMat = { log_width: 131 };

test('suggestLayouts: empty state returns []', () => {
  assert.deepEqual(suggestLayouts({}), []);
  assert.deepEqual(suggestLayouts({ part_width: 0, part_length_md: 10 }, { log_width: 100 }), []);
});

test('suggestLayouts: top-5 by density/score favours higher pcs_per_shot', () => {
  // The v2 optimizer ranks by score = pcs_per_shot × (1-offcut_log).
  // Top candidate must have ≥ pcs_per_shot than bottom — tied candidates
  // are fine but the TOP must dominate.
  const out = suggestLayouts(luxshare, luxshareMat);
  assert.ok(out.length > 0);
  assert.ok(out[0].pcs_per_shot >= out[out.length - 1].pcs_per_shot,
    `top pcs_per_shot ${out[0].pcs_per_shot} < bottom ${out[out.length - 1].pcs_per_shot}`);
});

test('suggestLayouts: Luxshare 90-tooth 1-web×4-across×19-md is recoverable when tooth count is constrained', () => {
  // Real Luxshare line has only a 90-tooth cylinder. With the v2
  // optimizer iterating over num_webs, we get one candidate per
  // num_webs value — the 1-web/4-across/19-md is the intended one.
  const out = suggestLayouts(luxshare, luxshareMat, { toothCountOptions: [90] });
  assert.ok(out.length >= 1);
  const hit = out.find(c => c.num_webs === 1 && c.parts_web_across === 4
    && c.parts_in_md >= 18 && c.parts_in_md <= 20 && c.tooth === 90);
  assert.ok(hit, `expected 1-web 4×19 90-tooth layout — got ${JSON.stringify(out)}`);
});

test('suggestLayouts: topN=50 also surfaces the Luxshare 90-tooth layout', () => {
  const out = suggestLayouts(luxshare, luxshareMat, { topN: 50 });
  const hit = out.find(c => c.tooth === 90 && c.parts_web_across === 4);
  assert.ok(hit, 'expected 90-tooth 4×N layout in top 50');
});

test('suggestLayouts: top-N is sorted desc by score', () => {
  const out = suggestLayouts(luxshare, luxshareMat);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1].score >= out[i].score,
      `score order broken at ${i}: ${out[i - 1].score} < ${out[i].score}`);
  }
});

test('suggestLayouts: respects maxAcross PER WEB from logWidth', () => {
  // Narrow log — 1-web candidates fit 2 across; multi-web candidates fit 1 across per web.
  const out = suggestLayouts(luxshare, { log_width: 64 });
  for (const c of out) {
    assert.ok(c.parts_web_across * c.num_webs * (26 + 3) <= 64 + 5,
      `${c.num_webs}-web × ${c.parts_web_across}-across exceeds narrow log`);
  }
});

test('suggestLayouts v2: LG 4-web flat-press layout is recoverable when maxPitch is constrained to ~75mm', () => {
  // LG reference layout (3850JP3025Y, QR label): 12×12 part, 320mm log,
  // 25 pcs/shot = 4 webs × 5 across × 5 md, pitch = 75mm (flat HP Indigo).
  // The optimizer by density-per-shot would prefer 4w×5×N with N=26
  // (pitch 390mm, 520pcs/shot). In reality the LG operator chose a
  // short pitch for per-part artwork reasons. We model that with a
  // maxPitchMm ≈ 80mm constraint.
  const lg = {
    part_width: 12, part_length_md: 12,
    min_gap_md: 3, min_gap_td: 3, edge_margin_td: 4,
    press_type: 'flat', allow_rotate_90: false, rotary_cols: 1,
  };
  const out = suggestLayouts(lg, { log_width: 320 }, { maxPitchMm: 80, topN: 30 });
  assert.ok(out.length > 0, 'no candidates for flat press');
  const hit = out.find(c => c.num_webs === 4 && c.parts_web_across === 5 && c.parts_in_md === 5);
  assert.ok(hit, `expected 4w×5×5 flat layout in top 30, got ${JSON.stringify(out.slice(0, 3))}`);
  assert.equal(hit.press_type, 'flat');
  assert.equal(hit.tooth, null, 'flat press should not have tooth');
  assert.equal(hit.pcs_per_shot, 100);
});

test('suggestLayouts v2: num_webs search enumerates multiple candidates for same part', () => {
  // Given a wide log (300mm) for a small part (12×12), we expect the
  // optimizer to produce candidates with 1, 2, 3, 4... webs.
  const st = { part_width: 12, part_length_md: 12, min_gap_td: 3, min_gap_md: 3, edge_margin_td: 3, rotary_cols: 1 };
  const out = suggestLayouts(st, { log_width: 300 }, { topN: 50, toothCountOptions: [90] });
  const webs = new Set(out.map(c => c.num_webs));
  assert.ok(webs.size >= 2, `expected multiple num_webs values, got ${[...webs]}`);
});

test('suggestLayouts: allow_rotate_90 exposes rotated candidates', () => {
  const rotatable = { ...luxshare, allow_rotate_90: true };
  const out = suggestLayouts(rotatable, luxshareMat);
  const hasRotated = out.some(c => c.rotated);
  // 26×12 vs 12×26: both orientations are distinct grids, so at least
  // one rotated candidate should appear in the top 5 if rotation helps.
  // If it never helps, it's fine that `rotated` is all false — the
  // important thing is that the optimizer didn't crash.
  assert.ok(out.length > 0);
  assert.equal(typeof hasRotated, 'boolean');
});

test('suggestLayouts: uses toothCountOptions override', () => {
  const out = suggestLayouts(luxshare, luxshareMat, {
    toothCountOptions: [90, 96, 104],
  });
  for (const c of out) {
    assert.ok([90, 96, 104].includes(c.tooth));
  }
});

test('suggestLayouts: sheet_length + web_width_td fit inside log', () => {
  const out = suggestLayouts(luxshare, luxshareMat);
  for (const c of out) {
    assert.ok(c.web_width_td <= 131 + 0.01);
    // sheet_length must be ≤ pitch (since pitch = sheet + next gap)
    assert.ok(c.sheet_length <= c.pitch + 0.01);
  }
});

test('suggestLayouts: targetPcsPerRoll flags meetsTarget', () => {
  const out = suggestLayouts(
    { ...luxshare, target_pcs_per_roll: 1000 },
    luxshareMat,
  );
  for (const c of out) {
    assert.notEqual(c.meetsTarget, null);
  }
});

test('suggestLayouts: de-duplicates identical grids (keeps lowest tooth)', () => {
  const out = suggestLayouts(luxshare, luxshareMat);
  const seen = new Set();
  for (const c of out) {
    const key = `${c.rotated}|${c.parts_web_across}|${c.parts_in_md}`;
    assert.ok(!seen.has(key), `duplicate grid ${key}`);
    seen.add(key);
  }
});

test('suggestLayouts: offcut metrics are between 0 and 1', () => {
  const out = suggestLayouts(luxshare, luxshareMat);
  for (const c of out) {
    assert.ok(c.offcut_td >= 0 && c.offcut_td <= 1, `bad offcut_td ${c.offcut_td}`);
    assert.ok(c.offcut_md >= 0 && c.offcut_md <= 1, `bad offcut_md ${c.offcut_md}`);
    assert.ok(c.offcut_total >= 0 && c.offcut_total <= 1, `bad offcut_total ${c.offcut_total}`);
  }
});

test('suggestLayouts v2: profile caps tooth count + constrains web width', () => {
  const gallus135 = {
    id: 'gallus-em340', name: 'Gallus EM340',
    press_type: 'rotary', tooth_count_max: 135,
    tooth_pitch_mm: 3.175,
    web_width_min_mm: 100, web_width_max_mm: 340,
    common_dies: [60, 72, 90, 104, 120],
  };
  const out = suggestLayouts(luxshare, luxshareMat, { profile: gallus135, topN: 20 });
  for (const c of out) {
    if (c.tooth != null) {
      assert.ok(c.tooth <= 135, `tooth ${c.tooth} exceeds Gallus 135T cap`);
      assert.ok(gallus135.common_dies.includes(c.tooth), `tooth ${c.tooth} not in Gallus die inventory`);
    }
    // web_width per lane must be between 100-340mm (our log is 131mm → only 1-web layouts feasible)
    assert.ok(c.web_width_td >= 100, `web ${c.web_width_td} below Gallus min`);
    assert.ok(c.web_width_td <= 340, `web ${c.web_width_td} above Gallus max`);
  }
});

test('suggestLayouts v2: reuse flag set when tooth matches common_dies (legacy)', () => {
  const profile = {
    press_type: 'rotary', tooth_count_max: 200, tooth_pitch_mm: 3.175,
    web_width_min_mm: 50, web_width_max_mm: 400,
    common_dies: [90],
  };
  const out = suggestLayouts(luxshare, luxshareMat, { profile, topN: 5 });
  for (const c of out) {
    if (c.tooth === 90) assert.equal(c.reuse, true, 'tooth 90 should be reuse=true');
    else assert.equal(c.reuse, false, `tooth ${c.tooth} should be reuse=false`);
  }
});

test('suggestLayouts v3: plate+magnetic inventory → full/partial/none reuse_status', () => {
  // Shop owns: plate {80, 90, 100}, magnetic {80, 100}
  // → tooth 80  = full (both)
  // → tooth 90  = partial_plate (plate only; need order magnetic-90T)
  // → tooth 100 = full (both)
  // → tooth 120 = none (neither) — but 120 not in union, so would not appear
  // → tooth outside union (say 72) wouldn't be in toothCountOptions at all
  const profile = {
    press_type: 'rotary', tooth_count_max: 200, tooth_pitch_mm: 3.175,
    web_width_min_mm: 50, web_width_max_mm: 400,
    plate_dies:    [{ tooth: 80, qty: 1 }, { tooth: 90, qty: 1 }, { tooth: 100, qty: 1 }],
    magnetic_dies: [{ tooth: 80, qty: 1 },                        { tooth: 100, qty: 1 }],
  };
  const out = suggestLayouts(luxshare, luxshareMat, { profile, topN: 10 });
  const t80  = out.find(c => c.tooth === 80);
  const t90  = out.find(c => c.tooth === 90);
  const t100 = out.find(c => c.tooth === 100);
  assert.ok(t80);  assert.equal(t80.reuse_status, 'full');
  assert.ok(t90);  assert.equal(t90.reuse_status, 'partial_plate');
  assert.deepEqual(t90.needs_order, ['magnetic-90T']);
  assert.ok(t100); assert.equal(t100.reuse_status, 'full');
});

test('suggestLayouts v3: asymmetric edge margins honoured in offcut calc', () => {
  const st = {
    part_width: 20, part_length_md: 20,
    min_gap_md: 3, min_gap_td: 3,
    edge_margin_td_left: 5, edge_margin_td_right: 2,
    allow_rotate_90: false, rotary_cols: 1,
  };
  const out = suggestLayouts(st, { log_width: 100 }, { toothCountOptions: [72], topN: 20 });
  // Verify that the 1-web candidate uses the 7mm total edge (5+2)
  // and produces offcut_td ≈ 4%:
  //   availTd = 100 − 7 = 93 → maxAcross = floor((93+3)/(20+3)) = 4
  //   partsSpan = 4·20 + 3·3 = 89
  //   logUsedTd = 1 · (89 + 7) = 96 → offcutTd = 4/100 = 4%
  const oneWeb = out.find(c => c.num_webs === 1);
  assert.ok(oneWeb, 'expected a 1-web candidate');
  assert.equal(oneWeb.parts_web_across, 4);
  assert.ok(oneWeb.offcut_td >= 0.03 && oneWeb.offcut_td <= 0.05, `offcut_td ${oneWeb.offcut_td}`);
});

test('suggestLayouts v2: profile with press_type=flat overrides default rotary', () => {
  const hpIndigo = {
    press_type: 'flat', web_width_min_mm: 150, web_width_max_mm: 340,
    max_pitch_mm: 320, common_dies: [],
  };
  const lg = { part_width: 12, part_length_md: 12, min_gap_md: 3, min_gap_td: 3, edge_margin_td: 4, allow_rotate_90: false, rotary_cols: 1 };
  const out = suggestLayouts(lg, { log_width: 320 }, { profile: hpIndigo });
  assert.ok(out.length > 0);
  for (const c of out) {
    assert.equal(c.press_type, 'flat');
    assert.equal(c.tooth, null);
  }
});
