/**
 * Gallus design calculator — pure functions.
 *
 * Mirrors `Gallus_Design_Calculator_RL.xlsx` (Sheet "Design_Calculator")
 * sections 1A–1B, 2, 3, 5, 6a, 6b, 7. Pure / side-effect-free so the
 * UI is just a thin wrapper around these — same engine can be reused
 * by tests and by future API endpoints if we ever expose this as a
 * server-side service.
 *
 * Conventions:
 *   pitch_mm = teeth × 25.4 / 8     (8 TPI standard)
 *   N_down   = round(pitch / (L + G))   — # rows of parts per cylinder rev
 *   actual_gap = pitch / N − L           — real gap when N is integer-rounded
 *   product_film_pct = N × L / pitch
 *   gallus_film_pct  = (pitch − K) / pitch   — useful print zone fraction
 *
 *   N_across = floor((W − 2E + Lg) / (Pw + Lg))   — # cross-web lanes
 *   lane_gap_actual = (W − 2E − N×Pw) / (N − 1)   — N>1
 *
 * The Excel formulas use ROUND(); we use Math.round() (banker's rounding
 * not relevant here — stride is always > 1 so half-rounding is rare).
 */

import {
  GALLUS_DEFAULTS,
  PRINT_CYLINDERS,
  MAGNETIC_CYLINDERS,
  getPrintCylinders,
} from './gallusInventory.js';

const {
  toothPitchMm,
  K_default,
  G_min_default,
  G_max_default,
  E_default,
  Lg_default,
  plate_cost_default,
} = GALLUS_DEFAULTS;

// ── Default inputs (what the form starts with on first open) ──────
export function createGallusInputs() {
  return {
    // Identifier fields — used by save-to-history + handoff to
    // Pricing (Std/Cpx). End CU PN is the customer's part number,
    // typically the index key when retrieving a past design.
    end_cu_pn: '',
    project: '',
    designer_note: '',

    L: 25, // product length down-web (mm)
    G: 3, // target gap between products (mm)
    G_min: G_min_default,
    G_max: G_max_default,
    K: K_default,
    only_available: true, // filter out N-stocked cylinders from Top 5

    W: 250, // total web width (mm)
    Pw: 60, // product width (cross-web, mm)
    E: E_default, // edge margin per side (mm)
    Lg: Lg_default, // target lane gap (mm)

    // Sprint S-PARTS (2026-04-29) — operator-supplied LAYOUT TARGETS.
    // Optional reference values. When > 0, the ranking algorithm
    // prefers cylinders / web widths whose computed n_down (parts_md)
    // and n_across (parts_td) match these targets. 0 = no preference,
    // engine falls back to pure yield/cost/gap optimisation.
    parts_md: 0, // target # parts down (per cylinder rev)
    parts_td: 0, // target # parts across (lanes)

    // Sprint S-FLEXO-1 (2026-04-29) — bleed margin per side (mm).
    // Real product needs bleed on EVERY edge so die-cut tolerance
    // (±0.3 mm) and color-registration drift don't expose white
    // around the printed area. 2 mm/side is the CCL Vietnam standard
    // for self-adhesive labels; 0 only for guillotine-trim sheet jobs.
    // Engine inflates L → L+2*bleed and Pw → Pw+2*bleed when computing
    // N_down / n_across so the cylinder selection accounts for the
    // physical print dimensions, not the trim spec.
    bleed_mm: 2,

    // Sprint S-FLEXO-2 (2026-04-29) — anilox + ink coverage.
    // Anilox volume (BCM = billion cubic microns / sq.in) determines
    // how much ink the cell delivers; coverage % is the printed-area
    // fraction per color. Together they drive ink consumption (kg/job)
    // and the anilox recommendation. Defaults pinned to CCL Vietnam's
    // most common config: 6 BCM + 30 % coverage (medium fill flexo).
    anilox_bcm: 6,
    coverage_pct: 30,
    ink_density_g_cm3: 1.0, // typical water-based ~1.0; UV ~1.1; metallic ~1.4

    // Sprint S-FLEXO-2 — setup waste in running meters. Flexo press
    // setup (color matching, register tuning, web threading) burns
    // material before the first sellable impression. CCL Vietnam
    // historical avg: 80–120 m + 20–30 min press time per color
    // change. Default 100 m × n_colors_per_change. 0 = no setup
    // (rerun of identical job, same plates already on press).
    setup_waste_m: 100,

    // Sprint S-FLEXO-3 (2026-04-29) — material stretch under press
    // tension. Engine reduces effective pitch by stretch_pct so the
    // selected cylinder accounts for register drift over a long run.
    // PE/BOPP: 0.3-0.8% (use 0.5% default), PET: ~0.1%, paper: ~0%.
    // The UI exposes a material_type select that maps to a default,
    // operator can override.
    material_type: 'paper', // paper | pet | bopp | pe | vinyl | custom
    stretch_pct: 0, // computed from material_type unless 'custom'

    // Sprint S-FLEXO-3 — plate gripper + tape gutter overhead. Real
    // plate area = (pitch + plate_overhead_mm) × W per color. Adds
    // ~$0.50-1.00 per color for the typical CCL job — small but
    // accumulates across high-color-count work.
    plate_overhead_mm: 13,

    // Sprint S-FLEXO-3 — weighted scoring axis weights (sum need not
    // equal 100; engine normalises). Profile-based UX uses a select
    // that snaps these to common presets but leaves them editable.
    // Defaults match Sprint 14h "yield-first" behaviour: yield=70,
    // cost=20, gap=10. Match weight only kicks in when parts_md/td set.
    weight_yield: 70,
    weight_cost: 20,
    weight_gap: 10,
    weight_match: 0,

    // Sprint S-FLEXO-5 (2026-04-29) — color sequence on press.
    // Order matters: trapping (overlap) tolerance is built by laying
    // larger-coverage / darker colors LAST so registration drift of
    // earlier stations is hidden under them. Lithography rules say
    // light → dark; flexo inverts because of wet-on-wet ink trapping
    // characteristics (heavier ink wins the trap).
    //
    // Each entry: { name, coverage_pct, kind: 'process'|'spot'|'special' }.
    // 'special' covers white, metallic, varnish — these have hard
    // sequencing rules (white always FIRST under spot for label work
    // on transparent film; varnish ALWAYS LAST). UI lets the operator
    // drag-reorder; engine flags violations as warn/error.
    color_sequence: [
      { name: 'Cyan', coverage_pct: 30, kind: 'process' },
      { name: 'Magenta', coverage_pct: 30, kind: 'process' },
      { name: 'Yellow', coverage_pct: 30, kind: 'process' },
      { name: 'Black', coverage_pct: 25, kind: 'process' },
    ],

    Z_die: 0, // 0 = use same Z as print cylinder
    plate_cost: plate_cost_default,
    // Sprint 14j — operators think in two equivalent units:
    //   web_length_m   — running meters of material to feed the press
    //   lot_run_qty    — number of finished pieces to produce
    // Both edit each other 2-way in the UI; whichever was typed last
    // wins, the other auto-recomputes from current pitch + N + lanes.
    web_length_m: 5000, // web meters per job (running m)
    lot_run_qty: 0, // 0 = derive from web_length_m
    n_colors: 4, // number of print plates needed

    // Sprint 14h — operator-uploaded artwork preview. Data URL of an
    // image (PNG/JPG/SVG) shown inside each product cell on the
    // ShotLayoutViz schematic. Visualisation only — not used by any
    // calc. Skipped from sessionStorage persistence by usePersistentInputs
    // when payload exceeds the size guard there.
    artwork_data_url: '',
    artwork_filename: '',
  };
}

