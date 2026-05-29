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
import './LibraryPicker.css';

const Ctx = createContext(null);

export function useLibraryPicker() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibraryPicker must be used inside <LibraryPickerProvider>');
  return v;
}

// ── Per-library normalizers ──────────────────────────────────────────
// Each function takes a raw row from the library and returns the
// shared picker row shape { code, ifs_code, desc, g_price, supplier,
// extra } plus whichever columns that library wants to display. The
// `extra` string appears as a muted 3rd column in the search table.

function normNPI(row) {
  // npiDB rows: { name, type, price (DAP), thick, color, supplier, note }
  return {
    code: row.name || '',
    ifs_code: '',
    desc: [row.type, row.thick, row.color].filter(Boolean).join(' · ') || row.name || '',
    g_price: Number(row.price) || 0,
    supplier: row.supplier || '',
    extra: row.note || '',
  };
}
function normSourcing(row) {
  // sourcingDB rows: { material, size, exw, dap, moq, lt, supplier, status }
  return {
    code: row.material || '',
    ifs_code: '',
    desc: [row.material, row.size].filter(Boolean).join(' · '),
    // Prefer DAP price (landed) — same cost basis as NPI. exw fallback.
    g_price: Number(row.dap) || Number(row.exw) || 0,
    supplier: row.supplier || '',
    extra: row.status || '',
  };
}
function normRawMaterial(row) {
  // raw_materials rows: { "Part No", "Part Description", "Supplier ID",
  // Price, "Price Unit Measure", "Purch U/M", ... }
  const partNo = row['Part No'] || row.part_no || '';
  return {
    code: partNo,
    ifs_code: partNo, // For IFS inventory the Part No IS the IFS code.
    desc: row['Part Description'] || row.description || '',
    g_price: Number(row.Price ?? row.price) || 0,
    supplier: row['Supplier ID'] || row.supplier || '',
    extra: row['Price Unit Measure'] || row.uom || '',
  };
}

const LIBRARIES = [
  { key: 'npi', labelKey: 'picker.lib.npi', norm: normNPI, source: 'npi' },
  { key: 'sourcing', labelKey: 'picker.lib.sourcing', norm: normSourcing, source: 'sourcing' },
  { key: 'raw', labelKey: 'picker.lib.raw', norm: normRawMaterial, source: 'rawMaterials' },
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
    // Menu position clamped so it doesn't spill off the viewport edge.
    // Width/height are approximate — overshoot gets trimmed on first render.
    const W = 230,
      H = 200;
    const x = Math.min(event.clientX, window.innerWidth - W - 8);
    const y = Math.min(event.clientY, window.innerHeight - H - 8);
    setMenu({ x, y, onPick });
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
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current?.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const choose = (key) => {
    setActive(key);
    // Small delay so the user sees the radio fill before the modal
    // takes over — feels more responsive than an instant hand-off.
    setTimeout(() => onSelect(key), 80);
  };

  return (
    <div ref={ref} className="libp-menu" style={{ left: x, top: y }} role="menu">
      <div className="libp-menu-head">{t('picker.menu_title')}</div>
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
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="libp-title">
      <Modal.Header
        id="libp-title"
        title={t(def.labelKey)}
        subtitle={
          rows.length >= 400
            ? `400+ ${t('picker.result_count_suffix')}`
            : `${rows.length} ${t('picker.result_count_suffix')}`
        }
      >
        {onBack && (
          <button
            type="button"
            className="libp-card-back"
            onClick={onBack}
            aria-label={t('picker.back')}
            title={t('picker.back')}
          >
            ← {t('picker.back')}
          </button>
        )}
      </Modal.Header>
      <Modal.Body className="flush">
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
                <th className="libp-col-code">{t('picker.col.code')}</th>
                <th className="libp-col-desc">{t('picker.col.desc')}</th>
                <th className="libp-col-supplier">{t('picker.col.supplier')}</th>
                <th className="libp-col-price">{t('picker.col.price')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="libp-empty">
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
