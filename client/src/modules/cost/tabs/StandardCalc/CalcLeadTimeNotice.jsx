import { useCallback, useMemo } from 'react';
import { useI18n } from '../../../../utils/useI18n';
import { fmtUsd, safeLeadTime } from './CalcLeadTimeNotice.helpers.js';
import './CalcLeadTimeNotice.css';

// Order matches Henry's spec: Material → Sample → PO → Remark → Process → Type of Material.
// Labels resolved via t('lt.col.<key>') so EN/VN locale toggle works.
const FIELDS = [
  { key: 'lt_material', i18n: 'lt.col.material_lt' },
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
 */
export default function CalcLeadTimeNotice({ leadTime, onChange, toolingCostTotal }) {
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