// ── Pure formula helpers ──────────────────────────────────────────
export function pitchOf(z) {
  return z * toothPitchMm;
}

// Sprint 14d FIX — subtract K (print-zone overhead) before computing
// N and actual_gap. The original xlsx formula divides by raw pitch,
// which over-allocates cylinder area: in reality K mm of every
// cylinder is dedicated to clamps + registration marks and CAN'T
// carry plate. So N parts of stride (L+G) must fit in (pitch − K),
// not the full pitch.
//
// Concrete bug the original formula caused (audit 2026-04-25):
//   L=252.75, G=3.97, Z=85 (pitch=269.875), K=9.9
//   Excel formula:  N = round(269.875 / 256.72) = 1
//                   gap  = 269.875 − 252.75 = 17.125 → ✗ over G_max=9
//   Correct:        usable = 259.975
//                   N = round(259.975 / 256.72) = 1
//                   gap = 259.975 − 252.75 = 7.225 → ✓ within [3,9]
//
// The xlsx Legend even defines K as "vùng cylinder không in" but its
// formula treats K as a Film % display metric only — never as a
// binding constraint. That's the bug we're fixing here. Pass K=0 to
// recover the legacy (xlsx-style) behaviour for back-compat in tests.
export function usablePitch(pitch, K = 0) {
  return Math.max(0, pitch - (Number(K) || 0));
}

export function bestNDown(pitch, L, G, K = 0) {
  const usable = usablePitch(pitch, K);
  if (usable <= 0 || L + G <= 0) return 0;
  if (usable < L) return 0; // 1 product can't fit on the plate zone
  return Math.max(1, Math.round(usable / (L + G)));
}

export function actualGap(pitch, N, L, K = 0) {
  if (!N || N <= 0) return 0;
  const usable = usablePitch(pitch, K);
  return usable / N - L;
}

// ── Sprint S-DESIGNER (2026-04-30) — designer-mode solver ─────────
//
// Old behaviour (solver mode): given W and the cylinder library, the
// engine picked N_down and n_across that maximised yield. parts_md /
// parts_td were soft preference flags only — they nudged ranking but
// never CONSTRAINED the layout, and the schematic ignored them.
//
// New behaviour: when the operator sets parts_md or parts_td > 0, the
// engine SWITCHES to designer mode and treats those as hard constraints:
//
//   parts_md > 0 → N_down is LOCKED to parts_md. Engine reports the
//     pitch any cylinder needs to satisfy this (`pitch_required`) and
//     filters cylinders that physically cannot host N_down parts. Slack
//     pitch becomes a larger actual_gap, validated against G_min/G_max.
//
//   parts_td > 0 → n_across is LOCKED to parts_td. Engine reports the
//     web width required (`W_required`) and validates the actual
//     lane_gap on the operator's W against DIE_MIN_GAP_MM. If W is too
//     narrow, the row is flagged `WEB TOO NARROW`.
//
// `solveLayout` is the pure helper that surfaces the required-geometry
// figures up-front. UI shows them as a banner above the cylinder table.
//
// Formulas (continuous-web flexo, K = clamp+reg-mark dead zone):
//
//   pitch_required = K + N × L_eff + N × G_target
//     (N parts at L_eff each + N uniform gaps within the cylinder
//     plate-zone (pitch − K). The N-th gap absorbs the slack to the
//     start of the next revolution.)
//
//   W_required     = 2 × E + n × Pw_eff + (n − 1) × Lg_target
//     (n lanes at Pw_eff each + n−1 inter-lane gaps + 2 edge margins.)
//
//   z_required     = ceil(pitch_required / toothPitchMm), then snapped
//                    UP to the smallest available cylinder Z that gives
//                    pitch ≥ pitch_required. Stretch is reversed so the
//                    NOMINAL plate matches the post-stretch print zone.
export function solveLayout(inputs) {
  const target_md = Math.max(0, Math.floor(Number(inputs.parts_md) || 0));
  const target_td = Math.max(0, Math.floor(Number(inputs.parts_td) || 0));
  const has_target_md = target_md > 0;
  const has_target_td = target_td > 0;

  let mode = 'solver';
  if (has_target_md && has_target_td) mode = 'designer-full';
  else if (has_target_md) mode = 'designer-md';
  else if (has_target_td) mode = 'designer-td';

  const L_eff = effectiveL(inputs);
  const Pw_eff = effectivePw(inputs);
  const W = Number(inputs.W) || 0;
  const E = Number(inputs.E) || 0;
  const K = Number(inputs.K) || 0;
  const G = Number(inputs.G) || 0;
  const Lg = Math.max(Number(inputs.Lg) || 0, HARD_MIN_GAP_MM);

  // MD axis — required pitch to host target_md parts at the operator's
  // target gap G. Slack vs the cylinder picked becomes a larger
  // actual_gap (still bounded by G_min / G_max in rankPrintCylinders).
  const pitch_required = has_target_md ? K + target_md * (L_eff + G) : 0;

  // Account for stretch when sizing the nominal plate. Stretch reduces
  // the EFFECTIVE pitch under tension, so the unstretched cylinder must
  // be slightly larger so the stretched pitch still meets the requirement.
  const stretch_pct = effectiveStretchPct(inputs);
  const nominal_required =
    stretch_pct > 0 ? pitch_required / (1 - stretch_pct / 100) : pitch_required;

  let z_required = null;
  let pitch_required_actual = pitch_required;
  if (has_target_md && pitch_required > 0) {
    const candidates = getPrintCylinders()
      .filter((c) => !inputs.only_available || c.available)
      .map((c) => ({ z: c.z, pitch_nominal: pitchOf(c.z) }))
      .filter((c) => c.pitch_nominal >= nominal_required)
      .sort((a, b) => a.pitch_nominal - b.pitch_nominal);
    if (candidates[0]) {
      z_required = candidates[0].z;
      // Report the post-stretch pitch the picked cylinder will actually
      // deliver, so the UI shows what the operator gets, not the spec.
      pitch_required_actual = stretchAdjustedPitch(candidates[0].pitch_nominal, inputs);
    }
  }

  // TD axis — required web width to host target_td lanes.
  const W_required = has_target_td
    ? 2 * E + target_td * Pw_eff + Math.max(0, target_td - 1) * Lg
    : 0;
  const w_fits = !has_target_td || W >= W_required;

  // Validate the LOCKED lane_gap when designer-td is in effect on the
  // operator's W. Even if W is wide enough at Lg_target, we want to
  // surface the actual gap (which can be larger when W has slack) so
  // the schematic is honest.
  const avail = Math.max(0, W - 2 * E);
  const lane_gap_locked =
    has_target_td && w_fits
      ? target_td > 1
        ? (avail - target_td * Pw_eff) / (target_td - 1)
        : 0
      : null;

  return {
    mode,
    target_md,
    target_td,
    has_target_md,
    has_target_td,
    L_eff,
    Pw_eff,
    pitch_required,
    pitch_required_nominal: nominal_required,
    pitch_required_actual,
    z_required,
    W_required,
    w_fits,
    lane_gap_locked,
  };
}

