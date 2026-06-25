import { useCallback, useMemo } from 'react';
import { useI18n } from '../../../../utils/useI18n';
import { fmtUsd, safeLeadTime, resolveMaterialLtDisplay } from './CalcLeadTimeNotice.helpers.js';
import './CalcLeadTimeNotice.css';

// Material L/T (lt_material) is rendered as a dedicated auto-derive + override
// cell BEFORE this loop; the remaining 5 stay plain free-text textareas.
// Order matches Henry's spec: Material → Sample → PO → Remark → Process → Type.
const FIELDS = [
  { key: 'lt_sample', i18n: 'lt.col.sample_lt' },
  { key: 'lt_po', i18n: 'lt.col.po_lt' },
  { key: 'lt_remark', i18n: 'lt.col.remark' },
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
        {FIELDS.map((f) => {
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
    </div>
  );
}
