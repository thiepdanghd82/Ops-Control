/**
 * CostSummaryBar — shared persistent summary row for Standard and
 * Complex calculators. Extracted in Sprint 5.2 from
 * CalcSummaryBar + CplxSummaryBar which carried byte-identical table
 * markup. Each calculator keeps its own compute path:
 *   - Standard runs `calcAll` on the active-tier stdState and passes
 *     the result down.
 *   - Complex receives the already-aggregated `aggregateComplex`
 *     result with gm/va/contribution filled in by ComplexCalc.
 *
 * Purely presentational. KPI tooltips centralised in
 * `utils/kpiDefinitions.js` so the three Complex surfaces
 * (Summary Bar, Cost Breakdown, Summary tab) all surface the same
 * text on hover.
 *
 * Props:
 *   result      — null | { s_mat_cost, bd_ink_setup, bd_ink_run,
 *                           overhead, labor_cost, tooling, packing_ship,
 *                           s_ttl, va, contribution, gm }
 *   endCuPn     — string for the End CU PN cell
 *   moqIdx      — 0-based tier index
 *   moqQty, eau, sp, target — tier-level numbers
 *   tiers       — [{ idx, moq }] from `buildTierOptions`; when it holds
 *                 more than one entry AND `onTierChange` is supplied the
 *                 TIER cell becomes a dropdown, so the operator can switch
 *                 tier from here instead of going back to the RFQ card.
 *                 One tier keeps the plain badge: a dropdown with a single
 *                 option is a control that cannot do anything.
 *   onTierChange — (idx) => void. Supplied by the wrapper, never dispatched
 *                 from here, because Standard and Complex write the same
 *                 field through DIFFERENT actions — Std `SET_ACTIVE_MOQ`
 *                 lands in `stdState`, Cpx must route through
 *                 `SET_CPLX_FIELD` or the write is lost on save
 *                 (MES-3-FIX-53). This component stays presentational.
 */
import { fmtN, pct, gmClr, fmtInt } from '../../utils/format';
import { KPI_TOOLTIPS } from '../../utils/kpiDefinitions';
import { getKpiBuckets } from '../../services/kpiBuckets';
import { useI18n } from '../../utils/useI18n';
import { tierOptionLabel } from './CostSummaryBar.helpers.js';

export default function CostSummaryBar({
  result,
  endCuPn = '',
  moqIdx = 0,
  moqQty = 0,
  eau = 0,
  sp = 0,
  target = 0,
  tiers = [],
  onTierChange = null,
}) {
  const { t } = useI18n();
  const r = result;
  // FIX-47 — TTL.MAT no longer double-counts ink; PROCESS now includes
  // setup mach + setup labor (omitted pre-fix, so SS/Flexo quotes
  // showed PROCESS below the SUBTOTAL component). See kpiBuckets.js.
  const buckets = getKpiBuckets(r);
  return (
    <div className="sc-sumbar">
      <table className="sc-sumbar-table">
        <thead>
          <tr>
            <th className="sc-sumbar-th">{t('sumbar.tier')}</th>
            <th className="sc-sumbar-th-cupn">{t('sumbar.end_cu_pn')}</th>
            <th className="sc-sumbar-th">MOQ</th>
            <th className="sc-sumbar-th">EAU</th>
            <th className="sc-sumbar-th sc-sumbar-th-mat" title={t('sumbar.ttl_mat_tip')}>
              {t('sumbar.ttl_mat')}
            </th>
            <th className="sc-sumbar-th sc-sumbar-th-proc">{t('sumbar.process')}</th>
            <th className="sc-sumbar-th sc-sumbar-th-pack">{t('sumbar.pack_ship')}</th>
            <th className="sc-sumbar-th sc-sumbar-th-sub">{t('sumbar.subtotal')}</th>
            <th className="sc-sumbar-th sc-sumbar-th-sell">{t('sumbar.sell_price')}</th>
            <th className="sc-sumbar-th">{t('sumbar.target')}</th>
            <th className="sc-sumbar-th sc-sumbar-th-va" title={KPI_TOOLTIPS.va}>
              VA %
            </th>
            <th className="sc-sumbar-th sc-sumbar-th-contr" title={KPI_TOOLTIPS.contribution}>
              Contr %
            </th>
            <th className="sc-sumbar-th sc-sumbar-th-gm" title={KPI_TOOLTIPS.gm}>
              GM %
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {tiers.length > 1 && onTierChange ? (
                <select
                  className="sc-sumbar-tier-select"
                  value={moqIdx}
                  onChange={(e) => onTierChange(Number(e.target.value))}
                  aria-label={t('sumbar.tier_select_aria')}
                  title={t('sumbar.tier_select_aria')}
                >
                  {tiers.map((o) => (
                    <option key={o.idx} value={o.idx}>
                      {tierOptionLabel(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="sc-sumbar-tier-badge">MOQ {moqIdx + 1}</span>
              )}
            </td>
            <td className="sc-sumbar-td-cupn" title={endCuPn || ''}>
              {endCuPn || '\u2014'}
            </td>
            <td>{fmtInt(moqQty)}</td>
            <td>{fmtInt(eau)}</td>
            <td
              className="sc-sumbar-td-mat"
              title="Materials + Inks (s_mat_cost; already aggregates ink subcost)"
            >
              {buckets ? fmtN(buckets.ttl_mat) : '\u2014'}
            </td>
            <td
              className="sc-sumbar-td-proc"
              title="Setup mach + setup labor + overhead + run labor"
            >
              {buckets ? fmtN(buckets.process) : '\u2014'}
            </td>
            <td className="sc-sumbar-td-pack">{buckets ? fmtN(buckets.pack_ship) : '\u2014'}</td>
            <td className="sc-sumbar-td-sub">{buckets ? fmtN(buckets.subtotal) : '\u2014'}</td>
            <td className="sc-sumbar-td-sell">{sp ? '$' + fmtN(sp, 4) : '\u2014'}</td>
            <td className="sc-sumbar-td-target">{target ? '$' + fmtN(target, 4) : '\u2014'}</td>
            <td className="sc-sumbar-td-va">{r ? pct(r.va) : '\u2014'}</td>
            <td className="sc-sumbar-td-contr">{r ? pct(r.contribution) : '\u2014'}</td>
            <td className="sc-sumbar-td-gm" style={{ color: r ? gmClr(r.gm) : '#94a3b8' }}>
              {r ? pct(r.gm) : '\u2014'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
