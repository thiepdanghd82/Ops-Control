/**
 * MES-1.6 — Per-WO audit timeline (read-only).
 *
 * Renders the WO_* events for one work order, newest-first, with a
 * collapsible JSON detail per row. Refetches when `refreshKey` changes
 * — the parent bumps it after release/cancel/op-add so the timeline
 * stays in sync without a full page reload.
 */
import { useCallback } from 'react';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useI18n } from '../../../utils/useI18n';
import { fetchAuditTimeline } from './api';

const EVENT_LABELS = {
  WO_CREATE: 'planning.workOrder.audit.event.WO_CREATE',
  WO_UPDATE: 'planning.workOrder.audit.event.WO_UPDATE',
  WO_RELEASE: 'planning.workOrder.audit.event.WO_RELEASE',
  WO_CANCEL: 'planning.workOrder.audit.event.WO_CANCEL',
  WO_OP_ADD: 'planning.workOrder.audit.event.WO_OP_ADD',
  OP_START: 'planning.workOrder.audit.event.OP_START',
  OP_START_RUN: 'planning.workOrder.audit.event.OP_START_RUN',
  OP_SCAN: 'planning.workOrder.audit.event.OP_SCAN',
  OP_PAUSE: 'planning.workOrder.audit.event.OP_PAUSE',
  OP_RESUME: 'planning.workOrder.audit.event.OP_RESUME',
  OP_COMPLETE: 'planning.workOrder.audit.event.OP_COMPLETE',
  OP_ACCEPT: 'planning.workOrder.audit.event.OP_ACCEPT',
};

function parseDetail(s) {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}

export default function AuditTimeline({ woId, refreshKey = 0 }) {
  const { t } = useI18n();
  // refreshKey is in the dep array specifically to bump fetcher identity
  // when the parent (WorkOrderDetail) calls setAuditKey(k => k+1) after a
  // mutation. Not read in the callback body — that's intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetcher = useCallback((signal) => fetchAuditTimeline(woId, signal), [woId, refreshKey]);
  const { data, initialLoading, error } = useAbortableFetch(fetcher, [woId, refreshKey]);

  // Skeleton only on INITIAL load. Mutation flow bumps refreshKey →
  // re-fetch; stale-while-revalidate keeps the existing timeline rows
  // visible until the new audit lands (no flash).
  if (initialLoading) {
    return <p className="wo-audit-loading">{t('planning.workOrder.audit.loading')}</p>;
  }
  if (error) {
    return (
      <div className="wo-error">
        {t('planning.workOrder.audit.load_failed')}: {error.message}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <p className="wo-audit-empty">{t('planning.workOrder.audit.empty')}</p>;
  }

  return (
    <ol className="wo-audit-timeline">
      {data.map((row, i) => {
        const detail = parseDetail(row.detail);
        const labelKey = EVENT_LABELS[row.event] || row.event;
        return (
          <li key={`${row.ts}-${i}`} className="wo-audit-entry">
            <div className="wo-audit-meta">
              <span className="wo-audit-ts">{row.ts}</span>
              <span className="wo-audit-event">{t(labelKey)}</span>
              <span className="wo-audit-actor">{row.user}</span>
            </div>
            <details className="wo-audit-detail">
              <summary>{t('planning.workOrder.audit.show_detail')}</summary>
              <pre className="wo-audit-json">{JSON.stringify(detail, null, 2)}</pre>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
