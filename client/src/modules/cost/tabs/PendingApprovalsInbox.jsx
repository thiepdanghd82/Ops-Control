/**
 * PendingApprovalsInbox — "my queue" view.
 *
 * Shows only quotes currently in the review queue (status =
 * quote_to_sale) that the current user can act on (canUserSetStatus
 * for price_approved). Sorted FIFO by approval.changed_at so the
 * reviewer clears the oldest work first — matches IBM/SAP/Brady inbox
 * convention. Empty state is celebratory.
 *
 * Toggle "My queue" / "All pending" lets admins / sys see the full
 * backlog without approval_roles being the gate. Non-privileged users
 * don't see the toggle.
 *
 * Sprint 6.4.
 */
import { useMemo, useState, useCallback, useEffect } from 'react';
import { sharedApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useCalc } from '../../../context/CalcContext';
import { useI18n } from '../../../utils/useI18n';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import ApprovalStatusBadge from '../../../components/Shared/ApprovalStatusBadge';
import ApprovalActionsCell from '../../../components/Shared/ApprovalActionsCell';
import ApprovalHistoryModal from '../../../components/Shared/ApprovalHistoryModal';
import ScopedFilterBar from '../components/ScopedFilterBar';
import {
  availableTargetStatuses,
  canUserSetStatus,
  getStatus,
} from '../../../utils/approvalWorkflow';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useAutoRefresh } from '../../../utils/useAutoRefresh';
import { useQuoteFilters } from '../hooks/useQuoteFilters';
import { applyQuoteFilters, quoteAccessor } from '../lib/quoteFilters';
import { subscribeDataEvents } from '../../../services/dataEventBus';
import { err as logErr } from '../../../utils/logger';
import { deriveInboxRow } from './PendingApprovalsInbox.columns.helpers';

// Sprint S-QUOTE-PROGRESS-V2 — the "pending" review queue collapsed
// from {pending_sales, pending_finance} to the single quote_to_sale
// status. Anything else (draft / price_approved / cancelled / rejected)
// is either pre-review or terminal.
const PENDING_STATES = new Set(['quote_to_sale']);