// ── Sprint S-FLEXO-5 — Color sequence validation ──────────────
// Flexo wet-on-wet trapping rules. Each rule returns 0+ issues.
// Operator drags colors into press order; engine validates.
//
// Rules (in priority):
//   R1 — opaque white must be FIRST (under all colors when on clear film)
//   R2 — varnish / overprint coating must be LAST (seals everything)
//   R3 — high-coverage spot color (>=60 %) should be near the END so
//        registration drift of earlier process colors hides under it
//   R4 — process Black (CMYK) ideally LAST among process colors
//        (covers misregister of CMY)
//   R5 — metallic should be near LAST (high opacity, hides drift)
const SPECIAL_FIRST = ['white', 'opaque white'];
const SPECIAL_LAST = ['varnish', 'overprint', 'overprint varnish', 'op coat'];
const METALLIC = ['silver', 'gold', 'metallic'];

export function validateColorSequence(sequence) {
  const issues = [];
  if (!Array.isArray(sequence) || sequence.length === 0) return issues;
  const lower = sequence.map((c) =>
    String(c.name || '')
      .trim()
      .toLowerCase()
  );

  // R1 — opaque white not first
  const whiteIdx = lower.findIndex((n) => SPECIAL_FIRST.includes(n));
  if (whiteIdx > 0) {
    issues.push({
      severity: 'error',
      en: `Opaque White must be the FIRST color (currently station ${whiteIdx + 1}) — clear-film labels need white as base`,
      vi: `Trắng đục phải in ĐẦU TIÊN (hiện đang ở station ${whiteIdx + 1}) — film trong cần trắng làm nền`,
    });
  }

  // R2 — varnish not last
  const varnishIdx = lower.findIndex((n) => SPECIAL_LAST.includes(n));
  if (varnishIdx >= 0 && varnishIdx !== sequence.length - 1) {
    issues.push({
      severity: 'error',
      en: `Varnish / overprint coat must be the LAST color (currently station ${varnishIdx + 1})`,
      vi: `Varnish / overprint phải in CUỐI CÙNG (hiện đang ở station ${varnishIdx + 1})`,
    });
  }

  // R3 — heavy spot color (>=60 %) not in last 2 stations
  for (let i = 0; i < sequence.length - 2; i++) {
    const c = sequence[i];
    if (c.kind === 'spot' && Number(c.coverage_pct) >= 60) {
      issues.push({
        severity: 'warn',
        en: `Heavy spot color "${c.name}" (${c.coverage_pct} %) at station ${i + 1} — move toward the END so it covers register drift`,
        vi: `Spot color đậm "${c.name}" (${c.coverage_pct} %) đang ở station ${i + 1} — nên đẩy về CUỐI để che drift`,
      });
    }
  }

  // R4 — process Black before C/M/Y
  const blackIdx = lower.indexOf('black');
  if (blackIdx >= 0) {
    const cmyIdx = ['cyan', 'magenta', 'yellow'].map((n) => lower.indexOf(n));
    const lastCmy = Math.max(...cmyIdx);
    if (lastCmy > blackIdx) {
      issues.push({
        severity: 'warn',
        en: `Process Black at station ${blackIdx + 1} prints BEFORE another CMY color — Black usually closes the process group to mask CMY drift`,
        vi: `Black ở station ${blackIdx + 1} đang in TRƯỚC một màu CMY khác — Black nên in cuối nhóm process để che drift`,
      });
    }
  }

  // R5 — metallic mid-sequence (warn only — sometimes intentional)
  const metallicIdx = lower.findIndex((n) => METALLIC.some((m) => n.includes(m)));
  if (metallicIdx >= 0 && metallicIdx < sequence.length - 2) {
    issues.push({
      severity: 'warn',
      en: `Metallic "${sequence[metallicIdx].name}" at station ${metallicIdx + 1} — high opacity ink should usually print near the end`,
      vi: `Mực ánh kim "${sequence[metallicIdx].name}" ở station ${metallicIdx + 1} — mực opacity cao nên in gần cuối`,
    });
  }

  return issues;
}

// ── Sprint S-FLEXO-4 — Die risk assessment ────────────────────
// Translates lane_gap_actual into a tiered risk vs the chosen die
// technology. The UI surfaces a coloured pill near the cylinder
// summary and (for 'risk') blocks the "Apply to Pricing" CTA until
// the operator explicitly acknowledges.
//
//   safe : lane_gap >= die_min × 1.3   (≥30 % headroom)
//   warn : die_min  ≤ lane_gap < die_min × 1.3
//   risk : lane_gap < die_min          (will scrap or jam)
export function dieRisk(lane_gap_mm, die_type = 'rotary_magnetic') {
  const mn = DIE_MIN_GAP_MM[die_type] ?? DIE_MIN_GAP_MM.rotary_magnetic;
  if (lane_gap_mm <= 0) return { tier: 'na', die_min: mn };
  if (lane_gap_mm < mn)
    return {
      tier: 'risk',
      die_min: mn,
      en: `Lane gap ${lane_gap_mm.toFixed(2)} mm is below the ${die_type} die minimum (${mn} mm) — will scrap`,
      vi: `Khoảng cách lane ${lane_gap_mm.toFixed(2)} mm dưới mức tối thiểu của khuôn ${die_type} (${mn} mm) — sẽ scrap`,
    };
  if (lane_gap_mm < mn * 1.3)
    return {
      tier: 'warn',
      die_min: mn,
      en: `Lane gap ${lane_gap_mm.toFixed(2)} mm is tight (die min ${mn} mm); chip-jam risk on long runs`,
      vi: `Khoảng cách lane ${lane_gap_mm.toFixed(2)} mm sát giới hạn (min ${mn} mm); rủi ro chip kẹt khi run dài`,
    };
  return { tier: 'safe', die_min: mn };
}

// ── Sprint S-FLEXO-4 — What-if delta ──────────────────────────
// Snapshot helper: cherry-pick the operator-relevant metrics from a
// jobSummary + Top-1 cylinder so the UI can later diff a candidate
// scenario vs. the baseline. Pure: no React / no DOM.
export function captureBaseline(top1, summary) {
  if (!top1 || top1.status !== 'OK') return null;
  return {
    z: top1.z,
    n_down: top1.n_down,
    n_across: top1.n_across,
    actual_gap: top1.actual_gap,
    material_yield_pct: top1.material_yield_pct,
    cost_per_1k: top1.cost_per_1k,
    setup_waste_pct: top1.setup_waste_pct,
    plate_cost: summary?.total_plate_cost ?? null,
  };
}
export function computeDelta(current, baseline) {
  if (!current || !baseline) return null;
  const safeDelta = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : null);
  return {
    z_changed: current.z !== baseline.z,
    yield_pp: safeDelta(current.material_yield_pct, baseline.material_yield_pct),
    cost_delta: safeDelta(current.cost_per_1k, baseline.cost_per_1k),
    plate_delta: safeDelta(current.plate_cost, baseline.plate_cost),
    n_down_diff: safeDelta(current.n_down, baseline.n_down),
    n_across_diff: safeDelta(current.n_across, baseline.n_across),
  };
}

