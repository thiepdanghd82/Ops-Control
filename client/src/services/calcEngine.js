// @ts-check
/**
 * Ops Control — Calculation Engine (extracted from COST V1.0 M02)
 * Pure functions — zero DOM, zero React, zero global state.
 * Every function takes explicit (state, lib) parameters.
 *
 * lib shape: { rate: [], ddl: { coverage: [], click_charges: {}, tool_life: {} } }
 */
import { isIndigoPrintType } from './printTypeUtils.js';
import {
  createEmptySnapshot,
  getCoverageFromSnapshot,
  getMatFromSnapshot,
  getRateFromSnapshot,
  getSnapshotSite,
} from './pricingSnapshot.js';
import { warn as devWarn } from '../utils/logger.js';

/**
 * Phase 2 resolver — internal helper that reads pricing values via the
 * persisted snapshot first, falling back to the live `lib.*` master
 * library on a per-key miss. Snapshot wins on direct hit; miss falls
 * through to `lib` so post-save additions (operator added a new
 * material/workcenter after the snapshot was frozen) still calc.
 *
 * Resolver pattern is INTERNAL to the calcAll flow only. The public
 * `getMatByCode(lib, code)` / `getRateByWC(lib, wc)` exports keep
 * their 2-arg signature for external callers (CostLibContext +
 * SubProductRow.jsx). Inside calcAll → calcInk / calcProcess we route
 * the lookups via this resolver instead.
 *
 * When `snapshot` is null/empty (legacy quote OR explicit BC mode call
 * `calcAll(st, allSpResults, lib)` with no options), every accessor
 * falls through to lib → behavior is identical to pre-Phase-2.
 */
function createResolver(snapshot, lib) {
  return {
    getMat(code) {
      const fromSnap = getMatFromSnapshot(snapshot, code);
      if (fromSnap) return fromSnap;
      // Match the case-insensitive trimmed lookup `getMatByCode` does
      // so a snapshot miss falls back identically to the legacy path.
      if (!lib || !Array.isArray(lib.mat)) return null;
      const c = String(code || '')
        .trim()
        .toLowerCase();
      return lib.mat.find((m) => String(m.code).trim().toLowerCase() === c) || null;
    },
    getRate(wc) {
      const fromSnap = getRateFromSnapshot(snapshot, wc);
      if (fromSnap) return fromSnap;
      if (!lib || !Array.isArray(lib.rate)) return null;
      return lib.rate.find((r) => r.workcenter === wc) || null;
    },
    getCoverage() {
      const fromSnap = getCoverageFromSnapshot(snapshot);
      if (fromSnap && fromSnap.length > 0) return fromSnap;
      return (lib && lib.ddl && lib.ddl.coverage) || [];
    },
  };
}

/**
 * @typedef {Object} CalcResult
 * Shape returned by calcAll() and aggregateComplex().
 * @property {number} sp                Selling price
 * @property {number} s_ttl             Supplier-price subtotal (mat+ink+process+pack+vat+tooling)
 * @property {number} g_ttl             Gross-price subtotal
 * @property {number} s_mat_cost        Raw-material spend (INCLUDES ink — Sprint 16 helpers carve out for display)
 * @property {number} g_mat_cost        Gross-price material + ink spend
 * @property {number} overhead          Machine overhead share
 * @property {number} labor_cost        Labor share
 * @property {number} tooling           Tooling amortization
 * @property {number} packing_ship      Packing + Shipping per unit
 * @property {number} vat_loss          VAT loss on USD(Book) trade mode
 * @property {number|null} gm           Gross margin %
 * @property {number|null} va           Value-add % (canonical: 1 - (mat + tool + pack) / sp)
 * @property {number|null} contribution Contribution % (canonical: 1 - (mat + tool + pack + labor) / sp)
 * @property {number} bd_mat_setup
 * @property {number} bd_mat_run
 * @property {number} bd_ink_setup
 * @property {number} bd_ink_run
 * @property {number} bd_overhead
 * @property {number} bd_labor
 * @property {number} bd_extra
 * @property {number} bd_extra_vat
 * @property {number} bd_setup_mach
 * @property {number} bd_setup_labor
 * @property {number} sga
 * @property {number} sga_rate_pct
 * @property {number} g_ttl_with_sga
 * @property {number|null} gm_after_sga
 * @property {string} site
 * @property {string[]} warnings
 * @property {any[]} [matResults]       Per-row material detail (NOT persisted)
 * @property {any[]} [inkResults]       Per-row ink detail (NOT persisted)
 * @property {any[]} [procResults]      Per-row process detail (NOT persisted)
 */

/**
 * @typedef {Object} Lib
 * Shape the engine expects for costing library data.
 * @property {any[]} rate
 * @property {any[]} [mat]
 * @property {Object} [ddl]
 * @property {{summary?: Object}} [finance]
 * @property {Object} [inkCalc]
 */

// ── Helpers ──

export function getRateByWC(lib, wc) {
  return (lib.rate || []).find((r) => r.workcenter === wc) || null;
}

export function getToolLife(lib, toolType) {
  return lib.ddl && lib.ddl.tool_life ? lib.ddl.tool_life[toolType] || 0 : 0;
}

export function getMatByCode(lib, code) {
  if (!code) return null;
  const c = String(code).trim().toLowerCase();
  return (lib.mat || []).find((m) => String(m.code).trim().toLowerCase() === c) || null;
}

export function getAllWorkcenters(lib) {
  return (lib.rate || [])
    .filter((r) => r.machine_rate > 0 || r.labor_rate > 0)
    .map((r) => r.workcenter);
}

export function getProcessOptions() {
  return [
    'Pre_Cut',
    'Die_Cut',
    'Print',
    'Assembly',
    'Special_cut',
    'Inspection',
    'ManualWork',
    'Others',
  ];
}

const TYPE_TO_DDL = {
  Pre_Cut: 'pre_cut',
  Die_Cut: 'die_cut',
  Print: 'print_type_list',
  Assembly: 'assembly',
  Special_cut: 'special_cut',
  Inspection: 'inspection',
  ManualWork: 'manual_work',
  Others: 'others',
};

export function getWCOptionsByType(lib, processType) {
  const ddlKey = TYPE_TO_DDL[processType];
  if (!ddlKey || !processType) {
    return (lib.rate || []).map((r) => r.workcenter);
  }
  const items = (lib.ddl && lib.ddl[ddlKey]) || [];
  if (!items.length) {
    return (lib.rate || []).map((r) => r.workcenter);
  }
  return items;
}

// ── Cut-type speed multipliers (Sprint S-DFM-P3) ──
//
// Industry-standard throughput factor relative to kiss-cut (1.00 = base):
//   kiss-cut    : face-only · fastest · 1.00
//   through-cut : liner too · slower (tool strain) · 0.70
//   both        : compound die (kiss+through in one pass) · 0.50
//   perf-only   : small teeth, no full cut · 0.80
//   emboss      : dwell-time for dimensional deformation · 0.60
//
// These multipliers apply to `uph` on Die_Cut process rows when the
// Cutting sub-tab has `cut_type` set. Operator-entered `speed` still
// drives the base UPH; the factor degrades it to reflect real-world
// throughput. Empty cut_type → factor 1.00 (no change, backward-compat).
export const CUT_TYPE_SPEED_FACTOR = Object.freeze({
  'kiss-cut': 1.0,
  'through-cut': 0.7,
  both: 0.5,
  'perf-only': 0.8,
  emboss: 0.6,
});

export function getCutTypeSpeedFactor(cutType) {
  if (!cutType) return 1;
  const k = String(cutType).trim().toLowerCase();
  return CUT_TYPE_SPEED_FACTOR[k] != null ? CUT_TYPE_SPEED_FACTOR[k] : 1;
}

// ── Layout / Pitch helpers ──

export function calcPitch(st) {
  if (st.rotary_cols > 0) {
    // Float-precision guard: 104.775 / 3.175 = 33.000000000000004 in IEEE
    // 754, so a naive ceil() rounds to 34 and "discovers" a 3.175mm snap
    // that doesn't exist. Shave off a tiny epsilon before ceil so exact
    // multiples don't falsely snap (matches layoutValidation rotary_snap).
    const toothPitch = Number(st.tooth_pitch_mm) || 3.175;
    const z = Math.ceil(((st.sheet_length + st.min_gap_md) * st.rotary_cols) / toothPitch - 1e-9);
    return (z * toothPitch) / st.rotary_cols;
  }
  return st.sheet_length + st.min_gap_md;
}

export function calcLayoutPerSheet(st) {
  // parts_per_die (compound die: 2-up / 3-up) multiplies each cavity's
  // output. A 2-up die literally cuts 2 labels per cavity per stamp.
  // Prior to Sprint S-DFM the multiplier was applied only in the
  // optimizer's pcs_per_shot — material/pitch/QPA downstream silently
  // under-counted by 2× / 3× on compound-die quotes.
  const ppd = Math.max(1, Number(st.parts_per_die) || 1);
  return st.parts_web_across * st.parts_in_md * ppd;
}

export function calcPcsPerRoll(st) {
  return calcLayoutPerSheet(st) * st.num_webs;
}

export function calcQPA_LM(st, mat) {
  const cavities = mat && mat.cavities > 0 ? mat.cavities : calcLayoutPerSheet(st);
  const pitch = mat && mat.pitch_ovr && mat.pitch_ovr > 0 ? mat.pitch_ovr : calcPitch(st);
  // num_webs falls back to 1 — matches the display columns (qpa_lm, qpa_m2)
  // and the rest of the engine (CalcLayout shotPlan, calcOffcut). Without
  // this fallback a quote with num_webs=0 produced run_s=0 while qpa_m2/
  // qpa_lm columns showed positive values — Setup Cost computed normally
  // (no num_webs dep) but Run Cost rendered "—". Operator hardware-test
  // 2026-05-11 surfaced this on a 6-row Std quote with MOQ=500 + WEBS="—".
  const webs = Math.max(1, Number(st.num_webs) || 0);
  if (!cavities) return 0;
  if (!mat.free_liner || mat.free_liner === 0) {
    return pitch / 1000 / cavities / webs;
  }
  const maxFL = mat.free_liner;
  const pcsRoll = st.parts_in_md > 0 ? st.parts_in_md * webs : 1;
  const rollLen = (pcsRoll / cavities) * (pitch / 1000) + maxFL * (pitch / 1000);
  return rollLen / pcsRoll / webs;
}

function calcOffcut(mat, st) {
  // Priority 1: user-entered explicit percentage (0–100 or 0–1). Matches
  // COST V1.0 Excel sheet 1's "Offcut %" column which is a direct input
  // cell the user can override. Accept both scales and normalize to 0–1.
  if (mat.offcut_pct != null && mat.offcut_pct !== '') {
    const raw = Number(mat.offcut_pct);
    if (!Number.isNaN(raw) && raw > 0) {
      return Math.min(raw > 1 ? raw / 100 : raw, 0.999);
    }
  }
  // Priority 2: derive from Cavities (= Layout/Sheet) and Width using the
  // COST V1.0 Sheet 1 formula: MOD(Cavities, Width) / Cavities.
  // This gives the fraction of cavities that can't be cleanly sliced out
  // of the log at the current width. We resolve cavities/width against
  // layout defaults so blank material rows still compute correctly.
  const width = mat.width > 0 ? mat.width : st && st.web_width_td ? st.web_width_td : 0;
  const cavities = mat.cavities > 0 ? mat.cavities : st ? calcLayoutPerSheet(st) : 0;
  if (width > 0 && cavities > 0) {
    const rem = cavities % width;
    return Math.min(rem / cavities, 0.999);
  }
  // Priority 3: log_width fallback — multi-web aware (Sprint S-DFM).
  // When num_webs > 1, the press slits `num_webs` webs from the same
  // log, so the usable stride = num_webs × mat.width. Old formula
  // (log % mat.width) ignored this and reported a ~0% offcut on e.g.
  // 2 × 82 mm webs from a 1300 mm log when the REAL offcut is
  // (1300 − 7 × 164) / 1300 ≈ 11.7%.
  const numWebs = Math.max(1, Number(st?.num_webs) || 1);
  const stride = mat.width * numWebs;
  if (mat.log_width > 0 && mat.width > 0 && mat.log_width >= stride) {
    const remLog = mat.log_width % stride;
    return Math.min(remLog / mat.log_width, 0.999);
  }
  return 0;
}

