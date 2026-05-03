/**
 * MES-1.5 — Work Order detail page.
 * MES-1.6 — release / cancel buttons + modals + audit timeline.
 *
 * Action buttons are status-gated client-side; the server enforces the
 * same rules (PRD §8 state machine + AC-1.6.3/4). On a successful
 * mutation we update the in-memory `data` AND bump `auditRefreshKey` so
 * the timeline below refetches without a full page reload.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useI18n } from '../../../utils/useI18n';
import { sharedApi } from '../../../services/api';
import { getField, getNumField } from '../../../utils/fieldMap';
import { computeOpHours } from '../../../utils/routingHours';
import { err as logErr } from '../../../utils/logger';
import WorkOrderOpsTable from './WorkOrderOpsTable';
import AuditTimeline from './AuditTimeline';
import ReleaseModal from './ReleaseModal';
import CancelModal from './CancelModal';
import AddOperationModal from './AddOperationModal';
import { fetchWorkOrderDetail } from './api';

// PP-07: lazy so the print stylesheet + sharedApi BOM/routing fetch
// only land when an operator actually opens the printable view.
const WorkOrderPrintable = lazy(() => import('./WorkOrderPrintable'));

const CANCELLABLE = new Set(['CREATED', 'RELEASED', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD']);
const TERMINAL = new Set(['COMPLETED', 'QC_RELEASED', 'CLOSED', 'CANCELLED']);

// PP-09 helper at module scope — pure function, no hooks, no closure.
function computeSummary(routing, qtyPlanned) {
  if (!routing || routing.length === 0 || !qtyPlanned) return null;
  const totalHrs = routing.reduce((s, op) => {
    const { totalHrs: hrs } = computeOpHours({
      setupTime: getNumField(op, 'setupTime'),
      runFactor: getNumField(op, 'runFactor'),
      factorUnit: getField(op, 'factorUnit'),
      quantity: qtyPlanned,
    });
    return s + hrs;
  }, 0);
  return { totalHrs, shifts: Math.ceil(totalHrs / 8) };
}

export default function WorkOrderDetail({ id, onBack }) {
  const { t } = useI18n();
  const fetcher = useCallback((signal) => fetchWorkOrderDetail(id, signal), [id]);
  const { data, setData, loading, error, refresh } = useAbortableFetch(fetcher, [id]);

  const [showRelease, setShowRelease] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showAddOp, setShowAddOp] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [auditKey, setAuditKey] = useState(0);
  // PP-09: routing rows for production-summary banner. Lazy-fetch once
  // ccl_pn is known; ignore failures (banner just hides). Same data the
  // printable view fetches — small duplication is fine since both are
  // already cached by sharedApi.
  const [routing, setRouting] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!data?.ccl_pn) return undefined;
    (async () => {
      try {
        const rows = await sharedApi.getRouting();
        if (cancelled) return;
        // String-coerce both sides — IFS Part No is a number for purely
        // numeric PNs (e.g. 80644500); data.ccl_pn is always a string.
        const targetPn = String(data.ccl_pn);
        setRouting((rows || []).filter((r) => String(getField(r, 'partNo')) === targetPn));
      } catch (e) {
        if (!cancelled) {
          logErr('WorkOrderDetail routing fetch failed', e);
          setRouting([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.ccl_pn]);

  // Production summary derived from routing standard times. Inline
  // (not useMemo) — calc is tiny, routing fetch is cached upstream by
  // sharedApi, so re-running on every WO detail render is cheap.
  const summary = computeSummary(routing, data?.qty_planned);

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
  const canAddOp = !TERMINAL.has(data.status);
  const releaseDisabled = canRelease && opsCount < 1;

  function handleOpAdded() {
    setShowAddOp(false);
    refresh();
    setAuditKey((k) => k + 1);
  }

  function handleOpAccepted(updatedOp) {
    // Merge over the existing op rather than replacing — /accept's
    // serializeOp omits fields like planned_start that the detail row
    // depends on. Spread order keeps server's authoritative status fresh.
    setData((prev) => {
      if (!prev) return prev;
      const next = (prev.operations || []).map((o) =>
        o.id === updatedOp.id ? { ...o, ...updatedOp } : o
      );
      return { ...prev, operations: next };
    });
    setAuditKey((k) => k + 1);
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
        <div className="wo-detail-actions">
          <button type="button" className="op-btn op-btn-ghost" onClick={() => setShowPrint(true)}>
            {t('planning.workOrder.print.open')}
          </button>
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
        <div className="wo-section-header">
          <h3>{t('planning.workOrder.detail.operations')}</h3>
          {canAddOp ? (
            <button
              type="button"
              className="op-btn op-btn-secondary"
              onClick={() => setShowAddOp(true)}
            >
              + {t('planning.workOrder.addOp.submit')}
            </button>
          ) : null}
        </div>
        {summary ? (
          <div className="wo-detail-summary" role="note">
            <strong>{t('planning.workOrder.print.summary')}:</strong> {summary.totalHrs.toFixed(2)}{' '}
            {t('planning.workOrder.print.hrs')} ≈ {summary.shifts}{' '}
            {t('planning.workOrder.print.shifts')} @ 8 {t('planning.workOrder.print.hrs')}/
            {t('planning.workOrder.print.shift')} | {t('planning.workOrder.col.qty_planned')}:{' '}
            {data.qty_planned?.toLocaleString()} {data.uom}
          </div>
        ) : null}
        <WorkOrderOpsTable operations={data.operations} onAccepted={handleOpAccepted} />
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
      {showAddOp ? (
        <AddOperationModal
          wo={data}
          onClose={() => setShowAddOp(false)}
          onSuccess={handleOpAdded}
        />
      ) : null}
      {showPrint ? (
        <Suspense fallback={null}>
          <WorkOrderPrintable wo={data} onClose={() => setShowPrint(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
