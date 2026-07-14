/**
 * RFQ Tracking — spreadsheet-style master list of RFQs.
 *
 * A paginated, inline-editable table of all 29 "RFQ Master" columns with
 * tolerant xlsx import (Import Wizard, datasetKey "rfq-tracking") and a
 * double-click draggable showcard for focused full-row editing. Mirrors the
 * Material Cost NPI data-tab architecture (MaterialLibrary.jsx).
 *
 * DISTINCT from the kanban `rfq-tracker` tab (RFQTracker.jsx, TRACKING
 * section) — different feature, different id, different data file
 * (Library/RFQTracking/rfq_tracking.json).
 *
 * Persistence: costApi.getRfqTracking() / costApi.saveRfqTracking(rows) →
 * GET/POST /api/rfq-tracking (bulk load + save-all with auto-backup).
 *
 * Inline cells are UNCONTROLLED (defaultValue + commit on blur) so typing in
 * a 29-col × 200-row grid stays smooth; a `rev` counter remounts inputs after
 * any non-inline mutation (showcard save / add / import / load) so they pick
 * up fresh values. GM / VA / Contr are stored as fractions but edited as % .
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { costApi, sharedApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import Modal from '../../../components/Shared/Modal';
import ImportWizard from '../../../components/Shared/ImportWizard';
import DecimalInput from '../../../utils/DecimalInput';
import { showToast } from '../../../utils/toast';
import {
  buildView,
  cycleSort,
  distinctValues,
  assignRids,
  applyEditByRid,
  deleteByRid,
  replaceByRid,
  stripRids,
  anyFilterActive,
  isPctBad,
  rowNeedsReason,
  rowsNeedingReason,
} from './rfqTableView';
import './RfqTracking.css';

const PER_PAGE = 200;
const DATASET_KEY = 'rfq-tracking';

// Column model — drives BOTH the grid and the grouped showcard.
// type: 'text' | 'num' | 'date' | 'pct' (pct = stored fraction, edited as %).
const COLUMNS = [
  { key: 'rfq_no', group: 'identity', type: 'text', required: true },
  { key: 'qtn', group: 'identity', type: 'text' },
  { key: 'customer', group: 'identity', type: 'text' },
  { key: 'end_customer', group: 'identity', type: 'text' },
  { key: 'part_no', group: 'identity', type: 'text' },
  { key: 'description', group: 'identity', type: 'text' },
  { key: 'main_material', group: 'materials', type: 'text' },
  { key: 'design_process', group: 'materials', type: 'text' },
  { key: 'print_type', group: 'materials', type: 'text' },
  { key: 'silkscreen', group: 'materials', type: 'text' },
  { key: 'moq', group: 'materials', type: 'num' },
  { key: 'rfq_date', group: 'dates', type: 'date' },
  { key: 'target_date', group: 'dates', type: 'date' },
  { key: 'actual_quote_date', group: 'dates', type: 'date' },
  { key: 'days_in_process', group: 'dates', type: 'num' },
  { key: 'month', group: 'dates', type: 'text' },
  { key: 'npi_stage', group: 'dates', type: 'text' },
  { key: 'npi_pic', group: 'dates', type: 'text' },
  { key: 'control_flag', group: 'dates', type: 'text' },
  { key: 'ccl_price', group: 'pricing', type: 'num' },
  { key: 'target_price', group: 'pricing', type: 'num' },
  { key: 'va', group: 'pricing', type: 'pct' },
  { key: 'contr', group: 'pricing', type: 'pct' },
  { key: 'gm', group: 'pricing', type: 'pct' },
  { key: 'eau', group: 'pricing', type: 'num' },
  { key: 'est_revenue', group: 'pricing', type: 'num' },
  { key: 'sales_pic', group: 'sales', type: 'text' },
  { key: 'sale_stage', group: 'sales', type: 'text' },
  { key: 'notes', group: 'sales', type: 'text' },
];

const GROUPS = ['identity', 'materials', 'dates', 'pricing', 'sales'];
const SEARCH_KEYS = ['rfq_no', 'customer', 'part_no', 'description', 'end_customer'];

// Margin red-flag thresholds (stored FRACTIONS). A cell turns red when its
// value is below the threshold: GM < 0%, Contr < 25%, VA < 30%.
const PCT_MIN = { gm: 0, contr: 0.25, va: 0.3 };

// Numeric-display refinements. THOUSANDS: show a thousands separator (MOQ,
// EAU). INT: round to a whole number (Est. Revenue). Storage keeps the exact
// value — only the shown text changes.
const THOUSANDS_COLS = new Set(['moq', 'eau']);
const INT_COLS = new Set(['est_revenue']);

// Fixed-choice dropdown columns with an "Other → manual text" escape. Storing
// a value not in the preset list means "Other" (custom free text).
const OTHER = '__other__';
const CHOICES = {
  sale_stage: ['Approved', 'Rejected', 'Cancel'],
  sales_pic: ['Anna', 'Dora', 'Vân', 'Helen', 'Anfernee'],
};

const COLUMNS_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
// Low-cardinality text columns get an enum multi-select filter (distinct
// values present); everything else text gets a "contains" input.
const ENUM_COLS = new Set([
  'month',
  'npi_stage',
  'npi_pic',
  'control_flag',
  'design_process',
  'sale_stage',
  'sales_pic',
]);
// Sort + filter state persists here (display-only) so it survives this lazy
// tab unmounting on switch (Lesson 18). NEVER sent to the server / quote.
const VIEW_STORE = 'ops-rfq-tracking-view';

function loadViewState() {
  try {
    const raw = sessionStorage.getItem(VIEW_STORE);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}
function saveViewState(state) {
  try {
    sessionStorage.setItem(VIEW_STORE, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

// ── value helpers ─────────────────────────────────────────────────
// Percent DISPLAY is rounded to a whole number (-0.4991 → "-50", 0.28223 →
// "28"). The stored fraction keeps full precision — only the shown value
// rounds; the inline blur no-ops when the rounded text is unchanged so a mere
// focus+blur never clobbers the exact fraction.
function fracToPctStr(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100)); // whole-percent, no decimals
}
function pctStrToFrac(s) {
  const t = String(s ?? '').trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return '';
  return n / 100;
}
function numOrEmpty(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/,/g, ''); // tolerate a pasted "1,000"
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
}
// 250000 → "250,000" (thousands separator, no decimals).
function fmtThousands(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
// 123456.78 → "123457" (rounded whole number, no decimals).
function fmtInt(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n));
}
// dd/MM/yyyy from an ISO (YYYY-MM-DD…) date; '—' otherwise.
function fmtDate(v) {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ── Import button (local — mirrors MaterialLibrary's ImportFileButton) ──
function ImportFileButton({ onDone, disabled }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleCommitted(stats) {
    setMsg(
      t('rfq_tracking.import_done', {
        rows: stats?.rowsImported ?? '?',
        total: stats?.totalAfter ?? '?',
      })
    );
    await sharedApi.refreshCache().catch(() => {});
    await onDone?.();
    setTimeout(() => setMsg(''), 4500);
  }

  return (
    <>
      <button
        type="button"
        className="rt-btn rt-btn-import"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        ⬆ {t('rfq_tracking.import')}
      </button>
      {msg && <span className="rt-import-msg">{msg}</span>}
      <ImportWizard
        open={open}
        onClose={() => setOpen(false)}
        datasetKey={DATASET_KEY}
        datasetLabel="RFQ Tracking"
        onCommitted={handleCommitted}
      />
    </>
  );
}

// ── Main tab ──────────────────────────────────────────────────────
export default function RfqTracking() {
  const { hasRole } = useAuth();
  const { t } = useI18n();
  const isViewOnly = !hasRole('user');
  const canImport = hasRole('admin');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editRid, setEditRid] = useState(null);
  const [reasonPrompt, setReasonPrompt] = useState(false); // opened to force a reason
  const [rev, setRev] = useState(0); // bump → remount inline inputs

  // Open the showcard for normal editing (not a reason prompt).
  const openCard = (rid) => {
    setReasonPrompt(false);
    setEditRid(rid);
  };
  const closeCard = () => {
    setReasonPrompt(false);
    setEditRid(null);
  };
  const searchRef = useRef(null);
  const ridSeq = useRef(0); // monotonic id source for newly-added rows

  // Sort + filter view state (display-only; persisted to sessionStorage).
  const persisted = useRef(loadViewState()).current;
  const [sort, setSort] = useState(persisted?.sort ?? null);
  const [filters, setFilters] = useState(persisted?.filters ?? {});
  const [showFilters, setShowFilters] = useState(persisted?.showFilters ?? false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    saveViewState({ sort, filters, showFilters });
  }, [sort, filters, showFilters]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await costApi.getRfqTracking();
      const withRids = assignRids(Array.isArray(data) ? data : []);
      ridSeq.current = withRids.length; // next add won't collide with r0..r{n-1}
      setRows(withRids);
      setDirty(false);
      setRev((r) => r + 1);
    } catch (err) {
      console.error('Failed to load RFQ Tracking:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    // Rejected / Cancel rows must carry a Notes/Reason. Block the save and
    // pop the showcard open on the first offender so the operator fills it.
    const missing = rowsNeedingReason(rows);
    if (missing.length) {
      setReasonPrompt(true); // pre-highlight + jump to Notes/Reason on open
      setEditRid(missing[0]._rid);
      showToast(t('rfq_tracking.reason_required_toast', { n: missing.length }), 'err');
      return;
    }
    setSaving(true);
    try {
      await costApi.saveRfqTracking(stripRids(rows)); // never persist _rid
      setDirty(false);
    } catch (e) {
      alert('Save failed: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Edit by STABLE _rid — sort/filter reorder the visible rows, so the
  // paginated display index is NOT safe to edit by (would hit the wrong row).
  function commitCell(rid, key, value) {
    setRows((prev) => {
      const cur = prev.find((r) => r._rid === rid);
      if (!cur || String(cur[key] ?? '') === String(value)) return prev; // no-op
      return applyEditByRid(prev, rid, key, value);
    });
    setDirty(true);
  }

  function handleAdd() {
    const rid = `r${ridSeq.current++}`;
    setRows((prev) => [...prev, { _rid: rid }]);
    setDirty(true);
    setRev((r) => r + 1);
    openCard(rid); // open the showcard to fill it (works under any filter)
  }

  function handleShowcardSave(rid, row) {
    setRows((prev) => replaceByRid(prev, rid, row));
    setDirty(true);
    setRev((r) => r + 1);
    closeCard();
  }

  function handleDelete(rid) {
    if (!confirm(t('rfq_tracking.delete_confirm'))) return;
    setRows((prev) => deleteByRid(prev, rid));
    setDirty(true);
    setRev((r) => r + 1);
    closeCard();
  }

  // Header click → tri-state sort; reset to page 1.
  function onSortClick(key) {
    setSort(cycleSort(sort, key));
    setPage(0);
  }
  // Per-column filter setter (empty value → remove the filter); reset page.
  function setColFilter(key, value) {
    setFilters((prev) => {
      const next = { ...prev };
      const empty =
        value == null ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'string' && value === '') ||
        (typeof value === 'object' &&
          !Array.isArray(value) &&
          Object.values(value).every((x) => String(x ?? '').trim() === ''));
      if (empty) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(0);
  }
  function clearFilters() {
    setFilters({});
    setPage(0);
  }

  // Distinct enum options per low-cardinality column (recomputed on data change).
  const enumOptions = useMemo(() => {
    const m = {};
    for (const k of ENUM_COLS) m[k] = distinctValues(rows, k);
    return m;
  }, [rows]);

  // Pipeline: global search → per-column filters → sort → (paginate below).
  const view = useMemo(
    () =>
      buildView(rows, {
        search,
        searchKeys: SEARCH_KEYS,
        filters,
        sort,
        columnsByKey: COLUMNS_BY_KEY,
      }),
    [rows, search, filters, sort]
  );
  const filtersOn = anyFilterActive(filters);

  const totalPages = Math.max(1, Math.ceil(view.length / PER_PAGE));
  const effectivePage = Math.min(page, totalPages - 1);
  const paged = view.slice(effectivePage * PER_PAGE, (effectivePage + 1) * PER_PAGE);
  const editRow = editRid != null ? rows.find((r) => r._rid === editRid) : null;
  const editIdx = editRid != null ? rows.findIndex((r) => r._rid === editRid) : -1;

  if (loading) {
    return (
      <div className="rt-wrap">
        <SkeletonTable rows={10} cols={10} />
      </div>
    );
  }

  const renderFilter = (c) => {
    const fv = filters[c.key];
    if (c.type === 'num' || c.type === 'pct') {
      return (
        <RangeFilter value={fv} pct={c.type === 'pct'} onChange={(v) => setColFilter(c.key, v)} />
      );
    }
    if (c.type === 'date') {
      return <DateRangeFilter value={fv} onChange={(v) => setColFilter(c.key, v)} />;
    }
    if (ENUM_COLS.has(c.key)) {
      return (
        <EnumFilter
          options={enumOptions[c.key] || []}
          value={fv || []}
          onChange={(v) => setColFilter(c.key, v)}
        />
      );
    }
    return (
      <input
        type="text"
        className="rt-fcell"
        placeholder={t('rfq_tracking.filter.contains')}
        value={fv || ''}
        onChange={(e) => setColFilter(c.key, e.target.value)}
      />
    );
  };

  return (
    <div className="rt-wrap">
      <div className="rt-headbar">
        <div className="rt-hb-left">
          <h2 className="rt-title">{t('rfq_tracking.title')}</h2>
          <span className="rt-count">
            {t('rfq_tracking.row_count', { shown: view.length, total: rows.length })}
          </span>
        </div>
        <div className="rt-hb-right">
          <input
            ref={searchRef}
            type="text"
            className="rt-search"
            placeholder={t('rfq_tracking.search_placeholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <button
            type="button"
            className={`rt-btn ${showFilters ? 'rt-btn-on' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            aria-pressed={showFilters}
          >
            ⚟ {t('rfq_tracking.filters')}
            {filtersOn ? ' •' : ''}
          </button>
          {filtersOn && (
            <button type="button" className="rt-btn" onClick={clearFilters}>
              {t('rfq_tracking.clear_filters')}
            </button>
          )}
          {!isViewOnly && (
            <button type="button" className="rt-btn" onClick={handleAdd}>
              + {t('rfq_tracking.add_row')}
            </button>
          )}
          {canImport && <ImportFileButton onDone={loadData} disabled={saving} />}
          {!isViewOnly && (
            <button
              type="button"
              className="rt-btn rt-btn-primary"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? t('rfq_tracking.saving') : t('rfq_tracking.save')}
              {isDirty && !saving ? ' •' : ''}
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t('rfq_tracking.empty_title')}
          hint={canImport ? t('rfq_tracking.empty_hint') : undefined}
        />
      ) : (
        <>
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead>
                <tr>
                  <th className="rt-th-num" data-col="__num">
                    #
                  </th>
                  {COLUMNS.map((c) => {
                    const active = sort?.key === c.key;
                    const ariaSort = active
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none';
                    return (
                      <th
                        key={c.key}
                        data-col={c.key}
                        aria-sort={ariaSort}
                        className={c.required ? 'rt-th-req' : ''}
                      >
                        <button
                          type="button"
                          className="rt-th-sort"
                          onClick={() => onSortClick(c.key)}
                          title={t('rfq_tracking.sort_hint')}
                        >
                          <span className="rt-th-label">{t(`rfq_tracking.col.${c.key}`)}</span>
                          <span className="rt-sort-ind" aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
                {showFilters && (
                  <tr className="rt-filter-row">
                    <th className="rt-th-num rt-filter-num" data-col="__num">
                      <button
                        type="button"
                        className="rt-fclear"
                        onClick={clearFilters}
                        disabled={!filtersOn}
                        title={t('rfq_tracking.clear_filters')}
                      >
                        ✕
                      </button>
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} data-col={c.key} className="rt-filter-cell">
                        {renderFilter(c)}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {paged.map((r, i) => {
                  const displayNum = effectivePage * PER_PAGE + i + 1;
                  return (
                    <tr key={r._rid} className="rt-row">
                      <td
                        className="rt-td-num"
                        data-col="__num"
                        title={t('rfq_tracking.expand_hint')}
                        onDoubleClick={() => openCard(r._rid)}
                      >
                        <button
                          type="button"
                          className="rt-expand"
                          onClick={() => openCard(r._rid)}
                          aria-label={t('rfq_tracking.expand_hint')}
                        >
                          ⤢
                        </button>
                        <span className="rt-rownum">{displayNum}</span>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} data-col={c.key}>
                          <InlineCell
                            key={`${r._rid}:${c.key}:${rev}`}
                            col={c}
                            value={r[c.key]}
                            disabled={isViewOnly}
                            onCommit={(v) => commitCell(r._rid, c.key, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {view.length === 0 && <div className="rt-nomatch">{t('rfq_tracking.no_match')}</div>}

          <div className="rt-pager">
            <button
              type="button"
              className="rt-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={effectivePage <= 0}
            >
              ← {t('rfq_tracking.prev')}
            </button>
            <span className="rt-pager-label">
              {t('rfq_tracking.page_x_of_y', { x: effectivePage + 1, y: totalPages })}
            </span>
            <button
              type="button"
              className="rt-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={effectivePage >= totalPages - 1}
            >
              {t('rfq_tracking.next')} →
            </button>
          </div>
        </>
      )}

      {editRow && (
        <RfqShowcard
          row={editRow}
          idx={editIdx}
          isViewOnly={isViewOnly}
          requireReason={reasonPrompt}
          onSave={(row) => handleShowcardSave(editRid, row)}
          onDelete={() => handleDelete(editRid)}
          onClose={closeCard}
        />
      )}
    </div>
  );
}

// ── Per-column filter controls ────────────────────────────────────
function RangeFilter({ value, onChange, pct }) {
  const { t } = useI18n();
  const v = value || {};
  return (
    <div className="rt-frange">
      <input
        type="number"
        step="any"
        className="rt-fcell rt-fcell-sm"
        placeholder={pct ? t('rfq_tracking.filter.min_pct') : t('rfq_tracking.filter.min')}
        value={v.min ?? ''}
        onChange={(e) => onChange({ ...v, min: e.target.value })}
      />
      <input
        type="number"
        step="any"
        className="rt-fcell rt-fcell-sm"
        placeholder={pct ? t('rfq_tracking.filter.max_pct') : t('rfq_tracking.filter.max')}
        value={v.max ?? ''}
        onChange={(e) => onChange({ ...v, max: e.target.value })}
      />
    </div>
  );
}

function DateRangeFilter({ value, onChange }) {
  const v = value || {};
  return (
    <div className="rt-frange">
      <input
        type="date"
        className="rt-fcell rt-fcell-sm"
        value={v.from ?? ''}
        onChange={(e) => onChange({ ...v, from: e.target.value })}
      />
      <input
        type="date"
        className="rt-fcell rt-fcell-sm"
        value={v.to ?? ''}
        onChange={(e) => onChange({ ...v, to: e.target.value })}
      />
    </div>
  );
}

function EnumFilter({ options, value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sel = value || [];
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const toggle = (opt) =>
    onChange(sel.includes(opt) ? sel.filter((x) => x !== opt) : [...sel, opt]);
  const summary =
    sel.length === 0
      ? t('rfq_tracking.filter.all')
      : t('rfq_tracking.filter.n_sel', { n: sel.length });
  return (
    <div className="rt-enum" ref={ref}>
      <button type="button" className="rt-fcell rt-enum-btn" onClick={() => setOpen((o) => !o)}>
        <span className="rt-enum-sum">{summary}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="rt-enum-pop">
          {options.length === 0 ? (
            <div className="rt-enum-empty">{t('rfq_tracking.filter.no_values')}</div>
          ) : (
            options.map((opt) => (
              <label key={opt} className="rt-enum-opt">
                <input type="checkbox" checked={sel.includes(opt)} onChange={() => toggle(opt)} />
                <span>{opt}</span>
              </label>
            ))
          )}
          {sel.length > 0 && (
            <button type="button" className="rt-enum-clear" onClick={() => onChange([])}>
              {t('rfq_tracking.filter.clear_col')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline cell (uncontrolled; commit on blur) ────────────────────
function InlineCell({ col, value, disabled, onCommit }) {
  const { type } = col;
  const cls = `rt-cell rt-cell-${type}`;
  if (type === 'num') {
    // MOQ / EAU: show a thousands separator. A native number input can't hold
    // "1,000", so use a text cell — raw digits while focused, formatted on blur.
    if (THOUSANDS_COLS.has(col.key)) {
      return (
        <input
          className={cls}
          disabled={disabled}
          type="text"
          inputMode="numeric"
          defaultValue={fmtThousands(value)}
          onFocus={(e) => {
            e.target.value = value == null ? '' : String(value);
          }}
          onBlur={(e) => {
            const n = numOrEmpty(e.target.value);
            onCommit(n);
            e.target.value = fmtThousands(n); // reformat display
          }}
        />
      );
    }
    // Est. Revenue: rounded whole number. Unchanged rounded text no-ops so a
    // focus+blur never clobbers the exact stored value.
    if (INT_COLS.has(col.key)) {
      return (
        <input
          className={cls}
          disabled={disabled}
          type="number"
          step="1"
          defaultValue={fmtInt(value)}
          onBlur={(e) => {
            if (e.target.value === fmtInt(value)) return;
            onCommit(numOrEmpty(e.target.value));
          }}
        />
      );
    }
    return (
      <input
        className={cls}
        disabled={disabled}
        type="number"
        step="any"
        defaultValue={value ?? ''}
        onBlur={(e) => onCommit(numOrEmpty(e.target.value))}
      />
    );
  }
  if (type === 'pct') {
    // Show a "%" suffix and red-flag the cell when below its margin threshold
    // (GM < 0%, Contr < 25%, VA < 30%). Value is still edited as a % number.
    const bad = isPctBad(PCT_MIN[col.key], value);
    return (
      <span className={`rt-pct-wrap ${bad ? 'rt-cell-bad' : ''}`}>
        <input
          className={`${cls} rt-pct-input`}
          disabled={disabled}
          type="number"
          step="any"
          defaultValue={fracToPctStr(value)}
          onBlur={(e) => {
            // Unchanged rounded display → keep the exact stored fraction.
            if (e.target.value === fracToPctStr(value)) return;
            onCommit(pctStrToFrac(e.target.value));
          }}
        />
        <span className="rt-pct-suffix" aria-hidden="true">
          %
        </span>
      </span>
    );
  }
  if (type === 'date') {
    // native date input value must be YYYY-MM-DD; keep raw ISO
    const iso = /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : '';
    return (
      <input
        className={cls}
        disabled={disabled}
        type="date"
        defaultValue={iso}
        title={fmtDate(value)}
        onBlur={(e) => onCommit(e.target.value)}
      />
    );
  }
  // text — fixed-choice columns (Sale Stage / Sales PIC) get a dropdown.
  if (CHOICES[col.key]) {
    return (
      <ChoiceCell
        options={CHOICES[col.key]}
        value={value}
        disabled={disabled}
        onCommit={onCommit}
      />
    );
  }
  return (
    <input
      className={cls}
      disabled={disabled}
      type="text"
      defaultValue={value ?? ''}
      onBlur={(e) => onCommit(e.target.value)}
    />
  );
}

// ── Choice cell: <select> of presets + "Other → manual text" ──────
function ChoiceCell({ options, value, disabled, onCommit }) {
  const { t } = useI18n();
  const v = value == null ? '' : String(value);
  const isPreset = v !== '' && options.includes(v);
  const [otherMode, setOtherMode] = useState(v !== '' && !isPreset);
  const otherRef = useRef(null);
  const selectVal = otherMode ? OTHER : isPreset ? v : '';
  const focusOther = () => requestAnimationFrame(() => otherRef.current?.focus());
  return (
    <div className="rt-choice">
      <select
        className="rt-cell rt-choice-sel"
        disabled={disabled}
        value={selectVal}
        onChange={(e) => {
          const sel = e.target.value;
          if (sel === OTHER) {
            setOtherMode(true);
            onCommit(''); // clear preset so the operator types a custom value
            focusOther(); // jump the cursor straight into the manual input
          } else {
            setOtherMode(false);
            onCommit(sel);
          }
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>{t('rfq_tracking.other')}</option>
      </select>
      {otherMode && (
        <input
          ref={otherRef}
          className="rt-cell rt-choice-other"
          type="text"
          disabled={disabled}
          defaultValue={isPreset ? '' : v}
          placeholder={t('rfq_tracking.other_placeholder')}
          onBlur={(e) => onCommit(e.target.value)}
        />
      )}
    </div>
  );
}

// Controlled variant for the showcard (bound to form state).
function ShowcardChoice({ options, value, disabled, onChange }) {
  const { t } = useI18n();
  const v = value == null ? '' : String(value);
  const isPreset = v !== '' && options.includes(v);
  const [otherMode, setOtherMode] = useState(v !== '' && !isPreset);
  const otherRef = useRef(null);
  const selectVal = otherMode ? OTHER : isPreset ? v : '';
  return (
    <div className="rt-choice">
      <select
        className="rt-field-input"
        disabled={disabled}
        value={selectVal}
        onChange={(e) => {
          const sel = e.target.value;
          if (sel === OTHER) {
            setOtherMode(true);
            onChange('');
            requestAnimationFrame(() => otherRef.current?.focus());
          } else {
            setOtherMode(false);
            onChange(sel);
          }
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>{t('rfq_tracking.other')}</option>
      </select>
      {otherMode && (
        <input
          ref={otherRef}
          className="rt-field-input"
          type="text"
          disabled={disabled}
          value={v}
          placeholder={t('rfq_tracking.other_placeholder')}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Showcard (grouped, editable, draggable lg modal) ──────────────
function RfqShowcard({ row, idx, isViewOnly, requireReason, onSave, onDelete, onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...row });
  // When opened because a reason is required, pre-highlight straight away.
  const [reasonErr, setReasonErr] = useState(!!requireReason);
  const notesRef = useRef(null);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const needsReason = rowNeedsReason(form); // Rejected/Cancel + blank Notes
  const attemptSave = () => {
    if (rowNeedsReason(form)) {
      setReasonErr(true);
      notesRef.current?.focus();
      return;
    }
    onSave(form);
  };

  // Opened via the "reason required" save gate → jump to + focus Notes/Reason.
  useEffect(() => {
    if (requireReason) {
      requestAnimationFrame(() => {
        notesRef.current?.scrollIntoView({ block: 'center' });
        notesRef.current?.focus();
      });
    }
  }, [requireReason]);

  return (
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="rt-sc-title">
      <Modal.Header
        id="rt-sc-title"
        title={t('rfq_tracking.showcard_title', {
          rfq: form.rfq_no || '—',
          qtn: form.qtn || '',
        })}
        subtitle={`#${idx + 1}`}
        severity="info"
      />
      <Modal.Body>
        {reasonErr && needsReason && (
          <div className="rt-sc-reason-err" role="alert">
            {t('rfq_tracking.reason_required')}
          </div>
        )}
        {GROUPS.map((g) => (
          <fieldset key={g} className="rt-sc-group">
            <legend>{t(`rfq_tracking.group.${g}`)}</legend>
            <div className="rt-sc-grid">
              {COLUMNS.filter((c) => c.group === g).map((c) => (
                <ShowcardField
                  key={c.key}
                  col={c}
                  value={form[c.key]}
                  disabled={isViewOnly}
                  onChange={(v) => set(c.key, v)}
                  label={t(`rfq_tracking.col.${c.key}`)}
                  invalid={reasonErr && needsReason && c.key === 'notes'}
                  inputRef={c.key === 'notes' ? notesRef : undefined}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </Modal.Body>
      <Modal.Footer align="between">
        {!isViewOnly ? (
          <button type="button" className="rt-btn rt-btn-danger" onClick={onDelete}>
            {t('rfq_tracking.delete')}
          </button>
        ) : (
          <span />
        )}
        <span className="rt-sc-footer-right">
          <button type="button" className="rt-btn" onClick={onClose}>
            {t('rfq_tracking.close')}
          </button>
          {!isViewOnly && (
            <button
              type="button"
              className="rt-btn rt-btn-primary"
              onClick={attemptSave}
              data-modal-autofocus
            >
              {t('rfq_tracking.save_changes')}
            </button>
          )}
        </span>
      </Modal.Footer>
    </Modal>
  );
}

function ShowcardField({ col, value, disabled, onChange, label, invalid, inputRef }) {
  const { type } = col;
  const isChoice = type === 'text' && CHOICES[col.key];
  return (
    <div
      className={`rt-field ${type === 'text' && col.key === 'notes' ? 'rt-field-wide' : ''} ${invalid ? 'rt-field-invalid' : ''}`}
    >
      <label>{label}</label>
      {isChoice ? (
        <ShowcardChoice
          options={CHOICES[col.key]}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      ) : type === 'num' ? (
        <DecimalInput
          className="rt-field-input"
          value={value ?? ''}
          disabled={disabled}
          onChange={(v) => onChange(v)}
        />
      ) : type === 'pct' ? (
        <div className={`rt-field-pct ${isPctBad(PCT_MIN[col.key], value) ? 'rt-cell-bad' : ''}`}>
          <DecimalInput
            className="rt-field-input"
            value={fracToPctStr(value)}
            disabled={disabled}
            onChange={(v) => onChange(pctStrToFrac(v))}
          />
          <span className="rt-field-suffix">%</span>
        </div>
      ) : type === 'date' ? (
        <input
          type="date"
          className="rt-field-input"
          value={/^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="rt-field-input"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
