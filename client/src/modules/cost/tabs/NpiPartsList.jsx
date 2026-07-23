/**
 * NPI Parts List — read-only viewer over the bundled snapshot of
 * `NPI Quote part list.xlsx` (Cost Ref data, 25k rows × 64 cols).
 *
 * v1.6 Option C: read-only mode (no Add/Edit/Delete). Phase 6 Day 6-7
 * deliverable per Henry's 2026-06-11 ask. Edit capability deferred to
 * v1.7 along with server-side persistence + sync.
 *
 * Architecture:
 *   - Fetches client/public/data/npi-parts.json on mount (gzip ~1 MB,
 *     served compressed by Express; cached in component state for
 *     the session — no re-fetch on tab re-mount within session).
 *   - Pagination 200 rows/page (same PER_PAGE as MaterialLibrary).
 *   - Search filter across 5 high-value text fields (Part Name /
 *     Code IFS / System code / Customer / PIC).
 *   - Year filter dropdown (built from distinct RFQ date years).
 *   - ColumnsToggle (Phase 2 PR #120 shared component) — 12 columns
 *     visible by default, 52 opt-in via toggle.
 *   - Showcard modal on double-click — 10 high-value fields per
 *     Henry's spec, read-only layout. Single-click selects row.
 *
 * Performance: 25k rows is too many to render all DOM nodes. Pagination
 * gives constant-time render (~200 rows × 12 cols ≈ 2400 cells per page).
 * No react-window dep needed for v1.6; revisit if v1.7 adds 100k+ scale.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../utils/useI18n';
import { sharedApi, importApi } from '../../../services/api';
import ColumnsToggle from '../../../components/Shared/ColumnsToggle';
import ImportWizard from '../../../components/Shared/ImportWizard';
import ConfirmClearModal from '../../../components/Shared/ConfirmClearModal';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import Modal from '../../../components/Shared/Modal';
import './NpiPartsList.css';

const PER_PAGE = 200;
const STORAGE_KEY = 'ops-cost-npi-parts-cols';

// Default-visible 12 cols — operator-facing high-value fields. Rest
// of 52 are opt-in via ColumnsToggle.
const DEFAULT_HIDDEN_KEYS = [
  'PIC',
  'Type',
  'Direct Project',
  'No.',
  'Remark',
  'Production part',
  'Size W',
  'Size L',
  'Material',
  'Size2 W',
  'Size2 L',
  'Num. of Webs',
  'Parts in MD',
  'Parts/Web across',
  'Min Gap MD btwn Sheets',
  'Cavity',
  'LP/Flexo',
  'SS',
  'Glue',
  'LP/Flexo Film',
  'SS Film',
  'Stencil Plate life',
  'Cutter life',
  'Dieset distribution',
  'Mat 2',
  'Mat 3',
  'Mat 4',
  'Mat 5',
  'Mat 6',
  'Mat 7',
  'Mat 8',
  'Mat 9',
  'Mat 10',
  'GP%',
  'Cutter type',
  'Cutter Cavity',
  'Tooling fee (woodie)',
  'Tooling fee (Pinacle die)',
  'Tooling fee (Rotary Die)',
  'Tooling fee (Dieset)',
  'Tooling fee (NC die)',
  'Material in Drawing',
  'Plate Flexo',
  'Film + Plate (SS)',
  'Sale/PM',
  'Quoted Approval (VND)',
  'Quoted Approval (USD)',
  'Delivery Term',
  'Week',
  'VA %',
  'Cont %',
  'GM %',
  'INK IN QUOATION',
];

// Search hits any of these columns (case-insensitive substring).
const SEARCHABLE_KEYS = [
  'Part Name',
  'Code IFS',
  'System code',
  'Customer',
  'PIC',
  'Direct Project',
];

// Showcard fields per Henry's spec (10 high-value fields).
const SHOWCARD_FIELDS = [
  { key: 'RFQ date', label: 'RFQ Date' },
  { key: 'Quoted date', label: 'Quote Date' },
  { key: 'System code', label: 'System Code' },
  { key: 'Code IFS', label: 'Code IFS' },
  { key: 'Unit price (VND)', label: 'Unit Price (VND)', fmt: 'vnd' },
  { key: 'Unit price (USD)', label: 'Unit Price (USD)', fmt: 'usd' },
  { key: 'Customer', label: 'Customer' },
  { key: 'MOQ', label: 'MOQ', fmt: 'int' },
  { key: 'Process', label: 'Process' },
];

// Composite tooling fee shown as nested row in showcard.
const TOOLING_KEYS = [
  'Tooling fee (woodie)',
  'Tooling fee (Pinacle die)',
  'Tooling fee (Rotary Die)',
  'Tooling fee (Dieset)',
  'Tooling fee (NC die)',
];

function fmtVnd(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtUsd(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(4);
}

function fmtInt(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtCell(value, key) {
  if (value == null || value === '') return '—';
  if (key === 'Unit price (VND)' || key === 'Quoted Approval (VND)') return fmtVnd(value);
  if (
    key === 'Unit price (USD)' ||
    key === 'Quoted Approval (USD)' ||
    key === 'GP%' ||
    key === 'VA %' ||
    key === 'Cont %' ||
    key === 'GM %'
  ) {
    return fmtUsd(value);
  }
  if (key === 'MOQ' || key === 'EAU') return fmtInt(value);
  return String(value);
}

function rowYear(row) {
  const d = row['RFQ date'];
  if (!d) return null;
  const s = String(d);
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : null;
}

export default function NpiPartsList() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null); // index in filtered list
  const [showcardRow, setShowcardRow] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy] = useState(false);
  const [msg, setMsg] = useState('');

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  // Read the LIVE Library file via the authed shared route (seeded once from
  // the bundled snapshot). Was a static /npi-parts/parts-snapshot.json fetch
  // before import shipped; the response shape is unchanged
  // ({ columns, rows, row_count, generated_at }).
  useEffect(() => {
    let aborted = false;
    setSnapshot(null);
    setLoadErr(null);
    sharedApi
      .getNpiParts()
      .then((data) => {
        if (!aborted) setSnapshot(data);
      })
      .catch((err) => {
        if (!aborted) setLoadErr(err?.message || 'Failed to load NPI Parts');
      });
    return () => {
      aborted = true;
    };
  }, [reloadTick]);

  const handleWizardCommitted = useCallback(() => {
    setWizardOpen(false);
    reload();
  }, [reload]);

  // Post-clear reload — the wipe + password step-up run inside
  // ConfirmClearModal (importApi.clearNpiParts(password)).
  const afterClear = useCallback(() => {
    reload();
    setMsg('Data cleared');
    setTimeout(() => setMsg(''), 3000);
  }, [reload]);

  const columnConfig = useMemo(() => {
    if (!snapshot?.columns) return [];
    return snapshot.columns.map((key) => ({ key, label: key }));
  }, [snapshot]);

  const years = useMemo(() => {
    if (!snapshot?.rows) return [];
    const set = new Set();
    for (const r of snapshot.rows) {
      const y = rowYear(r);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  }, [snapshot]);

  const filtered = useMemo(() => {
    if (!snapshot?.rows) return [];
    const q = query.trim().toLowerCase();
    return snapshot.rows.filter((r) => {
      if (yearFilter !== 'all' && rowYear(r) !== yearFilter) return false;
      if (!q) return true;
      for (const k of SEARCHABLE_KEYS) {
        const v = r[k];
        if (v != null && String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [snapshot, query, yearFilter]);

  // Reset to page 0 when filter changes.
  useEffect(() => {
    setPage(0);
    setSelectedRow(null);
  }, [query, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageStart = page * PER_PAGE;
  const pageRows = filtered.slice(pageStart, pageStart + PER_PAGE);

  if (loadErr) {
    return (
      <div className="npi-parts-wrap">
        <EmptyState
          icon="⚠"
          title={t('npi_parts.load_error_title')}
          hint={`${t('npi_parts.load_error_hint')}: ${loadErr}`}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="npi-parts-wrap">
        <SkeletonTable rows={10} columns={12} />
      </div>
    );
  }

  return (
    <div className="npi-parts-wrap">
      <header className="npi-parts-header">
        <div className="npi-parts-title-row">
          <h2 className="npi-parts-title">{t('npi_parts.title')}</h2>
          <span className="npi-parts-badge">
            {t('npi_parts.row_count', {
              shown: filtered.length.toLocaleString(),
              total: snapshot.row_count.toLocaleString(),
            })}
          </span>
        </div>
        <div className="npi-parts-readonly-notice">{t('npi_parts.data_notice')}</div>
        <div className="npi-parts-controls">
          <input
            type="search"
            className="npi-parts-search"
            placeholder={t('npi_parts.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('npi_parts.search_placeholder')}
          />
          <select
            className="npi-parts-year-filter"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            aria-label={t('npi_parts.year_filter_label')}
          >
            <option value="all">{t('npi_parts.year_all')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ColumnsToggle
            columns={columnConfig}
            storageKey={STORAGE_KEY}
            defaultHiddenKeys={DEFAULT_HIDDEN_KEYS}
            onChange={setVisibleColumns}
            title={t('npi_parts.columns_title')}
          />
          <button
            type="button"
            className="op-btn op-btn-primary npi-parts-import-btn"
            onClick={() => setWizardOpen(true)}
            disabled={busy}
            title={t('npi_parts.import_hint')}
          >
            ⬆ {t('npi_parts.import')}
          </button>
          <button
            type="button"
            className="op-btn op-btn-danger npi-parts-clear-btn"
            onClick={() => setClearOpen(true)}
            disabled={busy}
            title={t('npi_parts.clear_hint')}
          >
            🗑 {t('npi_parts.clear')}
          </button>
          {msg && <span className="npi-parts-toolbar-msg">{msg}</span>}
        </div>
      </header>

      <div className="npi-parts-table-wrap" role="region" aria-label={t('npi_parts.title')}>
        <table className="npi-parts-table">
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="npi-parts-empty" colSpan={visibleColumns.length || 1}>
                  {t('npi_parts.no_match')}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const absoluteIdx = pageStart + i;
                const isSelected = selectedRow === absoluteIdx;
                return (
                  <tr
                    key={absoluteIdx}
                    className={isSelected ? 'npi-parts-row-selected' : undefined}
                    onClick={() => setSelectedRow(absoluteIdx)}
                    onDoubleClick={() => setShowcardRow(row)}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} title={row[col.key] != null ? String(row[col.key]) : ''}>
                        {fmtCell(row[col.key], col.key)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="npi-parts-footer">
        <div className="npi-parts-pagination">
          <button
            type="button"
            className="npi-parts-page-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← {t('npi_parts.prev')}
          </button>
          <span className="npi-parts-page-info">
            {t('npi_parts.page_x_of_y', { x: page + 1, y: totalPages })}
          </span>
          <button
            type="button"
            className="npi-parts-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            {t('npi_parts.next')} →
          </button>
        </div>
        <div className="npi-parts-snapshot-meta">
          {t('npi_parts.snapshot_generated_at', {
            ts: new Date(snapshot.generated_at).toLocaleString(),
          })}
        </div>
      </footer>

      {showcardRow && (
        <Modal open onClose={() => setShowcardRow(null)} size="md">
          <Modal.Header
            title={
              showcardRow['Part Name']
                ? `${showcardRow['Part Name']}`
                : showcardRow['System code'] || t('npi_parts.showcard_title')
            }
          />
          <Modal.Body>
            <dl className="npi-parts-showcard-fields">
              {SHOWCARD_FIELDS.map((f) => {
                const raw = showcardRow[f.key];
                let val = raw == null || raw === '' ? '—' : String(raw);
                if (f.fmt === 'vnd') val = fmtVnd(raw);
                if (f.fmt === 'usd') val = fmtUsd(raw);
                if (f.fmt === 'int') val = fmtInt(raw);
                return (
                  <div className="npi-parts-showcard-row" key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{val}</dd>
                  </div>
                );
              })}
              <div className="npi-parts-showcard-row npi-parts-showcard-row-block">
                <dt>{t('npi_parts.showcard_tooling_fee')}</dt>
                <dd>
                  <ul className="npi-parts-showcard-tooling">
                    {TOOLING_KEYS.map((tk) => {
                      const v = showcardRow[tk];
                      if (v == null || v === '') return null;
                      return (
                        <li key={tk}>
                          <span className="npi-parts-showcard-tooling-label">
                            {tk.replace(/^Tooling fee \(|\)$/g, '')}
                          </span>
                          <span className="npi-parts-showcard-tooling-value">{fmtUsd(v)}</span>
                        </li>
                      );
                    })}
                    {TOOLING_KEYS.every((tk) => {
                      const v = showcardRow[tk];
                      return v == null || v === '';
                    }) && <li className="npi-parts-showcard-tooling-empty">—</li>}
                  </ul>
                </dd>
              </div>
            </dl>
          </Modal.Body>
          <Modal.Footer>
            <button
              type="button"
              className="op-btn op-btn-secondary"
              onClick={() => setShowcardRow(null)}
            >
              {t('common.dismiss')}
            </button>
          </Modal.Footer>
        </Modal>
      )}

      <ImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        datasetKey="npi-parts"
        datasetLabel="NPI Parts List"
        onCommitted={handleWizardCommitted}
      />
      <ConfirmClearModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        datasetLabel="NPI Parts List"
        rowCount={snapshot?.row_count}
        clearApi={(password) => importApi.clearNpiParts(password)}
        onCleared={afterClear}
      />
    </div>
  );
}
