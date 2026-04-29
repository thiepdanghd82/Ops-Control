/**
 * layoutOptimizer — top-N layout suggestions for a given part + log.
 *
 * Pure function. Given the part die size, the master-roll (log) width,
 * a list of allowed rotary-die tooth counts, and a few gap/edge/gapTd
 * constraints, enumerate every feasible layout and return the N best
 * ordered by a density-minus-waste score.
 *
 * Scoring
 * -------
 *   score = layout_per_sheet × (1 − offcut_total)
 *
 *   offcut_td  = (log_width − parts_td_span) / log_width
 *   offcut_md  = (pitch      − parts_md_span) / pitch
 *   offcut_total = 1 − (1 − offcut_td) × (1 − offcut_md)
 *
 * This rewards BOTH higher part count per sheet AND tighter packing.
 * A layout that stuffs 20 parts with 40% waste scores worse than one
 * that stuffs 16 parts with 5% waste.
 *
 * Returns a list of candidates, pre-sorted desc by score. Each entry
 * carries enough fields to 1-click apply into stdState.
 */

const DEFAULT_TOOTH_COUNTS = [
  // Common gear-cylinder tooth counts on rotary-die / flexo machines.
  // Multiples of small numbers like 72/80/90/96/104/120/144 — each
  // translates to pitch = N × 3.175mm. Range covers 80mm to ~520mm.
  // Shops typically own only a subset; operator overrides via
  // st.tooth_count_options.
  25, 27, 30, 32, 36, 40, 45, 48,
  54, 60, 64, 72, 80, 90, 96,
  104, 112, 120, 132, 144, 156, 168,
];

const num = (v) => (Number.isFinite(+v) ? +v : 0);

/**
 * @param {object} st       stdState (or a subproduct sp from ComplexCalc)
 * @param {object} [material]  main material row (for log_width)
 * @param {object} [opts]   overrides
 * @returns {Array<object>} ranked candidates
 */
