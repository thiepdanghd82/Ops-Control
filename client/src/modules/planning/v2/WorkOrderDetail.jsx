/**
 * MES-1.5 — Work Order detail page (read-only).
 *
 * Header card + operations sub-table + footer audit fields. No action
 * buttons in this sprint; release/cancel modals land in MES-1.6.
 */
import { useCallback } from 'react';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useI18n } from '../../../utils/useI18n';
import WorkOrderOpsTable from './WorkOrderOpsTable';
import { fetchWorkOrderDetail } from './api';

export default function WorkOrderDetail({ id, onBack }) {
  const { t } = useI18n();
  const fetcher = useCallback((signal) => fetchWorkOrderDetail(id, signal), [id]);
  const { data, loading, error } = useAbortableFetch(fetcher, [id]);

  if (loading) {
    return (
      <div className="wo-detail">
        <button type="button" className="op-btn op-btn-ghost wo-back" onClick={onBack}>
          {t('planning.workOrder.detail.back_to_list')}
        </button>
        <p className="wo-detail-loading">…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="wo-detail">
        <button type="button" className="op-btn op-btn-ghost wo-back" onClick={onBack}>
          {t('planning.workOrder.detail.back_to_list')}
        </button>
        <div className="wo-error">
          {error?.status === 404
            ? t('planning.workOrder.detail.not_found')
            : t('planning.workOrder.error.detail_failed')}
          {error?.message && error.status !== 404 ? `: ${error.message}` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="wo-detail">
      <button type="button" className="op-btn op-btn-ghost wo-back" onClick={onBack}>
        {t('planning.workOrder.detail.back_to_list')}
      </button>

      <header className="wo-detail-header">
        <h2 className="wo-detail-code">{data.code}</h2>
        <span className={`wo-status-pill wo-status-${data.status}`}>
          {t(`planning.workOrder.status.${data.status}`)}
        </span>
      </header>

      <dl className="wo-detail-grid">
        <dt>{t('planning.workOrder.col.customer')}</dt>
        <dd>{data.customer}</dd>
        <dt>{t('planning.workOrder.col.ccl_pn')}</dt>
        <dd>{data.ccl_pn}</dd>
        <dt>{t('planning.workOrder.col.qty_planned')}</dt>
        <dd>
          {data.qty_planned} {data.uom}
        </dd>
        <dt>{t('planning.workOrder.col.due_date')}</dt>
        <dd>{data.due_date}</dd>
      </dl>

      <section className="wo-detail-ops">
        <h3>{t('planning.workOrder.detail.operations')}</h3>
        <WorkOrderOpsTable operations={data.operations} />
      </section>

      <footer className="wo-detail-footer">
        <span>
          {t('planning.workOrder.detail.created_by')}: {data.created_by}
        </span>
        <span>
          {t('planning.workOrder.detail.created_at')}: {data.created_at}
        </span>
        {data.released_at ? (
          <span>
            {t('planning.workOrder.detail.released_at')}: {data.released_at}
          </span>
        ) : null}
        {data.closed_at ? (
          <span>
            {t('planning.workOrder.detail.closed_at')}: {data.closed_at}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