export function calcMatScrapFactor(st) {
  let y = 1;
  for (const p of st.processes) {
    if (p.workcenter) y *= 1 - (p.scrap_pct || 0);
  }
  return 1 - y;
}

/**
 * Safe divisor for (1 - scrap/offcut) ratios. Floored at 0.001 to prevent
 * divide-by-zero or absurd blow-ups when scrap approaches 100%.
 * Extracted so the magic 0.001 lives in exactly one place.
 */
export function safeYieldDivisor(loss) {
  return Math.max(0.001, 1 - (loss || 0));
}

// ── Material Cost ──

export function calcMat(mat, st, moq, allSpResults, subproducts) {
  // Auto-sync material pitch / width / cavities from the Layout tab when
  // the per-row override is 0 / empty. The UI shows the layout defaults
  // in black when not overridden; the engine MUST use the same fallback
  // so a visually-populated cell actually contributes to the formulas
  // (otherwise mat.width=0 silently zeroes qpa_m2, run_s, etc.).
  const effWidth = mat.width > 0 ? mat.width : st.web_width_td || 0;
  const effCavities = mat.cavities > 0 ? mat.cavities : calcLayoutPerSheet(st) || 1;
  const pitch = mat.pitch_ovr && mat.pitch_ovr > 0 ? mat.pitch_ovr : calcPitch(st);
  const layout_sheet = calcLayoutPerSheet(st);
  const webs = st.num_webs || 1;
  const cavities = effCavities;
  const scrap_factor = calcMatScrapFactor(st);
  const pcs_roll = st.pcs_per_roll || 0;
  const qpa_lm_raw = calcQPA_LM(st, mat);

  // SP sub-product reference (FG Z assembly)
  if (allSpResults && mat.code) {
    const sps = subproducts || [];
    const spIdx = sps.findIndex((sp) => sp.code === mat.code);
    if (spIdx >= 0) {
      const spRes = allSpResults[spIdx];
      // Validate that the referenced SP result was actually computed.
      // A missing/empty result means upstream calc failed — we must NOT
      // silently treat it as zero cost, that would hide data integrity bugs.
      if (!spRes || typeof spRes !== 'object' || !('g_mat_cost' in spRes)) {
        console.warn(
          `[calcMat] SP reference "${mat.code}" (idx=${spIdx}) has no computed result; returning error marker.`
        );
        return {
          setup_s: 0,
          setup_g: 0,
          run_s: 0,
          run_g: 0,
          vat: 0,
          total_s: 0,
          total_g: 0,
          qpa_m2: 0,
          qpa_lm: 0,
          mat_po_lm: 0,
          pitch: 0,
          qpa_lm_raw: 0,
          scrap_factor,
          webs,
          layout_sheet,
          pcs_roll,
          meter_roll: 0,
          isSPRef: true,
          spCost: 0,
          _spOvhd: 0,
          _spLabor: 0,
          _spTooling: 0,
          _spVat: 0,
          error: `SP reference "${mat.code}" not computed`,
        };
      }
      const sf = safeYieldDivisor(scrap_factor);
      const usage = mat.usage && mat.usage > 0 ? mat.usage : 1;
      const run_s = ((spRes.g_mat_cost || 0) / sf) * usage;
      const _spOvhd = ((spRes.bd_overhead || 0) / sf) * usage;
      const _spLabor = ((spRes.bd_labor || 0) / sf) * usage;
      const _spTooling = ((spRes.tooling || 0) / sf) * usage;
      const _spVat = ((spRes.vat_loss || 0) / sf) * usage;
      const setup_s =
        mat.setup_lm > 0 && moq ? ((spRes.g_ttl || 0) * (mat.setup_lm || 0)) / moq : 0;
      return {
        setup_s,
        setup_g: setup_s,
        run_s,
        run_g: run_s,
        vat: 0,
        total_s: setup_s + run_s,
        total_g: setup_s + run_s,
        qpa_m2: 0,
        qpa_lm: 0,
        mat_po_lm: 0,
        pitch: 0,
        qpa_lm_raw: 0,
        scrap_factor,
        webs,
        layout_sheet,
        pcs_roll,
        meter_roll: 0,
        isSPRef: true,
        spCost: spRes.g_mat_cost || 0,
        _spOvhd,
        _spLabor,
        _spTooling,
        _spVat,
      };
    }
  }

  const _webs = st.num_webs || 1;
  const qpa_m2 =
    mat.code && effWidth ? ((pitch * effWidth) / 1e6 / cavities / _webs) * (mat.usage || 1) : 0;
  const qpa_lm = mat.code ? (pitch / 1000 / cavities / _webs) * (mat.usage || 1) : 0;
  const mat_po_lm = mat.code
    ? ((moq * 1.1 * pitch) / 1000 / cavities / _webs) * (mat.usage || 1) + (mat.setup_lm || 0)
    : 0;
  const meter_roll = cavities > 0 && pcs_roll > 0 ? ((pcs_roll / cavities) * pitch) / 1000 : 0;

  const _blank = {
    setup_s: 0,
    setup_g: 0,
    run_s: 0,
    run_g: 0,
    vat: 0,
    total_s: 0,
    total_g: 0,
    qpa_m2,
    qpa_lm,
    mat_po_lm,
    pitch,
    qpa_lm_raw,
    scrap_factor,
    webs,
    layout_sheet,
    pcs_roll,
    meter_roll,
  };
  // Need a code AND a resolvable width (either on the row or from layout).
  if (!mat.code || !effWidth) return _blank;

  const offcut = mat.offcut_yn === 'Y' ? calcOffcut(mat, st) : mat.offcut_yn === 'N' ? 0 : 0.05;
  const sp = mat.latest || mat.s_price || 0;
  const gp = mat.latest || mat.g_price || mat.s_price || 0;
  const slit_adj = mat.slitting_yn === 'Y' ? 0.5 : mat.slitting_yn === 'N' ? 0 : 0.1;

  const offcutDiv = safeYieldDivisor(offcut);
  const scrapDiv = safeYieldDivisor(scrap_factor);
  const setup_s = moq
    ? ((((sp + slit_adj) * (mat.setup_lm || 0) * (mat.usage || 1)) / offcutDiv) *
        (effWidth / 1000)) /
      moq
    : 0;
  const setup_g = moq
    ? ((((gp + slit_adj) * (mat.setup_lm || 0) * (mat.usage || 1)) / offcutDiv) *
        (effWidth / 1000)) /
      moq
    : 0;

  const run_s =
    (((sp + slit_adj) * (effWidth / 1000) * qpa_lm_raw) / scrapDiv / offcutDiv) * (mat.usage || 1);
  const run_g =
    (((gp + slit_adj) * (effWidth / 1000) * qpa_lm_raw) / scrapDiv / offcutDiv) * (mat.usage || 1);

  const total_s = setup_s + run_s;
  const total_g = setup_g + run_g;
  const vat = st.trade_mode === 'USD(Book)' ? total_s * 0.15 : 0;

  return {
    setup_s,
    setup_g,
    run_s,
    run_g,
    vat,
    total_s,
    total_g,
    qpa_m2,
    qpa_lm,
    mat_po_lm,
    pitch,
    qpa_lm_raw,
    scrap_factor,
    webs,
    layout_sheet,
    pcs_roll,
    meter_roll,
  };
}

// ── Ink Cost ──

export function calcInk(ink, st, moq, lib, options = {}) {
  // Row identity gate — V3.3 only checked `ink.color` because that build
  // had a single "Color name" input. Ops Control v1.2 added a separate
  // "IFS Code" column; operators who typed only the IFS code (leaving
  // Desc blank) saw Setup/Run/Total = "—" with no hint why. Accept any
  // of color (Desc), ifs_code, or print_type as evidence the row is
  // real. If all three are empty the row is genuinely a placeholder.
  if (!ink.color && !ink.ifs_code && !ink.print_type)
    return { setup_s: 0, run_s: 0, vat: 0, ink_cover_disp: '', layout_indigo_disp: '', total: 0 };
  const price = ink.latest || ink.s_price || 0;
  const isIndigo = isIndigoPrintType(ink.print_type);
  // Pitch resolution (2026-05-11): per-row `ink.pitch_mm` overrides the
  // layout-derived pitch when > 0. Lets operators model a different
  // pitch per ink (e.g. offset register variant) without forking the
  // whole layout. Empty = follow Layout's computed pitch.
  const pitch = Number(ink.pitch_mm) > 0 ? Number(ink.pitch_mm) : calcPitch(st);
  const layout_per_sheet = calcLayoutPerSheet(st);
  // Phase 2: route coverage lookup through the resolver when calcAll
  // provides one (post-snapshot path). Falls back to direct lib read
  // for backward-compat callers (Phase 1 calcInk(ink, st, moq, lib)).
  const covArr = options.resolver
    ? options.resolver.getCoverage()
    : (lib && lib.ddl && lib.ddl.coverage) || [];
  const covObj = covArr.find((c) => c.pt === ink.print_type);
  const ink_cover_val = ink.coverage_override > 0 ? ink.coverage_override : covObj ? covObj.cov : 0;
  const ink_cover_disp = isIndigo ? '' : ink_cover_val || '';
  const layout_indigo_val =
    isIndigo && pitch > 0 ? Math.floor(980 / pitch) * layout_per_sheet * (st.num_webs || 1) : 0;
  const layout_indigo_disp = isIndigo ? layout_indigo_val : '';
  const scrapF = safeYieldDivisor(calcMatScrapFactor(st));

  // Width resolution (2026-05-11 FIX-40 follow-up): operator-facing
  // column renamed "Base Mat" → "Width" with layout sync. Priority:
  //   1. Explicit per-row `ink.width` (mm) — operator override
  //   2. Layout `web_width_td` (the press web's effective TD width)
  //   3. Legacy `ink.base_mat`: material lookup by code, then trailing
  //      numeric substring (e.g. "Mat-300" → 300). Kept so saved
  //      pre-rename quotes still calc correctly without a migration.
  let _widthMm = Number(ink.width) || 0;
  if (_widthMm <= 0) _widthMm = Number(st.web_width_td) || 0;
  if (_widthMm <= 0) {
    const baseMatRef = (st.materials || []).find((m) => m.code === ink.base_mat);
    if (baseMatRef && baseMatRef.width > 0) {
      _widthMm = baseMatRef.width;
    } else {
      const m = String(ink.base_mat || '').match(/(\d+(?:\.\d+)?)\s*$/);
      _widthMm = m ? Math.max(0, parseFloat(m[1])) : 0;
    }
  }
  const width_m = _widthMm / 1000;

  let run_s = 0,
    setup_s = 0;
  if (isIndigo) {
    const clicks = ink.clicks || 0;
    const _ccTbl = (lib.ddl && lib.ddl.click_charges) || {};
    const _ccKeys = Object.keys(_ccTbl)
      .map(Number)
      .filter((k) => !isNaN(k) && k > 0)
      .sort((a, b) => a - b);
    let click_charge = 0;
    for (const k of _ccKeys) {
      if (k <= clicks) click_charge = parseFloat(_ccTbl[String(k)]) || 0;
      else break;
    }
    run_s = layout_indigo_val > 0 ? (click_charge * clicks) / layout_indigo_val / scrapF : 0;
    const baseMat = st.materials.find((m) => m.code === ink.base_mat);
    const baseMat_usage = baseMat ? baseMat.usage || 1 : 1;
    const setup_sheets = Math.ceil(baseMat_usage / 0.98);
    setup_s = moq ? (click_charge * clicks * setup_sheets) / moq : 0;
  } else {
    // Guard against layout_per_sheet = 0 (operator zeroed parts_web_across
    // or parts_in_md): bare division would yield Infinity → NaN run cost
    // for every ink. qpa_lm = 0 makes run_s fall through to 0, matching
    // the "no layout = no run" intent. The run_s gate below also requires
    // ink_cover_val > 0 && width_m > 0, so this is belt-and-braces.
    const qpa_lm = layout_per_sheet > 0 ? pitch / 1000 / layout_per_sheet / (st.num_webs || 1) : 0;
    run_s =
      ink_cover_val > 0 && width_m > 0 && qpa_lm > 0
        ? (price * qpa_lm * (ink.area_pct || 0) * width_m) / ink_cover_val / scrapF
        : 0;
    const baseMat = st.materials.find((m) => m.code === ink.base_mat);
    const baseMat_usage = baseMat ? baseMat.usage || 1 : 1;
    // Guard setup_ink_qty the same way as run_s: when coverage data is
    // missing (ink_cover_val = 0) the coverage-based portion of setup
    // should also be zero — otherwise we divide by 1 and produce an
    // economically meaningless number while run_s is zero.
    const setup_ink_qty =
      (ink.setup_kg || 0) +
      (ink_cover_val > 0 && width_m > 0
        ? ((ink.area_pct || 0) * width_m * baseMat_usage) / ink_cover_val
        : 0);
    setup_s = moq ? (price * setup_ink_qty) / moq : 0;
  }
  const total = setup_s + run_s;
  const vat = st.trade_mode === 'USD(Book)' ? total * 0.15 : 0;
  return { setup_s, run_s, vat, ink_cover_disp, layout_indigo_disp, total };
}

