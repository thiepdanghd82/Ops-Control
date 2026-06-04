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
 * Ignore-list (feat/quote-validation-ignore-list): the operator can
 * dismiss a specific validation error they intentionally left (e.g. a
 * deliberately-empty sub-product). Ignored errors move to a collapsed
 * "Ignored (n)" section and can be restored. The badge ALWAYS discloses
 * the ignored count ("3 errors (10 ignored)") so the bar never pretends
 * the quote is clean. Ignoring is purely presentational — it stores
 * `state.ignored_validations` (an array of stable warning IDs) which
 * persists with the quote (server-side, via the normal save) and does
 * NOT touch calcEngine, the validation engine, or any cost number.
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
import {
  partitionWarnings,
  addIgnore,
  removeIgnore,
  summarizeBadge,
} from '../../services/validationIgnore';
import './WarningBar.css';

// Stable empty fallback so the `ignoreList` reference doesn't change on
// every render (keeps the partitionWarnings useMemo from re-running).
const EMPTY_IGNORE = [];

export default function WarningBar({ activeModule, activeTab }) {
  const { stdState, cplxState, setStdField, setCplxField } = useCalc();
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

  // Ignore-list lives on the active calc state so it persists with the
  // quote (saved server-side, restored on LOAD_QUOTE on any machine).
  const isComplex = activeTab === 'complex';
  const activeCalcState = isComplex ? cplxState : stdState;
  const ignoreList = activeCalcState?.ignored_validations || EMPTY_IGNORE;
  const setIgnoreField = isComplex ? setCplxField : setStdField;

  const { active, ignored } = useMemo(
    () => partitionWarnings(warnings, ignoreList),
    [warnings, ignoreList]
  );

  // Expandable bar + a nested collapse for the Ignored section.
  const [expanded, setExpanded] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  if (!isCalcTab || (active.length === 0 && ignored.length === 0)) return null;

  const ignore = (id) => setIgnoreField('ignored_validations', addIgnore(ignoreList, id));
  const unignore = (id) => setIgnoreField('ignored_validations', removeIgnore(ignoreList, id));

  const errors = active.filter((w) => w.severity === 'error');
  const warns = active.filter((w) => w.severity === 'warn');
  const primary = errors[0] || warns[0] || null;
  const badge = summarizeBadge({ errors: errors.length, warns: warns.length }, ignored.length);
  const extraActive = active.length - 1; // active issues beyond the primary

  // Tone: red on active errors, amber on active warnings only, neutral
  // when everything visible is ignored (no false "clean" alarm colour).
  const tone = errors.length > 0 ? 'wb-error' : warns.length > 0 ? 'wb-warn' : 'wb-clean';
  const headIcon = errors.length > 0 ? '⚠' : active.length > 0 ? '!' : '✓';

  return (
    <div className={`warning-bar ${tone} ${expanded ? 'wb-expanded' : ''}`}>
      <div
        className="wb-inner"
        onClick={() => setExpanded((x) => !x)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded((x) => !x);
        }}
      >
        <span className="wb-icon" aria-hidden="true">
          {headIcon}
        </span>
        <span className="wb-count">{badge}</span>
        {primary && (
          <>
            <span className="wb-sep">·</span>
            <span className="wb-scope">[{primary.scope}]</span>
            <span className="wb-msg">{primary.message}</span>
            {extraActive > 0 && !expanded && <span className="wb-more">+{extraActive} more</span>}
          </>
        )}
        <span className="wb-chevron">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="wb-body">
          {active.length > 0 && (
            <ul className="wb-list">
              {active.map((w) => (
                <li key={w.id} className={`wb-item wb-item-${w.severity}`}>
                  <span className="wb-item-icon">{w.severity === 'error' ? '⚠' : '!'}</span>
                  <span className="wb-item-scope">[{w.scope}]</span>
                  <span className="wb-item-msg">{w.message}</span>
                  <button
                    type="button"
                    className="wb-act-btn wb-ignore-btn"
                    title="Ignore this error for this quote"
                    onClick={(e) => {
                      e.stopPropagation();
                      ignore(w.id);
                    }}
                  >
                    <span aria-hidden="true">🚫</span> Ignore
                  </button>
                </li>
              ))}
            </ul>
          )}

          {ignored.length > 0 && (
            <div className="wb-ignored">
              <button
                type="button"
                className="wb-ignored-toggle"
                aria-expanded={showIgnored}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIgnored((x) => !x);
                }}
              >
                <span className="wb-ignored-chevron" aria-hidden="true">
                  {showIgnored ? '▾' : '▸'}
                </span>
                Ignored ({ignored.length})
              </button>
              {showIgnored && (
                <ul className="wb-list wb-list-ignored">
                  {ignored.map((w) => (
                    <li key={w.id} className="wb-item wb-item-ignored">
                      <span className="wb-item-icon" aria-hidden="true">
                        🚫
                      </span>
                      <span className="wb-item-scope">[{w.scope}]</span>
                      <span className="wb-item-msg">{w.message}</span>
                      <button
                        type="button"
                        className="wb-act-btn wb-unignore-btn"
                        title="Restore this error to the active list"
                        onClick={(e) => {
                          e.stopPropagation();
                          unignore(w.id);
                        }}
                      >
                        <span aria-hidden="true">↩</span> Un-ignore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
