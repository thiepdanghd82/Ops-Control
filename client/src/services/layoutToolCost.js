// @ts-check
/**
 * Layout → Process TOOL COST sources (Sprint S-LAYOUT-TOOLCOST).
 *
 * Operators can ASSIGN a Layout-computed cost — the Plate cost (Print Design
 * Layout) or one of the Cutter cost 1~4 (Cutting Design Layout) — to a Process
 * row's tool cost via a pick-once dropdown. The assigned cost then flows into
 * that process's tooling (tooling = tool_cost / tool_life) and the quote total.
 *
 * This module is the SINGLE source of truth that reproduces the exact same
 * costs the Layout tab displays, so the assigned tool cost never drifts from
 * what the operator sees on the Layout screen. It is LIVE-derived from
 * (state, lib): a quote re-costed after a DDL edit recomputes from current
 * rates, matching every other Layout display (Henry, 2026-09-08 — no snapshot
 * freeze).
 *
 * Assignment model:
 *   • `proc.tool_cost_src` holds the chosen source id ('' = manual tool_cost).
 *   • Effective tool cost = (src set AND still present) ? source.cost : 0 when
 *     assigned-but-gone (cutter cleared / plate 0) — the UI warns; unassigned
 *     rows keep manual tool_cost so the golden calc stays byte-identical.
 *   • A source assigned to one process is UNAVAILABLE to others (no dup).
 *
 * Cpx note: Complex sub-products carry only PLATE layout fields (no cutter
 * arrays / no cutting block), so `layoutToolCostSources(sp, lib)` yields the
 * Plate source only for Cpx. Std yields Plate + Cutter 1~4.
 */
import { computePlateCost, getPlateBaseCost } from './plateCost.js';
import { computeCutterCost, effCavity } from './cutterCost.js';

const CUTTER_PAIR_COUNT = 4;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cutting geometry context — mirrors the inline derivation in CalcLayout's
 * CutSubTab (cutTotalPerShot + product size fallbacks) so the assigned cutter
 * cost equals `cutterCostAt(i)` exactly. Kept here as the ONE pure source so
 * the Layout display + the assigned cost can't diverge.
 * @param {object} state
 * @returns {{cutTotalPerShot:number, cutterWmm:number, cutterLmm:number}}
 */
export function layoutCutContext(state = {}) {
  const s = state || {};
  const slit = !!s.slit_after_print;
  const partsAcross = Math.max(1, Number(s.parts_web_across) || 1);
  const partsInMd = Math.max(1, Number(s.parts_in_md) || 1);
  const numWebs = Math.max(1, Number(s.num_webs) || 1);
  const cutterCavityAuto = partsAcross * partsInMd;
  const cutterCavity = Number(s.cutter_cavity) > 0 ? Number(s.cutter_cavity) : cutterCavityAuto;
  const cutTotalPerShot = slit ? cutterCavity : numWebs * cutterCavity;
  const cutterWmm = Number(s.part_width) || Number(s.print_part_width) || 0;
  const cutterLmm = Number(s.part_length_md) || Number(s.print_part_length_md) || 0;
  return { cutTotalPerShot, cutterWmm, cutterLmm };
}

/**
 * Layout-computed tool cost sources for a state (Std: plate + cutters; Cpx sp:
 * plate only). Only sources with a finite cost > 0 are included.
 * @param {object} state calcEngine state (Std) or a subproduct (Cpx).
 * @param {object} lib   cost library (ddl.plate_base_cost / cutter_cost / …).
 * @returns {Array<{id:string,label:string,cost:number,kind:'plate'|'cutter'}>}
 */
export function layoutToolCostSources(state, lib) {
  const s = state || {};
  const out = [];

  // Plate — reproduces CalcLayout plateCost (computePlateCost + getPlateBaseCost).
  const plateBase = getPlateBaseCost(lib, s.pl_print_type);
  const plateCost = computePlateCost(
    {
      pt: s.pl_print_type,
      colors: s.pl_num_colors,
      webW: s.web_width_td,
      sheetL: s.sheet_length,
      filmLp: s.pl_film_lp_cost,
    },
    { plateBase }
  );
  if (Number.isFinite(plateCost) && Number(plateCost) > 0) {
    out.push({
      id: 'plate',
      kind: 'plate',
      label: `Plate · ${s.pl_print_type || '—'}`,
      cost: Number(plateCost),
    });
  }

  // Cutters 1~4 — reproduces CalcLayout cutterCostAt(i): operator override
  // (cutter_costs[i]) wins, else computeCutterCost with the per-cutter cavity.
  const { cutTotalPerShot, cutterWmm, cutterLmm } = layoutCutContext(s);
  const types = Array.isArray(s.cutter_types) ? s.cutter_types : [];
  const costs = Array.isArray(s.cutter_costs) ? s.cutter_costs : [];
  const cavities = Array.isArray(s.cutter_cavities) ? s.cutter_cavities : [];
  for (let i = 0; i < CUTTER_PAIR_COUNT; i++) {
    const type = String(types[i] ?? '').trim();
    if (!type) continue;
    const ovr = costs[i];
    const overridden = ovr != null && String(ovr).trim() !== '';
    const cost = overridden
      ? num(ovr)
      : Number(
          computeCutterCost(
            type,
            {
              widthMm: cutterWmm,
              lengthMm: cutterLmm,
              cavity: effCavity(cavities[i], cutTotalPerShot),
            },
            lib
          )
        );
    if (Number.isFinite(cost) && cost > 0) {
      out.push({ id: `cutter-${i}`, kind: 'cutter', label: `Cutter ${i + 1} · ${type}`, cost });
    }
  }

  return out;
}