// ── Process Cost ──

export function calcProcess(proc, st, moq, lib, options = {}) {
  if (!proc.workcenter)
    return {
      setup_mach: 0,
      setup_labor: 0,
      run_mach: 0,
      run_labor: 0,
      tooling: 0,
      extra: 0,
      extra_vat: 0,
      uph: 0,
      mach_rate: 0,
      labor_rate: 0,
      speed_uom: '',
      total_time: 0,
      pitch: 0,
    };
  // Phase 2: snapshot-first lookups via resolver. Falls back to the
  // direct `getRateByWC(lib, …)` path for legacy callers that don't
  // pass `options.resolver`.
  const rate = (options.resolver
    ? options.resolver.getRate(proc.workcenter)
    : getRateByWC(lib, proc.workcenter)) || { machine_rate: 0, labor_rate: 0 };
  const mach_rate = rate.machine_rate || 0;
  const labor_rate = rate.labor_rate || 0;
  const crew = rate.crew || 1;
  const manual_rate =
    ((options.resolver ? options.resolver.getRate('Manual') : getRateByWC(lib, 'Manual')) || {})
      .labor_rate || 2.54;
  const speed_uom = rate.speed_uom || '';
  const pitch = calcPitch(st);
  const layout = proc.layout || 1;
  const scrapFactor = 1 - calcMatScrapFactor(st);
  const repeat = proc.repeat || 1;

  // Machine UPH — normalise speed_uom
  let uph = 0;
  const sp = proc.speed || 0;
  const eff = proc.efficiency || 0.85;
  const _suom = (speed_uom || '').replace(/\s/g, '').toLowerCase();
  if (_suom === 'm/min') uph = ((sp * eff * 60 * 1000) / Math.max(1, pitch)) * layout;
  else if (_suom === 'mtr/hr' || _suom === 'm/hr')
    uph = ((sp * eff * 1000) / Math.max(1, pitch)) * layout;
  else if (_suom === 'stamp/min') uph = sp * eff * 60 * layout;
  else if (_suom === 'pcs/h' || _suom === 'pcs/hr') uph = sp * eff;
  else if (_suom === 'sheets/h' || _suom === 'sheets/hr') uph = sp * eff * layout;
  else if (_suom === 'sheet/h' || _suom === 'sheet/hr') uph = sp * eff * layout;

  // Sprint S-DFM-P3 — cut_type speed factor for Die_Cut rows.
  // Through / both / perf / emboss all run slower than kiss-cut due
  // to deeper cut depth, tool strain, or dwell time. Skipped when
  // cut_type is unset (empty string → factor 1.00 = no change).
  if (proc.process_type === 'Die_Cut' && st?.cut_type && uph > 0) {
    uph = uph * getCutTypeSpeedFactor(st.cut_type);
  }

  const setup_h = proc.setup_h || 0;
  const setup_mach = moq ? ((setup_h * mach_rate) / moq) * repeat : 0;
  const setup_labor = moq ? ((setup_h * labor_rate * crew) / moq) * repeat : 0;
  const run_mach = uph > 0 ? (mach_rate / uph / Math.max(0.001, scrapFactor)) * repeat : 0;
  const run_labor =
    ((uph > 0 ? (labor_rate * crew) / uph / Math.max(0.001, scrapFactor) : 0) +
      (proc.manual_uph > 0 ? manual_rate / proc.manual_uph / Math.max(0.001, scrapFactor) : 0)) *
    repeat;

  const _totalQtyAuto = (st.annual_qty || moq) * (st.product_lifetime || 1);
  const eau = proc.eau_ovr && proc.eau_ovr > 0 ? proc.eau_ovr : _totalQtyAuto;

  // Tooling
  let tooling = 0;
  if (proc.tool_cost > 0) {
    const tlife =
      proc.tool_life_ovr && proc.tool_life_ovr !== false
        ? proc.tool_life || 1
        : getToolLife(lib, proc.tool_type) || proc.tool_life || 1;
    // DDL data uses "Jig" but legacy code shipped with "Jig& Fixture".
    // Normalize both to match any variant (whitespace/casing/ampersand) but
    // require EXACT match after normalization so we don't accidentally
    // classify user-entered values like "jigsaw" / "jigging" as Jig.
    const ttNorm = String(proc.tool_type || '')
      .toLowerCase()
      .replace(/[\s&]/g, '');
    const isJig = ttNorm === 'jig' || ttNorm === 'jigfixture';
    if (isJig) {
      tooling = tlife > eau ? proc.tool_cost / eau : proc.tool_cost / tlife;
    } else {
      const totalToolPcs = tlife * layout;
      tooling = totalToolPcs > eau ? proc.tool_cost / eau : proc.tool_cost / totalToolPcs;
    }
  }

  const extra_raw = proc.extra_cost || 0;
  const extra = extra_raw > 0 ? extra_raw / Math.max(0.001, scrapFactor) : 0;
  const extra_vat = st.trade_mode === 'USD(Book)' ? extra * 0.15 : 0;

  const total_time =
    ((uph > 0 ? moq / uph : 0) + (proc.manual_uph > 0 ? moq / proc.manual_uph : 0) + setup_h) *
    60 *
    repeat;
  return {
    setup_mach,
    setup_labor,
    run_mach,
    run_labor,
    tooling,
    extra,
    extra_vat,
    uph,
    mach_rate,
    labor_rate,
    speed_uom,
    eau,
    pitch,
    total_time,
  };
}

// ── Packing & Shipping ──

export function calcPacking(st) {
  if (!st.pcs_per_bag) return 0;
  return (
    (st.container_cost || 0) / st.pcs_per_bag +
    (st.box_cost || 0) / Math.max(1, st.bags_per_box) / st.pcs_per_bag +
    (st.other_packing || 0)
  );
}

export function calcShipping(st) {
  const qty = st.ship_qty || st.moq || 1;
  return qty > 0 ? ((st.shipping_cost || 0) + (st.other_ship || 0)) / qty : 0;
}

// ── SGA (Phase 9D.3) ──
//
// Selling, General & Administrative overhead. Configured per-site in
// Finance tab → persists to finance_sum.json as
//   { sga_rate_pct_by_site: { VN: 5, '41 RDC': 3, ... } }
//
// Default rate for any site is 0, which makes sga = 0 and leaves gm
// identical to pre-9D behavior. Quotes on a site with a non-zero rate
// get a second margin (`gm_after_sga`) so Finance can see the post-SGA
// picture without breaking existing GM reports.
//
// Base for the SGA burden = g_ttl (COGS including material, process,
// tooling, packing). NOT applied to tooling / packing separately —
// accounting treats SGA as a uniform percent of COGS.
//
// Pure function: no IO, no state. Extracted so calcAll stays lean and
// the formula can be unit-tested without standing up a full quote state.
export function computeSga({ g_ttl, sp_price, lib, site, snapshot }) {
  const siteKey = site || 'VN';
  // Phase 9E.4 — snapshot precedence. When an approved quote carries
  // state.approval.rates_snapshot (captured at APPROVE_FINANCE), that
  // frozen rate is authoritative. A later Finance edit bumping SGA
  // from 0→5% must NOT retroactively change this quote's reported
  // margin. Callers pass the snapshot explicitly so the computation
  // stays pure (no hidden dependency on approval state).
  if (snapshot && typeof snapshot === 'object') {
    const snapPct = Number(snapshot.sga_rate_pct);
    const pct = Number.isFinite(snapPct) && snapPct > 0 ? snapPct : 0;
    const snapSga = pct > 0 ? (Number(g_ttl) || 0) * (pct / 100) : 0;
    const snapTtl = (Number(g_ttl) || 0) + snapSga;
    const snapGm = sp_price > 0 ? 1 - snapTtl / sp_price : null;
    return {
      sga: snapSga,
      sga_rate_pct: pct,
      g_ttl_with_sga: snapTtl,
      gm_after_sga: snapGm,
      site: snapshot.site || siteKey,
      from_snapshot: true,
    };
  }

  const rates = lib?.finance?.summary?.sga_rate_pct_by_site || {};
  // Phase 9E.2 — case-insensitive site lookup. Prior version silently
  // returned 0 SGA if a quote stored `site: 'vn'` (lowercase) but the
  // Finance table had `VN` (uppercase). Build a normalized index once
  // per call; O(sites count) — sites count is < 20 in any deployment.
  const raw = rates[siteKey];
  let rawValue = raw;
  if (rawValue == null) {
    const normalizedKey = String(siteKey).trim().toLowerCase();
    for (const [k, v] of Object.entries(rates)) {
      if (String(k).trim().toLowerCase() === normalizedKey) {
        rawValue = v;
        break;
      }
    }
  }
  const parsed = Number(rawValue);
  const sgaRatePct = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const sga = sgaRatePct > 0 ? (Number(g_ttl) || 0) * (sgaRatePct / 100) : 0;
  const g_ttl_with_sga = (Number(g_ttl) || 0) + sga;
  const gm_after_sga = sp_price > 0 ? 1 - g_ttl_with_sga / sp_price : null;
  return {
    sga,
    sga_rate_pct: sgaRatePct,
    g_ttl_with_sga,
    gm_after_sga,
    site: siteKey,
    from_snapshot: false,
  };
}

// ── Aggregate: calcAll ──

/**
 * @param {object} st - tier state (post buildTierState)
 * @param {Array|null} allSpResults - sub-product pass-1 results (Cpx aggregation), null for Std
 * @param {object} lib - master library (post activeSite filter from CostLibContext)
 * @param {Array|null} subproducts - subproducts array (Cpx context), null for Std
 * @param {object} [options]
 * @param {object|null} [options.snapshot] - Phase 2 pricing snapshot to read pricing
 *   from. Null/undefined → snapshot-less BC mode (lib-only, identical to pre-Phase-2
 *   behavior). Empty snapshot → resolver falls through to lib on every key (also BC).
 * @param {boolean} [options.warnSiteMismatch=true] - emit a `_warnings` entry when
 *   snapshot._site is set, state.site is set, and they diverge (operator changed
 *   site after the snapshot was frozen). Skip when either side is null.
 * @param {boolean} [options.collectWarnings=true] - attach `_warnings` array to
 *   the returned result. False → swallow warnings, no `_warnings` field.
 * @returns {object} cost-breakdown result; carries `_warnings` array iff
 *   `collectWarnings !== false` AND at least one warning was raised.
 */
