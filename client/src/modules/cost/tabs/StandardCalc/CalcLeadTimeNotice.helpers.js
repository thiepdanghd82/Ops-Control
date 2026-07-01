/**
 * Pure helpers extracted from CalcLeadTimeNotice + its parents (StandardCalc /
 * ComplexCalc). Lives in a separate `.js` file so node:test can import + cover
 * without JSX / React-Testing-Library infrastructure.
 *
 * Repo convention (see DesignSyncPicker.fields.test.js header): when a React
 * component carries non-trivial pure logic, extract the pure parts and test
 * those in isolation. Component-level interaction tests are deferred until
 * the repo adopts a JSX-aware test runner (out of scope for this PR).
 */

import { isMainMat, isProcessMat } from '../../lib/rowTypeNormalize.js';

// Match CalcProcesses.jsx hidden convention — rows flagged `hidden:true`
// are treated as deleted by the calc engine and should NOT contribute to
// the Tooling Cost sum on the Lead time tab either.
function isVisibleProc(p) {
  return p && p.hidden !== true;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Σ tool_cost across Standard quote processes.
 * @param {Array|null|undefined} processes - stdState.processes
 * @returns {number}
 */
export function sumToolingCostStd(processes) {
  if (!Array.isArray(processes)) return 0;
  return processes.reduce((s, p) => (isVisibleProc(p) ? s + safeNum(p.tool_cost) : s), 0);
}

/**
 * Σ tool_cost across every subproduct's processes (Complex quote).
 * @param {Array|null|undefined} subproducts - cplxState.subproducts
 * @returns {number}
 */
export function sumToolingCostCpx(subproducts) {
  if (!Array.isArray(subproducts)) return 0;
  return subproducts.reduce((acc, sp) => acc + sumToolingCostStd(sp && sp.processes), 0);
}

// Single USD formatter instance — cheap to reuse across renders.
const USD_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a USD amount as "$1,234.56". Returns "—" for 0 / NaN / non-finite.
 * @param {number} n
 * @returns {string}
 */
export function fmtUsd(n) {
  if (!Number.isFinite(n) || n === 0) return '—';
  return USD_FMT.format(n);
}

// VND values are integer-by-convention (no decimals); en-US locale gives
// the same thousand-separator (`,`) the existing `fmtUsd` produces so the
// two columns line up visually in the Summarize table side-by-side.
const VND_FMT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Format a VND amount as "10,450" — no currency symbol because VND
 * presentations in this app pair the number with a column label
 * "(VND)", not an inline glyph. Returns "—" for 0 / NaN / non-finite
 * so legacy quotes (no `selling_price_vnd` / `extra_moqs[i].price_vnd`)
 * render cleanly without a noisy `0`.
 * @param {number} n
 * @returns {string}
 */
export function fmtVnd(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  return VND_FMT.format(v);
}

// Field shape contract — kept in one place so component + tests + future
// xlsx export sheet all reference the same key list.
export const LEAD_TIME_KEYS = Object.freeze([
  'lt_material',
  'lt_sample',
  'lt_po',
  'lt_remark',
  'lt_process',
  'lt_material_type',
]);

// Material L/T = max(library lead time across the quote's Main.Mat rows) + this
// buffer, formatted "<n> days". Buffer covers internal handling once material
// lands. Auto-derived (READ-ONLY · AUTO-SYNCED) with a manual override.
export const MATERIAL_LT_BUFFER = 7;

/**
 * Auto-derive the Material L/T string from the active Main.Mat + Process.Mat
 * material rows + the IFS / NPI libraries.
 *
 * For every Main.Mat OR Process.Mat row, look the row's IFS CODE (`code`,
 * falling back to `ifs_code`) up in BOTH libraries — IFS Materials by `part_no`
 * (lead-time field `leadtime`) and NPI Materials by `name` (lead-time field
 * `lt`) — and collect every finite, > 0 day count. The result is
 * `max(collected) + BUFFER` formatted "<n> days". Returns `null` when nothing
 * matched (caller shows an empty cell — never a bare "7 days").
 *
 * Process Mat (ancillary materials: liner / primer / anti-static, etc.) is
 * included because its own supplier lead time can gate material readiness too
 * (operator decision 2026-06-30). Alt.Mat is excluded by construction — only
 * the ACTIVE material set is passed in.
 *
 * Matching is trim + case-insensitive; multiple library rows sharing a key all
 * enter the max pool.
 *
 * @param {Array|null|undefined} rows  active material rows (Main.Mat + Process.Mat counted)
 * @param {{ifs?:Array, npi?:Array}|null|undefined} lib  CostLibContext `lib`
 * @returns {string|null}  e.g. "37 days", or null when no library match
 */
export function deriveMaterialLT(rows, lib) {
  if (!Array.isArray(rows) || !lib || typeof lib !== 'object') return null;
  const ifs = Array.isArray(lib.ifs) ? lib.ifs : [];
  const npi = Array.isArray(lib.npi) ? lib.npi : [];
  const collected = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (!isMainMat(row.row_type) && !isProcessMat(row.row_type)) continue;
    const key = String(row.code || row.ifs_code || '').trim();
    if (!key) continue;
    const keyLc = key.toLowerCase();
    for (const r of ifs) {
      if (
        r &&
        String(r.part_no ?? '')
          .trim()
          .toLowerCase() === keyLc
      ) {
        const n = Number(r.leadtime);
        if (Number.isFinite(n) && n > 0) collected.push(n);
      }
    }
    for (const r of npi) {
      if (
        r &&
        String(r.name ?? '')
          .trim()
          .toLowerCase() === keyLc
      ) {
        const n = Number(r.lt);
        if (Number.isFinite(n) && n > 0) collected.push(n);
      }
    }
  }
  if (collected.length === 0) return null;
  const maxLt = Math.max(...collected);
  return `${Math.round(maxLt + MATERIAL_LT_BUFFER)} days`;
}