// ── Sprint S-FLEXO-3 — Material stretch ──────────────────────────
// Material stretches under press web tension (15-25 N/100mm). The
// stretch reduces the EFFECTIVE pitch the cylinder sees, so over a
// long run the printed image drifts vs. the unstretched die spec.
// Engine subtracts stretch_pct from the cylinder pitch when computing
// N_down + actual_gap, so the elected cylinder gives the correct
// step in the stretched state.
//
// Defaults sourced from CCL Vietnam internal "material register
// drift" study (Q3 2025) — operator can override via the 'custom'
// material_type + explicit stretch_pct.
export const MATERIAL_STRETCH_PCT = {
  paper: 0.0, // negligible
  pet: 0.1, // PET 12µm-50µm
  bopp: 0.5, // BOPP 25µm-50µm — most prone
  pe: 0.6, // PE 80µm-150µm — soft
  vinyl: 0.3, // PVC self-adhesive
  custom: null, // operator supplies
};
export function effectiveStretchPct(inputs) {
  const mat = String(inputs.material_type || 'paper').toLowerCase();
  if (mat === 'custom') return Math.max(0, Number(inputs.stretch_pct) || 0);
  const fromTable = MATERIAL_STRETCH_PCT[mat];
  return Number.isFinite(fromTable) ? fromTable : 0;
}
export function stretchAdjustedPitch(pitch, inputs) {
  const s = effectiveStretchPct(inputs);
  if (s <= 0) return pitch;
  return pitch * (1 - s / 100);
}

// ── Sprint S-FLEXO-2 — Ink consumption ───────────────────────────
// Convert anilox volume + coverage + printed area into ink mass.
//   BCM (cm³/m²) = bcm × 1.55  (1 BCM/in² ≈ 1.55 cm³/m²)
//   ink_volume_cm3 = printed_area_m² × bcm_cm3_per_m² × coverage_pct/100
//   ink_mass_g     = ink_volume_cm3 × density_g_cm3
//
// `printed_area_m2` is the total printed surface across the job,
// including bleed but excluding lane/MD gaps and edges (those don't
// receive ink).
export const BCM_TO_CM3_PER_M2 = 1.55;
export function inkConsumption({ printed_area_m2, anilox_bcm, coverage_pct, ink_density_g_cm3 }) {
  const A = Math.max(0, Number(printed_area_m2) || 0);
  const bcm = Math.max(0, Number(anilox_bcm) || 0);
  const cov = Math.max(0, Math.min(100, Number(coverage_pct) || 0));
  const rho = Math.max(0, Number(ink_density_g_cm3) || 0);
  const volume_cm3 = A * bcm * BCM_TO_CM3_PER_M2 * (cov / 100);
  return {
    volume_cm3,
    mass_g: volume_cm3 * rho,
    mass_kg: (volume_cm3 * rho) / 1000,
  };
}

// Anilox recommendation by job type. Cell volumes follow standard
// flexo industry buckets (Apex GTT line); recommendation is per-color.
export const ANILOX_RECOMMENDATION_BCM = [
  { range: 'Light coverage / fine type', bcm: 4 },
  { range: 'Process color (CMYK)', bcm: 5 },
  { range: 'Medium coverage / standard', bcm: 6 },
  { range: 'Solid spot / heavy ink', bcm: 8 },
  { range: 'Opaque white / metallic', bcm: 12 },
];
export function recommendAnilox(coverage_pct) {
  const c = Math.max(0, Number(coverage_pct) || 0);
  if (c < 20) return ANILOX_RECOMMENDATION_BCM[0];
  if (c < 40) return ANILOX_RECOMMENDATION_BCM[1];
  if (c < 60) return ANILOX_RECOMMENDATION_BCM[2];
  if (c < 85) return ANILOX_RECOMMENDATION_BCM[3];
  return ANILOX_RECOMMENDATION_BCM[4];
}

export function productFilmPct(N, L, pitch) {
  // Denominator stays raw pitch — this metric is "what fraction of the
  // cylinder is product", and the cylinder includes K (which is
  // intentionally non-product, so the metric correctly trends lower
  // when K eats more space).
  if (pitch <= 0) return 0;
  return (N * L) / pitch;
}

export function gallusFilmPct(pitch, K) {
  if (pitch <= 0 || pitch <= K) return 0;
  return (pitch - K) / pitch;
}

// ── Cross-direction (lane) calc ──────────────────────────────────
//
// Sprint 14g FIX — Lg is a TARGET, not a hard minimum. The xlsx
// formula `floor((avail + Lg) / (Pw + Lg))` treats Lg as the smallest
// acceptable lane gap, which rejects layouts where 1 more lane would
// fit with a smaller (but still physically reasonable) gap. Audit
// case: W=270, Pw=63.5, E=5, Lg=2.5 → xlsx returned 3 lanes (gap
// would be 30 mm wasted) but 4 lanes physically fit with a 2.0 mm
// gap — operationally fine.
//
// Correct algorithm:
//   1. Find the max lane count where actual gap >= a HARDCODED
//      physical minimum (HARD_MIN_GAP = 1 mm — lanes can't touch).
//      Lg is no longer a constraint at this stage.
//   2. Compute actual lane gap from the chosen lane count.
//   3. Return `lane_gap_below_target` so the UI can flag layouts
//      where the actual gap dipped below the operator's stated Lg
//      target — they can still proceed if it's acceptable.
// Sprint S-FLEXO-1 — magnetic die-cut blade width is 0.7 mm + tolerance
// 0.3 mm each side, so lanes physically can't sit closer than ~1.5 mm
// without scrap risk (chips kẹt giữa lanes, blade va edge product).
// Was 1.0 mm previously — under-spec for the rotary magnetic die that
// 90% of CCL Vietnam jobs use. Laser/flat dies override below.
export const DIE_MIN_GAP_MM = {
  rotary_magnetic: 1.5, // default Gallus magnetic
  laser: 0.3, // can cut closer
  flat: 2.0, // wider gap needed for stripping
};
const HARD_MIN_GAP_MM = DIE_MIN_GAP_MM.rotary_magnetic;

// Sprint S-FLEXO-1 — Pw_eff inflates the cross-direction product
// width by 2×bleed so the cylinder selection sees the PRINT footprint,
// not the trim spec. Without this, a 60 mm trim Pw with 2 mm bleed
// physically prints at 64 mm but the engine thinks 60 mm fits — the
// 65th mm of the next lane bleeds into the gap and prints over the
// adjacent product.
function effectivePw(inputs) {
  const Pw = Number(inputs.Pw) || 0;
  const bleed = Math.max(0, Number(inputs.bleed_mm) || 0);
  return Pw + 2 * bleed;
}
function effectiveL(inputs) {
  const L = Number(inputs.L) || 0;
  const bleed = Math.max(0, Number(inputs.bleed_mm) || 0);
  return L + 2 * bleed;
}

