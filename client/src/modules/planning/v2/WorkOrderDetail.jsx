/**
 * MES-1.5 — Work Order detail page.
 * MES-1.6 — release / cancel buttons + modals + audit timeline.
 *
 * Action buttons are status-gated client-side; the server enforces the
 * same rules (PRD §8 state machine + AC-1.6.3/4). On a successful
 * mutation we update the in-memory `data` AND bump `auditRefreshKey` so
 * the timeline below refetches without a full page reload.
 */
import { useCallback, useState } from 'react';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useI18n } from '../../../utils/useI18n';
import WorkOrderOpsTable from './WorkOrderOpsTable';
import AuditTimeline from './AuditTimeline';
import ReleaseModal from './ReleaseModal';
import CancelModal from './CancelModal';
import { fetchWorkOrderDetail } from './api';

const CANCELLABLE = new Set(['CREATED', 'RELEASED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD']);

export default function WorkOrderDetail({ id, onBack }) {
  const { t } = useI18n();
  const fetcher = useCallback((signal) => fetchWorkOrderDetail(id, signal), [id]);
  const { data, setData, loading, error } = useAbortableFetch(fetcher, [id]);

  const [showRelease, setShowRelease] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [auditKey, setAuditKey] = useState(0);

  function handleMutationSuccess(updated) {
    // updated is the WO header shape from /release or /cancel; merge with
    // existing operations[] so the ops table doesn't blink.
    setData((prev) => ({ ...prev, ...updated, operations: prev?.operations || [] }));
    setShowRelease(false);
    setShowCancel(false);
    setAuditKey((k) => k + 1);
  }

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

  const opsCount = data.operations?.length ?? 0;
  const canRelease = data.status === 'CREATED';
  const canCancel = CANCELLABLE.has(data.status);
  const releaseDisabled = canRelease && opsCount < 1;

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
        <div className="wo-detail-actions">
          {canRelease ? (
            <button
              type="button"
              className="op-btn op-btn-primary"
              onClick={() => setShowRelease(true)}
              disabled={releaseDisabled}
              title={releaseDisabled ? t('planning.workOrder.release.needs_ops') : undefined}
            >
              {t('planning.workOrder.release.submit')}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="op-btn op-btn-ghost wo-btn-danger"
              onClick={() => setShowCancel(true)}
            >
              {t('planning.workOrder.cancel.submit')}
            </button>
          ) : null}
        </div>
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

      <section className="wo-detail-audit">
        <h3>{t('planning.workOrder.audit.heading')}</h3>
        <AuditTimeline woId={data.id} refreshKey={auditKey} />
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

      {showRelease ? (
        <ReleaseModal
          wo={data}
          onClose={() => setShowRelease(false)}
          onSuccess={handleMutationSuccess}
        />
      ) : null}
      {showCancel ? (
        <CancelModal
          wo={data}
          onClose={() => setShowCancel(false)}
          onSuccess={handleMutationSuccess}
        />
      ) : null}
    </div>
  );
}
