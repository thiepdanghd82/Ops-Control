/**
 * MES-1.5 — Work Order operations sub-table (read-only).
 *
 * Sorted by `seq` ascending (server already orders).  Empty operations
 * array renders an inline note rather than the EmptyState card — the
 * operator already knows they're on a WO with no ops.
 */
import { useI18n } from '../../../utils/useI18n';

export default function WorkOrderOpsTable({ operations }) {
  const { t } = useI18n();
  if (!operations || operations.length === 0) {
    return <p className="wo-ops-empty">—</p>;
  }
  return (
    <table className="wo-ops-table">
      <thead>
        <tr>
          <th>{t('planning.workOrder.ops.col.seq')}</th>
          <th>{t('planning.workOrder.ops.col.op_type')}</th>
          <th>{t('planning.workOrder.ops.col.work_centre_no')}</th>
          <th>{t('planning.workOrder.ops.col.status')}</th>
          <th>{t('planning.workOrder.ops.col.planned_start')}</th>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