export function crossDirection(inputs) {
  const { W, E, Lg } = inputs;
  const Pw_eff = effectivePw(inputs);
  const avail = Math.max(0, W - 2 * E);
  if (Pw_eff <= 0)
    return {
      avail,
      n_across: 0,
      lane_gap_actual: 0,
      cross_film_pct: 0,
      lane_gap_below_target: false,
      n_locked: false,
    };

  // Sprint S-DESIGNER (2026-04-30) — designer-td locks n_across to the
  // operator-supplied target IF the web is wide enough. Lane_gap is
  // recomputed from the locked n on the actual W (not the target Lg)
  // so the schematic shows what the press will physically produce.
  // When the lock isn't possible (W too narrow), fall back to solver
  // n_across; rankPrintCylinders flags WEB TOO NARROW separately.
  const target_td = Math.max(0, Math.floor(Number(inputs.parts_td) || 0));
  const has_target_td = target_td > 0;
  if (has_target_td) {
    const Lg_min = Math.max(Number(Lg) || 0, HARD_MIN_GAP_MM);
    const w_required = 2 * E + target_td * Pw_eff + Math.max(0, target_td - 1) * Lg_min;
    if (W >= w_required) {
      const lane_gap_actual = target_td > 1 ? (avail - target_td * Pw_eff) / (target_td - 1) : 0;
      const cross_film_pct = (target_td * Pw_eff) / Math.max(W, 1);
      const lane_gap_below_target =
        target_td > 1 && Number.isFinite(Lg) && Lg > 0 && lane_gap_actual < Lg;
      return {
        avail,
        n_across: target_td,
        lane_gap_actual,
        cross_film_pct,
        lane_gap_below_target,
        n_locked: true,
        w_required,
      };
    }
    // W too narrow — surface the W_required so UI can prompt operator
    // to widen the web. n_across drops to solver fallback so the rank
    // table still has SOMETHING to show, but every row gets WEB TOO
    // NARROW status in rankPrintCylinders.
    const n_fallback = Math.max(
      1,
      Math.floor((avail + HARD_MIN_GAP_MM) / (Pw_eff + HARD_MIN_GAP_MM))
    );
    const lane_gap_fallback = n_fallback > 1 ? (avail - n_fallback * Pw_eff) / (n_fallback - 1) : 0;
    return {
      avail,
      n_across: n_fallback,
      lane_gap_actual: lane_gap_fallback,
      cross_film_pct: (n_fallback * Pw_eff) / Math.max(W, 1),
      lane_gap_below_target:
        n_fallback > 1 && Number.isFinite(Lg) && Lg > 0 && lane_gap_fallback < Lg,
      n_locked: false,
      w_required,
      w_too_narrow: true,
    };
  }

  // Solver mode (default, pre-Sprint-S-DESIGNER behaviour).
  const n_across = Math.max(1, Math.floor((avail + HARD_MIN_GAP_MM) / (Pw_eff + HARD_MIN_GAP_MM)));
  const lane_gap_actual = n_across > 1 ? (avail - n_across * Pw_eff) / (n_across - 1) : 0;
  // cross_film_pct uses Pw_eff (printed footprint) — the operator's
  // "what % of web carries print" intuition matches the print area,
  // not trim. UI may compute a separate trim-only ratio if needed.
  const cross_film_pct = (n_across * Pw_eff) / Math.max(W, 1);
  const lane_gap_below_target =
    n_across > 1 && Number.isFinite(Lg) && Lg > 0 && lane_gap_actual < Lg;
  return {
    avail,
    n_across,
    lane_gap_actual,
    cross_film_pct,
    lane_gap_below_target,
    n_locked: false,
  };
}

