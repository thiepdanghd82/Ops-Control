/* eslint-disable react-refresh/only-export-components --
   Co-locates provider + hook, same pattern as CostLibContext. */
/**
 * LibraryPicker (Phase 10M) — right-click material/ink picker.
 *
 * Flow:
 *   1. Component wraps the app (or just Cost module) via
 *      <LibraryPickerProvider>.
 *   2. Any row calls `useLibraryPicker().openMenu({ event, onPick })`
 *      on its `onContextMenu` handler.
 *   3. A small radio menu floats at the cursor with 3 libraries:
 *      NPI Material · Sourcing DB · Raw Materials (IFS). Exactly
 *      one may be "active" at a time.
 *   4. Selecting a library opens a search card (modal) with a
 *      table drawn from that library. Columns adapt to source.
 *   5. Double-click a row → `onPick(normalized)` where normalized
 *      is `{ code, ifs_code, desc, g_price, supplier }` regardless
 *      of source library. Modal closes.
 *
 * Why a provider + hook instead of local component state: a single
 * portal-rendered overlay scales cleanly to N row types (Std + Cplx
 * × Materials + Inks = 4 host tables). Putting the overlay state in
 * each host would duplicate a lot of wiring.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useI18n } from '../../utils/useI18n';
import { useCostLib } from '../../context/CostLibContext';
import Modal from '../Shared/Modal';
import { useFloatingMenu } from '../Shared/useFloatingMenu';
import {
  normNPI,
  normSourcing,
  normIfsMaterial,
  PICKER_COLUMNS,
  clampColWidth,
  colWidthPercents,
  visibleColumns,
} from './LibraryPicker.norm.js';
import './LibraryPicker.css';

const Ctx = createContext(null);

// localStorage prefix for per-library picker column widths.
const WIDTH_KEY = 'ops_picker_colw';
// localStorage prefix for columns the operator hid, per library.
const HIDDEN_KEY = 'ops_picker_colhide';

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

export function useLibraryPicker() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibraryPicker must be used inside <LibraryPickerProvider>');
  return v;
}

// ── Per-library normalizers ──────────────────────────────────────────
// Pure row-shape mappers extracted to LibraryPicker.norm.js so node:test
// can import them without a JSX/CSS loader. Each returns the shared
// picker row { code, ifs_code, desc, g_price, supplier, extra, date }.

const LIBRARIES = [
  { key: 'npi', labelKey: 'picker.lib.npi', norm: normNPI, source: 'npi' },
  { key: 'sourcing', labelKey: 'picker.lib.sourcing', norm: normSourcing, source: 'sourcing' },
  { key: 'ifs', labelKey: 'picker.lib.ifs', norm: normIfsMaterial, source: 'ifs' },
];

// Case-insensitive substring match across the normalized searchable
// fields (code, desc, supplier, extra). Keeps search predictable
// regardless of which library is active.
function matches(row, q) {
  if (!q) return true;
  const hay = (row.code + ' ' + row.desc + ' ' + row.supplier + ' ' + row.extra).toLowerCase();
  return hay.includes(q);
}

// Thousands separator for display; price is stored as a plain number.
// One picker cell. Numbers go through fmtPrice so 0.8624 and 39.1236 line
// up; the CODE column keeps its <code> styling; `date` and blank values
// render an em dash rather than an empty box.
function renderCell(row, col) {
  const v = row[col.key];
  if (col.mono) return <code>{v || '—'}</code>;
  if (col.num) return v === '' || v === null || v === undefined ? '—' : fmtPrice(Number(v));
  if (v === '' || v === null || v === undefined) return '—';
  return v;
}

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '';
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function LibraryPickerProvider({ children }) {
  // { x, y, onPick } when the right-click radio menu is open.
  const [menu, setMenu] = useState(null);
  // Active library key + pick callback when the search card is open.
  const [picker, setPicker] = useState(null);

  const openMenu = useCallback(({ event, onPick }) => {
    event.preventDefault();
    // Raw viewport coords — ContextMenu places itself edge-aware (flip +
    // clamp) after measuring, via useFloatingMenu.
    setMenu({ x: event.clientX, y: event.clientY, onPick });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);
  const closePicker = useCallback(() => setPicker(null), []);

  const selectLibrary = useCallback(
    (key) => {
      if (!menu) return;
      // Preserve the menu's origin (cursor position + onPick callback) so
      // the picker card's "back" arrow can reopen the radio menu exactly
      // where the user first right-clicked.
      const origin = { x: menu.x, y: menu.y, onPick: menu.onPick };
      setMenu(null);
      setPicker({ libraryKey: key, onPick: menu.onPick, origin });
    },
    [menu]
  );

  const backToMenu = useCallback(() => {
    if (!picker?.origin) return;
    const o = picker.origin;
    setPicker(null);
    setMenu({ x: o.x, y: o.y, onPick: o.onPick });
  }, [picker]);

  // Dismiss menu/picker on Escape and outside click.
  useEffect(() => {
    if (!menu && !picker) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        setMenu(null);
        setPicker(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu, picker]);

  const value = useMemo(() => ({ openMenu }), [openMenu]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {menu && <ContextMenu x={menu.x} y={menu.y} onSelect={selectLibrary} onClose={closeMenu} />}
      {picker && (
        <PickerCard
          key={picker.libraryKey}
          libraryKey={picker.libraryKey}
          onPick={(hit) => {
            picker.onPick?.(hit);
            closePicker();
          }}
          onClose={closePicker}
          onBack={picker.origin ? backToMenu : null}
        />
      )}
    </Ctx.Provider>
  );
}

// ── Floating right-click menu: 3 library options as radios ──────────
function ContextMenu({ x, y, onSelect, onClose }) {
  const { t } = useI18n();
  const [active, setActive] = useState(null);
  const { menuRef, style } = useFloatingMenu({ open: true, x, y });

  useEffect(() => {
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose, menuRef]);

  const choose = (key) => {
    setActive(key);
    // Small delay so the user sees the radio fill before the modal
    // takes over — feels more responsive than an instant hand-off.
    setTimeout(() => onSelect(key), 80);
  };

  return (
    <div ref={menuRef} className="libp-menu" style={style} role="menu">
      <div className="libp-menu-head" data-menu-drag-handle>
        {t('picker.menu_title')}
      </div>
      {LIBRARIES.map((L) => (
        <button
          key={L.key}
          className={`libp-menu-item ${active === L.key ? 'active' : ''}`}
          role="menuitemradio"
          aria-checked={active === L.key}
          onClick={() => choose(L.key)}
        >
          <span className={`libp-radio ${active === L.key ? 'on' : ''}`} aria-hidden />
          <span className="libp-menu-label">{t(L.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Picker card: search input + table; double-click to pick ─────────
function PickerCard({ libraryKey, onPick, onClose, onBack }) {
  const { t } = useI18n();
  const { lib } = useCostLib();
  const def = LIBRARIES.find((L) => L.key === libraryKey);
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
    const normalized = src.map(def.norm).filter((r) => r.code || r.desc);
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
