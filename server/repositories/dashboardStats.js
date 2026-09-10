/**
 * Enterprise dashboard aggregation queries.
 *
 * Reads from the `quotes` table. Extracts metrics by parsing state_json /
 * raw_json at query time because the stored `result` column is polluted
 * with calcAll output on some rows (historical data issue — not worth
 * a schema migration for a read-only dashboard).
 *
 * All functions return plain objects. Client-side renders charts. The
 * queries are indexed on saved_at, ccl_pn, rfq_number — lists that matter
 * for dashboards. No aggregation is materialized; we recompute each call.
 * Fast enough under 10k quotes; add materialized views if it grows.
 *
 * Sprint 9.1 (Phase 9B) — extended with win rate, per-customer revenue,
 * approval funnel, margin trend, and a single `days` time-range filter
 * applied at collect time so downstream reducers don't have to repeat
 * the cutoff check. Win/loss definition: quote.state.approval.status
 * === 'price_approved' → won, === 'rejected'|'cancelled' → lost. Draft / pending are
 * excluded from the win-rate denominator.
 */
import { loadQuotes } from './quotesStore.js';
import { getStatus as getApprovalStatus } from './approvalWorkflow.js';

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Normalize time-range. Accepts number-of-days (30 | 90 | 365) or
 * null/undefined/0/'all' for the full history. Returns `{ days, sinceMs }`
 * — sinceMs is the epoch cutoff (inclusive); null means "no cutoff".
 */
function normalizeRange(days) {
  if (days == null || days === 'all' || days === 0) return { days: null, sinceMs: null };
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return { days: null, sinceMs: null };
  return { days: n, sinceMs: Date.now() - n * 24 * 60 * 60 * 1000 };
}

/**
 * Collect per-quote metrics from the live quote store. Called once per
 * dashboard request. On 10k quotes: ~50-100ms cold from SQLite,
 * ~30-80ms from the JSON fallback (single readFile + parse).
 *
 * `days` optionally constrains by saved_at to the last N days. When a
 * time range is active and saved_at is missing / unparseable, the row
 * is dropped — it can't be time-bucketed safely anyway.
 *
 * Sprint 1.6 — was previously SQL-only against `ops.db`, but the
 * default OPS_DATA_BACKEND is `file` (writes to `quote_history.json`,
 * shadow-mirror to SQLite). Deployments where ops.db never got
 * populated (clean install, shadow-write disabled, or strict-sqlite
 * not yet enabled) showed all-zero KPIs even though 60+ quotes lived
 * on disk. Routing through `loadQuotes()` makes the dashboard backend-
 * agnostic — it pulls from whichever store quotesStore points at.
 *
 * Skips ?soft-deleted? rows so the dashboard matches what operators see
 * in QuoteHistory (Sprint 13 added soft-delete; quotes flagged
 * `deleted_at` are hidden everywhere except the Trash bin).
 */
export function collectMetrics({ days } = {}) {
  const { sinceMs } = normalizeRange(days);
  let quotes;
  try {
    quotes = loadQuotes();
  } catch {
    return [];
  }
  if (!Array.isArray(quotes)) return [];

  const out = [];
  for (const q of quotes) {
    if (q?.deleted_at) continue;
    let savedMs = null;
    if (q.saved_at) {
      const t = Date.parse(q.saved_at);
      if (Number.isFinite(t)) savedMs = t;
    }
    if (sinceMs != null) {
      if (savedMs == null || savedMs < sinceMs) continue;
    }

    const state = q.state || {};
    const result = q.result || {};
    const gm = isNum(result.gm) ? result.gm : null;
    const va = isNum(result.va) ? result.va : null;
    const contribution = isNum(result.contribution) ? result.contribution : null;
    const sp = isNum(result.sp)
      ? result.sp
      : isNum(state.selling_price)
        ? state.selling_price
        : null;
    const moq = isNum(state.moq) ? state.moq : null;
    const revenue = sp != null && moq != null ? sp * moq : null;
    const approvalStatus = getApprovalStatus(state.approval); // heal-on-read maps legacy v1 states → quote_to_sale / price_approved

    // Customer + part number live in `state.*` in the JSON shape; the
    // SQLite mirror denormalizes them as columns. Fall through both so
    // the dashboard works regardless of which backend served the row.
    out.push({
      id: q.id,
      type: q.type,
      saved_at: q.saved_at,
      saved_ms: savedMs,
      direct_cu: state.direct_cu ?? q.direct_cu ?? null,
      end_cu: state.end_cu ?? q.end_cu ?? null,
      ccl_pn: state.ccl_pn ?? q.ccl_pn ?? null,
      gm,
      va,
      contribution,
      sp,
      moq,
      revenue,
      approval_status: approvalStatus,
    });
  }
  return out;
}

