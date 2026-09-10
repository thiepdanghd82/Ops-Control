/**
 * ApprovalActionsCell — dropdown for the Quote Progress column.
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — rewrite from buttons to
 * a single <select> dropdown. The 5 quote-progress statuses are
 * listed; options the current user can't set are disabled with a
 * tooltip. Picking a status that requires a reason (cancelled /
 * rejected) opens an inline modal; the rest transition directly.
 *
 * All transitions go through `sharedApi.transitionApproval` (atomic
 * server endpoint). On success the parent re-fetches via the existing
 * `onAfterTransition` / `onOptimisticTransition` / `onTransitionRollback`
 * callbacks (kept unchanged for QuoteHistory.jsx wiring continuity).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sharedApi } from '../../services/api';
import { showToast } from '../../utils/toast';
import {
  APPROVAL_STATES,
  canUserSetStatus,
  getStatus,
  statusDisplay,
  statusRequiresReason,
} from '../../utils/approvalWorkflow';

export default function ApprovalActionsCell({
  quote,
  user,
  onAfterTransition,
  onOptimisticTransition,
  onTransitionRollback,
  allowedTargets,
}) {
  const approval = quote?.state?.approval || null;
  const currentStatus = getStatus(approval);
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState(null); // { targetStatus, reason }

  // Computed once per render — which of the 5 statuses can this user
  // pick, and what's the label/tone for each. The dropdown still shows
  // ALL options (so operators learn the full workflow vocabulary) but
  // disables the ones outside the user's auth. When `allowedTargets`
  // is provided (Pending Approvals inbox passes ['price_approved',
  // 'rejected']) the list is narrowed to that allowlist plus the
  // current status (kept so the <select> value mapping stays valid;
  // rendered disabled either way).
  const options = useMemo(() => {
    const allow = Array.isArray(allowedTargets) ? new Set(allowedTargets) : null;
    return APPROVAL_STATES.filter((s) => !allow || s === currentStatus || allow.has(s)).map(
      (s) => ({
        value: s,
        label: statusDisplay(s).label,
        enabled: canUserSetStatus(user, s),
        requiresReason: statusRequiresReason(s),
      })
    );
  }, [user, allowedTargets, currentStatus]);

  const runTransition = useCallback(
    async (targetStatus, reason) => {
      if (!quote?.id) {
        showToast('Missing quote id', 'err');
        return;
      }
      setBusy(true);
      onOptimisticTransition?.(quote.id, targetStatus);
      try {
        await sharedApi.transitionApproval(quote.id, targetStatus, reason);
        showToast(`Quote #${quote.id}: ${statusDisplay(targetStatus).label}`);
        window.dispatchEvent(new Event('ops-approvals-changed'));
        onAfterTransition?.(quote.id);
      } catch (err) {
        showToast(`Transition failed: ${err?.message || 'unknown'}`, 'err');
        onTransitionRollback?.(quote.id, err);
      } finally {
        setBusy(false);
      }
    },
    [quote?.id, onAfterTransition, onOptimisticTransition, onTransitionRollback]
  );

  const onSelectChange = useCallback(
    (e) => {
      const target = e.target.value;
      if (!target || target === currentStatus) return;
      const opt = options.find((o) => o.value === target);
      if (!opt || !opt.enabled) {
        // Belt-and-braces: the option should already be disabled in
        // the rendered DOM, but a script-driven change could still fire.
        e.target.value = currentStatus;
        return;
      }
      if (opt.requiresReason) {
        setReasonModal({ targetStatus: target, reason: '' });
        // Reset the <select> back to current so a Cancel on the modal
        // doesn't leave the dropdown stranded on the un-confirmed value.
        e.target.value = currentStatus;
      } else {
        runTransition(target);
      }
    },
    [currentStatus, options, runTransition]
  );

  const confirmReason = useCallback(async () => {
    if (!reasonModal) return;
    const trimmed = reasonModal.reason.trim();
    if (!trimmed) {
      showToast(`${statusDisplay(reasonModal.targetStatus).label} requires a reason.`, 'err');
      return;
    }
    await runTransition(reasonModal.targetStatus, trimmed);
    setReasonModal(null);
  }, [reasonModal, runTransition]);

  // No options enabled = no role to act = render nothing (parent shows
  // the read-only status badge via the separate `status` column).
  const anyEnabled = options.some((o) => o.enabled);
  if (!anyEnabled) return null;

  return (
    <>
      <select
        value={currentStatus}
        onChange={onSelectChange}
        disabled={busy}
        title={busy ? 'Saving…' : 'Change quote progress status'}
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '4px 6px',
          border: '1px solid #c6c6c6',
          background: busy ? '#f4f4f4' : '#fff',
          color: '#161616',
          cursor: busy ? 'wait' : 'pointer',
          borderRadius: 2,
          minWidth: 140,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={!o.enabled || o.value === currentStatus}>
            {o.label}
            {!o.enabled && o.value !== currentStatus ? ' — not authorized' : ''}
          </option>
        ))}
      </select>
      {reasonModal && (
        <ReasonModal
          quoteLabel={quote.state?.ccl_pn || quote.state?.rfq_number || `#${quote.id}`}
          fromStatus={currentStatus}
          targetStatus={reasonModal.targetStatus}
          reason={reasonModal.reason}
          setReason={(v) => setReasonModal((m) => ({ ...m, reason: v }))}
          busy={busy}
          onCancel={() => setReasonModal(null)}
          onConfirm={confirmReason}
        />
      )}
    </>
  );
}

function ReasonModal({
  quoteLabel,
  fromStatus,
  targetStatus,
  reason,
  setReason,
  busy,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  const targetLabel = statusDisplay(targetStatus).label;
  const fromLabel = statusDisplay(fromStatus).label;
  const verb = targetStatus === 'cancelled' ? 'Cancel' : 'Reject';

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
          {verb} quote — {quoteLabel}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: '#525252', marginBottom: 10 }}>
            Changing status from <b>{fromLabel}</b> to <b>{targetLabel}</b>. A reason is required
            for audit history.
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
            {busy ? `${verb}ing…` : verb}
          </button>
        </div>
      </div>
    </div>
  );
}
