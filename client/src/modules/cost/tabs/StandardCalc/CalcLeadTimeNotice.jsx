import { useCallback, useMemo } from 'react';
import { useI18n } from '../../../../utils/useI18n';
import {
  fmtUsd,
  safeLeadTime,
  resolveMaterialLtDisplay,
  buildRemarkFromSelection,
  resolveRemarkDisplay,
  remarkSelectAllState,
  toggleRemarkSelection,
  setAllRemarkSelection,
  isRemarkRowSelected,
} from './CalcLeadTimeNotice.helpers.js';
import { fmtN } from '../../../../utils/format';
import './CalcLeadTimeNotice.css';

// Read-only formatters for the Materials MOQ table. "—" for null/0.
function fmtMoqM2(v) {
  return v != null && v > 0 ? Math.round(v).toLocaleString('en-US') : '—';
}
function fmtClearPcs(v) {
  return v != null && v > 0 ? Math.round(v).toLocaleString('en-US') : '—';
}

// Material L/T + REMARK are rendered as dedicated auto-derive + override cells;
// the rest stay plain free-text. Order: Material → Sample → PO → Remark →
// Process → Type. REMARK sits between the before/after groups below.
const FIELDS_BEFORE_REMARK = [
  { key: 'lt_sample', i18n: 'lt.col.sample_lt' },
  { key: 'lt_po', i18n: 'lt.col.po_lt' },
];
const FIELDS_AFTER_REMARK = [
  { key: 'lt_process', i18n: 'lt.col.process' },
  { key: 'lt_material_type', i18n: 'lt.col.material_type' },
];

/**
 * CalcLeadTimeNotice — cover-sheet sub-tab capturing quote-level lead times +
 * free-text notes. Single row, 7 cells. Reused between StandardCalc + ComplexCalc
 * (Cpx imports this file; do NOT copy).
 *
 * Tooling cost (col 1) is READ-ONLY computed from parent's processes:
 *   - Std: Σ stdState.processes[i].tool_cost
 *   - Cpx: Σ subproducts[s].processes[i].tool_cost across all SPs
 * Single source of truth stays in processes[].tool_cost — this cell never
 * writes back (one-way sync). Operator edits tool_cost on the Processes tab;
 * switching back here re-derives via the parent useMemo (Lesson 18: sub-tab
 * unmount-remount pattern means this component re-renders on tab switch).
 *
 * Props:
 *   - leadTime: state.lead_time object (or undefined for legacy quotes).
 *     Component guards via `lt = leadTime || {}` + `lt[key] || ''` fallbacks.
 *   - onChange(nextLeadTime): caller dispatches SET_STD_FIELD / SET_CPLX_FIELD
 *     with field='lead_time' and the patched object.
 *   - toolingCostTotal: number, derived at parent (parent owns state shape).
 *   - materialLtAuto: string|null — auto-derived Material L/T ("<n> days") from
 *     the IFS/NPI libraries + Main.Mat rows (parent useMemo, same pattern as
 *     toolingCostTotal). Operator edit becomes a manual override (violet + ↻).
 */