export function calcAll(st, allSpResults, lib, subproducts, options = {}) {
  const moq =
    st.moq && st.moq > 0 ? st.moq : st.annual_qty && st.annual_qty > 0 ? st.annual_qty : 1;

  // Phase 2 resolver — snapshot-first, lib-fallback. Snapshot null →
  // every getter falls through to lib → behavior identical to pre-Phase-2
  // BC mode. The resolver is created ONCE per calcAll invocation +
  // propagated to calcInk / calcProcess via the same `options` bag so
  // callers don't need to know about the resolver shape.
  const snapshot = options.snapshot || null;
  const resolver = createResolver(snapshot, lib);
  const callOptions = { ...options, resolver };

  // Site-mismatch warning collection. Snapshot._site is set when
  // freezeLib captured state.site; state.site is the live tier site.
  // Both set + diverge → operator flipped active site after freeze →
  // calc may be using rates from a site the operator no longer
  // considers active. Skip silently when either side is null (legacy
  // / synthesized snapshot OR pre-Sprint-1.x state without site field).
  //
  // Note: this is a separate channel from the existing `warnings`
  // string array (scrap_pct guards) — surfaced via the distinct
  // `_warnings` field so consumers can opt-in without parsing strings.
  const siteWarnings = [];
  const snapSite = getSnapshotSite(snapshot);
  const stateSite = (st && st.site) || null;
  if (options.warnSiteMismatch !== false && snapSite && stateSite && snapSite !== stateSite) {
    const msg = `Site mismatch: snapshot frozen under '${snapSite}', current state.site = '${stateSite}'`;
    siteWarnings.push({
      type: 'site_mismatch',
      snapshot_site: snapSite,
      state_site: stateSite,
      message: msg,
    });
    // DEV-only console.warn via the repo logger (Vite import.meta.env.DEV
    // gate; auto-silent in prod + node:test).
    devWarn('[calcEngine]', msg);
  }

  // Materials
  let s_mat_setup = 0,
    g_mat_setup = 0,
    s_mat_run = 0,
    g_mat_run = 0,
    vat_mat = 0;
  const matResults = st.materials.map((m) => {
    if (m.hidden)
      return {
        setup_s: 0,
        setup_g: 0,
        run_s: 0,
        run_g: 0,
        vat: 0,
        total_s: 0,
        total_g: 0,
        qpa_m2: 0,
        qpa_lm: 0,
        mat_po_lm: 0,
        pitch: 0,
        qpa_lm_raw: 0,
        scrap_factor: 0,
        webs: 0,
        layout_sheet: 0,
        pcs_roll: 0,
        meter_roll: 0,
      };
    const r = calcMat(m, st, moq, allSpResults, subproducts);
    s_mat_setup += r.setup_s || 0;
    g_mat_setup += r.setup_g || 0;
    s_mat_run += r.run_s || 0;
    g_mat_run += r.run_g || 0;
    vat_mat += r.vat || 0;
    return r;
  });

  // Inks
  let s_ink_setup = 0,
    s_ink_run = 0,
    vat_ink = 0;
  const inkResults = st.inks.map((ik) => {
    if (ik.hidden)
      return { setup_s: 0, run_s: 0, vat: 0, ink_cover_disp: '', layout_indigo_disp: '', total: 0 };
    const r = calcInk(ik, st, moq, lib, callOptions);
    s_ink_setup += r.setup_s || 0;
    s_ink_run += r.run_s || 0;
    vat_ink += r.vat || 0;
    return r;
  });

  const s_mat_cost = s_mat_setup + s_mat_run + s_ink_setup + s_ink_run;
  const g_mat_cost = g_mat_setup + g_mat_run + s_ink_setup + s_ink_run;
  let vat_loss = vat_mat + vat_ink;

  // Processes
  let overhead = 0,
    labor_cost = 0,
    tooling = 0;
  let setup_mach_total = 0,
    setup_labor_total = 0,
    proc_extra = 0,
    proc_extra_vat = 0;
  const procResults = st.processes.map((p) => {
    if (p.hidden)
      return {
        setup_mach: 0,
        setup_labor: 0,
        run_mach: 0,
        run_labor: 0,
        tooling: 0,
        extra: 0,
        extra_vat: 0,
        uph: 0,
        mach_rate: 0,
        labor_rate: 0,
        speed_uom: '',
        total_time: 0,
        pitch: 0,
      };
    const r = calcProcess(p, st, moq, lib, callOptions);
    overhead += r.run_mach || 0;
    labor_cost += r.run_labor || 0;
    tooling += r.tooling || 0;
    setup_mach_total += r.setup_mach || 0;
    setup_labor_total += r.setup_labor || 0;
    overhead += r.setup_mach || 0;
    labor_cost += r.setup_labor || 0;
    proc_extra += r.extra || 0;
    proc_extra_vat += r.extra_vat || 0;
    return r;
  });

  // SP sub-product pass-through
  matResults.forEach((r) => {
    if (!r.isSPRef) return;
    overhead += r._spOvhd || 0;
    labor_cost += r._spLabor || 0;
    tooling += r._spTooling || 0;
    vat_loss += r._spVat || 0;
  });

  const packing_ship = calcPacking(st) + calcShipping(st);
  const s_ttl =
    s_mat_cost +
    overhead +
    labor_cost +
    vat_loss +
    proc_extra_vat +
    tooling +
    proc_extra +
    packing_ship;
  const g_ttl =
    g_mat_cost +
    overhead +
    labor_cost +
    vat_loss +
    proc_extra_vat +
    tooling +
    proc_extra +
    packing_ship;
  const sp_price = st.selling_price || 0;

  // VA% (Value Add) = Price − Material − tooling − packing/ship, / Price.
  // Contribution% here INCLUDES tooling in the cost side. This differs from the
  // textbook accounting definition (Contribution = (SP − variable cost)/SP,
  // where variable excludes fixed/period costs like tooling). The CCL
  // convention treats tooling as variable because dies are amortized per
  // quote/order. Do NOT change the formula without Finance sign-off — it will
  // shift every historical quote's reported margin.
  //
  // Sprint 21: two alignment fixes so stored KPIs match what the UI
  // re-derives from displayed breakdown fields. Before this, Finance
  // auditors saw stored `va` / `contribution` that didn't reconcile
  // with the Material + Labor columns in Cost Breakdown.
  //
  // 1. Switched from `g_mat_cost` (gross list price) to `s_mat_cost`
  //    (supplier/purchase price) so `va` matches the "Material"
  //    column UI renders (which uses s_mat_cost).
  // 2. Contribution uses RUN-only labor (`labor_cost - setup_labor_total`)
  //    to match the `labor_cost` field returned to consumers. Setup
  //    labor is tracked separately in `bd_setup_labor` and folded into
  //    s_ttl (so GM still includes it); Contribution's denominator
  //    aligns with the "Labor" column users see.
  const run_labor_only = labor_cost - setup_labor_total;
  const va = sp_price > 0 ? 1 - (s_mat_cost + tooling + packing_ship) / sp_price : null;
  const contribution =
    sp_price > 0 ? 1 - (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price : null;
  // GM uses s_ttl / sp_price — s_ttl is the full supplier-price subtotal
  // (material + run + setup + tooling + packing + vat_loss).
  const gm = sp_price > 0 ? 1 - s_ttl / sp_price : null;

  // SGA burden — see computeSga() below for the formula + rationale.
  // Pass the approval snapshot when the quote is in an approved state
  // so the frozen rate wins over live Finance data (Phase 9E.4).
  const approvalSnapshot = st.approval?.rates_snapshot || null;
  const {
    sga,
    sga_rate_pct: sgaRatePct,
    g_ttl_with_sga,
    site,
  } = computeSga({ g_ttl, sp_price, lib, site: st.site, snapshot: approvalSnapshot });
  // Sprint 21 follow-up: gm uses s_ttl (supplier basis). gm_after_sga
  // must also use s_ttl so the delta gm - gm_after_sga isolates JUST
  // the SGA burden. Pre-fix, gm_after_sga was s_ttl-vs-g_ttl AND SGA
  // combined — users couldn't reconcile when the numbers differed even
  // at SGA=0 because of the gross/supplier drift baked in.
  const s_ttl_with_sga = s_ttl + sga;
  const gm_after_sga = sp_price > 0 ? 1 - s_ttl_with_sga / sp_price : null;

  const warnings = [];
  if (st.processes && st.processes.some((p) => !p.hidden && p.scrap_pct >= 0.95)) {
    warnings.push(
      'Some processes have scrap_pct >= 95% — possible data entry error (95 entered instead of 0.95)?'
    );
  }

  return {
    s_mat_cost,
    g_mat_cost,
    overhead: overhead - setup_mach_total,
    labor_cost: labor_cost - setup_labor_total,
    vat_loss,
    tooling,
    packing_ship,
    s_ttl,
    g_ttl,
    va,
    contribution,
    gm,
    sp: sp_price,
    // Phase 9D.3 — SGA + post-SGA margin. When sga_rate_pct=0 (default)
    // sga=0 and gm_after_sga === gm, so no consumer sees a change.
    sga,
    sga_rate_pct: sgaRatePct,
    g_ttl_with_sga,
    gm_after_sga,
    site,
    matResults,
    inkResults,
    procResults,
    s_setup_mat: s_mat_setup,
    g_setup_mat: g_mat_setup,
    // Granular breakdown for Cost Breakdown tab
    bd_mat_setup: g_mat_setup,
    bd_mat_run: g_mat_run,
    bd_ink_setup: s_ink_setup,
    bd_ink_run: s_ink_run,
    bd_overhead: overhead,
    bd_labor: labor_cost,
    bd_extra: proc_extra,
    bd_extra_vat: proc_extra_vat,
    bd_setup_mach: setup_mach_total,
    bd_setup_labor: setup_labor_total,
    warnings,
    // Phase 2 snapshot/site-mismatch warnings — attached only when
    // `collectWarnings !== false` AND at least one warning was raised,
    // so the BC return shape stays untouched for happy-path callers.
    ...(options.collectWarnings !== false && siteWarnings.length > 0
      ? { _warnings: siteWarnings }
      : {}),
  };
}

/**
 * Persistable subset of a calcAll() / aggregateComplex() result. Saved
 * quote records use this shape so QuoteHistory / QuoteAnalysis / Summarize
 * can render the full Cost Breakdown without re-running calcAll (which
 * needs the current `lib` — something a viewer of a historical quote
 * may not have loaded).
 *
 * Sprint 14 rationale: previous save shape was just {gm, va, s_ttl}.
 * When a formula diverges in a later sprint (as happened with the
 * VA / Contribution canonical fix in Sprint 6 + the Sprint 9 migration),
 * stored KPIs drift silently from what consumers compute on render.
 * Persisting the money breakdown lets consumers recompute canonical
 * KPIs from stored fields — zero migration risk if the formula moves
 * again.
 *
 * Explicitly excludes the heavy per-row arrays (matResults, inkResults,
 * procResults). Those are recomputable from state and would inflate
 * the quote_history.json size by ~5-10×.
 */
const PERSISTED_RESULT_FIELDS = [
  'sp',
  's_ttl',
  'g_ttl',
  'gm',
  'va',
  'contribution',
  's_mat_cost',
  'g_mat_cost',
  'overhead',
  'labor_cost',
  'tooling',
  'packing_ship',
  'vat_loss',
  'bd_mat_setup',
  'bd_mat_run',
  'bd_ink_setup',
  'bd_ink_run',
  'bd_overhead',
  'bd_labor',
  'bd_extra',
  'bd_extra_vat',
  'bd_setup_mach',
  'bd_setup_labor',
  'sga',
  'sga_rate_pct',
  'g_ttl_with_sga',
  'gm_after_sga',
  'site',
  'warnings',
  // MES-3-FIX-41: per-row breakdown for export visibility. `rows` carries
  // active-tier rows at top level for fast read; `tiers` carries per-tier
  // rows (including non-active) so multi-tier xlsx exports show real
  // numbers everywhere. Cpx adds `subproducts[spi].rows`/.tiers[].rows.
  'rows',
  'tiers',
  'subproducts',
];

/**
 * @param {Partial<CalcResult>|null|undefined} result
 * @returns {Partial<CalcResult>|null}
 */
export function serializeResultForPersist(result) {
  if (!result || typeof result !== 'object') return null;
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of PERSISTED_RESULT_FIELDS) {
    if (k in result) out[k] = /** @type {any} */ (result)[k];
  }
  return out;
}

/**
 * Display helpers so UI rows + waterfalls can show Material AND Ink
 * as separate columns that actually sum to the subtotal.
 *
 * Sprint 16 background: `s_mat_cost` from calcAll deliberately bundles
 * raw-material + ink into one "materials-bought" total (line 450). The
 * Cost Breakdown UI renders BOTH a "Material" column (using s_mat_cost)
 * AND an "Ink" column (using bd_ink_*), which visually double-counts
 * ink — users summed columns and got a number larger than the stored
 * subtotal, eroding trust in the breakdown. These helpers cut ink out
 * of the Material figure at display time only; s_mat_cost itself is
 * unchanged so stored data + exports keep the same semantics.
 */
/**
 * @param {Partial<CalcResult>|null|undefined} result
 * @returns {number}
 */
