/**
 * Pure helpers for QuoteHistory's column-config / sort migration.
 * Lives in `.js` so node:test can import without the JSX loader.
 *
 * Repo pattern: same split as ColumnsToggle.helpers / DesignSyncPicker.fields /
 * CalcLeadTimeNotice.helpers — keep React-free pieces here, compose the
 * full `QUOTE_HISTORY_COLUMNS` config (with render functions) inside
 * QuoteHistory.jsx so the renderers can close over hooks/components.
 *
 * Sort-fn contract: returns a primitive (number or lowercase string) so
 * the same comparator works for both numeric (moq, gm) + textual
 * (rfq, project) sorts. Falsy/missing values coerce to 0 or '' so a
 * partially-saved quote never throws during the sort tick.
 */

import { getStatus as getApprovalStatus } from '../../../utils/approvalWorkflow.js';

/**
 * Ordinal used by status-column sorting — matches workflow progression so
 * ASC goes draft → pending_sales → pending_finance → approved, and
 * rejected sorts to the end so reviewers see actionable items near the top.
 * Mirror of the constant previously inlined in QuoteHistory.jsx.
 */
export const STATUS_ORDER = {
  draft: 0,
  pending_sales: 1,
  pending_finance: 2,
  approved: 3,
  rejected: 4,
};

/**
 * Column key order — drives both render order and ColumnsToggle popover
 * order. Pinning this list as the source of truth lets us assert "config
 * matches the rendered <th> list" with a regression test if drift surfaces.
 */
export const QUOTE_HISTORY_COLUMN_KEYS = [
  'num',
  'date',
  'rfq',
  'option',
  'ul',
  'owner',
  'direct_cu',
  'end_cu',
  'project',
  'ifs',
  'dcu_pn',
  'ecu_pn',
  'size',
  'materials',
  'trade_mode',
  'design',
  'moq',
  'sell',
  'price_vnd',
  'target',
  'va',
  'contr',
  'gm',
  'status',
  'approve',
  'layout',
];

/**
 * Columns that cannot be hidden — operator must always see row number,
 * date, RFQ, status, the approve/reject action, and the layout/export
 * cell. Henry's spec (Phase 2 Q3) — keeps the workflow anchors visible
 * regardless of how aggressive the operator's hide list gets.
 */
export const QUOTE_HISTORY_REQUIRED_KEYS = new Set([
  'num',
  'date',
  'rfq',
  'status',
  'approve',
  'layout',
]);

/**
 * v1 default hide list (Henry's spec Phase 2 Q7 option C). Trims the
 * 26-column table to 21 visible by stripping the rarely-used IFS / PN /
 * UL / target columns. Operator can re-show via the popover. Persisted
 * choice (via ColumnsToggle.helpers.loadHiddenKeys) supersedes this on
 * subsequent reloads.
 */
export const QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS = ['ul', 'ifs', 'dcu_pn', 'ecu_pn', 'target'];

/**
 * Pure sort functions per column key. Returns a primitive comparable
 * value; the comparator in QuoteHistory.jsx handles the ASC/DESC flip.
 *
 * Comments preserved from the original module-level SORT_KEYS so the
 * forensic trace for S-PROJFIX (Lesson 21) / Sprint 1.7f / Sprint 1.7g
 * survives the migration into config-driven render.
 */