// ── Print cylinder ranking ───────────────────────────────────────
// Returns ALL cylinders enriched with multi-axis ranking metrics:
//
//   material_yield_pct: (product area / cylinder×web area) — primary
//                       waste-reduction signal. Higher = less material
//                       wasted on edges, gaps, K overhead. This is the
//                       single most important metric for high-volume
//                       jobs since plate cost amortizes but material
//                       waste scales linearly with run length.
//
//   cost_per_1k:        plate cost per 1,000 impressions. For SMALL
//                       jobs this dominates because the plate is a
//                       fixed setup cost — a bigger cylinder = more
//                       plate area = more cost, with no extra yield
//                       payback when total impressions are low.
//
//   gap_diff:           proximity of actual_gap to operator's target G.
//                       Original Excel rank metric; operationally
//                       weakest because actual_gap within [G_min, G_max]
//                       is fine — there's no real benefit to hitting
//                       G exactly.
//
// Sort order: yield_pct DESC within OK status, so the operator's
// default Top-1 minimises material waste. Cost/gap-match winners are
// surfaced as separate badges in the UI for jobs where those axes
// dominate.
//
// Sprint 14d/14h — K-aware N, actual_gap, and yield. Lg semantics
// (target, not min) flow through cross-direction calc separately.
export function rankPrintCylinders(inputs) {
  const {
    G,
    G_min,
    G_max,
    K,
    only_available,
    W,
    plate_cost,
    web_length_m,
    n_colors,
    parts_md,
    parts_td,
  } = inputs;
  // Sprint S-FLEXO-1 — bleed inflates the EFFECTIVE print footprint
  // used for cylinder selection. trimmed L (operator's spec) → L_eff
  // (what physically prints + bleed). All N_down / actual_gap /
  // material_yield_pct calcs use L_eff so the selected cylinder
  // accommodates the printed area, not the trim spec.
  const L = Number(inputs.L) || 0;
  const Pw = Number(inputs.Pw) || 0;
  const L_eff = effectiveL(inputs);
  const Pw_eff = effectivePw(inputs);
  const cross = crossDirection(inputs);
  const n_across = cross.n_across || 0;
  // Sprint S-PARTS — coerce optional targets. 0 / NaN / negative = "no
  // preference", in which case match flags stay false and ranking is
  // purely yield/cost/gap-driven (legacy behaviour).
  // Sprint S-DESIGNER (2026-04-30) — `has_target_md` and `has_target_td`
  // separate the two axes so each side of the cylinder loop can lock
  // independently. `has_target` (legacy aggregate) still drives the
  // soft-preference sort tie-break for the solver-mode case.
  const target_md = Math.max(0, Math.floor(Number(parts_md) || 0));
  const target_td = Math.max(0, Math.floor(Number(parts_td) || 0));
  const has_target_md = target_md > 0;
  const has_target_td = target_td > 0;
  const has_target = has_target_md || has_target_td;
  const out = [];
  // Sprint 1.7j — read live (admin-edited) cylinder list. Falls back to
  // PRINT_CYLINDERS default when the runtime override hasn't loaded.
  // Sprint S-FLEXO-3 — plate overhead inflates the per-color plate
  // area so cost reflects the gripper + tape gutter we lose to mounts.
  const plate_overhead_mm = Math.max(0, Number(inputs.plate_overhead_mm) || 0);
  for (const cyl of getPrintCylinders()) {
    if (only_available && !cyl.available) continue;
    // Sprint S-FLEXO-3 — stretch reduces effective pitch the cylinder
    // delivers in the stretched material state. We use the adjusted
    // pitch for N_down + gap, but keep the nominal pitch for plate
    // area (the plate is cut to the unstretched cylinder size).
    const pitch_nominal = pitchOf(cyl.z);
    const pitch = stretchAdjustedPitch(pitch_nominal, inputs);
    const usable = usablePitch(pitch, K);
    if (usable < L_eff) {
      out.push({
        ...cyl,
        pitch,
        n_down: 0,
        actual_gap: 0,
        gap_diff: 0,
        product_film_pct: 0,
        gallus_film_pct: 0,
        step_lay: 0,
        material_yield_pct: 0,
        cost_per_1k: Infinity,
        status: 'TOO SMALL',
      });
      continue;
    }
    // Sprint S-DESIGNER (2026-04-30) — when parts_md > 0, LOCK N to the
    // operator target instead of letting bestNDown auto-pick. The
    // resulting actual_gap distributes pitch slack across the locked
    // N parts. If the cylinder physically can't host target_md parts,
    // fall through to TOO SMALL with a designer-mode reason string.
    let N, gap;
    if (has_target_md) {
      const required_for_target = target_md * L_eff + target_md * G_min;
      if (usable < required_for_target) {
        // Cylinder cannot host target_md parts even at the minimum gap.
        out.push({
          ...cyl,
          pitch,
          pitch_nominal,
          n_down: 0,
          n_across,
          actual_gap: 0,
          gap_diff: 0,
          product_film_pct: 0,
          gallus_film_pct: 0,
          step_lay: 0,
          material_yield_pct: 0,
          cost_per_1k: Infinity,
          match_md: false,
          match_td: false,
          match_count: 0,
          status: 'TOO SMALL',
          designer_reason: `pitch ${pitch.toFixed(2)} mm < required ${(K + required_for_target).toFixed(2)} mm for N=${target_md}`,
        });
        continue;
      }
      N = target_md;
      gap = (usable - N * L_eff) / N;
    } else {
      N = bestNDown(pitch, L_eff, G, K);
      gap = actualGap(pitch, N, L_eff, K);
    }
    const diff = Math.abs(gap - G);
    let status = 'OK';
    if (gap < G_min) status = 'GAP < MIN';
    else if (gap > G_max) status = 'GAP > MAX';
    // Designer-td: if web is too narrow for target_td, override status
    // for ALL cylinders (cylinder choice can't fix a too-narrow web).
    if (cross.w_too_narrow) status = 'WEB TOO NARROW';

    // Material yield = product area covered per shot ÷ full cylinder
    // area. The denominator is pitch×W (full circumference × full web)
    // because every mm of that area was wasted if it's not product:
    // edges, lane gaps, K overhead, MD gaps all count against yield.
    // Uses L_eff × Pw_eff (printed footprint) so a high-bleed job
    // shows realistic yield, not optimistic trim-only yield.
    const product_area = N * L_eff * n_across * Pw_eff;
    const cylinder_area = pitch * Math.max(W, 1);
    const yield_pct = cylinder_area > 0 ? product_area / cylinder_area : 0;

    // Plate cost per 1,000 impressions. plate_area_per_color = pitch×W
    // (in m²); total area across all colors = × n_colors. Cost/1k =
    // total_cost ÷ (total_imp / 1000). When `web_length_m` or
    // `plate_cost` are missing, default to Infinity so this metric
    // doesn't tie-break ranking spuriously.
    // Sprint S-FLEXO-1 — step uses L_eff (print footprint) since the
    // cylinder advances by print + gap per rev, not trim + gap.
    const step = L_eff + gap;
    // Sprint S-FLEXO-2 — `total_imp` is SELLABLE impressions only;
    // setup waste burns material before the first good impression and
    // doesn't produce sellable parts. Effective web feed = run + setup
    // (the press has to physically pull through both).
    const setup_m = Math.max(0, Number(inputs.setup_waste_m) || 0);
    const setup_imp = step > 0 ? Math.round((setup_m * 1000) / step) * Math.max(1, n_across) : 0;
    const total_imp =
      step > 0 && web_length_m > 0
        ? Math.round((web_length_m * 1000) / step) * Math.max(1, n_across)
        : 0;
    // Sprint S-FLEXO-3 — plate area uses NOMINAL pitch (the plate is
    // cut to the unstretched cylinder dimension) plus mounting overhead.
    const plate_area_total =
      (((pitch_nominal + plate_overhead_mm) * Math.max(W, 1)) / 1_000_000) *
      Math.max(1, n_colors || 0);
    const total_plate_cost = plate_area_total * (Number(plate_cost) || 0);
    const cost_per_1k =
      total_imp > 0 && total_plate_cost > 0 ? (total_plate_cost / total_imp) * 1000 : Infinity;

    // Sprint S-PARTS — match flags vs operator-supplied targets. Only
    // counted when the target is > 0 (otherwise treated as "n/a, skip").
    const match_md = target_md > 0 && N === target_md;
    const match_td = target_td > 0 && n_across === target_td;
    const match_count = (match_md ? 1 : 0) + (match_td ? 1 : 0);

    // Sprint S-FLEXO-2 — setup-as-fraction-of-job. For small jobs
    // (1k-2k pcs) this is 5–10 %; for big jobs (50k+) it tails to <1 %.
    // Helps operators decide "is it worth amortising setup over a
    // longer run?" without leaving the calculator.
    const sellable_imp = total_imp;
    const setup_waste_pct =
      setup_imp + sellable_imp > 0 ? setup_imp / (setup_imp + sellable_imp) : 0;

    out.push({
      ...cyl,
      pitch, // stretch-adjusted (operative pitch)
      pitch_nominal, // unstretched (= plate spec)
      rl_inch: cyl.z / 8,
      n_down: N,
      n_across,
      actual_gap: gap,
      gap_diff: diff,
      // Film percentages reflect the stretched pitch since they describe
      // the runtime print zone, not the cold cylinder.
      product_film_pct: productFilmPct(N, L_eff, pitch),
      gallus_film_pct: gallusFilmPct(pitch, K),
      step_lay: step,
      material_yield_pct: yield_pct,
      cost_per_1k,
      setup_imp,
      setup_waste_pct,
      match_md,
      match_td,
      match_count,
      status,
    });
  }
  // Sort: OK first, then within OK by YIELD descending (waste-first).
  // Within non-OK statuses, gap_diff ascending so operators see "least
  // bad" near the boundary first.
  // Sprint S-FLEXO-3 — weighted composite score across OK cylinders.
  // Each axis is normalised to [0,1] so weights are comparable:
  //   yield_norm    = material_yield_pct           (already 0..1)
  //   cost_norm     = 1 - cost_per_1k / max_cost   (lower cost = higher score)
  //   gap_norm      = 1 - gap_diff / max_gap_diff  (closer to G = higher)
  //   match_norm    = match_count / 2              (0, 0.5, or 1)
  // Final score = Σ(weight × axis_norm) / Σ(weight).
  // Sort: OK first, then composite_score DESC. Within non-OK,
  // gap_diff ASC so operators see "least bad" first.
  const okSet = out.filter((r) => r.status === 'OK');
  const max_cost = okSet.reduce(
    (m, r) => (Number.isFinite(r.cost_per_1k) && r.cost_per_1k > m ? r.cost_per_1k : m),
    0
  );
  const max_gap_diff = okSet.reduce((m, r) => (r.gap_diff > m ? r.gap_diff : m), 0);
  const w_yield = Math.max(0, Number(inputs.weight_yield) || 0);
  const w_cost = Math.max(0, Number(inputs.weight_cost) || 0);
  const w_gap = Math.max(0, Number(inputs.weight_gap) || 0);
  const w_match = Math.max(0, Number(inputs.weight_match) || 0);
  const w_sum = w_yield + w_cost + w_gap + w_match;
  for (const r of out) {
    if (r.status !== 'OK' || w_sum === 0) {
      r.composite_score = 0;
      continue;
    }
    const yield_norm = r.material_yield_pct;
    const cost_norm =
      max_cost > 0 && Number.isFinite(r.cost_per_1k)
        ? 1 - r.cost_per_1k / max_cost
        : Number.isFinite(r.cost_per_1k)
          ? 1
          : 0;
    const gap_norm = max_gap_diff > 0 ? 1 - r.gap_diff / max_gap_diff : 1;
    const match_norm = r.match_count / 2;
    r.composite_score =
      (w_yield * yield_norm + w_cost * cost_norm + w_gap * gap_norm + w_match * match_norm) / w_sum;
  }
  // Sprint S-PARTS — match targets still bubble first when set (hard
  // override on top of weighted score) so the operator's explicit
  // intent isn't lost in the noise.
  const statusRank = { OK: 0, 'GAP < MIN': 1, 'GAP > MAX': 2, 'TOO SMALL': 3 };
  out.sort((a, b) => {
    const sa = statusRank[a.status] ?? 9;
    const sb = statusRank[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.status === 'OK') {
      if (has_target && a.match_count !== b.match_count) return b.match_count - a.match_count;
      // composite_score replaces raw yield as the primary OK sort
      // when the operator has tuned weights; identical w_yield=70/etc
      // defaults make it equivalent to legacy yield-first behaviour.
      return b.composite_score - a.composite_score;
    }
    return a.gap_diff - b.gap_diff;
  });
  return out;
}

