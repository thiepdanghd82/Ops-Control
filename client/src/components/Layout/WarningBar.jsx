/**
 * WarningBar — bottom-of-screen validation status bar for the
 * Standard / Complex calculators.
 *
 * Reads the current calc state from CalcContext, runs it through
 * validateByActiveTab() on every change (via useMemo) and renders a
 * centered bar with the current warnings. The bar auto-hides the
 * moment every validation passes, so users get a live "is my input
 * complete?" indicator without extra clicks.
 *
 * Sits inside `.app-main` as a sibling AFTER `.app-content`, so it's
 * horizontally aligned with the sidebar's Sign Out button at the
 * bottom of the viewport.
 *
 * All messages are English per product spec.
 */

import { useMemo, useState, useContext } from 'react';
import { useCalc } from '../../context/CalcContext';
import { CostLibContext } from '../../context/CostLibContext';
import { validateByActiveTab } from '../../services/calcValidation';
import './WarningBar.css';

export default function WarningBar({ activeModule, activeTab }) {
  const { stdState, cplxState } = useCalc();
  // WarningBar lives outside CostLibProvider, so read context directly
  // (returns null when provider is absent — safe fallback).
  const costLib = useContext(CostLibContext);
  const lib = costLib?.lib || null;

  // Only validate when we're actually on a calculator tab — avoids
  // flashing warnings at people browsing History, Settings, etc.
  const isCalcTab =
    activeModule === 'cost' && (activeTab === 'standard' || activeTab === 'complex');

  const warnings = useMemo(
    () => (isCalcTab ? validateByActiveTab(activeTab, stdState, cplxState, lib) : []),
    [isCalcTab, activeTab, stdState, cplxState, lib]
  );

  // Expandable: click the bar to see all warnings stacked; otherwise it
  // shows the first error + a "+N more" chip. No effect needed to reset
  // `expanded` — when warnings.length hits 0 the component returns null,
  // and the next time it remounts useState re-inits expanded to false.
  const [expanded, setExpanded] = useState(false);

  if (!isCalcTab || warnings.length === 0) return null;

  const errors = warnings.filter((w) => w.severity === 'error');
  const warns = warnings.filter((w) => w.severity === 'warn');
  const primary = errors[0] || warns[0];
  const extraCount = warnings.length - 1;

  return (
    <div
      className={`warning-bar ${errors.length > 0 ? 'wb-error' : 'wb-warn'} ${expanded ? 'wb-expanded' : ''}`}
    >
      <div
        className="wb-inner"
        onClick={() => setExpanded((x) => !x)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded((x) => !x);
        }}
      >
        <span className="wb-icon" aria-hidden="true">
          {errors.length > 0 ? '⚠' : '!'}
        </span>
        <span className="wb-count">
          {errors.length > 0
            ? `${errors.length} error${errors.length > 1 ? 's' : ''}${warns.length > 0 ? ` + ${warns.length} warning${warns.length > 1 ? 's' : ''}` : ''}`
            : `${warns.length} warning${warns.length > 1 ? 's' : ''}`}
        </span>
        <span className="wb-sep">·</span>
        <span className="wb-scope">[{primary.scope}]</span>
        <span className="wb-msg">{primary.message}</span>
        {extraCount > 0 && !expanded && <span className="wb-more">+{extraCount} more</span>}
        <span className="wb-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <ul className="wb-list">
          {warnings.map((w) => (
            <li key={w.id} className={`wb-item wb-item-${w.severity}`}>
              <span className="wb-item-icon">{w.severity === 'error' ? '⚠' : '!'}</span>
              <span className="wb-item-scope">[{w.scope}]</span>
              <span className="wb-item-msg">{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
