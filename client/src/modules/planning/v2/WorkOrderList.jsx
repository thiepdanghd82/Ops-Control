/**
 * MES-1.5 — Work Order list page (read-only).
 *
 * Filters bind to URL search params via `useUrlFilters`.  Data fetched
 * via the project's `useAbortableFetch` pattern (no SWR yet — see
 * useUrlFilters.js JSDoc for the router-migration TODO).
 */
import { useCallback, useState } from 'react';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useI18n } from '../../../utils/useI18n';
import WorkOrderTable from './WorkOrderTable';
import CreateWorkOrderModal from './CreateWorkOrderModal';
import { useUrlFilters } from './useUrlFilters';
import { fetchWorkOrderList } from './api';
import { WO_STATUSES } from './constants';

export default function WorkOrderList({ onSelect }) {
  const { t } = useI18n();
  const [filters, setFilter] = useUrlFilters();
  const [showCreate, setShowCreate] = useState(false);

  const fetcher = useCallback((signal) => fetchWorkOrderList(filters, signal), [filters]);
  const { data, loading, initialLoading, error, refresh } = useAbortableFetch(fetcher, [filters]);

  function handleCreated(wo) {
    setShowCreate(false);
    refresh();
    // Auto-navigate to the new WO so FR-12 happy path stays under 30s.
    onSelect(wo.id);
  }

  const total = data?.total ?? 0;
  const limit = filters.pageSize;
  const offset = (filters.page - 1) * limit;
  const showFrom = total === 0 ? 0 : offset + 1;
  const showTo = Math.min(total, offset + (data?.items?.length || 0));
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="wo-list">
      <div className="wo-toolbar">
        <button
          type="button"
          className="op-btn op-btn-primary wo-create-cta"
          onClick={() => setShowCreate(true)}
        >
          + {t('planning.workOrder.create_cta')}
        </button>
        <select
          className="wo-filter-select"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label={t('planning.workOrder.filter.status')}
        >
          <option value="">{t('planning.workOrder.filter.all_statuses')}</option>
          {WO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`planning.workOrder.status.${s}`)}
            </option>
          ))}
        </select>
        <input
          className="wo-filter-q"
          type="search"
          placeholder={t('planning.workOrder.filter.q')}
          value={filters.q}
          onChange={(e) => setFilter('q', e.target.value)}
        />
        <input
          className="wo-filter-date"
          type="date"
          value={filters.from}
          onChange={(e) => setFilter('from', e.target.value)}
          aria-label={t('planning.workOrder.filter.from')}
        />
        <input
          className="wo-filter-date"
          type="date"
          value={filters.to}
          onChange={(e) => setFilter('to', e.target.value)}
          aria-label={t('planning.workOrder.filter.to')}
        />
      </div>

      <WorkOrderTable
        items={data?.items}
        loading={initialLoading}
        error={error}
        onSelect={onSelect}
      />

      <div className="wo-pagination">
        <span className="wo-pagination-summary">
          {t('planning.workOrder.pagination.showing', { from: showFrom, to: showTo, total })}
        </span>
        <div className="wo-pagination-controls">
          <button
            type="button"
            className="op-btn op-btn-ghost"
            onClick={() => setFilter('page', Math.max(1, filters.page - 1))}
            disabled={filters.page <= 1 || loading}
          >
            {t('planning.workOrder.pagination.prev')}
          </button>
          <span className="wo-pagination-page">
            {filters.page} / {totalPages}
          </span>
          <button
            type="button"
            className="op-btn op-btn-ghost"
            onClick={() => setFilter('page', Math.min(totalPages, filters.page + 1))}
            disabled={filters.page >= totalPages || loading}
          >
            {t('planning.workOrder.pagination.next')}
          </button>
          <label className="wo-pagination-size">
            {t('planning.workOrder.pagination.page_size')}:&nbsp;
            <select
              value={filters.pageSize}
              onChange={(e) => setFilter('pageSize', parseInt(e.target.value, 10))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      </div>

      {showCreate ? (
        <CreateWorkOrderModal onClose={() => setShowCreate(false)} onSuccess={handleCreated} />
      ) : null}
    </div>
  );
}
