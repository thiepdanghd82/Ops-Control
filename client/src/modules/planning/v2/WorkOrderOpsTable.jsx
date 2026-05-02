/**
 * MES-1.5 — Work Order operations sub-table.
 *
 * Sorted by `seq` ascending (server already orders).  Empty operations
 * array renders an inline note rather than the EmptyState card — the
 * operator already knows they're on a WO with no ops.
 *
 * Action column: planner can sign off a DONE op (DONE → ACCEPTED) via
 * the Accept button. Server endpoint requires role≥2 + Idempotency-Key
 * (handled inside `acceptOperation` from ./api). Successful accept
 * propagates the updated op to the parent through `onAccepted` so the
 * detail view re-renders without a full refetch and the audit timeline
 * picks up OP_ACCEPT on its next refresh-key bump.
 */
import { useState } from 'react';
import { useI18n } from '../../../utils/useI18n';
import { acceptOperation } from './api';

export default function WorkOrderOpsTable({ operations, onAccepted }) {
  const { t } = useI18n();
  const [busyOpId, setBusyOpId] = useState(null);
  const [error, setError] = useState(null);

  if (!operations || operations.length === 0) {
    return <p className="wo-ops-empty">—</p>;
  }

  async function handleAccept(op) {
    setBusyOpId(op.id);
    setError(null);
    try {
      const r = await acceptOperation(op.id);
      onAccepted?.(r.op);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyOpId(null);
    }
  }

  return (
    <>
      {error ? <div className="wo-error wo-ops-error">{error}</div> : null}
      <table className="wo-ops-table">
        <thead>
          <tr>
            <th>{t('planning.workOrder.ops.col.seq')}</th>
            <th>{t('planning.workOrder.ops.col.op_type')}</th>
            <th>{t('planning.workOrder.ops.col.work_centre_no')}</th>
            <th>{t('planning.workOrder.ops.col.status')}</th>
            <th>{t('planning.workOrder.ops.col.planned_start')}</th>
            <th>{t('planning.workOrder.ops.col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.id}>
              <td className="wo-td-num">{op.seq}</td>
              <td>{op.op_type}</td>
              <td>{op.work_centre_no}</td>
              <td>
                <span className="wo-status-pill wo-status-op">{op.status}</span>
              </td>
              <td>{op.planned_start || '—'}</td>
              <td>
                {op.status === 'DONE' ? (
                  <button
                    type="button"
                    className="op-btn op-btn-primary op-btn-sm"
                    disabled={busyOpId === op.id}
                    onClick={() => handleAccept(op)}
                    data-testid={`op-btn-accept-${op.id}`}
                  >
                    {busyOpId === op.id
                      ? t('planning.workOrder.ops.action.accept_busy')
                      : t('planning.workOrder.ops.action.accept')}
                  </button>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
