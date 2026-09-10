/**
 * Pure derive helpers for the Pending Approvals inbox row cells.
 *
 * Pulled out of PendingApprovalsInbox.jsx so vanilla node:test can pin
 * the field-by-field contract against Quote History — operator cross-
 * checks "same quote, same numbers in both tables" so the inbox row
 * MUST honour the same legacy-coerce + alias-trap rules QuoteHistory
 * sort fns encode. See:
 *   - QuoteHistory.columns.js  (sort fn shapes — copied 1:1)
 *   - Summarize.materials.helpers.js  (bullet-list materials join)
 *   - lib/quoteFilters.js + hooks/useQuoteFilters.js  (filter infra)
 *
 * Key gotchas pinned by tests:
 *   - `project` uses `s.project_name` ONLY (canonical). NEVER `s.project`
 *     because Standard's `RfqInfoCard` aliases the End Customer input
 *     INTO `state.project` (see CalcHeader.jsx `aliasMap`) — Lesson 21
 *     (S-PROJFIX, 2026-04-29). Reading `s.project` would surface
 *     End-Customer text under a "Project" column for Standard quotes.
 *   - `end_cu` falls back to `s.project` for the same Lesson 21 reason:
 *     Standard stores End Customer at `s.project`, Complex at `s.end_cu`.
 *   - `price_vnd` reads RAW from `s.selling_price_vnd` ONLY. Quote
 *     History falls back to `s.selling_price * s.usd_rate` for legacy
 *     quotes that pre-date the VND mirror; per Sprint S-D20-SUMMARIZE-
 *     SCHEMA-EXTEND + spec for this ticket, the inbox shows operator-
 *     entered VND verbatim (no derive) so accounting/sales agree on
 *     what was reviewed vs computed.
 *   - `contrVal` prefers `r.contribution` (fraction). Falls back to
 *     legacy `r.contr_pct / 100` (stored as already-multiplied %).
 *     Same coerce as QuoteHistory's `contr` sort fn (Sprint 1.7f).
 *   - `gmVal` prefers `r.gm` (fraction). Falls back to `r.gm_pct / 100`
 *     (legacy). Mirrors the inline gmVal expression that previously
 *     lived in PendingApprovalsInbox row map.
 */

import { collectDrwMaterials, collectQuoteMaterials } from './Summarize.materials.helpers.js';

/**
 * Coerce a price-like input into a finite number, or null. Treats `''`
 * and `null` as missing (rather than the JS `+''` → 0 / `+null` → 0
 * gotcha that would silently render zero as if the operator had typed
 * it). Pinned by C3/C4/D2 tests.
 */
function pickFiniteNumber(v) {
  if (v == null || v === '') return null;
  const n = +v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerce `result.contribution` (fraction) or legacy `result.contr_pct`
 * (already-multiplied %) into a single fraction. Returns null if
 * neither is finite — caller renders '—' via fmtPct.
 */
export function deriveContrFraction(r) {
  if (!r || typeof r !== 'object') return null;
  if (Number.isFinite(+r.contribution)) return Number(r.contribution);
  if (Number.isFinite(+r.contr_pct)) return Number(r.contr_pct) / 100;
  return null;
}

/**
 * Coerce `result.gm` (fraction) or legacy `result.gm_pct` (already-
 * multiplied %) into a single fraction. Mirrors the inline gmVal
 * expression that PendingApprovalsInbox row map used pre-extraction.
 */
export function deriveGmFraction(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.gm != null) return Number(r.gm);
  if (r.gm_pct != null) return Number(r.gm_pct) / 100;
  return null;
}

/**
 * Build the inbox-row derive bag from a raw quote. All field shapes
 * mirror Quote History's column accessors so an operator cross-checking
 * the same quote_id sees IDENTICAL numbers in both tables.
 *
 * Returns null for null/undefined/non-object input (defensive — the
 * useMemo upstream already filters `q && q.state`, but a null-return
 * here lets the test suite cover the edge case explicitly).
 *
 * @param {object|null|undefined} q  — raw quote from sharedApi.getQuotes
 * @returns {object|null}  — { sale_owner, end_cu, project, drw_materials,
 *   quote_materials, price_usd, price_vnd, vaVal, contrVal, gmVal }
 */
export function deriveInboxRow(q) {
  if (!q || typeof q !== 'object') return null;
  const s = q.state || {};
  const r = q.result || {};
  return {
    sale_owner: s.sale_owner ?? '',
    end_cu: s.end_cu || s.project || '',
    project: s.project_name || '',
    drw_materials: collectDrwMaterials(s),
    quote_materials: collectQuoteMaterials(s),
    price_usd: pickFiniteNumber(s.selling_price),
    price_vnd: pickFiniteNumber(s.selling_price_vnd),
    vaVal: pickFiniteNumber(r.va),
    contrVal: deriveContrFraction(r),
    gmVal: deriveGmFraction(r),
  };
}
