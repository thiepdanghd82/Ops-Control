/**
 * ApprovalActionsCell — renders the buttons a given user can legally
 * invoke on a given quote's approval. Reject opens an inline modal for
 * the required reason. All actions go through the atomic endpoint via
 * `sharedApi.transitionApproval`; on success the parent re-fetches
 * quotes (caller passes `onAfterTransition`).
 *
 * Sprint 6.3.
 */
import { useCallback, useEffect, useState } from 'react';
import { sharedApi } from '../../services/api';
import { showToast } from '../../utils/toast';
import { availableActions, actionDisplay, getStatus } from '../../utils/approvalWorkflow';

export default function ApprovalActionsCell({
  quote,
  user,
  onAfterTransition,
  // Optimistic UI hooks (Option 3 anti-flash): parent removes the row
  // from its local list BEFORE the network round-trip so the operator
  // sees the result immediately. On 4xx/5xx the parent should restore
  // (typically via refresh()) — wired through onTransitionRollback.
  onOptimisticTransition,
  onTransitionRollback,
}) {
  const approval = quote?.state?.approval || null;
  const actions = availableActions(approval, user);
  const [busy, setBusy] = useState(null); // current action being dispatched
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const runTransition = useCallback(
    async (action, reason) => {
      if (!quote?.id) {
        showToast('Missing quote id', 'err');
        return;
      }
      setBusy(action);
      // Optimistic remove BEFORE the network call. If the API rejects we
      // restore via onTransitionRollback below. Avoids the ~300-500ms
      // gap where the row sits with "…" before vanishing.
      onOptimisticTransition?.(quote.id, action);
      try {
        await sharedApi.transitionApproval(quote.id, action, reason);
        showToast(`Quote #${quote.id}: ${action} recorded`);
        // Tell same-tab listeners (Sidebar badge, inbox) to refresh.
        // Cross-tab sync would need SSE/websocket — out of scope for 6.5.
        window.dispatchEvent(new Event('ops-approvals-changed'));
        onAfterTransition?.(quote.id);
      } catch (err) {
        showToast(`Transition failed: ${err?.message || 'unknown'}`, 'err');
        // Rollback: ask parent to re-fetch so the optimistically-removed
        // row reappears with its correct status from the server.
        onTransitionRollback?.(quote.id, err);
      } finally {
        setBusy(null);
      }
    },
    [quote?.id, onAfterTransition, onOptimisticTransition, onTransitionRollback]
  );

  const confirmReject = useCallback(async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      showToast('Reject requires a reason.', 'err');
      return;
    }
    await runTransition('REJECT', reason);
    setRejectOpen(false);
    setRejectReason('');
  }, [rejectReason, runTransition]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        {actions.map((a) => (
          <ActionButton
            key={a}
            action={a}
            busy={busy === a}
            disabledByOther={busy != null && busy !== a}
            onClick={() => (a === 'REJECT' ? setRejectOpen(true) : runTransition(a))}
          />
        ))}
      </div>
      {rejectOpen && (
        <RejectModal
          quoteLabel={quote.state?.ccl_pn || quote.state?.rfq_number || `#${quote.id}`}
          currentStatus={getStatus(approval)}
          reason={rejectReason}
          setReason={setRejectReason}
          busy={busy === 'REJECT'}
          onCancel={() => {
            setRejectOpen(false);
            setRejectReason('');
          }}
          onConfirm={confirmReject}
        />
      )}
    </>
  );
}

function ActionButton({ action, busy, disabledByOther, onClick }) {
  const { label, tone } = actionDisplay(action);
  const palette = BUTTON_PALETTE[tone] || BUTTON_PALETTE.ghost;
  return (
    <button
      type="button"
      disabled={busy || disabledByOther}
      onClick={onClick}
      title={label}
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.2,
        padding: '4px 8px',
        border: `1px solid ${palette.border}`,
        background: busy ? palette.busyBg : palette.bg,
        color: palette.fg,
        cursor: busy || disabledByOther ? 'not-allowed' : 'pointer',
        opacity: disabledByOther ? 0.45 : 1,
        borderRadius: 2,
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? '…' : label}
    </button>
  );
}

const BUTTON_PALETTE = {
  primary: { bg: '#0f62fe', busyBg: '#0043ce', fg: '#fff', border: '#0043ce' },
  danger: { bg: '#fff', busyBg: '#fff1f1', fg: '#a2191f', border: '#da1e28' },
  ghost: { bg: '#fff', busyBg: '#f4f4f4', fg: '#525252', border: '#c6c6c6' },
};

function RejectModal({ quoteLabel, currentStatus, reason, setReason, busy, onCancel, onConfirm }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(22,22,22,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          width: 480,
          maxWidth: '92vw',
          border: '1px solid #e0e0e0',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid #e0e0e0',
            fontSize: 14,
            fontWeight: 600,
            color: '#161616',
          }}
        >
          Reject quote — {quoteLabel}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: '#525252', marginBottom: 10 }}>
            Current status: <b>{currentStatus}</b>. Rejecting returns the quote to <b>rejected</b>;
            the cost engineer can edit and re-submit.
          </div>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#525252',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
            }}
          >
            Reason (required)
          </label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Margin below 25% target. Revisit tooling amortization."
            rows={4}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: 8,
              border: '1px solid #c6c6c6',
              fontFamily: 'inherit',
              fontSize: 12,
              resize: 'vertical',
              color: '#161616',
            }}
          />
          <div style={{ fontSize: 11, color: '#8d8d8d', marginTop: 4 }}>
            Saved with the approval history (max 50 entries). Tip: ⌘+Enter to submit.
          </div>
        </div>
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              fontSize: 12,
              padding: '6px 14px',
              border: '1px solid #c6c6c6',
              background: '#fff',
              color: '#525252',
              cursor: busy ? 'not-allowed' : 'pointer',
              borderRadius: 2,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !reason.trim()}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 14px',
              border: '1px solid #da1e28',
              background: busy ? '#f4f4f4' : reason.trim() ? '#da1e28' : '#fff',
              color: reason.trim() && !busy ? '#fff' : '#a2191f',
              cursor: busy || !reason.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 2,
            }}
          >
            {busy ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