export function suggestLayouts(st, material, opts = {}) {
  // Machine profile integration: when the caller passes `profile`, we
  // project its constraints into the optimizer opts. Explicit opts
  // still win — lets callers override (e.g. "run optimizer with the
  // 192T Brotech but cap tooth at 120T for this job").
  //
  // v3 (2026-04-23): plate_dies + magnetic_dies are tracked separately
  // so "reuse" can distinguish:
  //   - full reuse  (plate + magnetic both on hand at this tooth)
  //   - partial     (only one of the two — the OTHER must be ordered)
  //   - none        (neither — both cylinders must be ordered)
  const profile = opts.profile || null;
  const plateDies   = Array.isArray(profile?.plate_dies) ? profile.plate_dies : [];
  const magnetDies  = Array.isArray(profile?.magnetic_dies) ? profile.magnetic_dies : [];
  const plateDiesSet   = new Set(plateDies.map(d => typeof d === 'object' ? d.tooth : d));
  const magnetDiesSet  = new Set(magnetDies.map(d => typeof d === 'object' ? d.tooth : d));
  // The tooth ladder to search over when no explicit override:
  //   prefer the UNION of plate + magnetic dies (shop can potentially
  //   mix+match), otherwise legacy common_dies, otherwise default.
  const unionDies = [...new Set([...plateDiesSet, ...magnetDiesSet])].sort((a, b) => a - b);
  const profileDies = unionDies.length ? unionDies
    : (profile?.common_dies?.length ? profile.common_dies : null);
  const profileMaxTooth = profile?.tooth_count_max || 0;
  const profileMaxPitch = profile?.max_pitch_mm || 0;
  const profileWebMin = profile?.web_width_min_mm || 0;
  const profileWebMax = profile?.web_width_max_mm || 0;
  const profilePressType = profile?.press_type || null;
  const profilePitchStep = profile?.tooth_pitch_mm || 0;

  const {
    toothCountOptions = profileDies
      ? profileDies
      : (Array.isArray(st?.tooth_count_options) && st.tooth_count_options.length
          ? st.tooth_count_options
          : profileMaxTooth
            ? DEFAULT_TOOTH_COUNTS.filter(t => t <= profileMaxTooth)
            : DEFAULT_TOOTH_COUNTS),
    toothPitchMm = num(st?.tooth_pitch_mm) || profilePitchStep || 3.175,
    edgeMarginTd = num(st?.edge_margin_td) || 3,
    edgeMarginTdLeft  = num(st?.edge_margin_td_left)  || 0,
    edgeMarginTdRight = num(st?.edge_margin_td_right) || 0,
    // Compound-die multiplier: a single rotary die may cut 2-up / 3-up
    // (multiple labels per cavity). Total parts/shot = geometry × this.
    partsPerDie = Math.max(1, num(st?.parts_per_die) || 1),
    // Orientation lock: when true (e.g. text/barcode dictates direction),
    // optimizer MUST NOT try the 90° rotated orientation.
    orientLocked = !!st?.orient_locked,
    // Perforation adds to the effective MD gap between rows.
    perfOffsetMm = num(st?.perf_offset_mm) || 0,
    // Customer tolerances (tol_p2c_mm, tol_c2c_mm, tol_slit_mm) are
    // surfaced via validateLayout.js — the optimizer used to score with
    // them but the chain was never wired and is removed.
    minGapTd     = num(st?.min_gap_td) || 3,
    minGapMd     = num(st?.min_gap_md) || 3,
    allowRotate  = st?.allow_rotate_90 !== false,   // default true
    // log_width: material > explicit opts override > web_width_td
    logWidth = num(material?.log_width) || num(material?.width) || num(st?.web_width_td),
    topN = 5,
    targetPcsPerRoll = num(st?.target_pcs_per_roll),
    rotaryCols = num(st?.rotary_cols) || 1,
    maxPitchMm = num(st?.max_pitch_mm) || profileMaxPitch
      || (profileMaxTooth ? profileMaxTooth * (profilePitchStep || 3.175) : 400),
    webWidthMin = num(opts.webWidthMin) || profileWebMin,
    webWidthMax = num(opts.webWidthMax) || profileWebMax,
    commonDies  = profileDies || (Array.isArray(opts.commonDies) ? opts.commonDies : null),
  } = opts;

  const partW = num(st?.part_width);
  const partL = num(st?.part_length_md);
  if (partW <= 0 || partL <= 0) return [];
  if (logWidth <= 0) return [];

  // `allowRotate` is the historical / backward-compat switch;
  // `orient_locked` is the modern, customer-facing field. Lock wins.
  const effAllowRotate = allowRotate && !orientLocked;
  const orientations = effAllowRotate
    ? [{ w: partW, l: partL, rotated: false }, { w: partL, l: partW, rotated: true }]
    : [{ w: partW, l: partL, rotated: false }];

  // Press type (rotary vs flat): flat presses (HP Indigo, digital,
  // sheet-fed offset) have no tooth constraint — pitch is whatever the
  // parts need. The LG 12×12 layout from the plant data (pitch 75mm =
  // 23.62 teeth — NOT an integer) is a flat-die press.
  //
  // When `press_type === 'flat'`, we synthesize a single "virtual"
  // tooth whose pitch = partsMdSpan + effMinGapMd (tightest fit) so the
  // iteration machinery below stays uniform.
  const pressType = st?.press_type || opts.pressType || profilePressType || 'rotary';
  const toothOptions = pressType === 'flat'
    ? []   // unused; flat branch iterates over maxInMd values
    : (Array.isArray(toothCountOptions) && toothCountOptions.length
         ? toothCountOptions : []);
  if (pressType !== 'flat' && toothOptions.length === 0) return [];

  const candidates = [];

  // Resolve asymmetric edge margins (fall back to symmetric default).
  const edgeLeft  = edgeMarginTdLeft  > 0 ? edgeMarginTdLeft  : edgeMarginTd;
  const edgeRight = edgeMarginTdRight > 0 ? edgeMarginTdRight : edgeMarginTd;
  const edgeTotal = edgeLeft + edgeRight;   // consumed per web, not per log
  // Effective MD gap: base gap + perforation offset (if customer has
  // perforation cuts between repeat labels, the perf line needs its
  // own space beyond the cut-to-cut min_gap_md).
  const effMinGapMd = minGapMd + perfOffsetMm;

  for (const { w, l, rotated } of orientations) {
    // ── (v2 upgrade) Iterate over num_webs. ────────────────────────
    // num_webs is NOT an operator input — it's a search variable. Given
    // log_width, we try every feasible split (1..maxWebs) and let the
    // scorer pick the winner. The LG 4-web layout emerges naturally;
    // the Luxshare 1-web layout also emerges when the log is narrow.
    const minWebForOne = w + edgeTotal;
    const maxWebs = Math.max(1, Math.floor(logWidth / minWebForOne));

    for (let numWebs = 1; numWebs <= maxWebs; numWebs++) {
      const webWidth = logWidth / numWebs;
      // Machine-level web-width bounds: skip if the resulting web is
      // narrower than the machine can hold or wider than its max.
      if (webWidthMin > 0 && webWidth < webWidthMin - 0.01) continue;
      if (webWidthMax > 0 && webWidth > webWidthMax + 0.01) continue;
      const availTd = webWidth - edgeTotal;
      const maxAcross = Math.max(0, Math.floor((availTd + minGapTd + 1e-9) / (w + minGapTd)));
      if (maxAcross < 1) continue;

      // For flat presses, iterate over maxInMd values (1..K) instead of
      // tooth counts — each maxInMd defines its own tightest pitch.
      // This gives the operator a spectrum of "how many per shot" to
      // choose from instead of always maxing out the die.
      const maxInMdForFlat = Math.max(1, Math.floor((maxPitchMm + effMinGapMd) / (l + effMinGapMd)));
      const flatInMdOptions = [];
      for (let k = 1; k <= maxInMdForFlat; k++) flatInMdOptions.push(k);

      for (const tooth of (pressType === 'flat' ? flatInMdOptions : toothOptions)) {
        let pitch;
        let inMdFixed = null;
        if (pressType === 'flat') {
          // `tooth` variable is actually the desired maxInMd here.
          inMdFixed = tooth;
          pitch = inMdFixed * l + Math.max(0, inMdFixed - 1) * effMinGapMd + effMinGapMd;
          if (pitch > maxPitchMm + 0.01) continue;
        } else {
          pitch = tooth * toothPitchMm / rotaryCols;
        }

        const maxInMd = inMdFixed != null
          ? inMdFixed
          : Math.max(0, Math.floor((pitch + effMinGapMd + 1e-9) / (l + effMinGapMd)));
        if (maxInMd < 1) continue;

        const partsTdSpan = maxAcross * w + Math.max(0, maxAcross - 1) * minGapTd;
        const partsMdSpan = maxInMd * l + Math.max(0, maxInMd - 1) * effMinGapMd;

        // For flat die, TRUE pitch is partsMdSpan + effMinGapMd (tightest).
        const finalPitch = pressType === 'flat'
          ? (partsMdSpan + effMinGapMd)
          : pitch;

        // Offcut calculation — compute against LOG (not just one web)
        // so the scorer fairly compares 1-web-wide-parts vs N-web-narrow-parts.
        const logUsedTd = numWebs * partsTdSpan + numWebs * edgeTotal;
        const offcutTdLog = (logWidth - logUsedTd) / logWidth;
        const offcutMd = (finalPitch - partsMdSpan) / finalPitch;
        const offcutTotal = 1 - (1 - Math.max(offcutTdLog, 0)) * (1 - Math.max(offcutMd, 0));

        // Parts per shot = total cavities visible on one pitch of the log.
        // Compound-die multiplier: a single cavity of the die may cut
        // N labels (2-up, 3-up, …).
        const pcsPerShot = numWebs * maxAcross * maxInMd * partsPerDie;

        // Target-pcs-per-roll bonus (v3): when customer specifies a
        // target and this candidate's pcs_per_shot divides it evenly,
        // grant a small score bonus so the optimizer prefers
        // "clean-count" layouts (no half-shots left over). Only used
        // as a tiebreaker — does not override a clearly better option.
        const targetBonus = (targetPcsPerRoll > 0
          && pcsPerShot > 0
          && targetPcsPerRoll % pcsPerShot === 0) ? 1.02 : 1.0;

        const score = pcsPerShot * (1 - offcutTotal) * targetBonus;

        const toothOut = pressType === 'flat' ? null : tooth;
        // Die-inventory reuse classification (v3):
        //   full    — both plate AND magnetic cylinders on hand at this tooth
        //   partial — only one of the two on hand (the other must be ordered)
        //   none    — neither (both cylinders must be ordered)
        //   null    — inventory data unavailable (profile not loaded)
        let reuse = null;
        let reuseStatus = null;    // 'full' | 'partial_plate' | 'partial_magnetic' | 'none'
        let needsOrder = [];       // e.g., ['magnetic-90T'] — what to order
        if (toothOut != null) {
          const hasPlate   = plateDiesSet.size   > 0 ? plateDiesSet.has(toothOut)   : null;
          const hasMagnet  = magnetDiesSet.size  > 0 ? magnetDiesSet.has(toothOut)  : null;
          if (hasPlate === null && hasMagnet === null) {
            // No inventory data — fall back to legacy single list.
            reuse = Array.isArray(commonDies) && commonDies.length
              ? commonDies.includes(toothOut)
              : null;
          } else {
            if (hasPlate && hasMagnet)       { reuse = true;  reuseStatus = 'full'; }
            else if (hasPlate && !hasMagnet) { reuse = false; reuseStatus = 'partial_plate';    needsOrder = [`magnetic-${toothOut}T`]; }
            else if (!hasPlate && hasMagnet) { reuse = false; reuseStatus = 'partial_magnetic'; needsOrder = [`plate-${toothOut}T`]; }
            else                              { reuse = false; reuseStatus = 'none';            needsOrder = [`plate-${toothOut}T`, `magnetic-${toothOut}T`]; }
          }
        }
        candidates.push({
          tooth: toothOut,
          press_type: pressType,
          reuse,
          reuse_status: reuseStatus,
          needs_order: needsOrder,
          pitch: round2(finalPitch),
          rotated,
          num_webs: numWebs,
          web_width_td: round2(Math.min(partsTdSpan + 2 * edgeMarginTd, webWidth)),
          part_width:     round2(w),
          part_length_md: round2(l),
          parts_web_across: maxAcross,
          parts_in_md:      maxInMd,
          layout_per_sheet: maxAcross * maxInMd,     // per-web cavities
          pcs_per_shot:     pcsPerShot,              // whole-log cavities
          sheet_length:     round2(partsMdSpan),
          rotary_cols:      rotaryCols,
          offcut_td:    round4(offcutTdLog),
          offcut_md:    round4(offcutMd),
          offcut_total: round4(offcutTotal),
          score: round4(score),
          meetsTarget: targetPcsPerRoll
            ? (targetPcsPerRoll % pcsPerShot === 0
               || Math.abs((targetPcsPerRoll / pcsPerShot) - Math.round(targetPcsPerRoll / pcsPerShot)) < 0.01)
            : null,
        });
      }
    }
  }

  // De-duplicate candidates that land on the same grid (rotated,
  // num_webs, parts_web_across, parts_in_md). Prefer lowest tooth
  // count (= cheapest die / least rotational inertia).
  const seen = new Map();
  for (const c of candidates) {
    const key = `${c.rotated}|${c.num_webs}|${c.parts_web_across}|${c.parts_in_md}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, c); continue; }
    // Prefer smaller tooth (rotary) or smaller pitch (flat) for the same grid.
    if (c.tooth != null && prev.tooth != null && c.tooth < prev.tooth) seen.set(key, c);
    else if (c.pitch < prev.pitch) seen.set(key, c);
  }
  const deduped = [...seen.values()];

  // Sort by: (1) score desc, (2) reuse status (full > partial > none),
  //          (3) lower offcut, (4) smaller tooth (cheaper / lighter die).
  const reuseRank = (s) => s === 'full' ? 0 : s === 'partial_plate' || s === 'partial_magnetic' ? 1 : s === 'none' ? 2 : 0;
  deduped.sort((a, b) =>
    (b.score - a.score)
      || (reuseRank(a.reuse_status) - reuseRank(b.reuse_status))
      || (a.offcut_total - b.offcut_total)
      || ((a.tooth ?? Number.MAX_SAFE_INTEGER) - (b.tooth ?? Number.MAX_SAFE_INTEGER)),
  );
  return deduped.slice(0, topN);
}

function round2(x) { return Math.round(x * 100) / 100; }
function round4(x) { return Math.round(x * 10000) / 10000; }

export { DEFAULT_TOOTH_COUNTS };
