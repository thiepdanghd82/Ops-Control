/**
 * PendingApprovalsInbox — "my queue" view.
 *
 * Shows only quotes where the current user can legitimately take an
 * action right now (availableActions() is non-empty). Sorted FIFO by
 * submitted_at so the reviewer clears the oldest work first — matches
 * IBM/SAP/Brady inbox convention. Empty state is celebratory.
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
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import ApprovalStatusBadge from '../../../components/Shared/ApprovalStatusBadge';
import ApprovalActionsCell from '../../../components/Shared/ApprovalActionsCell';
import ApprovalHistoryModal from '../../../components/Shared/ApprovalHistoryModal';
import { availableActions, getStatus } from '../../../utils/approvalWorkflow';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useAutoRefresh } from '../../../utils/useAutoRefresh';
import { subscribeDataEvents } from '../../../services/dataEventBus';
import { err as logErr } from '../../../utils/logger';

const PENDING_STATES = new Set(['pending_sales', 'pending_finance']);

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
  if (days <= 1)   return { bg: '#defbe6', fg: '#0e6027' };
  if (days <= 3)   return { bg: '#fff1e8', fg: '#8a3f00' };
  return { bg: '#fff1f1', fg: '#a2191f' }; // > 3 days = red (SLA breach)
}

function fmtNum(v) { return v == null || v === '' ? '—' : Number(v).toLocaleString('en-US'); }
function fmtPrice(v) {
  if (v == null || v === '') return '—';
  return Number(v).toFixed(4).replace(/\.?0+$/, '');
}
function fmtPct(v) { return v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`; }

export default function PendingApprovalsInbox() {
  const { user, hasRole } = useAuth();
  const { setPendingQuote } = useCalc();
  const [viewMode, setViewMode] = useState('mine'); // 'mine' | 'all'
  const [historyModal, setHistoryModal] = useState(null);

  const canSeeAll = hasRole('admin');

  // Sprint AR — hook-managed fetch. `refresh` is the reload-after-
  // transition entrypoint; internally it aborts any stale in-flight
  // load so a slow /shared/quotes never overwrites fresh post-action
  // state.
  const { data: rawQuotes, setData: setQuotesData, initialLoading, error: loadError, refresh } = useAbortableFetch(
    (signal) => sharedApi.getQuotes({ signal }),
    [],
    { onError: (err) => err?.name !== 'AbortError' && logErr('Failed to load quotes for inbox:', err) },
  );
  // v1.3 P0 — Approval inbox cần fresh nhanh (manager waiting). Poll 30s.
  useAutoRefresh(refresh, { intervalMs: 30000, pauseWhenHidden: true });
  // v1.3 Đợt 2 — instant SSE refetch khi approval.transition, cũng như
  // quote.saved (vì submit_for_approval đi qua /quotes save flow).
  useEffect(() => {
    const unsub = subscribeDataEvents(
      ['approval.transition', 'quote.saved'],
      () => { refresh(); }
    );
    return unsub;
  }, [refresh]);

  const quotes = useMemo(() => Array.isArray(rawQuotes) ? rawQuotes : [], [rawQuotes]);

  const reloadAfterTransition = useCallback(() => { refresh(); }, [refresh]);

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
      setQuotesData((prev) =>
        Array.isArray(prev) ? prev.filter((q) => q.id !== quoteId) : prev
      );
    },
    [setQuotesData]
  );
  const rollbackOnError = useCallback(() => { refresh(); }, [refresh]);

  const items = useMemo(() => {
    if (!Array.isArray(quotes)) return [];
    const rows = quotes
      .filter(q => q && q.state)
      .map(q => {
        const approval = q.state.approval || null;
        return {
          q,
          approval,
          status: getStatus(approval),
          actions: availableActions(approval, user),
          submittedAt: approval?.submitted_at || null,
        };
      });
    let filtered;
    if (viewMode === 'mine') {
      // Items I can act on RIGHT NOW, pending by definition.
      filtered = rows.filter(r => r.actions.length > 0 && PENDING_STATES.has(r.status));
    } else {
      // Everything currently in the review queue, regardless of who can act.
      filtered = rows.filter(r => PENDING_STATES.has(r.status));
    }
    // FIFO: oldest submission first (earliest ISO string wins).
    filtered.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : Infinity;
      return ta - tb;
    });
    return filtered;
  }, [quotes, user, viewMode]);

  const myQueueCount = useMemo(() =>
    quotes.filter(q =>
      q?.state &&
      PENDING_STATES.has(getStatus(q.state.approval)) &&
      availableActions(q.state.approval, user).length > 0
    ).length,
    [quotes, user]
  );

  const allPendingCount = useMemo(() =>
    quotes.filter(q => q?.state && PENDING_STATES.has(getStatus(q.state.approval))).length,
    [quotes]
  );

  function openQuote(item) {
    const t = item.q.type || 'standard';
    setPendingQuote(item.q.id, t, 'load');
    window.dispatchEvent(new CustomEvent('ops-switch-tab',
      { detail: t === 'complex' ? 'complex' : 'standard' }));
  }

  // Skeleton only on INITIAL load. Stale-while-revalidate (Lesson 29):
  // polling/SSE refresh keeps existing rows visible while the next
  // /shared/quotes call resolves, then swaps in the new data without
  // unmounting the table (preserves scroll position, no flash).
  if (initialLoading) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={8} cols={9} />
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
          action={<button className="op-btn op-btn-primary" onClick={refresh}>Retry</button>}
        />
      </div>
    );
  }

  return (
    <div style={{
      padding: 20,
      fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Header + view toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#161616' }}>
          Pending Approvals
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px',
          background: myQueueCount > 0 ? '#fff1e8' : '#defbe6',
          color: myQueueCount > 0 ? '#8a3f00' : '#0e6027',
          letterSpacing: 0.3, borderRadius: 10,
        }}>
          {myQueueCount} in my queue
        </span>
        {canSeeAll && (
          <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 0 }}>
            <ViewToggleBtn
              active={viewMode === 'mine'}
              onClick={() => setViewMode('mine')}
              label="My queue"
              count={myQueueCount}
            />
            <ViewToggleBtn
              active={viewMode === 'all'}
              onClick={() => setViewMode('all')}
              label="All pending"
              count={allPendingCount}
            />
          </div>
        )}
        <button
          onClick={refresh}
          title="Refresh"
          style={{
            marginLeft: canSeeAll ? 0 : 'auto',
            fontSize: 11, padding: '5px 12px',
            border: '1px solid #c6c6c6', background: '#fff', color: '#525252',
            cursor: 'pointer', borderRadius: 2,
          }}
        >↻ Refresh</button>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <EmptyState
          icon={viewMode === 'mine' ? '✓' : '📭'}
          title={viewMode === 'mine' ? 'All caught up' : 'No quotes in review'}
          hint={viewMode === 'mine'
            ? 'No quotes are waiting on your action right now. Check back later, or switch to "All pending" if you are an admin.'
            : 'No quotes are currently in Sales or Finance review.'}
        />
      ) : (
        /* Table */
        <div style={{
          border: '1px solid #e0e0e0', background: '#fff',
          overflowX: 'auto',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: 12, color: '#161616',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <thead>
              <tr style={{ background: '#f4f4f4', borderBottom: '1px solid #c6c6c6' }}>
                <Th style={{ width: 70 }}>Age</Th>
                <Th style={{ width: 140 }}>Submitted</Th>
                <Th style={{ width: 140 }}>Status</Th>
                <Th style={{ width: 130 }}>RFQ</Th>
                <Th style={{ minWidth: 130 }}>CCL PN</Th>
                <Th style={{ minWidth: 130 }}>Customer</Th>
                <Th style={{ width: 100 }}>Submitted by</Th>
                <Th style={{ width: 80 }} align="right">MOQ</Th>
                <Th style={{ width: 90 }} align="right">Sell</Th>
                <Th style={{ width: 60 }} align="right">GM%</Th>
                <Th style={{ minWidth: 200 }} align="center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const q = item.q;
                const s = q.state || {};
                const r = q.result || {};
                const days = ageDays(item.submittedAt);
                const ageClr = ageBadgeColor(days);
                const gmVal = r.gm != null ? r.gm
                  : (r.gm_pct != null ? r.gm_pct / 100 : null);
                return (
                  <tr
                    key={q.id || i}
                    style={{
                      borderBottom: '1px solid #f4f4f4',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}
                  >
                    <Td>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 10,
                        background: ageClr.bg, color: ageClr.fg,
                      }}>
                        {days == null ? '—' : days === 0 ? 'today' : `${days}d`}
                      </span>
                    </Td>
                    <Td>{fmtDateTime(item.submittedAt)}</Td>
                    <Td>
                      <ApprovalStatusBadge
                        approval={item.approval}
                        onOpenHistory={() => setHistoryModal({
                          approval: item.approval,
                          label: s.ccl_pn || s.rfq_number || `#${q.id}`,
                        })}
                      />
                    </Td>
                    <Td>
                      <button
                        onClick={() => openQuote(item)}
                        title="Open quote in calculator"
                        style={{
                          padding: 0, border: 'none', background: 'none',
                          color: '#0f62fe', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 12,
                          fontWeight: 600, textDecoration: 'underline',
                        }}
                      >{s.rfq_number || '—'}</button>
                    </Td>
                    <Td>{s.ccl_pn || '—'}</Td>
                    <Td title={`${s.direct_cu || ''} → ${s.end_cu || ''}`}>
                      {s.direct_cu || s.end_cu || '—'}
                    </Td>
                    <Td>{item.approval?.submitted_by || '—'}</Td>
                    <Td align="right">{fmtNum(s.moq)}</Td>
                    <Td align="right">{fmtPrice(s.selling_price)}</Td>
                    <Td align="right">{gmVal != null ? fmtPct(gmVal) : '—'}</Td>
                    <Td align="center">
                      {item.actions.length > 0 ? (
                        <ApprovalActionsCell
                          quote={q}
                          user={user}
                          onAfterTransition={reloadAfterTransition}
                          onOptimisticTransition={optimisticRemove}
                          onTransitionRollback={rollbackOnError}
                        />
                      ) : (
                        <span style={{ fontSize: 10, color: '#8d8d8d', fontStyle: 'italic' }}>
                          awaiting other reviewer
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
    <th style={{
      padding: '8px 10px',
      fontSize: 10, fontWeight: 700, color: '#525252',
      textAlign: align || 'left', textTransform: 'uppercase',
      letterSpacing: 0.4,
      ...style,
    }}>{children}</th>
  );
}

function Td({ children, align, style }) {
  return (
    <td style={{
      padding: '10px',
      textAlign: align || 'left',
      ...style,
    }}>{children}</td>
  );
}

function ViewToggleBtn({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, padding: '5px 12px',
        border: `1px solid ${active ? '#0f62fe' : '#c6c6c6'}`,
        background: active ? '#edf5ff' : '#fff',
        color: active ? '#0043ce' : '#525252',
        cursor: 'pointer', borderRadius: 0,
        fontWeight: active ? 600 : 400,
      }}
    >{label} <span style={{ color: '#8d8d8d', marginLeft: 4 }}>{count}</span></button>
  );
}