export function inkCostTotal(result) {
  if (!result || typeof result !== 'object') return 0;
  return (result.bd_ink_setup || 0) + (result.bd_ink_run || 0);
}

/**
 * @param {Partial<CalcResult>|null|undefined} result
 * @returns {number}
 */
export function matCostExcludingInk(result) {
  if (!result || typeof result !== 'object') return 0;
  return (result.s_mat_cost || 0) - inkCostTotal(result);
}

// ── MOQ Tier helpers ──

const _matStruct = new Set([
  'code',
  'desc',
  'row_type',
  'offcut_yn',
  'slitting_yn',
  'df_yn',
  'free_liner',
  'hidden',
]);
const _inkStruct = new Set(['color', 'print_type', 'base_mat', 'hidden']);
const _procStruct = new Set(['workcenter', 'process_type', 'label', 'hidden']);
const _filterOvr = (ovr, skip) => {
  const o = {};
  for (const k in ovr) if (!skip.has(k)) o[k] = ovr[k];
  return o;
};

export function buildTierState(st, tierIdx, price, moq, eau) {
  const em = tierIdx === 0 ? null : (st.extra_moqs || [])[tierIdx - 1];
  const base = Object.assign({}, st, {
    moq: moq || 1,
    annual_qty: eau || st.annual_qty || 1,
    selling_price: price,
  });
  if (!em) return base;
  // PR #C (Sprint S-ALT-MAT) — per-tier alt-materials override fields.
  // When state.materials_active === 'alt', material-row tier overrides
  // index against materials_alt (= st.materials mirror). Use the _alt
  // variant field; fall back to undefined (no override) when not set so
  // alt rows render with their base setup_lm. Ink + process + packing
  // tier overrides remain shared between main/alt (orthogonal to which
  // material set is active).
  const isMatAlt = st.materials_active === 'alt';
  const lmOvr = isMatAlt ? em.mat_setup_lm_alt : em.mat_setup_lm;
  if (lmOvr && lmOvr.length) {
    base.materials = st.materials.map((m, i) =>
      lmOvr[i] != null ? Object.assign({}, m, { setup_lm: lmOvr[i] }) : m
    );
  }
  if ((em.ink_setup_kg && em.ink_setup_kg.length) || (em.ink_area_pct && em.ink_area_pct.length)) {
    base.inks = st.inks.map((ik, i) => {
      const ovr = {};
      if (em.ink_setup_kg && em.ink_setup_kg[i] != null) ovr.setup_kg = em.ink_setup_kg[i];
      if (em.ink_area_pct && em.ink_area_pct[i] != null) ovr.area_pct = em.ink_area_pct[i];
      return Object.keys(ovr).length ? Object.assign({}, ik, ovr) : ik;
    });
  }
  if (em.proc_setup_h && em.proc_setup_h.length) {
    base.processes = st.processes.map((p, i) =>
      em.proc_setup_h[i] != null ? Object.assign({}, p, { setup_h: em.proc_setup_h[i] }) : p
    );
  }
  return base;
}

/**
 * Apply Complex per-MOQ overrides to a single subproduct.
 *
 * PR #B (mirror invariant): reads `sp.materials` directly which is kept
 * in sync with sp.materials_active by the reducer.
 *
 * PR #C (per-tier alt overrides, amendment A — per-SP branching):
 * The material setup_lm override map is per-SP-active, so a Cpx quote
 * with SP-A active='main' and SP-B active='alt' at the SAME tier picks
 * sp_mat_setup_lm for SP-A and sp_mat_setup_lm_alt for SP-B. Process
 * overrides remain shared (sp_proc_setup_h) since they are orthogonal
 * to the active material set choice.
 *
 * Reads from:
 *   cs.extra_moqs[tierIdx-1].sp_mat_setup_lm[spi][mi]       (main rows)
 *   cs.extra_moqs[tierIdx-1].sp_mat_setup_lm_alt[spi][mi]   (alt rows)
 *   cs.extra_moqs[tierIdx-1].sp_proc_setup_h[spi][pi]       (shared)
 */
export function applyCplxTierToSp(cs, sp, spi, tierIdx) {
  if (!tierIdx || tierIdx === 0) return sp;
  const em = (cs.extra_moqs || [])[tierIdx - 1];
  if (!em) return sp;
  let out = sp;
  const isSpMatAlt = sp && sp.materials_active === 'alt';
  const matOvrTable = isSpMatAlt ? em.sp_mat_setup_lm_alt : em.sp_mat_setup_lm;
  const matOvr = matOvrTable && matOvrTable[spi];
  if (matOvr && Array.isArray(matOvr) && matOvr.length) {
    out = Object.assign({}, out, {
      materials: (out.materials || []).map((m, mi) =>
        matOvr[mi] != null ? Object.assign({}, m, { setup_lm: matOvr[mi] }) : m
      ),
    });
  }
  const procOvr = em.sp_proc_setup_h && em.sp_proc_setup_h[spi];
  if (procOvr && Array.isArray(procOvr) && procOvr.length) {
    out = Object.assign({}, out, {
      processes: (out.processes || []).map((p, pi) =>
        procOvr[pi] != null ? Object.assign({}, p, { setup_h: procOvr[pi] }) : p
      ),
    });
  }
  return out;
}

export function getActiveTierState(st) {
  const idx = st.active_moq_idx || 0;
  if (idx === 0) return st;
  const em = (st.extra_moqs || [])[idx - 1];
  if (!em) return st;
  const base = Object.assign({}, st, {
    moq: em.moq || st.moq,
    selling_price: em.price || st.selling_price,
    annual_qty: em.eau != null && em.eau !== '' ? em.eau : st.annual_qty,
  });
  // PR #C (Sprint S-ALT-MAT) — per-tier alt-materials override fields.
  // Material-row tier overrides branch on state.materials_active (alt
  // vs main). When _alt variant is undefined, fall back to no override
  // so alt rows render with their base setup_lm / per-row fields. Ink +
  // process + packing tier overrides remain shared.
  const isMatAlt = st.materials_active === 'alt';
  const lmOvr = isMatAlt ? em.mat_setup_lm_alt : em.mat_setup_lm;
  if (lmOvr && lmOvr.length) {
    base.materials = st.materials.map((m, i) =>
      lmOvr[i] != null ? Object.assign({}, m, { setup_lm: lmOvr[i] }) : m
    );
  }
  if ((em.ink_setup_kg && em.ink_setup_kg.length) || (em.ink_area_pct && em.ink_area_pct.length)) {
    base.inks = st.inks.map((ik, i) => {
      const ovr = {};
      if (em.ink_setup_kg && em.ink_setup_kg[i] != null) ovr.setup_kg = em.ink_setup_kg[i];
      if (em.ink_area_pct && em.ink_area_pct[i] != null) ovr.area_pct = em.ink_area_pct[i];
      return Object.keys(ovr).length ? Object.assign({}, ik, ovr) : ik;
    });
  }
  if (em.proc_setup_h && em.proc_setup_h.length) {
    base.processes = st.processes.map((p, i) =>
      em.proc_setup_h[i] != null ? Object.assign({}, p, { setup_h: em.proc_setup_h[i] }) : p
    );
  }
  // Apply full per-MOQ row overrides (new system). Material rows pick
  // the _alt variant when active='alt'; ink/proc rows shared.
  const matRowsOvr = isMatAlt ? em.mat_rows_alt : em.mat_rows;
  if (matRowsOvr && matRowsOvr.length) {
    base.materials = (base.materials || st.materials).map((m, i) => {
      if (!matRowsOvr[i]) return m;
      const ovr = _filterOvr(matRowsOvr[i], _matStruct);
      return Object.keys(ovr).length ? Object.assign({}, m, ovr) : m;
    });
  }
  if (em.ink_rows && em.ink_rows.length) {
    base.inks = (base.inks || st.inks).map((ik, i) => {
      if (!em.ink_rows[i]) return ik;
      const ovr = _filterOvr(em.ink_rows[i], _inkStruct);
      return Object.keys(ovr).length ? Object.assign({}, ik, ovr) : ik;
    });
  }
  if (em.proc_rows && em.proc_rows.length) {
    base.processes = (base.processes || st.processes).map((p, i) => {
      if (!em.proc_rows[i]) return p;
      const ovr = _filterOvr(em.proc_rows[i], _procStruct);
      return Object.keys(ovr).length ? Object.assign({}, p, ovr) : p;
    });
  }
  if (em.packing) Object.assign(base, em.packing);
  return base;
}

// ── Alt Materials helper (PR #A — Sprint S-ALT-MAT) ──
//
// Std state carries three fields: materials_main (canonical "main" set),
// materials_alt (alternative set, default empty), and materials_active
// ('main' | 'alt'). The legacy `state.materials` field is kept as a MIRROR
// of the active set so existing readers (calcAll, getActiveTierState,
// buildTierState, UI cells, validators, ink base-mat lookups) continue
// working without callsite churn. New code SHOULD prefer getActiveMaterials
// for clarity, especially when reading from a state shape that may have
// been hand-crafted in tests where the mirror could lag.
//
// PR #B (Cpx) will extend this helper to look at per-subproduct active
// fields; the function signature stays stable.
export function getActiveMaterials(state) {
  if (!state || typeof state !== 'object') return [];
  if (state.materials_active === 'alt') return state.materials_alt || [];
  return state.materials_main || state.materials || [];
}

// Per-subproduct variant for Complex calculator (Sprint S-ALT-MAT, PR #B).
// Same contract as getActiveMaterials but reads from a subproduct object.
// Each SP carries its own materials_main / materials_alt / materials_active
// fields with `sp.materials` as a mirror; this helper is the explicit
// reader new code SHOULD prefer over `sp.materials` (which may lag if a
// test fixture or buggy migration produces an out-of-sync mirror).
//
// aggregateComplex + applyCplxTierToSp continue reading `sp.materials`
// directly — the reducer maintains the mirror invariant on every write.
export function getActiveSPMaterials(sp) {
  if (!sp || typeof sp !== 'object') return [];
  if (sp.materials_active === 'alt') return sp.materials_alt || [];
  return sp.materials_main || sp.materials || [];
}

// ── State Factories ──

