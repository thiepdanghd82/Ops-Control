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
import { calcMat } from '../../../../services/calcEngine.js';

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
 * Build the read-only "Materials MOQ" table for the Lead time & Notice sub-tab.
 * DISPLAY-ONLY: pure derive from the material rows + NPI Materials library — no
 * writes to quote state / reducer / server.
 *
 * One output row per material row that has a non-empty IFS code (blank rows
 * skipped). `qpa_m2` is computed via the SAME calcMat the Materials table uses
 * (moq-independent), so the value matches that tab exactly. `moq_m2` (NPI m²
 * MOQ) + `type` (NPI Type/Description) come from the NPI row whose `name`
 * case-insensitively equals the code; no match → moq_m2 + clear_pcs null (UI
 * shows "—", never fabricated). `clear_pcs = moq_m2 / qpa_m2` (guarded against
 * divide-by-zero).
 *
 * Cpx flattens across subproducts: the parent calls this once per SP (st = the
 * subproduct) with opts.spCode, then concatenates.
 *
 * @param {Array|null|undefined} materials  active material rows
 * @param {{npi?:Array}|null|undefined} lib  CostLibContext `lib`
 * @param {object} st    layout state passed to calcMat (tier state / subproduct)
 * @param {number} moq   active-tier moq (qpa_m2 ignores it; passed for parity)
 * @param {{spCode?:string}} [opts]  Cpx per-SP label prefix
 * @returns {Array<{row_label:string,ifs_code:string,quote_mat:string,type:string,leadtime:number|null,qpa_m2:number,moq_m2:number|null,clear_pcs:number|null}>}
 */
/**
 * Normalize a material code / library name for tolerant matching. Collapses the
 * spacing / dash / case / trailing-* differences that make an EXACT lookup miss
 * (CLAUDE.md Lesson 32 — the code↔library variant): e.g. row code
 * "JKD PSC701-10B-NT" vs NPI name "JKD PSC 701-10B-NT" (internal space) both
 * normalize to "jkdpsc701-10b-nt". Whitespace is removed entirely (not just
 * trimmed) so an internal space in only one string no longer blocks the match.
 */
export function normCode(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-') // en/em/figure dashes + minus → hyphen
    .replace(/\s+/g, '') // remove ALL whitespace (PSC 701 → PSC701)
    .toLowerCase()
    .replace(/\*+$/, ''); // strip trailing '*' markers (NPI names use them)
}

/**
 * Resolve a library row for `key` from `rows` keyed by `field`, EXACT-first then
 * a normalized fallback. Returns { row, fuzzy, ambiguous }:
 *  - exact trim+lowercase equality always wins (zero false-positive risk);
 *  - else normCode() equality — one distinct match → { fuzzy:true };
 *  - MORE THAN ONE distinct library row normalizing to the key → do NOT guess:
 *    { ambiguous:true, row:null } so the caller keeps "—" + flags the row.
 */
export function resolveLibRow(rows, field, key) {
  if (!Array.isArray(rows)) return { row: null, fuzzy: false, ambiguous: false };
  const keyLc = String(key).trim().toLowerCase();
  const exact = rows.find(
    (r) =>
      r &&
      String(r[field] ?? '')
        .trim()
        .toLowerCase() === keyLc
  );
  if (exact) return { row: exact, fuzzy: false, ambiguous: false };
  const nkey = normCode(key);
  if (!nkey) return { row: null, fuzzy: false, ambiguous: false };
  const hits = rows.filter((r) => r && normCode(r[field]) === nkey);
  if (hits.length === 0) return { row: null, fuzzy: false, ambiguous: false };
  // Distinct = different original field values (true dupes are not ambiguous).
  const distinct = new Set(
    hits.map((r) =>
      String(r[field] ?? '')
        .trim()
        .toLowerCase()
    )
  );
  if (distinct.size > 1) return { row: null, fuzzy: false, ambiguous: true };
  return { row: hits[0], fuzzy: true, ambiguous: false };
}

