/**
 * MES-1.5 — Work Order list-table component (read-only).
 *
 * Plain `<table>` rendering. Click-row → `onSelect(woId)`. Skeleton
 * fallback while loading. Empty / error states surface inline.
 */
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import EmptyState from '../../../components/Shared/EmptyState';
import { useI18n } from '../../../utils/useI18n';

const COLUMNS = [
  { key: 'code', labelKey: 'planning.workOrder.col.code' },
  { key: 'customer', labelKey: 'planning.workOrder.col.customer' },
  { key: 'ccl_pn', labelKey: 'planning.workOrder.col.ccl_pn' },
  { key: 'qty_planned', labelKey: 'planning.workOrder.col.qty_planned' },
  { key: 'due_date', labelKey: 'planning.workOrder.col.due_date' },
  { key: 'status', labelKey: 'planning.workOrder.col.status' },
  { key: 'operations_count', labelKey: 'planning.workOrder.col.ops_count' },
];

export default function WorkOrderTable({ items, loading, error, onSelect }) {
  const { t } = useI18n();

  if (loading) return <SkeletonTable rows={6} cols={COLUMNS.length} />;
  if (error) {
    return (
      <div className="wo-error">
        {t('planning.workOrder.error.load_failed')}: {error.message}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <EmptyState
        title={t('planning.workOrder.empty')}
        cta={
          <button type="button" className="op-btn" disabled>
            {t('planning.workOrder.create_cta')}
          </button>
        }
      />
    );
  }

  return (
    <table className="wo-table">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} className={`wo-th wo-th-${c.key}`}>
              {t(c.labelKey)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr
            key={row.id}
            className="wo-table-row"
            tabIndex={0}
            onClick={() => onSelect(row.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(row.id);
              }
            }}
          >
            <td className="wo-td wo-td-code">{row.code}</td>
            <td className="wo-td">{row.customer}</td>
            <td className="wo-td">{row.ccl_pn}</td>
            <td className="wo-td wo-td-num">{row.qty_planned}</td>
            <td className="wo-td">{row.due_date}</td>
            <td className="wo-td">
              <span className={`wo-status-pill wo-status-${row.status}`}>
                {t(`planning.workOrder.status.${row.status}`)}
              </span>
            </td>
            <td className="wo-td wo-td-num">{row.operations_count ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
