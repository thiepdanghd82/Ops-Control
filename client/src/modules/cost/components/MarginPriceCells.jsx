/**
 * MarginPriceCells — shared editable VA%/Contr%/GM% cells + a per-tier
 * "Apply GM 25%" affordance for the Cost Breakdown tab (Standard + Complex).
 *
 * Editing a metric back-solves the price via priceSolver and writes it
 * through the tab's commit handler. The default-price affordance shows the
 * GM-25% suggestion (labeled, noting when a secondary floor raised it) and
 * applies it on click. All styling is class-based (Lesson 6 — no dynamic
 * inline style).
 */
import { useState, useEffect } from 'react';
import { formatDefaultHint } from './MarginPriceCells.helpers';
import './MarginPriceCells.css';

/**
 * Editable margin cell. Shows `value` as a percentage; on blur/Enter parses
 * the entered percent and calls `onCommit(fraction)`. `onCommit` returns
 * truthy when the solve succeeded — a falsy return flashes the cell and
 * leaves the price unchanged.
 */
export function MarginCell({ metric, value, warn, onCommit, disabled }) {
  const [draft, setDraft] = useState(null); // string while editing, else null
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!rejected) return undefined;
    const id = setTimeout(() => setRejected(false), 1200);
    return () => clearTimeout(id);
  }, [rejected]);

  const shown =
    draft != null
      ? draft
      : value == null || !Number.isFinite(value)
        ? ''
        : (value * 100).toFixed(1);

  const commit = () => {
    if (draft == null) return;
    const raw = draft.trim().replace('%', '');
    setDraft(null);
    if (raw === '') return; // blank → no-op
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setRejected(true);
      return;
    }
    const ok = onCommit(num / 100);
    if (!ok) setRejected(true);
  };

  const cls =
    `mpc-cell-input mpc-${metric}` +
    (metric === 'gm' && typeof value === 'number' && value < 0 ? ' mpc-gm-neg' : '') +
    (warn ? ' sc-input-warn' : '') +
    (rejected ? ' mpc-reject' : '');

  return (
    <input
      type="text"
      inputMode="decimal"
      className={cls}
      value={shown}
      disabled={disabled}
      aria-label={`${metric} percent — edit to back-solve the price`}
      title="Type a target % to back-solve the price"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(shown);
        e.target.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * The ↻ "Apply GM 25%" button + suggested-price hint, rendered inside the
 * price cell. `def` is the priceSolver.defaultPrice result (or null).
 */
export function ApplyDefault({ def, onApply, warn }) {
  const hint = formatDefaultHint(def);
  return (
    <div className={`mpc-apply${warn ? ' mpc-apply-warn' : ''}`}>
      <button
        type="button"
        className="mpc-apply-btn"
        title={hint ? `Apply ${hint}` : 'Apply GM 25% price'}
        aria-label="Apply GM 25% default price"
        onClick={onApply}
        disabled={!def}
      >
        ↻
      </button>
      {hint && <span className="mpc-hint">{hint}</span>}
    </div>
  );
}
