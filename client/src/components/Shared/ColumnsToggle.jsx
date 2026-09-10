import { useCallback, useEffect, useRef, useState } from 'react';
import { applyColumnVisibility, loadHiddenKeys, saveHiddenKeys } from './ColumnsToggle.helpers.js';
import './ColumnsToggle.css';

const ColumnsIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="5" height="18" rx="1" />
    <rect x="10" y="3" width="4" height="18" rx="1" />
    <rect x="16" y="3" width="5" height="18" rx="1" />
  </svg>
);

/**
 * ColumnsToggle — popover with checkbox list for column visibility.
 * Standalone shared component (does NOT touch DataBrowser; coexists
 * with its built-in toggle for Mfg Structures / IFS Inventory).
 *
 * Pattern: caller passes onChange callback receiving the filtered
 * `visibleColumns` array (post-required-guard, source-order preserved).
 * State lives internally; localStorage persists across reload via
 * storageKey. See ColumnsToggle.helpers.js for the pure load/save logic
 * that this component composes.
 *
 * Required columns (`column.required === true`) render disabled
 * checkbox + 0.6 opacity label + cannot be hidden. Stale persisted
 * keys (column removed from current config) are silently filtered out
 * on read.
 *
 * Props contract:
 *   - columns: Array<{ key, label, required? }>
 *   - storageKey: string
 *   - onChange: (visibleColumns) => void
 *   - title?: string (default "Visible Columns")
 *   - defaultHiddenKeys?: string[] (default [])
 */
export default function ColumnsToggle({
  columns,
  storageKey,
  onChange,
  title = 'Visible Columns',
  defaultHiddenKeys = [],
}) {
  // Init: load + filter stale keys. validKeys snapshot computed once
  // per columns identity to avoid recomputing on every render.
  const [hiddenKeys, setHiddenKeys] = useState(() => {
    const valid = (columns || []).map((c) => c && c.key).filter(Boolean);
    return loadHiddenKeys(storageKey, valid, defaultHiddenKeys);
  });
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Notify parent + persist whenever hiddenKeys change. Parent uses
  // onChange to update its visibleColumns state for table render.
  useEffect(() => {
    onChange(applyColumnVisibility(columns, hiddenKeys));
    saveHiddenKeys(storageKey, hiddenKeys);
  }, [hiddenKeys, columns, storageKey, onChange]);

  // Click-outside + Escape close. Match ScopedFilterBar DateRangePicker
  // inline pattern (no shared hook in repo).
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
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

  const handleToggle = useCallback((key) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setHiddenKeys(new Set());
  }, []);

  const handleResetDefault = useCallback(() => {
    const valid = new Set((columns || []).map((c) => c && c.key).filter(Boolean));
    setHiddenKeys(new Set((defaultHiddenKeys || []).filter((k) => valid.has(k))));
  }, [columns, defaultHiddenKeys]);

  const cols = Array.isArray(columns) ? columns : [];
  const hiddenCount = [...hiddenKeys].filter((k) =>
    cols.some((c) => c.key === k && !c.required)
  ).length;

  return (
    <div className="ct-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`ct-toggle-btn${hiddenCount > 0 ? ' ct-toggle-btn-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={hiddenCount > 0 ? `${hiddenCount} column(s) hidden` : 'Show / hide columns'}
      >
        <ColumnsIcon />
        <span>Columns{hiddenCount > 0 ? ` (${hiddenCount})` : ''}</span>
      </button>
      {open && (
        <div className="ct-panel" ref={panelRef} role="dialog" aria-label={title}>
          <div className="ct-panel-header">
            <span className="ct-panel-title">{title}</span>
            <div className="ct-panel-actions">
              <button type="button" className="ct-action" onClick={handleSelectAll}>
                Select All
              </button>
              <button type="button" className="ct-action" onClick={handleResetDefault}>
                Reset All
              </button>
            </div>
          </div>
          <div className="ct-panel-list">
            {cols.map((c) => {
              const hidden = hiddenKeys.has(c.key);
              const disabled = !!c.required;
              return (
                <label
                  key={c.key}
                  className={`ct-item${disabled ? ' ct-item-required' : ''}`}
                  title={disabled ? 'Required column' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={disabled || !hidden}
                    disabled={disabled}
                    onChange={() => handleToggle(c.key)}
                  />
                  <span className="ct-item-label">{c.label || c.key}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