/**
 * Resolve what the Material L/T cell shows: the manual override when set,
 * otherwise the auto-derived value. `lt_material_ovr` is the override source of
 * truth; an empty / whitespace override means "auto".
 *
 * @param {object|null|undefined} leadTime  state.lead_time
 * @param {string|null} autoVal  deriveMaterialLT() result
 * @returns {{value:string, isOverride:boolean}}
 */
export function resolveMaterialLtDisplay(leadTime, autoVal) {
  const lt = leadTime && typeof leadTime === 'object' ? leadTime : {};
  const ovr = typeof lt.lt_material_ovr === 'string' ? lt.lt_material_ovr : '';
  if (ovr.trim() !== '') return { value: ovr, isOverride: true };
  return { value: autoVal || '', isOverride: false };
}

/**
 * Heal legacy quotes that lack `state.lead_time` (saved before this feature
 * landed). Returns a fresh object with all 6 keys present + defaulted to ''
 * so the component can render textareas without per-cell null checks.
 *
 * Preserves any extra keys the input might carry (forward-compat).
 * @param {object|null|undefined} leadTime
 * @returns {{lt_material:string, lt_sample:string, lt_po:string, lt_remark:string, lt_process:string, lt_material_type:string}}
 */
export function safeLeadTime(leadTime) {
  const src = leadTime && typeof leadTime === 'object' ? leadTime : {};
  const out = { ...src };
  for (const k of LEAD_TIME_KEYS) {
    if (typeof out[k] !== 'string') out[k] = '';
  }
  // Material L/T auto-derive override source (Sprint S-MAT-LT). Structural
  // default only — the legacy lt_material→lt_material_ovr seed happens ONCE at
  // migration heal (not here), so a later ↻ reset isn't re-seeded each render.
  if (typeof out.lt_material_ovr !== 'string') out.lt_material_ovr = '';
  return out;
}