export const QUOTE_HISTORY_SORT_FNS = {
  date: (q) => new Date(q.saved_at || 0).getTime(),
  rfq: (q) => (q.state?.rfq_number || '').toLowerCase(),
  // Sprint S-OPTIONS-COL (2026-06-12) — column repurposed from VER (which
  // showed `q.version`) to Option (operator-entered free-text in RFQ &
  // Certification, persisted at state.options). Legacy column key 'ver'
  // is rewritten to 'option' in resolveSortKey so saved sort prefs from
  // v1.6.0-rc6 keep working after the rename.
  option: (q) => (q.state?.options || '').toLowerCase(),
  // Renamed `npi` → `owner` so column.key == sort key == localStorage key
  // stays consistent. Legacy persisted sortKey 'npi' is silently rewritten
  // to 'owner' in QuoteHistory.jsx's resilience guard.
  owner: (q) => (q.state?.npi_owner || q.npi_owner || '').toLowerCase(),
  direct_cu: (q) => (q.state?.direct_cu || '').toLowerCase(),
  // Sprint S-PROJFIX (2026-04-29) — Standard's RfqInfoCard aliases the
  // End Customer input to state.project (CalcHeader.jsx aliasMap), so
  // s.project actually holds End Customer text for Standard quotes
  // and s.end_cu stays empty. Complex has no alias (writes directly
  // to state.end_cu). The fallback s.end_cu || s.project covers both.
  end_cu: (q) => (q.state?.end_cu || q.state?.project || '').toLowerCase(),
  // Project column reads state.project_name — the canonical field
  // written by RfqInfoCard's "Project" input for both calculator types.
  project: (q) => (q.state?.project_name || '').toLowerCase(),
  ifs: (q) => (q.state?.ccl_pn || '').toLowerCase(),
  dcu_pn: (q) => (q.state?.direct_cu_pn || '').toLowerCase(),
  moq: (q) => Number(q.state?.moq) || 0,
  sell: (q) => Number(q.state?.selling_price) || 0,
  // Sprint 1.7g — PRICE VND column. Auto-synced from RFQ & MOQ Pricing
  // info via the bi-directional setPriceUsd/setPriceVnd handlers in
  // CalcHeader, so the field always lives at state.selling_price_vnd.
  // Fallback: derive USD × usd_rate when only USD was entered (legacy
  // quotes without the explicit VND mirror).
  price_vnd: (q) => {
    const s = q.state || {};
    if (Number.isFinite(+s.selling_price_vnd)) return Number(s.selling_price_vnd);
    if (Number.isFinite(+s.selling_price) && Number.isFinite(+s.usd_rate)) {
      return Number(s.selling_price) * Number(s.usd_rate);
    }
    return 0;
  },
  gm: (q) => Number(q.result?.gm) || 0,
  va: (q) => Number(q.result?.va) || 0,
  // Sprint 1.7f — Contr.% (contribution margin). Two field shapes in the
  // wild: new calcAll uses fraction `contribution`, legacy bundle stored
  // `contr_pct` as already-multiplied %. Coerce both into fraction so the
  // sort comparison stays apples-to-apples.
  contr: (q) => {
    const r = q.result || {};
    if (Number.isFinite(+r.contribution)) return Number(r.contribution);
    if (Number.isFinite(+r.contr_pct)) return Number(r.contr_pct) / 100;
    return 0;
  },
  status: (q) => STATUS_ORDER[getApprovalStatus(q.state?.approval)] ?? 99,
};

/**
 * Resilience: when the persisted/in-state sortKey points at a column the
 * operator has hidden (or a key that no longer exists in config), fall
 * back to `date` desc so the sort tick stays well-defined.
 *
 * Also rewrites the legacy sortKey 'npi' → 'owner' (column was renamed
 * during Phase 2 to keep key/sortKey symmetric) so saved sort prefs from
 * v1.5.12 keep working.
 */
export function resolveSortKey(currentKey, visibleKeys) {
  let rewritten = currentKey === 'npi' ? 'owner' : currentKey;
  // Sprint S-OPTIONS-COL (2026-06-12) — VER column repurposed as Option.
  // Saved sort prefs from v1.6.0-rc6 carrying 'ver' rewrite to 'option'.
  if (rewritten === 'ver') rewritten = 'option';
  if (!rewritten) return 'date';
  const set = visibleKeys instanceof Set ? visibleKeys : new Set(visibleKeys || []);
  if (!QUOTE_HISTORY_SORT_FNS[rewritten]) return 'date';
  if (set.size > 0 && !set.has(rewritten)) return 'date';
  return rewritten;
}

export const QUOTE_HISTORY_STORAGE_KEY = 'ops-cost-quote-history-cols';
