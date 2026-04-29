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
 */
import { fmtN, pct, gmClr, fmtInt } from '../../utils/format';
import { KPI_TOOLTIPS } from '../../utils/kpiDefinitions';

export default function CostSummaryBar({
  result, endCuPn = '',
  moqIdx = 0, moqQty = 0, eau = 0, sp = 0, target = 0,
}) {
  const r = result;
  return (
    <div className="sc-sumbar">
      <table className="sc-sumbar-table">
        <thead>
          <tr>
            <th className="sc-sumbar-th">Tier</th>
            <th className="sc-sumbar-th-cupn">End CU PN</th>
            <th className="sc-sumbar-th">MOQ</th>
            <th className="sc-sumbar-th">EAU</th>
            <th className="sc-sumbar-th sc-sumbar-th-mat" title="Total Material = Materials + Inks">Ttl. Mat</th>
            <th className="sc-sumbar-th sc-sumbar-th-proc">Process</th>
            <th className="sc-sumbar-th sc-sumbar-th-pack">Pack &amp; Ship</th>
            <th className="sc-sumbar-th sc-sumbar-th-sub">Subtotal</th>
            <th className="sc-sumbar-th sc-sumbar-th-sell">Sell Price</th>
            <th className="sc-sumbar-th">Target</th>
            <th className="sc-sumbar-th sc-sumbar-th-va" title={KPI_TOOLTIPS.va}>VA %</th>
            <th className="sc-sumbar-th sc-sumbar-th-contr" title={KPI_TOOLTIPS.contribution}>Contr %</th>
            <th className="sc-sumbar-th sc-sumbar-th-gm" title={KPI_TOOLTIPS.gm}>GM %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span className="sc-sumbar-tier-badge">MOQ {moqIdx + 1}</span></td>
            <td className="sc-sumbar-td-cupn" title={endCuPn || ''}>{endCuPn || '\u2014'}</td>
            <td>{fmtInt(moqQty)}</td>
            <td>{fmtInt(eau)}</td>
            <td className="sc-sumbar-td-mat" title="Materials + Inks">{r ? fmtN((r.s_mat_cost || 0) + (r.bd_ink_setup || 0) + (r.bd_ink_run || 0)) : '\u2014'}</td>
            <td className="sc-sumbar-td-proc">{r ? fmtN((r.overhead || 0) + (r.labor_cost || 0) + (r.tooling || 0)) : '\u2014'}</td>
            <td className="sc-sumbar-td-pack">{r ? fmtN(r.packing_ship) : '\u2014'}</td>
            <td className="sc-sumbar-td-sub">{r ? fmtN(r.s_ttl) : '\u2014'}</td>
            <td className="sc-sumbar-td-sell">{sp ? '$' + fmtN(sp, 4) : '\u2014'}</td>
            <td className="sc-sumbar-td-target">{target ? '$' + fmtN(target, 4) : '\u2014'}</td>
            <td className="sc-sumbar-td-va">{r ? pct(r.va) : '\u2014'}</td>
            <td className="sc-sumbar-td-contr">{r ? pct(r.contribution) : '\u2014'}</td>
            <td className="sc-sumbar-td-gm" style={{ color: r ? gmClr(r.gm) : '#94a3b8' }}>{r ? pct(r.gm) : '\u2014'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