// ── Multi-axis "winners" — surfaces 3 distinct picks ────────────
// For a given ranked list, pick the cylinder that wins each axis:
//   - yield: highest material_yield_pct
//   - cost: lowest cost_per_1k (excluding Infinity)
//   - gap: smallest gap_diff (closest to operator's target G)
// Useful when one axis matters more than another (small job →
// cost wins, mass production → yield wins, custom design → gap match).
export function pickWinners(ranked) {
  const ok = ranked.filter((r) => r.status === 'OK');
  if (ok.length === 0) return { yield: null, cost: null, gap: null, match: null };
  const byYield = [...ok].sort((a, b) => b.material_yield_pct - a.material_yield_pct);
  const byCost = [...ok]
    .filter((r) => Number.isFinite(r.cost_per_1k))
    .sort((a, b) => a.cost_per_1k - b.cost_per_1k);
  const byGap = [...ok].sort((a, b) => a.gap_diff - b.gap_diff);
  // Sprint S-PARTS — "Layout match" winner: the OK cylinder whose
  // n_down × n_across best matches the operator-supplied targets.
  // match_count is set in rankPrintCylinders (0/1/2). Picked when at
  // least one axis hits — yield is the tie-breaker among cylinders
  // with the same match_count.
  const matched = ok
    .filter((r) => r.match_count > 0)
    .sort((a, b) => b.match_count - a.match_count || b.material_yield_pct - a.material_yield_pct);
  return {
    yield: byYield[0] || null,
    cost: byCost[0] || null,
    gap: byGap[0] || null,
    match: matched[0] || null,
  };
}

// ── Web width suggestion ─────────────────────────────────────────
// Identifies cross-direction over-allocation: if the user's web is
// wider than necessary to fit `n_across` lanes at the OPERATOR's Lg
// target, suggests the next standard stock width above the minimum.
// Common Gallus stock widths in 25-mm increments — adjust to your
// actual supplier inventory.
const COMMON_WEB_WIDTHS_MM = [100, 125, 150, 175, 200, 225, 250, 275, 300, 330, 370, 420];
export function suggestWebWidth(inputs, cross) {
  const { E, Lg, W } = inputs;
  // Sprint S-FLEXO-1 — minimum web is computed from the EFFECTIVE
  // print footprint (Pw + 2×bleed), not the trim spec. Otherwise the
  // suggestion produces a "savings" reading that doesn't physically
  // accommodate the printed product.
  const Pw_eff = effectivePw(inputs);
  if (!Pw_eff || !cross || cross.n_across <= 0) return null;
  // Minimum web that fits current lane count at the target Lg:
  //   W_min = n_across × Pw_eff + (n_across - 1) × Lg + 2 × E
  const W_min =
    cross.n_across * Pw_eff +
    Math.max(0, cross.n_across - 1) * (Number(Lg) || 0) +
    2 * (Number(E) || 0);
  // Snap to nearest common stock width above W_min.
  const stock = COMMON_WEB_WIDTHS_MM.find((w) => w >= W_min) || Math.ceil(W_min / 10) * 10;
  // Only suggest if savings ≥ 5% of current W (avoid noise).
  const savings_mm = W - stock;
  if (savings_mm < W * 0.05) return null;
  return {
    current_mm: W,
    suggested_mm: stock,
    min_required_mm: W_min,
    savings_pct: savings_mm / W,
  };
}

// ── Die-cut step matching ────────────────────────────────────────
// For each magnetic cylinder, compute the die step it would produce at
// its own optimal N and compare to the print step. Match tolerance
// 0.05 mm (= ✓), 0.20 mm (= ⚠ near), else ✗ mismatch.
export function rankMagneticCylinders(inputs, printStep) {
  if (!Number.isFinite(printStep) || printStep <= 0) return [];
  const { L } = inputs;
  const out = [];
  for (const cyl of MAGNETIC_CYLINDERS) {
    const pitch = pitchOf(cyl.z);
    if (pitch < L) continue;
    const N = Math.max(1, Math.round(pitch / printStep));
    const dieStep = pitch / N;
    const stepDiff = Math.abs(dieStep - printStep);
    let match = '✗ MISMATCH';
    if (stepDiff < 0.05) match = '✓ MATCH';
    else if (stepDiff < 0.2) match = '⚠ NEAR';
    out.push({
      ...cyl,
      pitch,
      n_die: N,
      die_step: dieStep,
      step_diff: stepDiff,
      match,
    });
  }
  // Sort by stepDiff asc — closest first.
  out.sort((a, b) => a.step_diff - b.step_diff);
  return out;
}

