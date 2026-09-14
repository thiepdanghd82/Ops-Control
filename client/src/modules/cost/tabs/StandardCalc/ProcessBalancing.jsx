/**
 * ProcessBalancing — Bottleneck detection, crew simulation, line efficiency
 * Matches COST V1.0 renderProcBalance (lines 5309-5611)
 */
import { useMemo, useCallback } from 'react';
import { useI18n } from '../../../../utils/useI18n';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { calcAll, getActiveTierState } from '../../../../services/calcEngine';
import { snapshotPricingParams } from '../../../../services/pricingSnapshot';
import { fmtN as _fmtN } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';

// Local wrapper: default 2 decimals for process-timing fields. Shared
// helper's default is 5; we just re-bind the default, otherwise identical
// em-dash / NaN / zero handling.
function fmtN(v, d = 2) {
  return _fmtN(v, d);
}

export default function ProcessBalancing() {
  const { t } = useI18n();
  const { stdState, setStdField } = useCalc();
  const { lib } = useCostLib();
  const st = stdState;

  // Crew overrides + target UPH live in stdState so they survive tab
  // navigation AND load/save cycles. Previously mirrored into local
  // useState which went out of sync when the user loaded a saved quote.
  // useMemo so downstream hooks get a stable reference when the underlying
  // field is unchanged (otherwise `{} || {}` creates a fresh object each
  // render and thrashes useMemo/useCallback dependencies).
  const crewAdj = useMemo(() => st._balanceCrew || {}, [st._balanceCrew]);
  const targetUPH = st._balanceTakt || 0;

  // Calculate all process results
  const tierSt = useMemo(() => getActiveTierState(st), [st]);
  const allResult = useMemo(() => {
    if (!lib) return null;
    const { snapshot } = snapshotPricingParams(st, lib);
    try {
      return calcAll(tierSt, null, lib, null, { snapshot });
    } catch {
      return null;
    }
  }, [tierSt, lib, st]);

  const procResults = useMemo(() => allResult?.procResults || [], [allResult]);
  const processes = useMemo(() => st.processes || [], [st.processes]);

  // Build active process list with balancing data
  const active = useMemo(() => {
    const list = [];
    let visIdx = 0;
    processes.forEach((p, i) => {
      if (p.hidden || (!p.process_type && !p.workcenter)) return;
      visIdx++;
      const r = procResults[i] || {};
      const mcUPH = Math.round(r.uph || 0);
      const manUPH = Math.round(p.manual_uph || 0);
      const baseCrew = Math.max(1, Math.round(r.crew || p.crew || 1));
      const adjCrew = crewAdj[i] != null ? crewAdj[i] : baseCrew;
      const repeat = p.repeat || 1;
      const setupHrs = (p.setup_h || 0) * repeat;
      const totalTimeBefore = (r.total_time || 0) / 60; // hrs
      const runHrsBefore = Math.max(0, totalTimeBefore - setupHrs);
      const canAdj = manUPH > 0;

      // Calculate running hours after crew adjustment
      let runHrsAfter = runHrsBefore;
      if (canAdj && adjCrew !== baseCrew) {
        if (mcUPH > 0 && manUPH > 0) {
          // Mixed: split by proportional contribution
          const invMc = 1 / mcUPH;
          const invMan = 1 / manUPH;
          const total = invMc + invMan;
          const machFrac = invMc / total;
          const manFrac = invMan / total;
          runHrsAfter = runHrsBefore * machFrac + (runHrsBefore * manFrac * baseCrew) / adjCrew;
        } else {
          // Pure manual
          runHrsAfter = (runHrsBefore * baseCrew) / adjCrew;
        }
      }

      const totalHrsAfter = setupHrs + runHrsAfter;

      // Effective UPH with crew
      let effUPH = 0;
      if (mcUPH > 0 && manUPH > 0) effUPH = Math.min(mcUPH, manUPH * adjCrew);
      else if (mcUPH > 0) effUPH = mcUPH;
      else if (manUPH > 0) effUPH = manUPH * adjCrew;

      // Cycle time
      const ctSec = effUPH > 0 ? 3600 / effUPH : null;

      list.push({
        i,
        visIdx,
        p,
        r,
        mcUPH,
        manUPH,
        baseCrew,
        adjCrew,
        canAdj,
        setupHrs,
        runHrsBefore,
        runHrsAfter,
        totalTimeBefore,
        totalHrsAfter,
        effUPH,
        ctSec,
        repeat,
      });
    });
    return list;
  }, [processes, procResults, crewAdj]);

  // Processes with valid UPH for balancing
  const withUPH = useMemo(() => active.filter((x) => x.effUPH > 0), [active]);

  // Bottleneck = lowest effective UPH (highest cycle time)
  const bnProc = useMemo(
    () => (withUPH.length > 0 ? withUPH.reduce((a, b) => (a.effUPH < b.effUPH ? a : b)) : null),
    [withUPH]
  );
  const maxCT = bnProc?.ctSec || 0;

  // Balance efficiency = sum(CT) / (n * CT_BN) * 100
  const lineEff = useMemo(() => {
    if (withUPH.length === 0 || maxCT <= 0) return 0;
    const sumCT = withUPH.reduce((s, x) => s + (x.ctSec || 0), 0);
    return (sumCT / (withUPH.length * maxCT)) * 100;
  }, [withUPH, maxCT]);

  // Total crew
  const totalCrew = useMemo(() => active.reduce((s, x) => s + x.adjCrew, 0), [active]);

  // Auto target UPH = minimum machine UPH
  const autoTarget = useMemo(() => {
    const machMin = withUPH
      .filter((x) => x.mcUPH > 0)
      .reduce((mn, x) => Math.min(mn, x.mcUPH), Infinity);
    return isFinite(machMin) ? machMin : 0;
  }, [withUPH]);

  const effectiveTarget = targetUPH > 0 ? targetUPH : autoTarget;
  const targetCT = effectiveTarget > 0 ? 3600 / effectiveTarget : null;

  // Crew handlers write straight to stdState — single source of truth.
  const adjustCrew = useCallback(
    (procIdx, delta) => {
      const base = active.find((x) => x.i === procIdx);
      const current = crewAdj[procIdx] != null ? crewAdj[procIdx] : base?.baseCrew || 1;
      const next = Math.max(1, current + delta);
      setStdField('_balanceCrew', { ...crewAdj, [procIdx]: next });
    },
    [active, crewAdj, setStdField]
  );

  if (!lib || active.length === 0) {
    return (
      <div className="pb" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        {t('bal.empty_no_proc')}
      </div>
    );
  }

  if (withUPH.length === 0) {
    return (
      <div className="pb" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        {t('bal.empty_no_uph')}
      </div>
    );
  }

  return (
    <div className="pb">
      {/* Header with KPIs */}
      <div className="pb-header">
        <div className="pb-header-left">
          <div className="pb-header-icon">&#9881;&#65039;</div>
          <div>
            <div className="pb-header-title">{t('bal.title')}</div>
            <div className="pb-header-sub">{t('bal.subtitle')}</div>
          </div>
        </div>
        <div className="pb-kpis">
          {/* Bottleneck */}
          <div className="pb-kpi pb-kpi-bn">
            <div className="pb-kpi-dot-red" />
            <div>
              <div className="pb-kpi-label">{t('bal.bottleneck')}</div>
              <div className="pb-kpi-val pb-kpi-val-bn">
                {t('bal.col.process')} {bnProc?.visIdx} &mdash;{' '}
                {bnProc?.p.workcenter || bnProc?.p.process_type || '?'}
              </div>
            </div>
          </div>
          {/* Balance Eff */}
          <div
            className={`pb-kpi ${lineEff >= 80 ? 'pb-kpi-green' : lineEff >= 60 ? 'pb-kpi-amber' : 'pb-kpi-red'}`}
          >
            <div className="pb-kpi-label">{t('bal.balance_eff')}</div>
            <div className="pb-kpi-val pb-kpi-val-eff">{lineEff.toFixed(1)}%</div>
          </div>
          {/* Total Crew */}
          <div className="pb-kpi pb-kpi-default">
            <div className="pb-kpi-label">{t('bal.total_crew')}</div>
            <div className="pb-kpi-val">{totalCrew}</div>
          </div>
          {/* Target UPH */}
          <div className="pb-kpi pb-kpi-default">
            <div className="pb-kpi-label">{t('bal.target_uph')}</div>
            <div className="pb-kpi-target">
              <DecimalInput
                value={targetUPH}
                placeholder={autoTarget > 0 ? String(autoTarget) : 'auto'}
                onChange={(v) => setStdField('_balanceTakt', v)}
                className="pb-target-input"
              />
              <span className="pb-target-unit">{t('bal.pcs_hr')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="pb-table-wrap">
        <table className="pb-table">
          <thead>
            <tr className="pb-group-row">
              <th colSpan={3} className="pb-group pb-group-info">
                {t('bal.grp.process_info')}
              </th>
              <th colSpan={2} className="pb-group pb-group-uph">
                {t('bal.grp.throughput')}
              </th>
              <th colSpan={3} className="pb-group pb-group-time">
                {t('bal.grp.time_before')}
              </th>
              <th colSpan={2} className="pb-group pb-group-crew">
                {t('bal.grp.crew_sim')}
              </th>
              <th colSpan={2} className="pb-group pb-group-speed">
                {t('bal.grp.line_speed')}
              </th>
              <th colSpan={3} className="pb-group pb-group-analysis">
                {t('bal.grp.analysis')}
              </th>
            </tr>
            <tr>
              <th className="pb-th">{t('bal.col.process')}</th>
              <th className="pb-th">{t('bal.col.type')}</th>
              <th className="pb-th">{t('bal.col.workcenter')}</th>
              <th className="pb-th right">
                {t('bal.col.mc_uph')}
                <br />
                <span className="pb-th-sub">{t('bal.col.machine')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.manual_uph')}
                <br />
                <span className="pb-th-sub">{t('bal.col.per_person')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.setup')}
                <br />
                <span className="pb-th-sub">{t('bal.col.hrs')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.running')}
                <br />
                <span className="pb-th-sub">{t('bal.col.hrs')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.prod_time')}
                <br />
                <span className="pb-th-sub">{t('bal.col.before_hrs')}</span>
              </th>
              <th className="pb-th center">
                {t('bal.col.adj')}
                <br />
                <span className="pb-th-sub">{t('bal.col.crew')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.prod_time')}
                <br />
                <span className="pb-th-sub">{t('bal.col.after_hrs')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.eff_uph')}
                <br />
                <span className="pb-th-sub">{t('bal.col.with_crew')}</span>
              </th>
              <th className="pb-th right">
                {t('bal.col.cycle_time')}
                <br />
                <span className="pb-th-sub">{t('bal.col.per_piece')}</span>
              </th>
              <th className="pb-th">
                {t('bal.col.load')}{' '}
                <span className="pb-th-sub" style={{ fontWeight: 400 }}>
                  {t('bal.col.vs_target')}
                </span>
              </th>
              <th className="pb-th center">{t('bal.col.status')}</th>
              <th className="pb-th">{t('bal.col.crew_suggestion')}</th>
            </tr>
          </thead>
          <tbody>
            {active.map((proc) => {
              const isBN = bnProc && proc.i === bnProc.i;
              const isSlow = !isBN && targetCT && proc.ctSec && proc.ctSec > targetCT * 1.02;
              const barPct =
                maxCT > 0 && proc.ctSec ? Math.min(100, (proc.ctSec / maxCT) * 100) : 0;
              const taktPct =
                targetCT && maxCT > 0 ? Math.min(100, (targetCT / maxCT) * 100) : null;
              const barColor = isBN ? '#ef4444' : isSlow ? '#f59e0b' : '#22c55e';
              const timeDelta =
                proc.totalTimeBefore > 0 ? proc.totalHrsAfter - proc.totalTimeBefore : 0;
              const showDelta =
                proc.canAdj && proc.adjCrew !== proc.baseCrew && Math.abs(timeDelta) > 0.001;

              // Crew suggestion
              let suggText = '';
              let suggColor = '#94a3b8';
              if (proc.canAdj && effectiveTarget > 0 && proc.manUPH > 0) {
                const req = Math.ceil(effectiveTarget / proc.manUPH);
                const delta = req - proc.adjCrew;
                if (delta > 0) {
                  suggText = `+${delta} needed \u2192 ${req}`;
                  suggColor = '#dc2626';
                } else if (delta < 0) {
                  suggText = `${delta} excess \u2192 ${req}`;
                  suggColor = '#0369a1';
                } else {
                  suggText = '\u2713 Balanced';
                  suggColor = '#16a34a';
                }
              }

              // CT display
              let ctDisp = '\u2014';
              if (proc.ctSec != null) {
                ctDisp =
                  proc.ctSec >= 60
                    ? `${(proc.ctSec / 60).toFixed(2)} min/pc`
                    : `${proc.ctSec.toFixed(2)} s/pc`;
              }

              // Prod time after background
              let ptAfterBg = '#f8faff';
              if (showDelta) ptAfterBg = timeDelta < 0 ? '#f0fdf4' : '#fef2f2';

              // Machine-paced note
              const machinePaced = proc.mcUPH > 0 && proc.manUPH === 0;

              return (
                <tr key={proc.i} className={isBN ? 'pb-row-bn' : isSlow ? 'pb-row-slow' : ''}>
                  {/* Process info */}
                  <td>
                    <span className="pb-proc-label">
                      {t('bal.col.process')} {proc.visIdx}
                    </span>
                  </td>
                  <td className="pb-td-type">{proc.p.process_type || '\u2014'}</td>
                  <td className="pb-td-wc">{proc.p.workcenter || '\u2014'}</td>

                  {/* UPH */}
                  <td className="pb-td-num" style={{ color: '#1a4a8a' }}>
                    {proc.mcUPH || '\u2014'}
                  </td>
                  <td className="pb-td-num" style={{ color: '#b45309' }}>
                    {proc.manUPH || '\u2014'}
                  </td>

                  {/* Time before */}
                  <td className="pb-td-num" style={{ background: '#faf5ff', color: '#6d28d9' }}>
                    {fmtN(proc.setupHrs)}
                  </td>
                  <td className="pb-td-num" style={{ background: '#f0fdfa', color: '#0e7490' }}>
                    {fmtN(proc.runHrsBefore)}
                  </td>
                  <td
                    className="pb-td-num pb-td-bold"
                    style={{ background: '#eff6ff', color: '#0369a1' }}
                  >
                    {fmtN(proc.totalTimeBefore)}
                  </td>

                  {/* Crew simulation */}
                  <td className="pb-td-crew">
                    {proc.canAdj ? (
                      <div className="pb-crew-ctrl">
                        <button
                          className="pb-crew-btn pb-crew-minus"
                          onClick={() => adjustCrew(proc.i, -1)}
                        >
                          &minus;
                        </button>
                        <span className="pb-crew-val">{proc.adjCrew}</span>
                        <button
                          className="pb-crew-btn pb-crew-plus"
                          onClick={() => adjustCrew(proc.i, 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="pb-crew-static">{proc.baseCrew}</span>
                    )}
                  </td>

                  {/* Prod time after */}
                  <td
                    className="pb-td-num"
                    style={{
                      background: ptAfterBg,
                      fontWeight: 600,
                      color:
                        showDelta && timeDelta < 0
                          ? '#16a34a'
                          : showDelta && timeDelta > 0
                            ? '#dc2626'
                            : '#0369a1',
                    }}
                  >
                    {fmtN(proc.totalHrsAfter)}
                    {showDelta && (
                      <span
                        className={`pb-delta ${timeDelta < 0 ? 'pb-delta-down' : 'pb-delta-up'}`}
                      >
                        {timeDelta < 0 ? '\u25BC' : '\u25B2'}
                        {Math.abs(timeDelta).toFixed(2)}
                      </span>
                    )}
                  </td>

                  {/* Line speed */}
                  <td
                    className="pb-td-num"
                    style={{ color: isBN ? '#dc2626' : '#0369a1', fontWeight: isBN ? 800 : 600 }}
                  >
                    {proc.effUPH > 0 ? proc.effUPH.toLocaleString() : '\u2014'}
                  </td>
                  <td className="pb-td-num" style={{ color: '#374151', fontSize: 11 }}>
                    {ctDisp}
                  </td>

                  {/* Load bar */}
                  <td className="pb-td-load">
                    <div className="pb-bar-wrap">
                      <div
                        className="pb-bar-fill"
                        style={{ width: barPct + '%', background: barColor }}
                      />
                      {taktPct != null && (
                        <div className="pb-bar-target" style={{ left: taktPct + '%' }} />
                      )}
                    </div>
                    <span className="pb-bar-text" style={{ color: barColor }}>
                      {barPct > 0 ? barPct.toFixed(0) + '% of BN' : ''}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="pb-td-status">
                    {proc.effUPH === 0 ? (
                      <span className="pb-badge pb-badge-none">{t('bal.no_uph')}</span>
                    ) : isBN ? (
                      <span className="pb-badge pb-badge-bn">{t('bal.bottleneck')}</span>
                    ) : isSlow ? (
                      <span className="pb-badge pb-badge-slow">{t('bal.slow')}</span>
                    ) : (
                      <span className="pb-badge pb-badge-ok">{t('bal.ok')}</span>
                    )}
                  </td>

                  {/* Crew suggestion */}
                  <td className="pb-td-sugg" style={{ color: suggColor }}>
                    {machinePaced ? (
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>
                        {t('bal.machine_paced')}
                      </span>
                    ) : suggText ? (
                      <span style={{ fontWeight: 600, fontSize: 11 }}>{suggText}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="pb-footer">
        <div className="pb-footer-left">
          <span className="pb-footer-icon">&#9888;&#65039;</span>
          <span>{t('bal.foot_synced')} </span>
          <b>
            {t('bal.col.prod_time')} {t('bal.col.after_hrs')}
          </b>{' '}
          {t('bal.foot_after')} <b>{t('bal.foot_not')}</b> {t('bal.foot_affect')}
        </div>
        <div className="pb-footer-right">
          {t('bal.foot_formula')}
          <sub>BN</sub>
          {t('bal.foot_target')}
        </div>
      </div>
    </div>
  );
}