/**
 * Top-level counts + overall averages.
 * Sprint 9.1 additions: pending_count (Sprint S-QUOTE-PROGRESS-V2 —
 * pending_count now = quote_to_sale; the v1 2-gate pipeline collapsed)
 * and revenue_total (sum of sp*moq where both present).
 *
 * Phase 9F.3 — accepts an optional pre-collected `_metrics` array so a
 * single `/dashboard` request can share one full-table scan across
 * all six aggregators instead of running six independent scans. When
 * `_metrics` is provided `days` is ignored (caller already filtered).
 */
export function getOverview({ days, _metrics } = {}) {
  const metrics = _metrics || collectMetrics({ days });
  const total = metrics.length;
  if (total === 0) {
    return {
      total: 0,
      by_type: {},
      avg_gm: null,
      avg_va: null,
      pending_count: 0,
      revenue_total: 0,
    };
  }

  const byType = {};
  let gmSum = 0,
    gmCount = 0;
  let vaSum = 0,
    vaCount = 0;
  let pendingCount = 0;
  let revenueTotal = 0;
  for (const m of metrics) {
    byType[m.type || 'unknown'] = (byType[m.type || 'unknown'] || 0) + 1;
    if (isNum(m.gm)) {
      gmSum += m.gm;
      gmCount++;
    }
    if (isNum(m.va)) {
      vaSum += m.va;
      vaCount++;
    }
    if (m.approval_status === 'quote_to_sale') pendingCount++;
    if (isNum(m.revenue)) revenueTotal += m.revenue;
  }
  return {
    total,
    by_type: byType,
    avg_gm: gmCount ? gmSum / gmCount : null,
    avg_va: vaCount ? vaSum / vaCount : null,
    pending_count: pendingCount,
    revenue_total: revenueTotal,
  };
}

/**
 * Overall win rate. Won = approval.status === 'price_approved'; Lost =
 * 'rejected' or 'cancelled'. Draft / pending are tracked separately
 * but excluded from the rate denominator so an inbox of pending
 * quotes doesn't drag the win rate down. Rate is null when decided=0
 * (avoids 0/0 NaN).
 */
export function getWinRate({ days, _metrics } = {}) {
  const metrics = _metrics || collectMetrics({ days });
  let won = 0,
    lost = 0,
    pending = 0,
    draft = 0;
  for (const m of metrics) {
    switch (m.approval_status) {
      case 'price_approved':
        won++;
        break;
      case 'rejected':
      case 'cancelled':
        lost++;
        break;
      case 'quote_to_sale':
        pending++;
        break;
      default:
        draft++;
        break;
    }
  }
  const decided = won + lost;
  return {
    won,
    lost,
    pending,
    draft,
    decided,
    rate: decided > 0 ? won / decided : null,
  };
}

/**
 * Quote-progress funnel — counts per state. Used by the funnel chart
 * to visualize stage distribution of the quote pipeline.
 */
export function getApprovalFunnel({ days, _metrics } = {}) {
  const metrics = _metrics || collectMetrics({ days });
  const funnel = {
    draft: 0,
    quote_to_sale: 0,
    price_approved: 0,
    cancelled: 0,
    rejected: 0,
  };
  for (const m of metrics) {
    if (funnel[m.approval_status] != null) funnel[m.approval_status]++;
    else funnel.draft++;
  }
  return funnel;
}

/**
 * Top N customers — quote_count, avg_gm, revenue, win_rate.
 * revenue = sum of sp*moq across the customer's quotes.
 * win_rate = won / (won+lost) for that customer's quotes; null when
 * no quotes are decided yet.
 */