/**
 * Flatten sources → { id: cost } map, threaded to calcAll → calcProcess via
 * options.layoutToolCosts.
 * @param {Array<{id:string,cost:number}>} sources
 * @returns {Record<string,number>}
 */
export function buildLayoutToolCosts(sources) {
  const map = {};
  for (const s of sources || []) {
    if (s && s.id != null) map[s.id] = s.cost;
  }
  return map;
}

/**
 * Effective tool cost for a process given the layout-cost map.
 *   • src set + present → source cost.
 *   • src set + absent (source disappeared) → 0 (UI warns).
 *   • src unset → manual proc.tool_cost (golden byte-identical).
 * Shared by calcProcess (money-path) and the UI cell so they never disagree.
 * @param {object} proc
 * @param {Record<string,number>|undefined|null} layoutToolCosts
 * @returns {number}
 */
export function effectiveToolCost(proc, layoutToolCosts) {
  const p = proc || {};
  if (p.tool_cost_src) {
    const v = layoutToolCosts ? layoutToolCosts[p.tool_cost_src] : undefined;
    return v != null ? Number(v) : 0;
  }
  return p.tool_cost || 0;
}

/**
 * Sources still available for a given process row: those not assigned to any
 * OTHER process (this row's own current pick is always included so it stays
 * selected in its own dropdown). This is the no-duplicate-assignment invariant.
 * @param {Array<{id:string}>} sources
 * @param {Array<{tool_cost_src?:string}>} processes
 * @param {number} currentIdx index of the row whose picker is open
 * @returns {Array<{id:string}>}
 */
export function availableToolCostSources(sources, processes, currentIdx) {
  const procs = Array.isArray(processes) ? processes : [];
  return (sources || []).filter((s) => {
    const takenBy = procs.findIndex((p) => (p && p.tool_cost_src) === s.id);
    return takenBy === -1 || takenBy === currentIdx;
  });
}

// Process → allowed Layout source kinds. A Print process only takes the Plate
// (khuôn in); a cutting process only takes Cutter (dao cut); everything else
// (Assembly / Inspection / ManualWork — e.g. a hand-typed Jig&Fixture) takes
// none. Classify by process_type first; only 'Others'/blank falls back to
// tool_type. Keeps the picker honest so a Print row never lists dao-cut costs.
const PRINT_PROCESS_TYPES = new Set(['Print']);
const CUT_PROCESS_TYPES = new Set(['Pre_Cut', 'Die_Cut', 'Special_cut']);
const NONE_PROCESS_TYPES = new Set(['Assembly', 'Inspection', 'ManualWork']);
// tool_type fallback (DDL tool_life keys): Pressplate → plate; cutting/die
// tools → cutter; Jig / CNC → none.
const CUT_TOOL_TYPES = new Set([
  'Knife',
  'Etching',
  'Carving',
  'Metal',
  'Rotary',
  'Stencil',
  'Pinnacle Die',
  'RDC',
]);

/**
 * Which Layout source kinds a process may assign.
 * @param {object} proc
 * @returns {Set<'plate'|'cutter'>} empty set = no Layout source allowed.
 */
export function allowedSourceKinds(proc) {
  const p = proc || {};
  const pt = String(p.process_type || '').trim();
  if (PRINT_PROCESS_TYPES.has(pt)) return new Set(['plate']);
  if (CUT_PROCESS_TYPES.has(pt)) return new Set(['cutter']);
  if (NONE_PROCESS_TYPES.has(pt)) return new Set();
  // pt === 'Others' or blank → fall back to tool_type.
  const tt = String(p.tool_type || '').trim();
  if (tt === 'Pressplate') return new Set(['plate']);
  if (CUT_TOOL_TYPES.has(tt)) return new Set(['cutter']);
  return new Set();
}

/**
 * Sources a process may PICK from: filtered to the kinds it's allowed
 * (allowedSourceKinds) AND not taken by another row (availableToolCostSources).
 * @param {Array<{id:string,kind:string}>} sources
 * @param {Array<{tool_cost_src?:string}>} processes
 * @param {number} currentIdx
 * @param {object} proc
 * @returns {Array<{id:string,kind:string}>}
 */
export function pickableToolCostSources(sources, processes, currentIdx, proc) {
  const kinds = allowedSourceKinds(proc);
  const byKind = (sources || []).filter((s) => s && kinds.has(s.kind));
  return availableToolCostSources(byKind, processes, currentIdx);
}

/**
 * Suggested (pre-highlighted) source for a process: the Plate source for a
 * Pressplate tool_type or a Print process_type. Cutters are unrestricted (no
 * suggestion). Suggestion only — operator still picks manually.
 * @param {object} proc
 * @returns {'plate'|null}
 */
export function suggestedSrcForProcess(proc) {
  const p = proc || {};
  return p.tool_type === 'Pressplate' || p.process_type === 'Print' ? 'plate' : null;
}