// Generate a stable unique id for list rows (React key stability across edits).
function newMid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStdState() {
  return {
    // Sprint 18 — schema marker. stdMigration.upgradeStdState short-
    // circuits when version ≥ 1 + all _mid present, so new quotes start
    // stamped and subsequent loads skip the migration walk.
    // Sprint S-CLEAN (2026-04-24) — fresh quote starts with empty
    // number fields so the operator isn't overwriting sample data.
    // Enum defaults are kept because they're the near-universal
    // choice (VN site, USD Normal, Sheet packing, DAP ship term).
    _schema_version: 1,
    rfq_number: '',
    ccl_pn: '',
    direct_cu: '',
    project: '',
    project_name: '',
    end_cu_pn: '',
    direct_cu_pn: '',
    npi_owner: '',
    sale_owner: '',
    description: '',
    options: '',
    moq: 0,
    annual_qty: 0,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0,
    selling_price_vnd: 0,
    usd_rate: 0,
    currency: 'USD',
    target: null,
    target_vnd: null,
    target_contr: 25,
    num_moq: 1,
    extra_moqs: [],
    active_moq_idx: 0,
    product_lifetime: '',
    sum_records: [],
    // Layout (clean defaults — operator fills in from the drawing).
    // num_webs=1 + parts_in_md=1 + parts_web_across=1 kept because
    // 1×1 is the trivial layout and prevents /0 in derived math.
    // `part_width` / `part_length_md` = DIE outer size (authoritative
    // for geometry). Print image net size + bleed live in the separate
    // `part_net_*` / `bleed_*` fields below (Sprint S-SPLIT 2026-04-24).
    part_width: 0,
    part_length_md: 0,
    web_width_td: 0,
    sheet_length: 0,
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    min_gap_md: 0,
    rotary_cols: 0,
    pcs_per_roll: 0,
    // ── Print Design Layout sub-tab (Sprint S-SPLIT) ──
    // Net image size = what the customer sees; die_size = what we cut.
    // Operator types net + bleed; validator warns if net+2*bleed > die.
    //
    // `print_part_width` / `print_part_length_md` (Sprint 13b 2026-04-25):
    // Print designer's INTENDED finished product size. Logically equals
    // Cut's `part_width` / `part_length_md` (the die-cut output IS the
    // product), but tracked separately so the Print tab is editable in
    // parallel with Cut. Validator warns when the two diverge — catches
    // documentation mistakes where the print artwork was sized for one
    // spec while the die was made for another. 0 = unset (Print tab
    // surfaces a "Sync from Cut" affordance to fill in).
    print_part_width: 0,
    print_part_length_md: 0,
    part_net_width: 0,
    part_net_length: 0,
    bleed_td_mm: 0, // bleed each side TD (operator-entered)
    bleed_md_mm: 0, // bleed each side MD
    plate_tooth: 0, // explicit plate cylinder tooth (0 = follow magnetic)
    plate_pitch_mm: 0, // derived if 0, else authoritative
    // ── Cutting Design Layout sub-tab ──
    cut_type: '', // 'kiss-cut'|'through-cut'|'both'|'perf-only'|'emboss'
    corner_radius_mm: 0,
    magnetic_tooth: 0, // explicit magnetic cylinder tooth (0 = optimizer picks)
    magnetic_pitch_mm: 0, // derived if 0
    // Slit-after-print workflow — print wide web → slit into N lanes →
    // die-cut each lane. Informational fields the UI uses to show
    // print-cavities-across vs cut-cavities-across. When slit is on,
    // operator sets `num_webs` in the shared header to `slit_lane_count`.
    slit_after_print: false,
    slit_lane_count: 1,
    cutter_cavity: 0, // parts per cutter stamp (per die). 0 = auto = parts_web_across × parts_in_md.
    // ── DFM guards (Sprint S-DFM) ──
    color_count: 0, // # of colors/inks to print (0 = unset, don't validate)
    die_quiet_zone_mm: 0, // clearance around die for reg marks / bearer (0 = none)
    tol_p2p_mm: 0, // print-to-print (color registration) tolerance
    min_slit_lane_width_mm: 0, // override default min slit lane width (0 = 25mm default)
    // ── Phase 4 UX polish ──
    unwind_direction: '', // '' | 'face-in' | 'face-out' — label orientation on roll
    print_direction_md: '', // '' | 'head-first' | 'tail-first' — text reading direction
    include_reg_marks: false, // reg-mark / color bar strip (typ. 5 mm) embedded at lane edge
    reg_mark_width_mm: 0, // width of reg mark strip when include_reg_marks = true (0 = 5 default)
    plate_thickness_mm: 0, // 1.14 / 1.70 mm flexo · 0 = unspecified
    anilox_bcm: 0, // anilox volume (BCM, billion cubic microns) · typ. 4.0-6.5
    print_to_cut_offset_mm: 0, // MD offset between print and cut cylinders (for layout drawing)
    // Layout optimizer inputs (Phase 2 — used by layoutValidation +
    // layoutOptimizer). All optional with sensible defaults so old
    // quotes hydrate without migration.
    edge_margin_td: 3,
    // Asymmetric edge margins (customer-specified distance from liner
    // left/right edge to first product). Zero means "symmetric — fall
    // back to edge_margin_td above". Non-zero wins.
    edge_margin_td_left: 0,
    edge_margin_td_right: 0,
    // Advanced layout tuning (optional). Defaults are no-op so legacy
    // quotes hydrate unchanged.
    parts_per_die: 1, // compound die multiplier (2-up / 3-up)
    orient_locked: false, // if true, optimizer MUST NOT rotate 90°
    perf_offset_mm: 0, // adds to MD gap when perforation line present
    tol_p2c_mm: 0, // customer tolerance print-to-cut
    tol_c2c_mm: 0, // customer tolerance cut-to-cut
    tol_slit_mm: 0, // customer tolerance slitting edge
    min_gap_td: 3,
    allow_rotate_90: true,
    tooth_pitch_mm: 3.175,
    tooth_count_options: [], // empty = optimizer uses DEFAULT_TOOTH_COUNTS
    machine_profile_id: '', // FK into Library/MachineProfiles — drives optimizer constraints when set
    die_policy: 'new_allowed', // reuse_existing | new_allowed | specific_tooth
    target_pcs_per_roll: 0, // 0 = no constraint
    max_roll_od_mm: 0,
    // layout_validation_ack: 'warning acknowledged by {user, ts, codes[]}'
    // is set ONCE when the operator confirms a save with warnings, so
    // re-opening the quote doesn't re-prompt.
    layout_validation_ack: null,
    // Sprint S-PFC — admin-editable Process Flow Chart overrides in the
    // Summarize tab. Same schema as Complex. Empty = auto-generated.
    flow_chart_overrides: {},
    // Materials — alt-materials feature (Sprint S-ALT-MAT, PR #A).
    // materials_main is the canonical set seeded with 2 starter rows.
    // materials_alt is the parallel "Alternative" set, empty by default
    // until operator clicks the Alternative.Mat toggle and adds rows
    // (or copies from main). materials_active discriminates which set
    // calc engine + UI render. `materials` is kept as a MIRROR of the
    // active set so legacy readers (calcAll, getActiveTierState, validators,
    // ink base-mat lookups) continue working without callsite churn —
    // reducer keeps the three fields consistent.
    materials_main: Array(2)
      .fill(null)
      .map((_, i) => ({
        _mid: newMid(),
        row_type: i < 10 ? 'Main.Mat' : 'Process Mat',
        code: '',
        drw_material: '',
        desc: '',
        usage: 0,
        setup_lm: 0,
        cavities: 0,
        free_liner: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    materials_alt: [],
    materials_active: 'main',
    materials: Array(2)
      .fill(null)
      .map((_, i) => ({
        _mid: newMid(),
        row_type: i < 10 ? 'Main.Mat' : 'Process Mat',
        code: '',
        drw_material: '',
        desc: '',
        usage: 0,
        setup_lm: 0,
        cavities: 0,
        free_liner: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    // Inks: start with 2 rows (add more via + button, max 10)
    inks: Array(2)
      .fill(null)
      .map((_, i) => ({
        label: `Ink ${i + 1}`,
        ifs_code: '',
        color: '',
        print_type: '',
        mesh_spec: '',
        pitch_mm: 0,
        // `base_mat` legacy (pre-2026-05-11): string holding a material
        // code or a trailing numeric width. Replaced by `width` (mm,
        // numeric) that mirrors Layout's web_width_td when unset.
        // Kept in schema so saved quotes still resolve their width via
        // calcInk's legacy fallback chain.
        base_mat: '',
        width: 0,
        coverage: 0,
        setup_kg: 0,
        area_pct: 0,
        clicks: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    // Processes: 1 row default
    processes: Array(1)
      .fill(null)
      .map((_, i) => ({
        label: `Process ${i + 1}`,
        process_type: '',
        workcenter: '',
        speed: 0,
        layout: 1,
        efficiency: 0.85,
        setup_h: 0,
        scrap_pct: 0.03,
        manual_uph: 0,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      })),
    // Packing (clean — operator fills per SKU).
    packing_method: 'Sheet',
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    // Shipping (clean).
    delivery_term: 'DAP',
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
    // RFQ
    design_process: '',
    layout_file: null,
    customer_drw_file: null,
    // Lead time & Notice sub-tab metadata. Free-text fields operator
    // fills on cover-sheet; zero pricing impact (calcAll never reads
    // lead_time). Legacy quotes heal via `state.lead_time || {}`
    // fallback at reducer + UI, so no schema-version bump needed
    // (PR #110 pattern).
    lead_time: {
      lt_material: '',
      lt_sample: '',
      lt_po: '',
      lt_remark: '',
      lt_process: '',
      lt_material_type: '',
    },
    // Pricing snapshot — Phase 1 foundation for fixing the calcEngine
    // recompute-drift bug (quote.state today does NOT embed pricing
    // params, so re-opening an old quote after master rates shift
    // produces a different cost). Empty default; freezeLib(lib, state)
    // populates at save time (Phase 2). See pricingSnapshot.js.
    pricing_snapshot: createEmptySnapshot(),
  };
}

export function createEmptyStdState() {
  return {
    _schema_version: 1,
    rfq_number: '',
    ccl_pn: '',
    direct_cu: '',
    project: '',
    project_name: '',
    end_cu_pn: '',
    direct_cu_pn: '',
    description: '',
    options: '',
    npi_owner: '',
    sale_owner: '',
    moq: 0,
    annual_qty: 0,
    product_lifetime: 0,
    trade_mode: '',
    site: 'VN',
    selling_price: 0,
    selling_price_vnd: 0,
    usd_rate: 0,
    currency: '',
    target: null,
    target_vnd: null,
    target_contr: 25,
    part_width: 0,
    part_length_md: 0,
    web_width_td: 0,
    sheet_length: 0,
    // MES-3-FIX-32 follow-up — num_webs / parts_in_md / parts_web_across
    // MUST default to 1 (not 0). `calcQPA_LM` early-returns 0 when
    // `!st.num_webs`, which propagates into `run_s = 0` and the UI shows
    // Run Cost = "—" even when every other input is populated. Same trap
    // would surface for parts_in_md / parts_web_across via
    // `calcLayoutPerSheet` (their product = layout_per_sheet, and 0×0 = 0
    // kills cavities everywhere). `createStdState()` documents this same
    // invariant — keep both factories aligned.
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    min_gap_md: 0,
    rotary_cols: 0,
    pcs_per_roll: 0,
    // Alt-materials feature (Sprint S-ALT-MAT, PR #A). See createStdState
    // for the full contract — materials field is a mirror of the active set.
    materials_main: Array(1)
      .fill(null)
      .map(() => ({
        _mid: newMid(),
        row_type: 'Main.Mat',
        code: '',
        drw_material: '',
        desc: '',
        usage: 0,
        setup_lm: 0,
        cavities: 0,
        free_liner: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    materials_alt: [],
    materials_active: 'main',
    materials: Array(1)
      .fill(null)
      .map(() => ({
        _mid: newMid(),
        row_type: 'Main.Mat',
        code: '',
        drw_material: '',
        desc: '',
        usage: 0,
        setup_lm: 0,
        cavities: 0,
        free_liner: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    inks: Array(1)
      .fill(null)
      .map((_, i) => ({
        label: `Ink ${i + 1}`,
        ifs_code: '',
        color: '',
        print_type: '',
        mesh_spec: '',
        pitch_mm: 0,
        // `base_mat` legacy (pre-2026-05-11): string holding a material
        // code or a trailing numeric width. Replaced by `width` (mm,
        // numeric) that mirrors Layout's web_width_td when unset.
        // Kept in schema so saved quotes still resolve their width via
        // calcInk's legacy fallback chain.
        base_mat: '',
        width: 0,
        coverage: 0,
        setup_kg: 0,
        area_pct: 0,
        clicks: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    processes: Array(1)
      .fill(null)
      .map((_, i) => ({
        label: `Process ${i + 1}`,
        process_type: '',
        workcenter: '',
        speed: 0,
        layout: 0,
        efficiency: 0,
        setup_h: 0,
        scrap_pct: 0,
        manual_uph: 0,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        extra_cost: 0,
        product_life: 0,
        eau_ovr: 0,
        repeat: 0,
      })),
    packing_method: 'Sheet',
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    delivery_term: '',
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
    design_process: '',
    request_ul: 'N',
    ul_description: '',
    layout_file: null,
    num_moq: 1,
    extra_moqs: [],
    active_moq_idx: 0,
    sum_records: [],
    // Lead time & Notice sub-tab metadata — see createStdState for
    // the contract; mirrored here so RESET_STD (New button) starts
    // with the same shape.
    lead_time: {
      lt_material: '',
      lt_sample: '',
      lt_po: '',
      lt_remark: '',
      lt_process: '',
      lt_material_type: '',
    },
    // Pricing snapshot — see createStdState for the contract; mirrored
    // here so RESET_STD (New button) starts with the same empty shape.
    pricing_snapshot: createEmptySnapshot(),
  };
}

export function createCplxState() {
  return {
    rfq_number: '',
    ccl_pn: '',
    direct_cu: '',
    project: '',
    description: '',
    options: '',
    moq: 0,
    annual_qty: 0,
    product_lifetime: 0,
    trade_mode: 'USD',
    site: 'VN',
    selling_price: 0,
    currency: 'USD',
    target: null,
    selling_price_vnd: 0,
    target_vnd: null,
    usd_rate: 0,
    sale_owner: '',
    direct_cu_pn: '',
    end_cu: '',
    end_cu_pn: '',
    project_name: '',
    ul: '',
    npi_owner: '',
    request_ul: 'N',
    ul_description: '',
    num_moq: 1,
    extra_moqs: [],
    active_moq_idx: 0,
    layout_file: null,
    packing_method: 'Sheet',
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    delivery_term: '',
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
    subproducts: [createSubProduct('SP A')],
    // v2 shape additions (see cplxMigration.js). Populated here so new
    // quotes start at version 2 without needing the lazy migrator.
    bom: [],
    tooling_alloc: [],
    // Sprint S-PFC — admin overrides for the auto-generated Process
    // Flow Chart in Summarize tab. Shape: { labels, hidden, extraNodes,
    // groupTitles } — empty object = fully auto-generated from data.
    flow_chart_overrides: {},
    _shape_version: 2,
    // Lead time & Notice sub-tab metadata — see createStdState for
    // the contract. Quote-level (not per-SP) per operator scoping.
    lead_time: {
      lt_material: '',
      lt_sample: '',
      lt_po: '',
      lt_remark: '',
      lt_process: '',
      lt_material_type: '',
    },
    // Pricing snapshot — quote-level (not per-SP), captures USED rows
    // from lib at save time. See pricingSnapshot.js / createStdState.
    pricing_snapshot: createEmptySnapshot(),
  };
}

export function createSubProduct(code) {
  return {
    code,
    description: '',
    main_process: '',
    // v2 shape: explicit assembly flag. Default false; BOM tree UI
    // toggles this to true for FG/parent SPs. Migration back-fills
    // from FG code prefix for legacy quotes.
    is_assembly: typeof code === 'string' && code.toUpperCase().startsWith('FG'),
    // Alt-materials feature (Sprint S-ALT-MAT, PR #B). See createStdState
    // for the full contract — sp.materials field is a mirror of the active
    // set; calcEngine readers (aggregateComplex, applyCplxTierToSp) keep
    // reading sp.materials so no callsite churn is needed.
    materials_main: Array(1)
      .fill(null)
      .map(() => ({
        _mid: newMid(),
        row_type: 'Main.Mat',
        code: '',
        drw_material: '',
        desc: '',
        qpa: 0,
        usage: 0,
        setup_lm: 0,
        free_liner: 0,
        pitch: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    materials_alt: [],
    materials_active: 'main',
    materials: Array(1)
      .fill(null)
      .map(() => ({
        _mid: newMid(),
        row_type: 'Main.Mat',
        code: '',
        drw_material: '',
        desc: '',
        qpa: 0,
        usage: 0,
        setup_lm: 0,
        free_liner: 0,
        pitch: 0,
        width: 0,
        log_width: 0,
        pitch_ovr: 0,
        offcut_yn: '',
        slitting_yn: '',
        df_yn: '',
        offcut_pct: 0,
        import_duty: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    inks: Array(1)
      .fill(null)
      .map((_, i) => ({
        label: `Ink ${i + 1}`,
        ifs_code: '',
        color: '',
        print_type: '',
        mesh_spec: '',
        pitch_mm: 0,
        // `base_mat` legacy (pre-2026-05-11): string holding a material
        // code or a trailing numeric width. Replaced by `width` (mm,
        // numeric) that mirrors Layout's web_width_td when unset.
        // Kept in schema so saved quotes still resolve their width via
        // calcInk's legacy fallback chain.
        base_mat: '',
        width: 0,
        coverage: 0,
        setup_kg: 0,
        area_pct: 0,
        s_price: 0,
        g_price: 0,
        latest: 0,
      })),
    processes: Array(1)
      .fill(null)
      .map((_, i) => ({
        label: `Process ${i + 1}`,
        process_type: '',
        workcenter: '',
        speed: 0,
        layout: 1,
        efficiency: 0.85,
        setup_h: 0,
        scrap_pct: 0.03,
        manual_uph: 0,
        tool_cost: 0,
        tool_type: '',
        tool_life: 0,
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      })),
    packing_method: 'Sheet',
    pcs_per_bag: 0,
    bags_per_box: 0,
    container_cost: 0,
    box_cost: 0,
    other_packing: 0,
    delivery_term: '',
    ship_qty: 0,
    shipping_cost: 0,
    other_ship: 0,
    // Layout — die geometry. Clean defaults (Sprint S-CLEAN).
    part_width: 0,
    part_length_md: 0,
    web_width_td: 0,
    sheet_length: 0,
    num_webs: 1,
    parts_in_md: 1,
    parts_web_across: 1,
    min_gap_md: 0,
    rotary_cols: 0,
    pcs_per_roll: 0,
    // Asymmetric edges (Sprint v3)
    edge_margin_td: 3,
    edge_margin_td_left: 0,
    edge_margin_td_right: 0,
    min_gap_td: 3,
    // Advanced (parts_per_die, orient_locked, perf_offset, tolerances)
    parts_per_die: 1,
    orient_locked: false,
    perf_offset_mm: 0,
    tol_p2c_mm: 0,
    tol_c2c_mm: 0,
    tol_slit_mm: 0,
    target_pcs_per_roll: 0,
    max_roll_od_mm: 0,
    // Machine profile (Sprint Press Library)
    machine_profile_id: '',
    tooth_pitch_mm: 3.175,
    tooth_count_options: [],
    allow_rotate_90: true,
    // Print Design Layout sub-tab (Sprint S-SPLIT)
    part_net_width: 0,
    part_net_length: 0,
    bleed_td_mm: 0,
    bleed_md_mm: 0,
    plate_tooth: 0,
    plate_pitch_mm: 0,
    // Cutting Design Layout sub-tab
    cut_type: '',
    corner_radius_mm: 0,
    magnetic_tooth: 0,
    magnetic_pitch_mm: 0,
    slit_after_print: false,
    slit_lane_count: 1,
    cutter_cavity: 0,
    color_count: 0,
    die_quiet_zone_mm: 0,
    tol_p2p_mm: 0,
    min_slit_lane_width_mm: 0,
    unwind_direction: '',
    print_direction_md: '',
    include_reg_marks: false,
    reg_mark_width_mm: 0,
    plate_thickness_mm: 0,
    anilox_bcm: 0,
    print_to_cut_offset_mm: 0,
    layout_file: null,
    _layoutOpen: true,
    _bodyOpen: true,
  };
}

/**
 * Enumerate MOQ tiers for a std or cplx state. Returns tier metadata
 * (idx, moq, selling price, annual qty) — CalcCostBreakdown and
 * CplxCostBreakdown had this loop duplicated; now both share one source.
 *
 * Shape: [{ idx: 0, moq, sp, eau }, { idx: 1, moq, sp, eau }, …]
 * Skips tiers whose extra_moqs[t-1] entry is missing.
 */
export function enumerateTiers(state) {
  if (!state) return [];
  const numTiers = state.num_moq || 1;
  const out = [];
  for (let t = 0; t < numTiers; t++) {
    if (t === 0) {
      out.push({
        idx: 0,
        moq: state.moq || 0,
        sp: state.selling_price || 0,
        eau: state.annual_qty || 0,
      });
    } else {
      const em = state.extra_moqs?.[t - 1];
      if (!em) continue;
      out.push({
        idx: t,
        moq: em.moq || 0,
        sp: em.price || 0,
        eau: em.eau || state.annual_qty || 0,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// COMPLEX AGGREGATION — previously duplicated in ComplexCalc.jsx and
// CplxCostBreakdown.jsx. Extracted here so both callers share the same
// two-pass logic and FG/sum fallback. Intentionally does NOT compute
// gm/va/contribution — each caller has different conventions for those
// (see calcEngine.js:426 + audit notes on Contribution Margin). Callers
// receive the raw aggregate and derive margins themselves.
//
// Returns { aggregate, pass2, errors }:
//   - aggregate: object with s_ttl, s_mat_cost, overhead, labor_cost,
//                tooling, packing_ship, and detailed breakdown fields.
//   - pass2: per-SP results (array of calcAll returns, with nulls for
//            SPs that threw).
//   - errors: [{ spi, code, pass, message }, …] for surfaced calc failures.
// ═══════════════════════════════════════════════════════════════════════
export function aggregateComplex(cs, sps, lib, tierIdx = 0, opts = {}) {
  const bomQtyEnabled = !!opts.bomQtyEnabled;
  // Sprint 8 B.4 (audit §2.2): when a sub-product is referenced by
  // another SP as a material, its setup + tooling should amortize over
  // the PARENT's MOQ — not the child's own `ship_qty`. With this flag
  // OFF (default), legacy behavior: each SP computes at its own
  // ship_qty or activeMoq. With it ON, referenced SPs are forced to
  // compute at activeMoq so setup amortization reflects the assembly's
  // effective run size.
  const spMoqScalingEnabled = !!opts.spMoqScalingEnabled;
  if (!lib || !sps || !sps.length) {
    return { aggregate: null, pass2: [], errors: [] };
  }
  const activeMoq =
    tierIdx === 0 ? cs.moq : ((cs.extra_moqs || [])[tierIdx - 1] || {}).moq || cs.moq;
  const tieredSps = sps.map((sp, spi) => applyCplxTierToSp(cs, sp, spi, tierIdx));

  // Build the "is referenced by another SP" set once — used by both
  // passes to decide whether child's ship_qty should be honored.
  const referencedIdxs = new Set();
  if (spMoqScalingEnabled) {
    for (let i = 0; i < tieredSps.length; i++) {
      const sp = tieredSps[i];
      for (const m of sp?.materials || []) {
        if (!m?.code) continue;
        const refIdx = tieredSps.findIndex((s, j) => j !== i && s?.code === m.code);
        if (refIdx >= 0) referencedIdxs.add(refIdx);
      }
    }
  }
  const effectiveMoqFor = (spi, sp) => {
    if (spMoqScalingEnabled && referencedIdxs.has(spi)) {
      return activeMoq; // parent context — ignore child's ship_qty
    }
    return sp.ship_qty || activeMoq;
  };

  // Phase 3 — extract snapshot from opts (caller injects via the same
  // `opts` bag already used for bomQtyEnabled / spMoqScalingEnabled).
  // Passing it down the SP calcAll calls so the aggregate honours the
  // frozen rates per the parent quote, not the live master library.
  const calcOpts = opts.snapshot ? { snapshot: opts.snapshot } : {};

  const errors = [];
  const pass1 = tieredSps.map((sp, spi) => {
    try {
      const spSt = {
        ...sp,
        moq: effectiveMoqFor(spi, sp),
        selling_price: cs.selling_price,
        trade_mode: cs.trade_mode,
        site: cs.site,
      };
      return calcAll(spSt, null, lib, null, calcOpts);
    } catch (err) {
      errors.push({ spi, code: sp.code, pass: 1, message: err?.message || String(err) });
      return null;
    }
  });
  const pass2 = tieredSps.map((sp, spi) => {
    const hasRef = sp.materials?.some(
      (m) => m.code && tieredSps.some((s, si2) => si2 !== spi && s.code === m.code)
    );
    if (!hasRef) return pass1[spi];
    try {
      const spSt = {
        ...sp,
        moq: effectiveMoqFor(spi, sp),
        selling_price: cs.selling_price,
        trade_mode: cs.trade_mode,
        site: cs.site,
      };
      const res = calcAll(spSt, pass1, lib, tieredSps, calcOpts);
      const matErrs = (res?.matResults || []).filter((r) => r?.error).map((r) => r.error);
      if (matErrs.length) errors.push({ spi, code: sp.code, pass: 2, message: matErrs.join('; ') });
      return res;
    } catch (err) {
      errors.push({ spi, code: sp.code, pass: 2, message: err?.message || String(err) });
      return pass1[spi];
    }
  });

  // Prefer an explicit assembly SP as the aggregate; otherwise sum.
  //
  // Flag OFF (default): legacy path — "code starts with FG" heuristic for
  // the assembly pick, and sum across all SPs with implicit qty=1. Numbers
  // match every quote saved before this sprint.
  //
  // Flag ON: Sprint 4.4 semantics.
  //   - Assembly pick honors the v2 `is_assembly` flag (fallback: FG prefix)
  //     so users who toggled a non-FG SP into assembly in the BOM Tree UI
  //     see that reflected here.
  //   - When the assembly SP has a computed pass2 row, use it as-is — the
  //     assembly's own material rows encode component rollup; re-applying
  //     BOM qty on top would double-count.
  //   - Sum-fallback is WEIGHTED by BOM qty. If `cs.bom` is non-empty,
  //     only SPs listed there contribute (orphan SPs → 0). If `cs.bom` is
  //     empty, every non-assembly SP contributes with implicit qty=1 so
  //     legacy quotes without an explicit BOM keep the same sum.
  const aggregateKeys = [
    's_ttl',
    's_mat_cost',
    'bd_mat_setup',
    'bd_mat_run',
    'bd_ink_setup',
    'bd_ink_run',
    'overhead',
    'labor_cost',
    'tooling',
    'bd_setup_mach',
    'bd_setup_labor',
    'packing_ship',
    'vat_loss',
    'bd_extra',
  ];
  let aggregate;
  if (bomQtyEnabled) {
    const asmWithFlag = sps.findIndex((s) => s && s.is_assembly === true);
    const asmIdx =
      asmWithFlag >= 0
        ? asmWithFlag
        : sps.findIndex((s) => (s?.code || '').toUpperCase().startsWith('FG'));
    if (asmIdx >= 0 && pass2[asmIdx]) {
      aggregate = { ...pass2[asmIdx] };
    } else {
      const bom = Array.isArray(cs?.bom) ? cs.bom : [];
      const weights = new Map();
      if (bom.length > 0) {
        for (const e of bom) {
          if (!e || typeof e.sp_index !== 'number' || !sps[e.sp_index]) continue;
          if (e.sp_index === asmIdx) continue; // never weight assembly into its own sum
          const q = Number.isFinite(+e.qty) && +e.qty >= 0 ? +e.qty : 1;
          weights.set(e.sp_index, (weights.get(e.sp_index) || 0) + q);
        }
      } else {
        sps.forEach((sp, i) => {
          if (!sp) return;
          if (i === asmIdx) return;
          if (sp.is_assembly) return;
          weights.set(i, 1);
        });
      }
      const wsum = (key) => {
        let acc = 0;
        for (const [spi, w] of weights.entries()) {
          const v = pass2[spi]?.[key];
          if (typeof v === 'number') acc += v * w;
        }
        return acc;
      };
      aggregate = Object.fromEntries(aggregateKeys.map((k) => [k, wsum(k)]));
    }
  } else {
    const fgIdx = sps.findIndex((s) => (s.code || '').toUpperCase().startsWith('FG'));
    if (fgIdx >= 0 && pass2[fgIdx]) {
      aggregate = { ...pass2[fgIdx] };
    } else {
      const sum = (key) => pass2.reduce((a, r) => a + (r?.[key] || 0), 0);
      aggregate = Object.fromEntries(aggregateKeys.map((k) => [k, sum(k)]));
    }
  }

  // Sprint 41 — parent-level Pack&Ship integration.
  //
  // BEFORE: the Complex Pack&Ship tab let users fill cs.packing_* and
  //   cs.shipping_* but aggregateComplex() only summed per-SP values.
  //   User input at the assembly level was silently dropped from the
  //   cost roll-up (bug #41-P&S — users' quotes under-costed by the
  //   parent packing amount).
  //
  // AFTER: parent-level calcPacking(cs) + calcShipping(cs) contribute
  //   to the final per-unit cost, matching Standard's behavior. Per-SP
  //   packing_ship still accumulates (usually 0 because per-SP pcs_per_bag
  //   defaults to 0, which calcPacking treats as "no packing at this
  //   level"), so backward compat with quotes that set values at both
  //   levels is preserved — the two stack.
  //
  // s_ttl must be bumped too so downstream gm/va/contribution (computed
  // in ComplexCalc.jsx from agg.s_ttl/s_mat_cost/tooling/packing_ship)
  // reflect the new packing_ship. Other cost aggregates are unchanged.
  //
  // Edge case: cs.pcs_per_bag=0 → calcPacking short-circuits to 0, and
  // cs.ship_qty=0 → calcShipping falls back to cs.moq || 1. Both are
  // safe; no NaN risk.
  if (aggregate) {
    try {
      const parentPsSt = { ...cs, moq: activeMoq };
      const parentPacking = calcPacking(parentPsSt) || 0;
      const parentShipping = calcShipping(parentPsSt) || 0;
      const parentPs = parentPacking + parentShipping;
      if (Number.isFinite(parentPs) && parentPs > 0) {
        aggregate.packing_ship = (aggregate.packing_ship || 0) + parentPs;
        aggregate.s_ttl = (aggregate.s_ttl || 0) + parentPs;
      }
    } catch (err) {
      errors.push({
        spi: -1,
        code: '(assembly)',
        pass: 'parent-ps',
        message: err?.message || String(err),
      });
    }
  }

  return { aggregate, pass2, errors };
}

// ── Per-row breakdown for export (MES-3-FIX-41) ──
//
// `quote.result` historically captured only aggregate KPIs; per-row Setup/
// Run/Total were computed in calcAll's `matResults / inkResults / procResults`
// arrays and discarded by serializeResultForPersist (intentionally — full
// row detail would inflate quote_history.json ~5-10×). For xlsx export
// visibility we need a *small* subset of those rows: just the three money
// columns (+ Indigo clicks for ink rows). This helper pulls exactly that.
//
// Shape (index-aligned to state arrays):
//   {
//     materials_main: [{setup_cost, run_cost, total}, ...],
//     materials_alt:  [{setup_cost, run_cost, total}, ...],
//     inks:           [{setup_cost, run_cost, total, clicks?}, ...],
//     processes:      [{setup_cost, run_cost, total}, ...],
//   }
//
// The Material `total` includes vat (matches `total_s` from calcMat).
// The Ink `total` is setup_s + run_s (vat tracked separately at aggregate).
// The Process `total` includes tooling + extra (the full per-row line cost
// operators see in the Processes UI).
//
// Computes BOTH material sets via a swap-and-recompute when the inactive
// set is non-empty — otherwise non-active material rows would always be
// em-dash in exports, defeating the point.
const _num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const _matRowFromResult = (r) => ({
  setup_cost: _num(r && r.setup_s),
  run_cost: _num(r && r.run_s),
  total: _num(r && r.total_s),
});
const _inkRowFromResult = (r, ink) => {
  const row = {
    setup_cost: _num(r && r.setup_s),
    run_cost: _num(r && r.run_s),
    total: _num(r && r.total),
  };
  // Indigo subtypes display clicks; non-Indigo omit the field.
  if (ink && String(ink.print_type || '').startsWith('Indigo')) {
    row.clicks = _num(ink.clicks);
  }
  return row;
};
const _procRowFromResult = (r) => {
  const setup = _num(r && r.setup_mach) + _num(r && r.setup_labor);
  const run = _num(r && r.run_mach) + _num(r && r.run_labor);
  const tooling = _num(r && r.tooling);
  const extra = _num(r && r.extra);
  return {
    setup_cost: setup,
    run_cost: run + tooling + extra,
    total: setup + run + tooling + extra,
  };
};

/**
 * Extract per-row Setup/Run/Total from a state by running calcAll for
 * BOTH active and (if non-empty) inactive material sets.
 *
 * @param {object} state — Std-shaped state (must have `materials` mirror)
 * @param {object} lib   — library reference (calcAll requires it)
 * @param {object[]} [allSpResults] — Cpx pass1 results (Std passes null)
 * @param {object[]} [subproducts]  — Cpx subproducts (Std passes null)
 */
export function calcRowBreakdown(state, lib, allSpResults, subproducts, options = {}) {
  if (!state || !lib) {
    return { materials_main: [], materials_alt: [], inks: [], processes: [] };
  }
  const activeKey = state.materials_active === 'alt' ? 'materials_alt' : 'materials_main';
  const inactiveKey = activeKey === 'materials_main' ? 'materials_alt' : 'materials_main';

  // Phase 3: propagate snapshot down to the internal calcAll so the
  // per-row breakdown uses frozen rates/coverage just like the
  // top-level result does. Without this, save-time rowsPayload would
  // drift from the displayed cost on legacy quotes after master shift.
  const activeResult = calcAll(state, allSpResults, lib, subproducts, options);
  const out = {
    materials_main: [],
    materials_alt: [],
    inks: (activeResult.inkResults || []).map((r, i) =>
      _inkRowFromResult(r, (state.inks || [])[i])
    ),
    processes: (activeResult.procResults || []).map(_procRowFromResult),
  };
  out[activeKey] = (activeResult.matResults || []).map(_matRowFromResult);

  const inactiveSet = state[inactiveKey] || [];
  if (Array.isArray(inactiveSet) && inactiveSet.length > 0) {
    const swapped = {
      ...state,
      materials: inactiveSet,
      materials_active: activeKey === 'materials_main' ? 'alt' : 'main',
    };
    const inactiveResult = calcAll(swapped, allSpResults, lib, subproducts, options);
    out[inactiveKey] = (inactiveResult.matResults || []).map(_matRowFromResult);
  }
  return out;
}

/**
 * Build {rows, tiers} for a Std quote (multi-tier). Walks 0..N tiers via
 * buildTierState + calcRowBreakdown. Returns:
 *   { rows: <active-tier rows>, tiers: [{rows}, ...] }
 *
 * @param {object} state — Std state
 * @param {object} lib
 */
export function buildStdRowsPayload(state, lib, options = {}) {
  if (!state || !lib) return { rows: null, tiers: [] };
  const tierCount = 1 + (Array.isArray(state.extra_moqs) ? state.extra_moqs.length : 0);
  const activeIdx = Number(state.active_moq_idx) || 0;
  const tiers = [];
  for (let t = 0; t < tierCount; t++) {
    const em = t === 0 ? null : (state.extra_moqs || [])[t - 1];
    const price = t === 0 ? state.selling_price : (em?.selling_price ?? state.selling_price);
    const moq = t === 0 ? state.moq : (em?.moq ?? state.moq);
    const eau = t === 0 ? state.annual_qty : (em?.eau ?? state.annual_qty);
    const tierSt = buildTierState(state, t, price, moq, eau);
    // Phase 3: propagate snapshot through to calcRowBreakdown → calcAll
    // so per-tier per-row breakdown stays consistent with frozen rates
    // when buildQuoteData captures the snapshot at save time.
    tiers.push({ rows: calcRowBreakdown(tierSt, lib, null, null, options) });
  }
  return { rows: tiers[activeIdx]?.rows ?? null, tiers };
}

/**
 * Build {subproducts: [{rows, tiers}]} for a Cpx quote. Each SP gets its
 * own per-tier walk. Returns the full subproducts payload — caller bundles
 * it into the persisted result alongside the aggregate KPIs.
 *
 * @param {object} cs  — Cpx top-level state
 * @param {object[]} sps — array of subproduct states
 * @param {object} lib
 */
export function buildCpxRowsPayload(cs, sps, lib, options = {}) {
  if (!cs || !Array.isArray(sps) || !sps.length || !lib) return { subproducts: [] };
  const tierCount = 1 + (Array.isArray(cs.extra_moqs) ? cs.extra_moqs.length : 0);
  const activeIdx = Number(cs.active_moq_idx) || 0;
  const activeMoqFor = (tIdx) =>
    tIdx === 0 ? cs.moq : ((cs.extra_moqs || [])[tIdx - 1] || {}).moq || cs.moq;

  const subproducts = sps.map((sp, spi) => {
    const tiers = [];
    for (let t = 0; t < tierCount; t++) {
      const tieredSp = applyCplxTierToSp(cs, sp, spi, t);
      const spSt = {
        ...tieredSp,
        moq: tieredSp.ship_qty || activeMoqFor(t),
        selling_price: cs.selling_price,
        trade_mode: cs.trade_mode,
        site: cs.site,
      };
      // Phase 3: propagate snapshot (frozen rates/coverage) into the
      // per-SP per-tier rows breakdown. Matches buildStdRowsPayload's
      // pattern — the rows payload now never drifts from the
      // top-level result when a snapshot is supplied.
      tiers.push({ rows: calcRowBreakdown(spSt, lib, null, null, options) });
    }
    return { rows: tiers[activeIdx]?.rows ?? null, tiers };
  });
  return { subproducts };
}