// ── Required-field validation (Sprint 14b) ───────────────────────
//
// Returns a list of issues — empty array = ready to calculate. The UI
// surfaces both the per-field flags (so the operator can spot the
// problem field at a glance) and the human-readable banner.
//
// Severity legend:
//   'error'  — calc cannot run; fix to get any result
//   'warn'   — calc runs but result may be unrealistic / out-of-spec
//   'info'   — purely informational
//
// All messages are bilingual EN / VN.
export function validateInputs(inputs) {
  const issues = [];
  const num = (v) => Number(v) || 0;

  // Hard requirements
  if (num(inputs.L) <= 0) {
    issues.push({
      field: 'L',
      severity: 'error',
      en: 'Product length L is required',
      vi: 'Cần điền chiều dài sản phẩm L (mm)',
    });
  }
  if (num(inputs.G) <= 0) {
    issues.push({
      field: 'G',
      severity: 'error',
      en: 'Target gap G must be > 0',
      vi: 'Gap mục tiêu G phải > 0',
    });
  }
  if (num(inputs.W) <= 0) {
    issues.push({
      field: 'W',
      severity: 'error',
      en: 'Web width W is required',
      vi: 'Cần điền chiều rộng web W (mm)',
    });
  }
  if (num(inputs.Pw) <= 0) {
    issues.push({
      field: 'Pw',
      severity: 'error',
      en: 'Product width Pw is required',
      vi: 'Cần điền chiều rộng sản phẩm Pw (mm)',
    });
  }

  // Soft / sanity warnings
  const G = num(inputs.G),
    Gmin = num(inputs.G_min),
    Gmax = num(inputs.G_max);
  if (G > 0 && Gmin > 0 && G < Gmin) {
    issues.push({
      field: 'G',
      severity: 'warn',
      en: `Target gap G (${G}) is below G_min (${Gmin}) — die-cut may fail`,
      vi: `Gap mục tiêu nhỏ hơn G_min (${Gmin}) — die-cut có thể lỗi`,
    });
  }
  if (G > 0 && Gmax > 0 && G > Gmax) {
    issues.push({
      field: 'G',
      severity: 'warn',
      en: `Target gap G (${G}) is above G_max (${Gmax}) — wasted web`,
      vi: `Gap mục tiêu lớn hơn G_max (${Gmax}) — phí web`,
    });
  }
  const W = num(inputs.W),
    Pw = num(inputs.Pw),
    E = num(inputs.E);
  if (W > 0 && Pw > 0 && W < Pw + 2 * E) {
    issues.push({
      field: 'W',
      severity: 'warn',
      en: `Web (${W}) too narrow for one product + edges — increase W or shrink Pw/E`,
      vi: `Web hẹp hơn sản phẩm + 2×edge — tăng W hoặc giảm Pw/E`,
    });
  }
  if (num(inputs.L) > 0 && num(inputs.K) >= num(inputs.L)) {
    issues.push({
      field: 'K',
      severity: 'warn',
      en: `Print-zone overhead K (${num(inputs.K)}) is ≥ product length L — sanity check`,
      vi: `K (${num(inputs.K)}) ≥ L — kiểm tra lại`,
    });
  }

  // Sprint S-FLEXO-1 — Z_die must be 0 (= use print Z) OR an integer
  // multiple of the chosen print Z. Mismatch causes die-cut to drift
  // out of registration after a few cylinder revs → scrap entire job.
  // Only validated when inputs carry print_z (set by GallusCalc when
  // top-1 cylinder is known). When print_z is absent we skip — engine
  // can't know which print cylinder will win.
  const Z_die = num(inputs.Z_die);
  const print_z = num(inputs.print_z);
  if (Z_die > 0 && print_z > 0) {
    const ratio = Z_die / print_z;
    if (Math.abs(ratio - Math.round(ratio)) > 0.001) {
      issues.push({
        field: 'Z_die',
        severity: 'error',
        en: `Z_die (${Z_die}) must equal print Z (${print_z}) or an integer multiple — die-cut will drift out of register`,
        vi: `Z_die (${Z_die}) phải = Z in (${print_z}) hoặc bội số nguyên — die-cut sẽ lệch register sau vài vòng`,
      });
    }
  }

  return issues;
}

/**
 * Suggest a target Gap value that produces an EXACT fit with one of
 * the available cylinders. Walks the ranked list and returns the
 * candidate whose actual_gap is closest to the operator's current G,
 * along with the candidate just above and below for comparison.
 *
 * Returns `null` when there are no inputs to work from (L missing).
 */
export function suggestGap(inputs, rankedFromCurrentG) {
  const L = Number(inputs.L) || 0;
  if (L <= 0) return null;
  const G = Number(inputs.G) || 0;
  const okCandidates = rankedFromCurrentG.filter((r) => r.status === 'OK');
  if (okCandidates.length === 0) {
    // No OK match at current G — surface the closest near-miss so
    // operator sees what gap WOULD make their best cylinder OK.
    const nearest = rankedFromCurrentG.find((r) => r.n_down > 0);
    if (!nearest) return null;
    return {
      gap: nearest.actual_gap,
      cylinder_z: nearest.z,
      n_down: nearest.n_down,
      reason: 'no_ok_at_current_g',
      pitch: nearest.pitch,
      product_film_pct: nearest.product_film_pct,
    };
  }
  // Top OK candidate already gives the closest fit. The actual_gap on
  // that row is the value G would need to equal for ZERO drift.
  // Sprint 14e fix — DO NOT round. Operators want full precision so
  // they can paste the exact value back into G if they want a perfect
  // alignment. The display formatter uses .toFixed(2) for readability,
  // but the underlying gap value stays raw. Earlier code rounded to
  // 2 decimals which caused a 0.005 mm drift the operator couldn't
  // recover from without re-typing.
  const top = okCandidates[0];
  return {
    gap: top.actual_gap,
    cylinder_z: top.z,
    n_down: top.n_down,
    reason:
      G > 0 && Math.abs(top.actual_gap - G) < 0.005 ? 'already_optimal' : 'better_fit_available',
    pitch: top.pitch,
    product_film_pct: top.product_film_pct,
  };
}

// ── Job summary using the top-1 print cylinder ───────────────────
//
// Sprint 14j additions:
//   - `lot_run_qty` overrides `web_length_m` when set (2-way coupled
//     in the UI). Whichever non-zero value is provided drives the
//     other; if both are set, lot_run_qty wins.
//   - Surfaces `web_consumed_m`, `material_area_m2`, `pieces_per_m`
//     so operators see the LOT ↔ LM ↔ M² conversions in one card.
//   - Cylinder revolutions = web_mm / pitch (pitch, NOT step — pitch
//     accounts for K overhead, the "wasted" web that still feeds
//     under the cylinder).
export function jobSummary(top1, cross, inputs) {
  if (!top1 || top1.status !== 'OK') return null;
  const { web_length_m, lot_run_qty, plate_cost, n_colors, W } = inputs;
  const totalImpRev = top1.n_down * cross.n_across;

  // Pieces per running meter of web — accounts for K overhead. This
  // is the canonical conversion between "lot Q'ty" and "web length":
  //   piece/m = 1000 × N_down × n_across / pitch
  const piecesPerM = top1.pitch > 0 ? (1000 * top1.n_down * cross.n_across) / top1.pitch : 0;

  // Resolve effective web length from whichever input is set.
  let effWebM = Number(web_length_m) || 0;
  let effLotQty = Number(lot_run_qty) || 0;
  if (effLotQty > 0 && piecesPerM > 0) {
    // Lot wins — derive web from it.
    effWebM = effLotQty / piecesPerM;
  } else if (effWebM > 0 && piecesPerM > 0) {
    effLotQty = Math.floor(effWebM * piecesPerM);
  }

  const webMm = effWebM * 1000;
  const revolutions = top1.pitch > 0 ? Math.round(webMm / top1.pitch) : 0;
  const totalImp = revolutions * totalImpRev;
  // Plate area per color = pitch × W (m²)
  const plateAreaPerColor = (top1.pitch * W) / 1_000_000;
  const totalPlateArea = plateAreaPerColor * n_colors;
  const totalPlateCost = totalPlateArea * plate_cost;
  const costPer1k = totalImp > 0 ? (totalPlateCost / totalImp) * 1000 : 0;
  // Total material area (m²) = web length × W. Useful for material
  // procurement (how many m² of substrate to order).
  const materialAreaM2 = (effWebM * W) / 1000;

  return {
    cylinder_z: top1.z,
    pitch: top1.pitch,
    step: top1.step_lay,
    n_down: top1.n_down,
    n_across: cross.n_across,
    total_imp_rev: totalImpRev,
    total_imp: totalImp,
    pieces_per_m: piecesPerM,
    web_used_m: effWebM,
    lot_run_qty: effLotQty,
    material_area_m2: materialAreaM2,
    revolutions,
    plate_area_per_color: plateAreaPerColor,
    total_plate_area: totalPlateArea,
    total_plate_cost: totalPlateCost,
    cost_per_1k_imp: costPer1k,
  };
}
