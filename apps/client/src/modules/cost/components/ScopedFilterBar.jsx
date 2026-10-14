import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../utils/useI18n';
import './ScopedFilterBar.css';

const SearchIcon = () => (
  <svg
    className="sc-filter-icon"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

function fmtDay(iso) {
  if (!iso) return '';
  // YYYY-MM-DD → DD/MM
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function startOfWeekIso() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // ISO week starts Mon
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function DateRangePicker({ filter, setField, clearField }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasRange = filter.dateFrom || filter.dateTo;
  const label = hasRange
    ? `${fmtDay(filter.dateFrom) || '…'} → ${fmtDay(filter.dateTo) || '…'}`
    : t('filter.date_range');

  function applyPreset(from, to) {
    setField('dateFrom', from);
    setField('dateTo', to);
  }

  return (
    <div className="sc-filter-date" ref={ref}>
      <button
        type="button"
        className={`sc-filter-date-trigger${hasRange ? ' sc-filter-date-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{label}</span>
        {hasRange && (
          <span
            className="sc-filter-clear"
            role="button"
            tabIndex={0}
            aria-label={t('filter.clear_date_aria')}
            onClick={(e) => {
              e.stopPropagation();
              clearField('dateFrom');
              clearField('dateTo');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                clearField('dateFrom');
                clearField('dateTo');
              }
            }}
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div className="sc-filter-date-pop" role="dialog">
          <div className="sc-filter-date-grid">
            <label>
              {t('filter.from')}
              <input
                type="date"
                value={filter.dateFrom || ''}
                onChange={(e) => setField('dateFrom', e.target.value || null)}
              />
            </label>
            <label>
              {t('filter.to')}
              <input
                type="date"
                value={filter.dateTo || ''}
                onChange={(e) => setField('dateTo', e.target.value || null)}
              />
            </label>
          </div>
          <div className="sc-filter-date-presets">
            <button type="button" onClick={() => applyPreset(todayIso(), todayIso())}>
              {t('filter.today')}
            </button>
            <button type="button" onClick={() => applyPreset(startOfWeekIso(), todayIso())}>
              {t('filter.this_week')}
            </button>
            <button type="button" onClick={() => applyPreset(startOfMonthIso(), todayIso())}>
              {t('filter.this_month')}
            </button>
            <button type="button" onClick={() => applyPreset(daysAgoIso(30), todayIso())}>
              {t('filter.last_30_days')}
            </button>
            <button
              type="button"
              className="sc-filter-date-preset-clear"
              onClick={() => {
                clearField('dateFrom');
                clearField('dateTo');
              }}
            >
              {t('filter.clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopedTextInput({ name, label, value, onChange, onClear }) {
  const { t } = useI18n();
  return (
    <label className={`sc-filter-text${value ? ' sc-filter-text-active' : ''}`}>
      <span className="sc-filter-text-label">{label}</span>
      <input
        type="text"
        value={value || ''}
        placeholder={label}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="sc-filter-clear"
          aria-label={t('filter.clear_field_aria', { label })}
          onClick={() => onClear(name)}
        >
          ×
        </button>
      )}
    </label>
  );
}

export default function ScopedFilterBar({
  filter,
  setField,
  clearField,
  clearAll,
  hasActiveFilter,
  resultCount,
  totalCount,
  globalPlaceholder,
  rightSlot = null,
}) {
  const { t } = useI18n();
  // globalPlaceholder is consumer-provided (Inbox / Summarize / QH each
  // pass their own scope-specific placeholder); fall back to a generic
  // translated default when omitted.
  const searchPlaceholder = globalPlaceholder ?? t('filter.search_placeholder');
  return (
    <div className="sc-filter-bar">
      <div className="sc-filter-row sc-filter-row-1">
        <div className="sc-filter-search-wrap">
          <SearchIcon />
          <input
            className="sc-filter-search"
            type="text"
            placeholder={searchPlaceholder}
            value={filter.query}
            onChange={(e) => setField('query', e.target.value)}
          />
          {filter.query && (
            <button
              type="button"
              className="sc-filter-clear sc-filter-clear-search"
              aria-label={t('filter.clear_search_aria')}
              onClick={() => clearField('query')}
            >
              ×
            </button>
          )}
        </div>
        {rightSlot ? <div className="sc-filter-right">{rightSlot}</div> : null}
      </div>
      <div className="sc-filter-row sc-filter-row-2">
        <DateRangePicker filter={filter} setField={setField} clearField={clearField} />
        <ScopedTextInput
          name="customer"
          label={t('filter.customer')}
          value={filter.customer}
          onChange={setField}
          onClear={clearField}
        />
        <ScopedTextInput
          name="part"
          label={t('filter.part')}
          value={filter.part}
          onChange={setField}
          onClear={clearField}
        />
        <ScopedTextInput
          name="sale"
          label={t('filter.sale')}
          value={filter.sale}
          onChange={setField}
          onClear={clearField}
        />
        {hasActiveFilter && (
          <button
            type="button"
            className="sc-filter-clear-all"
            onClick={clearAll}
            title={t('filter.clear_all_title')}
          >
            {t('filter.clear_all')}
          </button>
        )}
        <span className="sc-filter-count">
          {resultCount != null && totalCount != null
            ? t('filter.shown_of', { n: resultCount, m: totalCount })
            : ''}
        </span>
      </div>
    </div>
  );
}
