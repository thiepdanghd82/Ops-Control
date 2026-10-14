/**
 * processLayoutSync — the Processes grid's Layout column follows the Layout
 * tab (2026-10-06, Henry: "cột layout sẽ sync với số cavity").
 *
 *   • A Print or Die_Cut row whose tool type names a Layout cutter (Cutter
 *     type 1~4) takes that cutter's cavities — its own cell, else Cut
 *     Total/Shot. Two cutters of that type with different cavities are not
 *     guessed between.
 *   • Any other Print row takes Print Total/Shot, tool or no tool: Indigo
 *     rows carry none, and their speed is in M/min like Flexo's, so their
 *     layout means the same parts per repeat.
 *   • Everything else is typed by hand, as before.
 *
 * The cavity is WRITTEN into `proc.layout` (the reducer does it after every
 * change), so the engine, the validator and both xlsx sheets keep reading
 * one plain number. `proc.layout_ovr` marks a number the operator typed
 * over; it survives until ↻ or a new tool/process type clears it.
 *
 * Std state and a Cpx subproduct carry the same layout fields, so both
 * grids go through these functions (Lesson 48).
 */
import { CUTTER_PAIR_COUNT, layoutCutContext } from './layoutToolCost.js';
import { effCavity } from './cutterCost.js';

const SYNCED_PROCESS_TYPES = new Set(['Print', 'Die_Cut']);

const atLeastOne = (v) => Math.max(1, Number(v) || 1);

/**
 * Print Total / Shot — the Print Design Layout's figure, one definition for
 * the Layout tab and the sync.
 * @param {object} state Std state or a Cpx subproduct.
 * @returns {number}
 */
export function layoutPrintTotal(state) {
  const s = state || {};
  const partsAcross = atLeastOne(s.parts_web_across);
  const partsInMd = atLeastOne(s.parts_in_md);
  const across = s.slit_after_print
    ? atLeastOne(s.slit_lane_count) * partsAcross
    : atLeastOne(s.num_webs) * partsAcross;
  return across * partsInMd;
}

/**
 * Cutters 1~4 that have a type, each with the cavities the Cutting Design
 * Layout shows for it.
 * @param {object} state
 * @returns {Array<{index:number,type:string,cavity:number}>}
 */
export function layoutCutterCavities(state) {
  const s = state || {};
  const types = Array.isArray(s.cutter_types) ? s.cutter_types : [];
  const cavities = Array.isArray(s.cutter_cavities) ? s.cutter_cavities : [];
  const { cutTotalPerShot } = layoutCutContext(s);
  const out = [];
  for (let i = 0; i < CUTTER_PAIR_COUNT; i++) {
    const type = String(types[i] ?? '').trim();
    if (!type) continue;
    out.push({ index: i, type, cavity: effCavity(cavities[i], cutTotalPerShot) });
  }
  return out;
}

/**
 * The cavity a process row follows, and where it comes from.
 * @param {object} proc
 * @param {object} state
 * @returns {{value:number, kind:'print'} | {value:number, kind:'cutter', index:number, type:string} | null}
 */
export function syncedLayoutFor(proc, state) {
  if (!proc) return null;
  const processType = String(proc.process_type ?? '').trim();
  if (!SYNCED_PROCESS_TYPES.has(processType)) return null;
  const toolType = String(proc.tool_type ?? '').trim();
  if (toolType) {
    const hits = layoutCutterCavities(state).filter((c) => c.type === toolType);
    if (hits.length) {
      if (new Set(hits.map((h) => h.cavity)).size > 1) return null;
      const { index, type, cavity } = hits[0];
      return cavity > 0 ? { value: cavity, kind: 'cutter', index, type } : null;
    }
  }
  if (processType === 'Print') return { value: layoutPrintTotal(state), kind: 'print' };
  return null;
}

/**
 * Writes the followed cavity into every row that follows one and is not
 * typed over. Same array back when nothing moves.
 * @param {Array<object>} processes
 * @param {object} state
 * @returns {Array<object>}
 */
export function syncProcessLayouts(processes, state) {
  if (!Array.isArray(processes)) return processes;
  let changed = false;
  const out = processes.map((p) => {
    if (!p || p.layout_ovr) return p;
    const synced = syncedLayoutFor(p, state);
    if (!synced || Number(p.layout) === synced.value) return p;
    changed = true;
    return { ...p, layout: synced.value };
  });
  return changed ? out : processes;
}

/**
 * On opening a quote: a row saved before the sync existed, whose number
 * differs from the Layout tab, keeps that number as an override — so no
 * saved price moves. Rows that already carry a flag are left as decided.
 * @param {Array<object>} processes
 * @param {object} state
 * @returns {Array<object>}
 */
export function healLayoutOverrides(processes, state) {
  if (!Array.isArray(processes)) return processes;
  let changed = false;
  const out = processes.map((p) => {
    if (!p || p.layout_ovr != null) return p;
    const synced = syncedLayoutFor(p, state);
    const saved = Number(p.layout);
    if (!synced || !(saved > 0) || saved === synced.value) return p;
    changed = true;
    return { ...p, layout_ovr: true };
  });
  return changed ? out : processes;
}

/**
 * What a typed Layout value means: an override unless it equals the cavity
 * the row follows; no flag at all for a row that follows nothing.
 * @param {object} proc
 * @param {object} state
 * @param {number|string} value
 * @returns {boolean|undefined}
 */
export function layoutOverrideFlag(proc, state, value) {
  const synced = syncedLayoutFor(proc, state);
  if (!synced) return undefined;
  return (Number(value) || 0) !== synced.value;
}
