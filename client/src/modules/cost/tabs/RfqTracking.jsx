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

// ── value helpers ─────────────────────────────────────────────────
// Percent: stored fraction -0.2778 ↔ edited/displayed -27.78.
function fracToPctStr(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 1000000) / 10000); // ×100, trim float noise
}
function pctStrToFrac(s) {
  const t = String(s ?? '').trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return '';
  return n / 100;
}
function numOrEmpty(s) {
  const t = String(s ?? '').trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
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
  const [editIdx, setEditIdx] = useState(null);
  const [rev, setRev] = useState(0); // bump → remount inline inputs
  const searchRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await costApi.getRfqTracking();
      setRows(Array.isArray(data) ? data : []);
      setDirty(false);
      setRev((r) => r + 1);
    } catch (err) {
      console.error('Failed to load RFQ Tracking:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await costApi.saveRfqTracking(rows);
      setDirty(false);
    } catch (e) {
      alert('Save failed: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Commit a single inline cell edit into local state (called on blur).
  function commitCell(realIdx, key, value) {
    setRows((prev) => {
      const cur = prev[realIdx]?.[key] ?? '';
      if (String(cur) === String(value)) return prev; // no-op, avoid churn
      const n = [...prev];
      n[realIdx] = { ...n[realIdx], [key]: value };
      return n;
    });
    setDirty(true);
  }

  function handleAdd() {
    setRows((prev) => [...prev, {}]);
    setDirty(true);
    setRev((r) => r + 1);
    // jump to last page so the new row is visible
    setTimeout(() => {
      setPage(Math.floor(rows.length / PER_PAGE));
    }, 0);
  }

  function handleShowcardSave(idx, row) {
    setRows((prev) => {
      const n = [...prev];
      n[idx] = row;
      return n;
    });
    setDirty(true);
    setRev((r) => r + 1);
    setEditIdx(null);
  }

  function handleDelete(idx) {
    if (!confirm(t('rfq_tracking.delete_confirm'))) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setRev((r) => r + 1);
    setEditIdx(null);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const text = SEARCH_KEYS.map((k) => r[k])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((tm) => text.includes(tm));
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const effectivePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(effectivePage * PER_PAGE, (effectivePage + 1) * PER_PAGE);

  if (loading) {
    return (
      <div className="rt-wrap">
        <SkeletonTable rows={10} cols={10} />
      </div>
    );
  }

  return (
    <div className="rt-wrap">
      <div className="rt-headbar">
        <div className="rt-hb-left">
          <h2 className="rt-title">{t('rfq_tracking.title')}</h2>
          <span className="rt-count">
            {t('rfq_tracking.row_count', { shown: filtered.length, total: rows.length })}
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
                  {COLUMNS.map((c) => (
                    <th key={c.key} data-col={c.key} className={c.required ? 'rt-th-req' : ''}>
                      {t(`rfq_tracking.col.${c.key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => {
                  const realIdx = rows.indexOf(r);
                  return (
                    <tr key={realIdx} className="rt-row">
                      <td
                        className="rt-td-num"
                        data-col="__num"
                        title={t('rfq_tracking.expand_hint')}
                        onDoubleClick={() => setEditIdx(realIdx)}
                      >
                        <button
                          type="button"
                          className="rt-expand"
                          onClick={() => setEditIdx(realIdx)}
                          aria-label={t('rfq_tracking.expand_hint')}
                        >
                          ⤢
                        </button>
                        <span className="rt-rownum">{realIdx + 1}</span>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} data-col={c.key}>
                          <InlineCell
                            key={`${realIdx}:${c.key}:${rev}`}
                            col={c}
                            value={r[c.key]}
                            disabled={isViewOnly}
                            onCommit={(v) => commitCell(realIdx, c.key, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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

      {editIdx !== null && rows[editIdx] && (
        <RfqShowcard
          row={rows[editIdx]}
          idx={editIdx}
          isViewOnly={isViewOnly}
          onSave={(row) => handleShowcardSave(editIdx, row)}
          onDelete={() => handleDelete(editIdx)}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

// ── Inline cell (uncontrolled; commit on blur) ────────────────────
function InlineCell({ col, value, disabled, onCommit }) {
  const { type } = col;
  const cls = `rt-cell rt-cell-${type}`;
  if (type === 'num') {
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
    return (
      <input
        className={cls}
        disabled={disabled}
        type="number"
        step="any"
        defaultValue={fracToPctStr(value)}
        onBlur={(e) => onCommit(pctStrToFrac(e.target.value))}
      />
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

// ── Showcard (grouped, editable, draggable lg modal) ──────────────
function RfqShowcard({ row, idx, isViewOnly, onSave, onDelete, onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...row });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

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
              onClick={() => onSave(form)}
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

function ShowcardField({ col, value, disabled, onChange, label }) {
  const { type } = col;
  return (
    <div className={`rt-field ${type === 'text' && col.key === 'notes' ? 'rt-field-wide' : ''}`}>
      <label>{label}</label>
      {type === 'num' ? (
        <DecimalInput
          className="rt-field-input"
          value={value ?? ''}
          disabled={disabled}
          onChange={(v) => onChange(v)}
        />
      ) : type === 'pct' ? (
        <div className="rt-field-pct">
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
