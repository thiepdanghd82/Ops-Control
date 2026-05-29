/**
 * ApprovalHistoryModal — read-only timeline of a quote's approval
 * transitions. Reads from `approval.history` (populated by the state
 * machine, capped at 50 entries). Sprint 6.3, migrated to the shared
 * Modal primitive in the 2026-04-24 modal-design refresh.
 */
import { statusDisplay } from '../../utils/approvalWorkflow';
import Modal from './Modal';
import './ApprovalHistoryModal.css';

function fmtTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ApprovalHistoryModal({ open, onClose, approval, quoteLabel }) {
  if (!open) return null;

  const history = Array.isArray(approval?.history) ? approval.history : [];
  const currentStatus = statusDisplay(approval?.status);

  return (
    <Modal open={open} onClose={onClose} size="md" ariaLabelledBy="approval-hist-title">
      <Modal.Header
        id="approval-hist-title"
        title="Approval History"
        subtitle={quoteLabel || undefined}
      >
        <span className={`status-badge status-${currentStatus.tone || 'neutral'}`}>
          {currentStatus.label.toUpperCase()}
        </span>
      </Modal.Header>

      <Modal.Body className="flush">
        {history.length === 0 ? (
          <div className="appr-hist-empty">No transitions recorded yet.</div>
        ) : (
          <ol className="appr-hist-list">
            {history.map((h, i) => (
              <li
                key={h.ts ? `${h.ts}-${h.action || ''}-${i}` : `hi-${i}`}
                className="appr-hist-row"
              >
                <time className="appr-hist-ts">{fmtTs(h.ts)}</time>
                <span className="appr-hist-action">{h.action}</span>
                <div className="appr-hist-body">
                  <div className="appr-hist-transition">
                    <span className="appr-hist-from">{h.from}</span>
                    <span className="appr-hist-arrow" aria-hidden>
                      →
                    </span>
                    <span className="appr-hist-to">{h.to}</span>
                    <span className="appr-hist-actor">by {h.actor || '—'}</span>
                  </div>
                  {h.reason && <div className="appr-hist-reason">&ldquo;{h.reason}&rdquo;</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal.Body>

      {(approval?.submitted_by ||
        approval?.sales_approved_by ||
        approval?.finance_approved_by ||
        approval?.rejected_by) && (
        <Modal.Footer align="start">
          <div className="appr-hist-footer-meta">
            {approval?.submitted_by && (
              <span>
                Submitted by <b>{approval.submitted_by}</b>
              </span>
            )}
            {approval?.sales_approved_by && (
              <span>
                Sales ✓ by <b>{approval.sales_approved_by}</b>
              </span>
            )}
            {approval?.finance_approved_by && (
              <span>
                Finance ✓ by <b>{approval.finance_approved_by}</b>
              </span>
            )}
            {approval?.rejected_by && (
              <span>
                Rejected by <b>{approval.rejected_by}</b>
              </span>
            )}
          </div>
        </Modal.Footer>
      )}
    </Modal>
  );
}