export function buildLeadTimeMaterialsTable(materials, lib, st, moq, opts = {}) {
  if (!Array.isArray(materials)) return [];
  const npi = lib && Array.isArray(lib.npi) ? lib.npi : [];
  const ifs = lib && Array.isArray(lib.ifs) ? lib.ifs : [];
  const spCode = opts && opts.spCode ? String(opts.spCode).trim() : '';
  const out = [];
  for (const mat of materials) {
    if (!mat || typeof mat !== 'object') continue;
    const key = String(mat.code || mat.ifs_code || '').trim();
    if (!key) continue; // skip blank-code rows
    // Tolerant lookup (exact-first, normalized fallback, ambiguity guard) so a
    // spacing/dash/case variant between the code and the library name still
    // resolves Type / Leadtime / MOQ (Lesson 32).
    const npiRes = resolveLibRow(npi, 'name', key);
    const ifsRes = resolveLibRow(ifs, 'part_no', key);
    const npiMatch = npiRes.ambiguous ? null : npiRes.row;
    const ifsMatch = ifsRes.ambiguous ? null : ifsRes.row;
    const ambiguous = npiRes.ambiguous || ifsRes.ambiguous;
    const fuzzy = (!!npiMatch && npiRes.fuzzy) || (!!ifsMatch && ifsRes.fuzzy);
    let qpa_m2 = 0;
    try {
      qpa_m2 = Number(calcMat(mat, st, moq, null, null).qpa_m2) || 0;
    } catch {
      qpa_m2 = 0;
    }
    const moqNum = npiMatch ? Number(npiMatch.moq) : NaN;
    const moq_m2 = Number.isFinite(moqNum) && moqNum > 0 ? moqNum : null;
    const clear_pcs = moq_m2 != null && qpa_m2 > 0 ? moq_m2 / qpa_m2 : null;
    // Leadtime (days) synced from BOTH libraries — NPI `lt` + IFS `leadtime`;
    // MAX when both match, the single value when only one matches, else null.
    const ltCands = [
      npiMatch ? Number(npiMatch.lt) : NaN,
      ifsMatch ? Number(ifsMatch.leadtime) : NaN,
    ].filter((v) => Number.isFinite(v) && v > 0);
    const leadtime = ltCands.length ? Math.max(...ltCands) : null;
    out.push({
      row_label: spCode ? `${spCode} · ${mat.row_type || ''}` : mat.row_type || '',
      ifs_code: mat.code || '',
      quote_mat: mat.desc || '',
      type: npiMatch ? npiMatch.type || '' : '',
      leadtime,
      qpa_m2,
      moq_m2,
      clear_pcs,
      // Match-quality flags for the UI (Lesson 32 visibility):
      //  - resolved: any library-derived data found
      //  - fuzzy:    resolved ONLY via the normalized fallback (spacing/dash/case)
      //  - ambiguous: normalized fallback hit >1 distinct rows → left unresolved
      resolved: !!(npiMatch || ifsMatch),
      fuzzy,
      ambiguous,
    });
  }
  return out;
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

// ── REMARK checkbox-driven auto-sync (Sprint S-REMARK-SEL) ──
// The Materials MOQ table's checkbox column drives the REMARK field: one line
// per CHECKED coded row. Selection = map of UNCHECKED keys ({ [ifs_code]:
// false }); a row is checked unless its key === false (so new rows default
// checked). All pure — no React, no state mutation.

/** Round + thousands-separate (matches the Clear Materials MOQ column). */
export function formatThousands(v) {
  return Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : '—';
}

/** A row is selected unless the mask marks its ifs_code false. */
export function isRemarkRowSelected(selection, code) {
  const sel = selection && typeof selection === 'object' ? selection : {};
  return sel[code] !== false;
}

/**
 * Build the auto REMARK text from the table rows + selection. One line per
 * CHECKED row that has a non-empty ifs_code:
 *   "<ifs_code>: <Clear MOQ> pcs"   (or "<ifs_code>: —" when clear_pcs is null)
 * joined by "\n", in table order. Blank-code rows excluded.
 */
export function buildRemarkFromSelection(rows, selection) {
  if (!Array.isArray(rows)) return '';
  const lines = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const code = String(r.ifs_code || '').trim();
    if (!code) continue;
    if (!isRemarkRowSelected(selection, code)) continue;
    const clear =
      r.clear_pcs != null && r.clear_pcs > 0 ? `${formatThousands(r.clear_pcs)} pcs` : '—';
    lines.push(`${r.ifs_code}: ${clear}`);
  }
  return lines.join('\n');
}

/**
 * Resolve what the REMARK field shows: the manual override when set, else the
 * checkbox-driven auto text. `lt_remark_ovr` is the override source of truth.
 */
export function resolveRemarkDisplay(leadTime, autoRemark) {
  const lt = leadTime && typeof leadTime === 'object' ? leadTime : {};
  const ovr = typeof lt.lt_remark_ovr === 'string' ? lt.lt_remark_ovr : '';
  if (ovr.trim() !== '') return { value: ovr, isOverride: true };
  return { value: autoRemark || '', isOverride: false };
}

/** Header select-all state over the coded rows. */
export function remarkSelectAllState(rows, selection) {
  let total = 0;
  let selected = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = String(r?.ifs_code || '').trim();
    if (!code) continue;
    total++;
    if (isRemarkRowSelected(selection, code)) selected++;
  }
  return {
    total,
    selected,
    checked: total > 0 && selected === total,
    indeterminate: selected > 0 && selected < total,
  };
}

/** Toggle one row's checkbox → new selection map (immutable). */
export function toggleRemarkSelection(selection, code) {
  const sel = { ...(selection && typeof selection === 'object' ? selection : {}) };
  if (sel[code] === false) delete sel[code];
  else sel[code] = false;
  return sel;
}

/** Select-all / clear-all → new selection map for the given rows. */
export function setAllRemarkSelection(rows, checked) {
  if (checked) return {};
  const sel = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = String(r?.ifs_code || '').trim();
    if (code) sel[code] = false;
  }
  return sel;
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
  // REMARK checkbox-driven auto-sync (Sprint S-REMARK-SEL). Structural defaults:
  //  - lt_remark_ovr: manual-override source (like lt_material_ovr). Legacy
  //    lt_remark→lt_remark_ovr seed happens ONCE at migration heal, not here.
  //  - remark_selection: map of UNCHECKED row keys ({ [ifs_code]: false }); a
  //    row is checked unless its key === false. Absent/empty {} = all checked,
  //    and newly-added rows default checked. Coerce non-objects to {}.
  if (typeof out.lt_remark_ovr !== 'string') out.lt_remark_ovr = '';
  if (
    !out.remark_selection ||
    typeof out.remark_selection !== 'object' ||
    Array.isArray(out.remark_selection)
  ) {
    out.remark_selection = {};
  }
  return out;
}
