/**
 * PickerCard — the library search modal, split out of LibraryPicker.jsx.
 *
 * It is a lazy chunk: the provider wraps the whole app, so keeping the
 * table, the column machinery and the modal in the app shell put the
 * shell over its perf budget for a dialog most sessions never open. The
 * right-click menu stays eager; this loads on first open.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../utils/useI18n';
import { useCostLib } from '../../context/CostLibContext';
import Modal from '../Shared/Modal';
import {
  normNPI,
  normSourcing,
  normIfsMaterial,
  PICKER_COLUMNS,
  clampColWidth,
  colWidthPercents,
  visibleColumns,
} from './LibraryPicker.norm.js';
import { LIBRARIES, WIDTH_KEY, HIDDEN_KEY, matches, fmtPrice } from './pickerShared.js';
import './LibraryPicker.css';

// Column widths the operator dragged, per library. A stale or corrupt
// entry must not collapse the table, so a bad read degrades to defaults.
function readStoredWidths(libraryKey) {
  try {
    const raw = localStorage.getItem(`${WIDTH_KEY}:${libraryKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredHidden(libraryKey) {
  try {
    const raw = localStorage.getItem(`${HIDDEN_KEY}:${libraryKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderCell(row, col) {
  const v = row[col.key];
  if (col.mono) return <code>{v || '—'}</code>;
  if (col.num) return v === '' || v === null || v === undefined ? '—' : fmtPrice(Number(v));
  if (v === '' || v === null || v === undefined) return '—';
  return v;
}

// Library key → row normalizer. Kept in the lazy chunk.
const NORMALIZERS = { npi: normNPI, sourcing: normSourcing, ifs: normIfsMaterial };

export default function PickerCard({ libraryKey, onPick, onClose, onBack }) {
  const { t } = useI18n();
  const { lib } = useCostLib();
  const def = LIBRARIES.find((L) => L.key === libraryKey);
  // The normalizer lives here, not in the shared module — see the note
  // at the top of pickerShared.js.
  const norm = NORMALIZERS[libraryKey];
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Transform → filter → cap. `cap` keeps the DOM snappy when the
  // source library runs into the thousands (IFS inventory does).
  const rows = useMemo(() => {
    if (!def) return [];
    const src = Array.isArray(lib[def.source]) ? lib[def.source] : [];
    const q = query.trim().toLowerCase();
    const normalized = src.map(norm).filter((r) => r.code || r.desc);
    const filtered = q ? normalized.filter((r) => matches(r, q)) : normalized;
    return filtered.slice(0, 400); // hard cap — user can narrow search
  }, [def, lib, query]);

  // Column widths the operator dragged, per library. Persisted so the
  // layout they set for NPI survives closing the picker. Bad/stale values
  // fall back to the column's default rather than collapsing a column.
  const allColumns = PICKER_COLUMNS[def?.key] || [];
  const [widths, setWidths] = useState(() => readStoredWidths(libraryKey));
  const [hidden, setHidden] = useState(() => readStoredHidden(libraryKey));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  // The card is resizable and maximizable, so the breakpoint that matters
  // is the table's own width, not the viewport's.
  const wrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(undefined);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const columns = visibleColumns(allColumns, { hidden, width: wrapWidth });
  const toggleColumn = (key) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try {
      localStorage.setItem(`${HIDDEN_KEY}:${libraryKey}`, JSON.stringify(next));
    } catch {
      /* private mode / quota */
    }
  };
  const showAllColumns = () => {
    setHidden([]);
    try {
      localStorage.removeItem(`${HIDDEN_KEY}:${libraryKey}`);
    } catch {
      /* ignore */
    }
  };
  // Proportions, not pixels — the table fits the card at any size and a
  // drag redistributes space instead of widening the table.
  const pct = colWidthPercents(columns, widths);
  const resetWidths = () => {
    setWidths({});
    try {
      localStorage.removeItem(`${WIDTH_KEY}:${libraryKey}`);
    } catch {
      /* ignore */
    }
  };

  // Drag a header's right edge. Pointer events so the drag keeps tracking
  // outside the <th> and releases cleanly if the pointer leaves the window.
  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = clampColWidth(widths[col.key], col.w);
    // Pixels the operator drags are converted into weight using the
    // header's own rendered width, so the edge follows the pointer.
    const th = e.currentTarget.closest('th');
    const renderedPx = th ? th.getBoundingClientRect().width : startW;
    const pxToWeight = renderedPx > 0 ? startW / renderedPx : 1;
    let latest = startW;
    const move = (ev) => {
      latest = clampColWidth(startW + (ev.clientX - startX) * pxToWeight);
      setWidths((prev) => ({ ...prev, [col.key]: latest }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Persist outside the state updater — React may run an updater
      // twice, and a write belongs in the event handler either way.
      try {
        localStorage.setItem(
          `${WIDTH_KEY}:${libraryKey}`,
          JSON.stringify({ ...widths, [col.key]: latest })
        );
      } catch {
        /* private mode / quota — widths just don't persist */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!def) return null;

  return (
    <Modal open onClose={onClose} size="xl" maximizable ariaLabelledBy="libp-title">
      <Modal.Header
        id="libp-title"
        title={t(def.labelKey)}
        subtitle={
          rows.length >= 400
            ? `400+ ${t('picker.result_count_suffix')}`
            : `${rows.length} ${t('picker.result_count_suffix')}`
        }
      />
      <Modal.Body className="flush libp-body">
        {onBack && (
          <div className="libp-backrow">
            <button
              type="button"
              className="libp-card-back"
              onClick={onBack}
              aria-label={t('picker.back')}
              title={t('picker.back')}
            >
              ← {t('picker.back')}
            </button>
          </div>
        )}
        <div className="libp-card-search">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('picker.search_placeholder')}
            aria-label={t('picker.search_placeholder')}
          />
          <span className="libp-card-count">
            {rows.length >= 400 ? `400+` : rows.length}
            &nbsp;{t('picker.result_count_suffix')}
          </span>
          <div className="libp-colmenu-wrap">
            <button
              type="button"
              className="libp-colmenu-btn"
              onClick={() => setColMenuOpen((v) => !v)}
              aria-expanded={colMenuOpen}
              title={t('picker.columns_title')}
            >
              ▦ {t('picker.columns')}
            </button>
            {colMenuOpen && (
              <div className="libp-colmenu" role="menu">
                {allColumns.map((c) => (
                  <label key={c.key} className="libp-colmenu-item">
                    <input
                      type="checkbox"
                      checked={!hidden.includes(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {t(c.labelKey)}
                  </label>
                ))}
                <button type="button" className="libp-colmenu-all" onClick={showAllColumns}>
                  {t('picker.columns_all')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="libp-card-tablewrap" ref={wrapRef}>
          <table className="libp-table libp-table-cols">
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={{ width: pct[c.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.num ? 'libp-num' : ''} ${c.mono ? 'libp-mono' : ''}`}
                    style={{ width: pct[c.key] }}
                  >
                    <span className="libp-th-label">{t(c.labelKey)}</span>
                    <span
                      className="libp-col-grip"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t('picker.reset_widths')}
                      onPointerDown={(e) => startResize(e, c)}
                      onDoubleClick={resetWidths}
                      title={t('picker.reset_widths')}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="libp-empty">
                    {t('picker.empty')}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr
                  key={`${r.code}-${i}`}
                  onDoubleClick={() => onPick(r)}
                  title={t('picker.double_click_hint')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`${c.num ? 'libp-num' : ''} ${c.mono ? 'libp-mono' : ''}`}
                    >
                      {renderCell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal.Body>
      <Modal.Footer align="between">
        <span className="libp-hint">{t('picker.footer_hint')}</span>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
          {t('picker.close')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
