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
  return out;
}
