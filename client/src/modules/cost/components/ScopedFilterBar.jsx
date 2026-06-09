import { useEffect, useRef, useState } from 'react';
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
    : 'Date range';

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
            aria-label="Clear date range"
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
              From
              <input
                type="date"
                value={filter.dateFrom || ''}
                onChange={(e) => setField('dateFrom', e.target.value || null)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filter.dateTo || ''}
                onChange={(e) => setField('dateTo', e.target.value || null)}
              />
            </label>
          </div>
          <div className="sc-filter-date-presets">
            <button type="button" onClick={() => applyPreset(todayIso(), todayIso())}>
              Today
            </button>
            <button type="button" onClick={() => applyPreset(startOfWeekIso(), todayIso())}>
              This week
            </button>
            <button type="button" onClick={() => applyPreset(startOfMonthIso(), todayIso())}>
              This month
            </button>
            <button type="button" onClick={() => applyPreset(daysAgoIso(30), todayIso())}>
              Last 30 days
            </button>
            <button
              type="button"
              className="sc-filter-date-preset-clear"
              onClick={() => {
                clearField('dateFrom');
                clearField('dateTo');
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopedTextInput({ name, label, value, onChange, onClear }) {
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
          aria-label={`Clear ${label}`}
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
  globalPlaceholder = 'Search…',
  rightSlot = null,
}) {
  return (
    <div className="sc-filter-bar">
      <div className="sc-filter-row sc-filter-row-1">
        <div className="sc-filter-search-wrap">
          <SearchIcon />
          <input
            className="sc-filter-search"
            type="text"
            placeholder={globalPlaceholder}
            value={filter.query}
            onChange={(e) => setField('query', e.target.value)}
          />
          {filter.query && (
            <button
              type="button"
              className="sc-filter-clear sc-filter-clear-search"
              aria-label="Clear search"
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
          label="Customer"
          value={filter.customer}
          onChange={setField}
          onClear={clearField}
        />
        <ScopedTextInput
          name="part"
          label="Part"
          value={filter.part}
          onChange={setField}
          onClear={clearField}
        />
        <ScopedTextInput
          name="sale"
          label="Sale"
          value={filter.sale}
          onChange={setField}
          onClear={clearField}
        />
        {hasActiveFilter && (
          <button
            type="button"
            className="sc-filter-clear-all"
            onClick={clearAll}
            title="Clear all filters"
          >
            ↻ Clear all
          </button>
        )}
        <span className="sc-filter-count">
          {resultCount != null && totalCount != null
            ? `${resultCount} of ${totalCount} shown`
            : ''}
        </span>
      </div>
    </div>
  );
}