// The inbox dropdown only offers terminal review outcomes — approve
// or reject. Draft + Cancelled are intentionally hidden here (operator
// flagged 2026-06-15): an inbox queue is a review workflow, not a
// rollback or admin cancel surface — those still work from Quote
// History where the full 5-status list lives.
const INBOX_ALLOWED_TARGETS = ['price_approved', 'rejected'];

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ageDays(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function ageBadgeColor(days) {
  if (days == null) return { bg: '#f4f4f4', fg: '#525252' };
  if (days <= 1) return { bg: '#defbe6', fg: '#0e6027' };
  if (days <= 3) return { bg: '#fff1e8', fg: '#8a3f00' };
  return { bg: '#fff1f1', fg: '#a2191f' }; // > 3 days = red (SLA breach)
}

function fmtNum(v) {
  return v == null || v === '' ? '—' : Number(v).toLocaleString('en-US');
}
function fmtPrice(v) {
  if (v == null || v === '') return '—';
  return Number(v)
    .toFixed(4)
    .replace(/\.?0+$/, '');
}
// en-US 0-decimals VND; '—' for null/0/non-finite. Matches the
// fmtVnd contract in StandardCalc/CalcLeadTimeNotice.helpers.js +
// Summarize so cross-table values render uniformly. Inlined here
// per the surgical-scope rule rather than imported from a sibling
// tab — keeps PendingApprovalsInbox self-contained.
const VND_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function fmtVnd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  return VND_FMT.format(n);
}
function fmtPct(v) {
  return v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`;
}

export default function PendingApprovalsInbox() {
  const { user, hasRole } = useAuth();
  const { setPendingQuote } = useCalc();
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState('mine'); // 'mine' | 'all'
  const [historyModal, setHistoryModal] = useState(null);
  // Shared filter infra — same hook + accessor + applyQuoteFilters as
  // Quote History so an operator using both screens trains a single
  // mental model (date range / customer / part / sale / global query).
  // Filter state lives outside useAbortableFetch so 30s poll + SSE
  // refresh don't reset it (same QuoteHistory pattern, Sprint S-D20).
  const { filter, debouncedFilter, setField, clearField, clearAll, hasActiveFilter } =
    useQuoteFilters();

  const canSeeAll = hasRole('admin');

  // Sprint AR — hook-managed fetch. `refresh` is the reload-after-
  // transition entrypoint; internally it aborts any stale in-flight
  // load so a slow /shared/quotes never overwrites fresh post-action
  // state.
  const {
    data: rawQuotes,
    setData: setQuotesData,
    initialLoading,
    error: loadError,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getQuotes({ signal }), [], {
    onError: (err) => err?.name !== 'AbortError' && logErr('Failed to load quotes for inbox:', err),
  });
  // v1.3 P0 — Approval inbox cần fresh nhanh (manager waiting). Poll 30s.
  useAutoRefresh(refresh, { intervalMs: 30000, pauseWhenHidden: true });
  // v1.3 Đợt 2 — instant SSE refetch khi approval.transition, cũng như
  // quote.saved (vì submit_for_approval đi qua /quotes save flow).
  useEffect(() => {
    const unsub = subscribeDataEvents(['approval.transition', 'quote.saved'], () => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  const quotes = useMemo(() => (Array.isArray(rawQuotes) ? rawQuotes : []), [rawQuotes]);

  const reloadAfterTransition = useCallback(() => {
    refresh();
  }, [refresh]);

  // Option 3 anti-flash: optimistic remove on Approve/Reject. Drops
  // the row from the local list IMMEDIATELY so the operator doesn't
  // stare at a "…" button for 300-500ms while the network round-trip
  // completes. On error the rollback handler triggers a full refresh
  // which re-fetches the canonical server state (row reappears with
  // its real status). Idempotent because the SSE listener + 30s poll
  // would refresh anyway — we just shift the user-visible result
  // ahead of the network.
  const optimisticRemove = useCallback(
    (quoteId) => {
      setQuotesData((prev) => (Array.isArray(prev) ? prev.filter((q) => q.id !== quoteId) : prev));
    },
    [setQuotesData]
  );
  const rollbackOnError = useCallback(() => {
    refresh();
  }, [refresh]);

  const items = useMemo(() => {
    if (!Array.isArray(quotes)) return [];
    const rows = quotes
      .filter((q) => q && q.state)
      .map((q) => {
        const approval = q.state.approval || null;
        // "Actionable" in the new model = user can move the quote to
        // price_approved (the next forward step out of quote_to_sale).
        const canApprove = canUserSetStatus(user, 'price_approved');
        return {
          q,
          approval,
          status: getStatus(approval),
          targets: availableTargetStatuses(approval, user),
          actionable: canApprove,
          submittedAt: approval?.changed_at || approval?.submitted_at || null,
        };
      });
    let filtered;
    if (viewMode === 'mine') {
      filtered = rows.filter((r) => r.actionable && PENDING_STATES.has(r.status));
    } else {
      filtered = rows.filter((r) => PENDING_STATES.has(r.status));
    }
    // Shared filter infra — accessor maps {q, approval, ...} item to
    // the flat shape applyQuoteFilters expects (via quoteAccessor on
    // the underlying quote). Applied AFTER viewMode + PENDING_STATES
    // so the "N in my queue" counter above stays anchored to the true
    // queue size, not the filtered subset.
    filtered = applyQuoteFilters(filtered, debouncedFilter, (item) => quoteAccessor(item.q));
    // FIFO: oldest entry to the review queue first.
    filtered.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : Infinity;
      return ta - tb;
    });
    return filtered;
  }, [quotes, user, viewMode, debouncedFilter]);

  // Total pre-filter count for ScopedFilterBar "N of M shown" tally.
  // Mirrors the items useMemo's pre-filter shape (viewMode applied,
  // filter NOT applied) so the counter reads "matches out of {viewMode}
  // queue size" — same semantic as Quote History.
  const totalForFilter = useMemo(() => {
    if (!Array.isArray(quotes)) return 0;
    return quotes.filter((q) => {
      if (!q || !q.state) return false;
      const status = getStatus(q.state.approval);
      if (!PENDING_STATES.has(status)) return false;
      if (viewMode === 'mine') return canUserSetStatus(user, 'price_approved');
      return true;
    }).length;
  }, [quotes, user, viewMode]);

  const myQueueCount = useMemo(
    () =>
      quotes.filter(
        (q) =>
          q?.state &&
          PENDING_STATES.has(getStatus(q.state.approval)) &&
          canUserSetStatus(user, 'price_approved')
      ).length,
    [quotes, user]
  );

  const allPendingCount = useMemo(
    () => quotes.filter((q) => q?.state && PENDING_STATES.has(getStatus(q.state.approval))).length,
    [quotes]
  );

  function openQuote(item) {
    const t = item.q.type || 'standard';
    setPendingQuote(item.q.id, t, 'load');
    window.dispatchEvent(
      new CustomEvent('ops-switch-tab', { detail: t === 'complex' ? 'complex' : 'standard' })
    );
  }

  // Skeleton only on INITIAL load. Stale-while-revalidate (Lesson 29):
  // polling/SSE refresh keeps existing rows visible while the next
  // /shared/quotes call resolves, then swaps in the new data without
  // unmounting the table (preserves scroll position, no flash).
  if (initialLoading) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={8} cols={18} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon="⚠️"
          title="Failed to load approvals inbox"
          hint={loadError.message || String(loadError)}
          action={
            <button className="op-btn op-btn-primary" onClick={refresh}>
              Retry
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Header + view toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: '#161616' }}>{t('inbox.title')}</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 10px',
            background: myQueueCount > 0 ? '#fff1e8' : '#defbe6',
            color: myQueueCount > 0 ? '#8a3f00' : '#0e6027',
            letterSpacing: 0.3,
            borderRadius: 10,
          }}
        >
          {t('inbox.in_my_queue', { n: myQueueCount })}
        </span>
        {canSeeAll && (
          <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 0 }}>
            <ViewToggleBtn
              active={viewMode === 'mine'}
              onClick={() => setViewMode('mine')}
              label={t('inbox.my_queue')}
              count={myQueueCount}
            />
            <ViewToggleBtn
              active={viewMode === 'all'}
              onClick={() => setViewMode('all')}
              label={t('inbox.all_pending')}
              count={allPendingCount}
            />
          </div>
        )}
        <button
          onClick={refresh}
          title={t('inbox.refresh_title')}
          style={{
            marginLeft: canSeeAll ? 0 : 'auto',
            fontSize: 11,
            padding: '5px 12px',
            border: '1px solid #c6c6c6',
            background: '#fff',
            color: '#525252',
            cursor: 'pointer',
            borderRadius: 2,
          }}
        >
          {t('inbox.refresh')}
        </button>
      </div>

      {/* Shared filter infra — global search + Date/Customer/Part/Sale
          chips. Counter reflects filtered count vs viewMode queue size
          (NOT my-queue/all-pending split). */}
      <ScopedFilterBar
        filter={filter}
        setField={setField}
        clearField={clearField}
        clearAll={clearAll}
        hasActiveFilter={hasActiveFilter}
        resultCount={items.length}
        totalCount={totalForFilter}
        globalPlaceholder={t('inbox.search_placeholder')}
      />

      {/* Empty state */}
      {items.length === 0 ? (
        <EmptyState
          icon={viewMode === 'mine' ? '✓' : '📭'}
          title={
            hasActiveFilter
              ? t('inbox.empty.no_match.title')
              : viewMode === 'mine'
                ? t('inbox.empty.caught_up.title')
                : t('inbox.empty.no_review.title')
          }
          hint={
            hasActiveFilter
              ? t('inbox.empty.no_match.hint')
              : viewMode === 'mine'
                ? t('inbox.empty.caught_up.hint')
                : t('inbox.empty.no_review.hint')
          }
        />
      ) : (
        /* Table */
        <div
          style={{
            border: '1px solid #e0e0e0',
            background: '#fff',
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              color: '#161616',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr style={{ background: '#f4f4f4', borderBottom: '1px solid #c6c6c6' }}>
                <Th style={{ width: 70 }}>Age</Th>
                <Th style={{ width: 140 }}>Submitted</Th>
                <Th style={{ width: 140 }}>Status</Th>
                <Th style={{ width: 130 }}>RFQ</Th>
                {/* Sprint S-INBOX-COLS (2026-06-17) — Sale Owner adjacent
                    to RFQ per PR #157 admin-scan convention. */}
                <Th style={{ width: 100 }}>{t('qh.sale_owner')}</Th>
                <Th style={{ minWidth: 130 }}>CCL PN</Th>
                <Th style={{ minWidth: 130 }}>Customer</Th>
                {/* END CU + PROJECT canonical readings — Lesson 21
                    enforced via deriveInboxRow helper (NOT s.project). */}
                <Th style={{ minWidth: 130 }}>{t('qh.end_cu')}</Th>
                <Th style={{ minWidth: 130 }}>{t('qh.project')}</Th>
                {/* Bulleted Main.Mat join, Process Mat skipped. */}
                <Th style={{ minWidth: 180 }}>{t('qh.materials')}</Th>
                <Th style={{ width: 100 }}>{t('qh.quoted_by')}</Th>
                <Th style={{ width: 80 }} align="right">
                  MOQ
                </Th>
                {/* Existing "Sell" column relabeled to "PRICE USD" via
                    qh.sell_price key — same data (s.selling_price). */}
                <Th style={{ width: 90 }} align="right">
                  {t('qh.sell_price')}
                </Th>
                <Th style={{ width: 100 }} align="right">
                  {t('qh.price_vnd')}
                </Th>
                <Th style={{ width: 60 }} align="right">
                  {t('qh.va_pct')}
                </Th>
                <Th style={{ width: 70 }} align="right">
                  {t('qh.contr_pct')}
                </Th>
                <Th style={{ width: 60 }} align="right">
                  GM%
                </Th>
                <Th style={{ minWidth: 200 }} align="center">
                  Actions
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const q = item.q;
                const s = q.state || {};
                const days = ageDays(item.submittedAt);
                const ageClr = ageBadgeColor(days);
                // Derive bag — pinned to Quote History contract via
                // deriveInboxRow helper (Lesson 21 project_name vs
                // project, legacy contr_pct/gm_pct coerce, raw VND).
                // Non-null guaranteed because the upstream useMemo
                // already filters q && q.state — but the helper
                // tolerates partial state for safety.
                const dx = deriveInboxRow(q) || {};
                const { gmVal, vaVal, contrVal } = dx;
                return (
                  <tr
                    key={q.id || i}
                    style={{
                      borderBottom: '1px solid #f4f4f4',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}
                  >
                    <Td>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: ageClr.bg,
                          color: ageClr.fg,
                        }}
                      >
                        {days == null ? '—' : days === 0 ? 'today' : `${days}d`}
                      </span>
                    </Td>
                    <Td>{fmtDateTime(item.submittedAt)}</Td>
                    <Td>
                      <ApprovalStatusBadge
                        approval={item.approval}
                        onOpenHistory={() =>
                          setHistoryModal({
                            approval: item.approval,
                            label: s.ccl_pn || s.rfq_number || `#${q.id}`,
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <button
                        onClick={() => openQuote(item)}
                        title="Open quote in calculator"
                        style={{
                          padding: 0,
                          border: 'none',
                          background: 'none',
                          color: '#0f62fe',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: 'underline',
                        }}
                      >
                        {s.rfq_number || '—'}
                      </button>
                    </Td>
                    {/* Sale Owner — derived via helper (s.sale_owner). */}
                    <Td>{dx.sale_owner || '—'}</Td>
                    <Td>{s.ccl_pn || '—'}</Td>
                    <Td title={`${s.direct_cu || ''} → ${s.end_cu || ''}`}>
                      {s.direct_cu || s.end_cu || '—'}
                    </Td>
                    {/* END CU canonical (Lesson 21 fallback handled in helper). */}
                    <Td>{dx.end_cu || '—'}</Td>
                    {/* PROJECT canonical — s.project_name only. */}
                    <Td>{dx.project || '—'}</Td>
                    {/* MATERIALS — bulleted Main.Mat join (drw_material). Native
                        title tooltip lets reviewers hover for full content
                        without expanding the cell. */}
                    <Td
                      title={dx.drw_materials || ''}
                      style={{
                        whiteSpace: 'pre-line',
                        maxWidth: 220,
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      {dx.drw_materials || '—'}
                    </Td>
                    <Td>{item.approval?.changed_by || item.approval?.submitted_by || '—'}</Td>
                    <Td align="right">{fmtNum(s.moq)}</Td>
                    {/* PRICE USD — same data as pre-fix Sell column. */}
                    <Td align="right">{fmtPrice(dx.price_usd)}</Td>
                    {/* PRICE VND — raw s.selling_price_vnd, NO USD×rate
                        fallback (helper enforces; spec test C2). */}
                    <Td align="right">{fmtVnd(dx.price_vnd)}</Td>
                    <Td align="right">{vaVal != null ? fmtPct(vaVal) : '—'}</Td>
                    <Td align="right">{contrVal != null ? fmtPct(contrVal) : '—'}</Td>
                    <Td align="right">{gmVal != null ? fmtPct(gmVal) : '—'}</Td>
                    <Td align="center">
                      {item.targets.length > 0 ? (
                        <ApprovalActionsCell
                          quote={q}
                          user={user}
                          allowedTargets={INBOX_ALLOWED_TARGETS}
                          onAfterTransition={reloadAfterTransition}
                          onOptimisticTransition={optimisticRemove}
                          onTransitionRollback={rollbackOnError}
                        />
                      ) : (
                        <span style={{ fontSize: 10, color: '#8d8d8d', fontStyle: 'italic' }}>
                          read-only
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ApprovalHistoryModal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        approval={historyModal?.approval}
        quoteLabel={historyModal?.label}
      />
    </div>
  );
}

function Th({ children, style, align }) {
  return (
    <th
      style={{
        padding: '8px 10px',
        fontSize: 10,
        fontWeight: 700,
        color: '#525252',
        textAlign: align || 'left',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align, style }) {
  return (
    <td
      style={{
        padding: '10px',
        textAlign: align || 'left',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function ViewToggleBtn({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: '5px 12px',
        border: `1px solid ${active ? '#0f62fe' : '#c6c6c6'}`,
        background: active ? '#edf5ff' : '#fff',
        color: active ? '#0043ce' : '#525252',
        cursor: 'pointer',
        borderRadius: 0,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label} <span style={{ color: '#8d8d8d', marginLeft: 4 }}>{count}</span>
    </button>
  );
}