export default function CalcLeadTimeNotice({
  leadTime,
  onChange,
  toolingCostTotal,
  materialLtAuto = null,
  materialsTable = [],
}) {
  const { t } = useI18n();

  // safeLeadTime heals legacy quotes (no state.lead_time at all) into
  // a stable shape with 6 string keys. Memoised so a `null` leadTime
  // doesn't churn the handleField useCallback dependency on every
  // render (react-hooks/exhaustive-deps clean).
  const lt = useMemo(() => safeLeadTime(leadTime), [leadTime]);

  const handleField = useCallback(
    (name, value) => {
      onChange({ ...lt, [name]: value });
    },
    [lt, onChange]
  );

  const toolingDisplay = fmtUsd(toolingCostTotal);
  const toolingTip = t('lt.tooling.synced_tip');
  const toolingCaption = t('lt.tooling.caption');
  const placeholder = t('lt.placeholder.multiline');

  // Material L/T: manual override (violet + ↻) wins, else the auto-derived
  // "<n> days" from the IFS/NPI libraries. Editing writes lt_material_ovr (the
  // override source of truth) — NOT lt_material directly.
  const matLt = resolveMaterialLtDisplay(lt, materialLtAuto);
  const matLtLabel = t('lt.col.material_lt');

  // REMARK: checkbox-driven auto text ("<IFS code>: <Clear MOQ> pcs" per checked
  // row) unless a manual override (lt_remark_ovr) is set. Editing writes the
  // override; ↻ clears it and re-enables the checkbox sync.
  const autoRemark = useMemo(
    () => buildRemarkFromSelection(materialsTable, lt.remark_selection),
    [materialsTable, lt.remark_selection]
  );
  const remarkDisp = resolveRemarkDisplay(lt, autoRemark);
  const remarkLabel = t('lt.col.remark');
  const selAll = remarkSelectAllState(materialsTable, lt.remark_selection);

  return (
    <div className="ltn-wrap">
      <div className="ltn-grid">
        <div className="ltn-col ltn-col-tooling">
          <div className="ltn-th">{t('lt.col.tooling_cost')}</div>
          <div
            className="ltn-cell ltn-tooling"
            title={toolingTip}
            aria-label={toolingTip}
            aria-readonly="true"
          >
            <div className="ltn-tooling-row">
              <span className="ltn-tooling-value">{toolingDisplay}</span>
              <span className="ltn-tooling-lock" aria-hidden="true">
                🔒
              </span>
            </div>
            <span className="ltn-tooling-caption">{toolingCaption}</span>
          </div>
        </div>
        <div className="ltn-col ltn-col-material">
          <div className="ltn-th">{matLtLabel}</div>
          <div className="ltn-cell">
            <div className="sc-pack-row">
              <textarea
                rows={3}
                value={matLt.value}
                onChange={(e) => handleField('lt_material_ovr', e.target.value)}
                placeholder={materialLtAuto || t('lt.material.auto_placeholder')}
                className={`ltn-input${matLt.isOverride ? ' sc-pack-tier-ovr' : ''}`}
                aria-label={matLtLabel}
                title={matLt.isOverride ? t('lt.material.manual_tip') : t('lt.material.auto_tip')}
              />
              {matLt.isOverride && (
                <button
                  type="button"
                  className="sc-pack-reset"
                  onClick={() => handleField('lt_material_ovr', '')}
                  title={t('lt.material.reset')}
                  aria-label={t('lt.material.reset')}
                >
                  ↻
                </button>
              )}
            </div>
            <span className="ltn-tooling-caption">
              {matLt.isOverride ? t('lt.material.manual_caption') : t('lt.material.auto_caption')}
            </span>
          </div>
        </div>
        {FIELDS_BEFORE_REMARK.map((f) => {
          const label = t(f.i18n);
          return (
            <div key={f.key} className={`ltn-col ltn-col-${f.key.replace('lt_', '')}`}>
              <div className="ltn-th">{label}</div>
              <div className="ltn-cell">
                <textarea
                  rows={3}
                  value={lt[f.key] || ''}
                  onChange={(e) => handleField(f.key, e.target.value)}
                  placeholder={placeholder}
                  className="ltn-input"
                  aria-label={label}
                />
              </div>
            </div>
          );
        })}
        {/* REMARK — checkbox-driven auto text unless manually overridden. */}
        <div className="ltn-col ltn-col-remark">
          <div className="ltn-th">{remarkLabel}</div>
          <div className="ltn-cell">
            <div className="sc-pack-row">
              <textarea
                rows={3}
                value={remarkDisp.value}
                onChange={(e) => handleField('lt_remark_ovr', e.target.value)}
                placeholder={t('lt.remark.auto_placeholder')}
                className={`ltn-input${remarkDisp.isOverride ? ' sc-pack-tier-ovr' : ''}`}
                aria-label={remarkLabel}
                title={remarkDisp.isOverride ? t('lt.remark.manual_tip') : t('lt.remark.auto_tip')}
              />
              {remarkDisp.isOverride && (
                <button
                  type="button"
                  className="sc-pack-reset"
                  onClick={() => handleField('lt_remark_ovr', '')}
                  title={t('lt.remark.reset')}
                  aria-label={t('lt.remark.reset')}
                >
                  ↻
                </button>
              )}
            </div>
            <span className="ltn-tooling-caption">
              {remarkDisp.isOverride ? t('lt.remark.manual_caption') : t('lt.remark.auto_caption')}
            </span>
          </div>
        </div>
        {FIELDS_AFTER_REMARK.map((f) => {
          const label = t(f.i18n);
          return (
            <div key={f.key} className={`ltn-col ltn-col-${f.key.replace('lt_', '')}`}>
              <div className="ltn-th">{label}</div>
              <div className="ltn-cell">
                <textarea
                  rows={3}
                  value={lt[f.key] || ''}
                  onChange={(e) => handleField(f.key, e.target.value)}
                  placeholder={placeholder}
                  className="ltn-input"
                  aria-label={label}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Read-only "Materials MOQ" table — synced FROM the Materials section +
          the NPI Materials library. Display-only: never writes quote state. */}
      <div className="ltn-matmoq">
        <div className="ltn-matmoq-title">{t('lt.matmoq.title')}</div>
        {materialsTable.length === 0 ? (
          <div className="ltn-matmoq-empty">{t('lt.matmoq.empty')}</div>
        ) : (
          <div className="ltn-matmoq-wrap">
            <table className="ltn-matmoq-table">
              <thead>
                <tr>
                  <th className="ltn-matmoq-chk">
                    <input
                      type="checkbox"
                      checked={selAll.checked}
                      ref={(el) => {
                        if (el) el.indeterminate = selAll.indeterminate;
                      }}
                      onChange={(e) =>
                        handleField(
                          'remark_selection',
                          setAllRemarkSelection(materialsTable, e.target.checked)
                        )
                      }
                      aria-label={t('lt.matmoq.select_all')}
                      title={t('lt.matmoq.select_all')}
                    />
                  </th>
                  <th>{t('lt.matmoq.row')}</th>
                  <th>{t('lt.matmoq.ifs_code')}</th>
                  <th>{t('lt.matmoq.quote_mat')}</th>
                  <th>{t('lt.matmoq.type')}</th>
                  <th className="ltn-matmoq-num">{t('lt.matmoq.leadtime')}</th>
                  <th className="ltn-matmoq-num">{t('lt.matmoq.qpa_m2')}</th>
                  <th className="ltn-matmoq-num">{t('lt.matmoq.moq_m2')}</th>
                  <th className="ltn-matmoq-num">{t('lt.matmoq.clear_pcs')}</th>
                </tr>
              </thead>
              <tbody>
                {materialsTable.map((r, i) => {
                  const selKey = String(r.ifs_code || '').trim();
                  return (
                    <tr key={`${r.ifs_code}-${i}`}>
                      <td className="ltn-matmoq-chk">
                        {selKey ? (
                          <input
                            type="checkbox"
                            checked={isRemarkRowSelected(lt.remark_selection, selKey)}
                            onChange={() =>
                              handleField(
                                'remark_selection',
                                toggleRemarkSelection(lt.remark_selection, selKey)
                              )
                            }
                            aria-label={`${t('lt.matmoq.select_row')} ${r.ifs_code}`}
                          />
                        ) : null}
                      </td>
                      <td>{r.row_label || '—'}</td>
                      <td
                        className={`ltn-matmoq-code${
                          r.ambiguous
                            ? ' ltn-matmoq-ambiguous'
                            : r.fuzzy
                              ? ' ltn-matmoq-fuzzy'
                              : selKey && !r.resolved
                                ? ' ltn-matmoq-unresolved'
                                : ''
                        }`}
                        title={
                          r.ambiguous
                            ? t('lt.matmoq.ambiguous_tip')
                            : r.fuzzy
                              ? t('lt.matmoq.fuzzy_tip')
                              : selKey && !r.resolved
                                ? t('lt.matmoq.unresolved_tip')
                                : undefined
                        }
                      >
                        {r.ifs_code || '—'}
                        {r.fuzzy && <span className="ltn-matmoq-approx"> ≈</span>}
                      </td>
                      <td>{r.quote_mat || '—'}</td>
                      <td>{r.type || '—'}</td>
                      <td className="ltn-matmoq-num">
                        {r.leadtime != null && r.leadtime > 0
                          ? Math.round(r.leadtime).toLocaleString('en-US')
                          : '—'}
                      </td>
                      <td className="ltn-matmoq-num">{r.qpa_m2 > 0 ? fmtN(r.qpa_m2, 6) : '—'}</td>
                      <td className="ltn-matmoq-num">{fmtMoqM2(r.moq_m2)}</td>
                      <td className="ltn-matmoq-num">{fmtClearPcs(r.clear_pcs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
