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
  lazy,
  Suspense,
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useI18n } from '../../utils/useI18n';
import { useFloatingMenu } from '../Shared/useFloatingMenu';
import { LIBRARIES } from './pickerShared.js';
import './LibraryPicker.css';

// The search card is the heavy half — table, columns, modal. It only
// appears on right-click, so it loads then rather than riding in the
// app shell this provider wraps.
const PickerCard = lazy(() => import('./PickerCard.jsx'));

const Ctx = createContext(null);

// localStorage prefix for per-library picker column widths.
// localStorage prefix for columns the operator hid, per library.

export function useLibraryPicker() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibraryPicker must be used inside <LibraryPickerProvider>');
  return v;
}

// ── Per-library normalizers ──────────────────────────────────────────
// Pure row-shape mappers extracted to LibraryPicker.norm.js so node:test
// can import them without a JSX/CSS loader. Each returns the shared
// picker row { code, ifs_code, desc, g_price, supplier, extra, date }.

// Case-insensitive substring match across the normalized searchable
// fields (code, desc, supplier, extra). Keeps search predictable
// regardless of which library is active.

// Thousands separator for display; price is stored as a plain number.
// One picker cell. Numbers go through fmtPrice so 0.8624 and 39.1236 line
// up; the CODE column keeps its <code> styling; `date` and blank values
// render an em dash rather than an empty box.

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
        <Suspense fallback={null}>
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
        </Suspense>
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
