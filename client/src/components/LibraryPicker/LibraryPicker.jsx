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
import { normNPI, normSourcing, normIfsMaterial } from './LibraryPicker.norm.js';
import './LibraryPicker.css';

const Ctx = createContext(null);

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

  if (!def) return null;

  return (
    <Modal open onClose={onClose} size="lg" maximizable ariaLabelledBy="libp-title">
      <Modal.Header
        id="libp-title"
        title={t(def.labelKey)}
        subtitle={
          rows.length >= 400
            ? `400+ ${t('picker.result_count_suffix')}`
            : `${rows.length} ${t('picker.result_count_suffix')}`
        }
      />
      <Modal.Body className="flush">
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
        </div>
        <div className="libp-card-tablewrap">
          <table className="libp-table">
            <thead>
              <tr>
                <th className="libp-col-date">{t('picker.col.date')}</th>
                <th className="libp-col-code">{t('picker.col.code')}</th>
                <th className="libp-col-desc">{t('picker.col.desc')}</th>
                <th className="libp-col-supplier">{t('picker.col.supplier')}</th>
                <th className="libp-col-price">{t('picker.col.price')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="libp-empty">
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
                  <td className="libp-col-date">{r.date || '—'}</td>
                  <td className="libp-col-code">
                    <code>{r.code}</code>
                  </td>
                  <td className="libp-col-desc">
                    {r.desc}
                    {r.extra && <span className="libp-extra"> — {r.extra}</span>}
                  </td>
                  <td className="libp-col-supplier">{r.supplier}</td>
                  <td className="libp-col-price">{fmtPrice(r.g_price)}</td>
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