export function getTopCustomers(limit = 10, { days, _metrics } = {}) {
  const metrics = _metrics || collectMetrics({ days });
  const agg = new Map(); // customer → { count, gmSum, gmN, revenue, won, lost }
  for (const m of metrics) {
    const cu = m.direct_cu || '(unknown)';
    const row = agg.get(cu) || { count: 0, gmSum: 0, gmN: 0, revenue: 0, won: 0, lost: 0 };
    row.count++;
    if (isNum(m.gm)) {
      row.gmSum += m.gm;
      row.gmN++;
    }
    if (isNum(m.revenue)) row.revenue += m.revenue;
    if (m.approval_status === 'price_approved') row.won++;
    else if (m.approval_status === 'rejected' || m.approval_status === 'cancelled') row.lost++;
    agg.set(cu, row);
  }
  return [...agg.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([customer, r]) => {
      const decided = r.won + r.lost;
      return {
        customer,
        quote_count: r.count,
        avg_gm: r.gmN ? r.gmSum / r.gmN : null,
        revenue: r.revenue,
        won: r.won,
        lost: r.lost,
        win_rate: decided > 0 ? r.won / decided : null,
      };
    });
}

/**
 * Quote count per month for the last N months (default 12).
 * Good for a sparkline showing quote velocity. Ignores the `days`
 * range filter — this function defines its own window via `months`.
 */
export function getMonthlyQuoteCount({ months = 12, _metrics } = {}) {
  // Phase 9N.1 — accept pre-collected _metrics so route handler can
  // share ONE all-history scan across getMonthlyQuoteCount + getMarginTrend
  // instead of scanning twice per dashboard request.
  const metrics = _metrics || collectMetrics();
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      count: 0,
      cutoff: d.getTime(),
    });
  }
  for (const m of metrics) {
    if (m.saved_ms == null) continue;
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (m.saved_ms >= buckets[i].cutoff) {
        buckets[i].count++;
        break;
      }
    }
  }
  return buckets.map((b) => ({ month: b.month, count: b.count }));
}

/**
 * Monthly avg-GM trend over the last N months. Helps visualize margin
 * drift. Returns `avg_gm: null` for months with no quotes (chart can
 * render these as gaps instead of 0).
 */
export function getMarginTrend({ months = 12, _metrics } = {}) {
  // Phase 9N.1 — shares the all-history scan with getMonthlyQuoteCount.
  const metrics = _metrics || collectMetrics();
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      gmSum: 0,
      gmN: 0,
      count: 0,
      cutoff: d.getTime(),
    });
  }
  for (const m of metrics) {
    if (m.saved_ms == null) continue;
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (m.saved_ms >= buckets[i].cutoff) {
        buckets[i].count++;
        if (isNum(m.gm)) {
          buckets[i].gmSum += m.gm;
          buckets[i].gmN++;
        }
        break;
      }
    }
  }
  return buckets.map((b) => ({
    month: b.month,
    count: b.count,
    avg_gm: b.gmN ? b.gmSum / b.gmN : null,
  }));
}

/**
 * GM histogram — distribution of quotes by gross-margin band.
 * Bands match the gmClr thresholds in utils/format.js so UI colors agree.
 */
export function getMarginHistogram({ days, _metrics } = {}) {
  const metrics = _metrics || collectMetrics({ days });
  const bands = {
    negative: { range: '< 0%', count: 0, color: '#dc2626' },
    low: { range: '0–10%', count: 0, color: '#dc2626' },
    medium: { range: '10–20%', count: 0, color: '#d97706' },
    good: { range: '20–35%', count: 0, color: '#16a34a' },
    excellent: { range: '> 35%', count: 0, color: '#16a34a' },
    unknown: { range: 'no GM', count: 0, color: '#94a3b8' },
  };
  for (const m of metrics) {
    if (!isNum(m.gm)) {
      bands.unknown.count++;
      continue;
    }
    if (m.gm < 0) bands.negative.count++;
    else if (m.gm < 0.1) bands.low.count++;
    else if (m.gm < 0.2) bands.medium.count++;
    else if (m.gm < 0.35) bands.good.count++;
    else bands.excellent.count++;
  }
  return bands;
}
