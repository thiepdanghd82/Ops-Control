/**
 * CalcProcesses — Processes table for Standard Calculator
 * Matches COST V1.0 M05 processes section
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import {
  calcProcess,
  getActiveTierState,
  getProcessOptions,
  getWCOptionsByType,
  getRateByWC,
  getToolLife,
} from '../../../../services/calcEngine';
import { fmtN as _fmtN, parseLocaleNumber } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';
// ProcessBalancing is rendered as separate "Balancing" sub-tab

// Local wrapper: default 4 decimals for process cost fields.
function fmtN(v, d = 4) {
  return _fmtN(v, d);
}

export default function CalcProcesses() {
  const { stdState, setProcessField, dispatch } = useCalc();
  const { lib } = useCostLib();
  const st = stdState;
  const processes = useMemo(() => st.processes || [], [st.processes]);

  const tierSt = useMemo(() => getActiveTierState(st), [st]);

  const results = useMemo(() => {
    if (!lib) return [];
    return processes.map((proc) => {
      if (proc.hidden || !proc.workcenter) return null;
      try {
        const moq = tierSt.moq || st.moq || 0;
        return calcProcess(proc, tierSt, moq, lib);
      } catch {
        return null;
      }
    });
  }, [processes, tierSt, lib, st.moq]);

  const handleField = useCallback(
    (idx, field, value, isNum = false) => {
      // VN locale: parseLocaleNumber accepts "12,5" (truncated to 12 by
      // raw parseFloat — operator-reported regression).
      setProcessField(idx, field, isNum ? parseLocaleNumber(value) || 0 : value);
    },
    [setProcessField]
  );

  // Sprint 1.6 — Setup H is per-MOQ. Mirrors the per-tier routing we
  // added to CalcMaterials: editing while MOQ 2/3 is active writes to
  // the override, not the base. Empty input → revert to base.
  const activeMoqIdx = st.active_moq_idx || 0;

  const setSetupHActive = useCallback(
    (procIdx, value) => {
      // VN locale: parseLocaleNumber handles "12,5" (raw Number returns NaN).
      if (activeMoqIdx === 0) {
        setProcessField(
          procIdx,
          'setup_h',
          value === '' || value == null ? 0 : parseLocaleNumber(value) || 0
        );
        return;
      }
      const ei = activeMoqIdx - 1;
      const em = (st.extra_moqs || [])[ei] || {};
      const arr = Array.isArray(em.proc_setup_h) ? [...em.proc_setup_h] : [];
      const parsedH = parseLocaleNumber(value);
      arr[procIdx] =
        value === '' || value == null ? null : Number.isFinite(parsedH) ? parsedH : null;
      dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx: ei, field: 'proc_setup_h', value: arr } });
    },
    [activeMoqIdx, st.extra_moqs, setProcessField, dispatch]
  );

  const getSetupHActive = useCallback(
    (proc, procIdx) => {
      if (activeMoqIdx === 0) return proc.setup_h;
      const em = (st.extra_moqs || [])[activeMoqIdx - 1];
      const ovr = em?.proc_setup_h?.[procIdx];
      return ovr != null ? ovr : proc.setup_h;
    },
    [activeMoqIdx, st.extra_moqs]
  );

  const isSetupHOverride = useCallback(
    (procIdx) => {
      if (activeMoqIdx === 0) return false;
      const em = (st.extra_moqs || [])[activeMoqIdx - 1];
      return em?.proc_setup_h?.[procIdx] != null;
    },
    [activeMoqIdx, st.extra_moqs]
  );

  const handleProcessType = useCallback(
    (idx, value) => {
      setProcessField(idx, 'process_type', value);
      setProcessField(idx, 'workcenter', '');
    },
    [setProcessField]
  );

  const handleWorkcenter = useCallback(
    (idx, wc) => {
      setProcessField(idx, 'workcenter', wc);
      if (lib && wc) {
        const rate = getRateByWC(lib, wc);
        if (rate && rate.crew) setProcessField(idx, 'crew', rate.crew);
      }
    },
    [setProcessField, lib]
  );

  const handleToolType = useCallback(
    (idx, toolType) => {
      setProcessField(idx, 'tool_type', toolType);
      if (lib && toolType) {
        const life = getToolLife(lib, toolType);
        if (life > 0) setProcessField(idx, 'tool_life', life);
      }
    },
    [setProcessField, lib]
  );

  const addRow = useCallback(() => {
    dispatch({ type: 'ADD_PROCESS_ROW' });
  }, [dispatch]);

  const removeRow = useCallback(
    (idx) => {
      dispatch({ type: 'REMOVE_PROCESS_ROW', payload: { idx } });
    },
    [dispatch]
  );

  const processOptions = useMemo(() => getProcessOptions(), []);

  const visibleProcs = processes.map((p, i) => ({ ...p, _idx: i })).filter((p) => !p.hidden);

  const toolTypeOpts = useMemo(() => {
    if (!lib?.ddl?.tool_life) return [];
    return Object.keys(lib.ddl.tool_life);
  }, [lib]);

  // Backfill tool_life from DDL when loading a legacy quote where
  // tool_type was saved but tool_life was never populated (= 0).
  // The engine already falls back to getToolLife at compute time so
  // cost is correct — but the UI input only shows proc.tool_life, so
  // without this heal the column looks empty. Respect tool_life_ovr
  // so an operator's manual override is never overwritten.
  useEffect(() => {
    if (!lib?.ddl?.tool_life || !processes.length) return;
    processes.forEach((proc, i) => {
      if (!proc || proc.hidden || proc.tool_life_ovr) return;
      const hasType = !!proc.tool_type;
      const missing = !proc.tool_life || Number(proc.tool_life) === 0;
      if (hasType && missing) {
        const life = getToolLife(lib, proc.tool_type);
        if (life > 0) setProcessField(i, 'tool_life', life);
      }
    });
  }, [processes, lib, setProcessField]);

  const totals = useMemo(() => {
    let setupMach = 0,
      setupLabor = 0,
      runMach = 0,
      runLabor = 0,
      tooling = 0;
    results.forEach((r) => {
      if (r) {
        setupMach += r.setup_mach || 0;
        setupLabor += r.setup_labor || 0;
        runMach += r.run_mach || 0;
        runLabor += r.run_labor || 0;
        tooling += r.tooling || 0;
      }
    });
    return {
      setupMach,
      setupLabor,
      runMach,
      runLabor,
      tooling,
      total: setupMach + setupLabor + runMach + runLabor + tooling,
    };
  }, [results]);

  return (
    <div className="sc-section">
      <div className="sc-card">
        <div className="sc-card-header sc-header-green">
          <span className="sc-card-icon">&#9881;</span>
          <span className="sc-card-title">Processes ({visibleProcs.length} rows)</span>
          <div className="sc-header-totals">
            <span className="sc-header-total-item">
              Mach: <b>${fmtN(totals.setupMach + totals.runMach)}</b>
            </span>
            <span className="sc-header-total-item">
              Labor: <b>${fmtN(totals.setupLabor + totals.runLabor)}</b>
            </span>
            <span className="sc-header-total-item">
              Tool: <b>${fmtN(totals.tooling)}</b>
            </span>
            <span className="sc-header-total-item sc-header-total-main">
              Total: <b>${fmtN(totals.total)}</b>
            </span>
          </div>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-proc-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th style={{ width: 110 }}>Process Type</th>
                <th style={{ width: 110 }}>Workcenter</th>
                <th style={{ width: 45 }}>Rpt</th>
                <th style={{ width: 55 }}>Crew</th>
                <th style={{ width: 65 }}>Speed</th>
                <th style={{ width: 50 }}>Layout</th>
                <th style={{ width: 50 }}>Eff%</th>
                <th style={{ width: 55 }}>Setup H</th>
                <th style={{ width: 50 }}>Scrap%</th>
                <th
                  className="sc-col-derived"
                  style={{ width: 60 }}
                  title="Machine UPH from rate table"
                >
                  MC UPH
                </th>
                <th style={{ width: 60 }} title="Manual labor UPH (per person)">
                  Man UPH
                </th>
                <th style={{ width: 70 }}>Tool Cost</th>
                <th style={{ width: 90 }}>Tool Type</th>
                <th style={{ width: 65 }}>Tool Life</th>
                <th
                  className="sc-col-derived"
                  style={{ width: 65 }}
                  title="Production time in hours"
                >
                  Prod Time
                </th>
                <th className="sc-col-result" style={{ width: 65 }}>
                  S.Mach
                </th>
                <th className="sc-col-result" style={{ width: 65 }}>
                  S.Labor
                </th>
                <th className="sc-col-result" style={{ width: 65 }}>
                  R.Mach
                </th>
                <th className="sc-col-result" style={{ width: 65 }}>
                  R.Labor
                </th>
                <th className="sc-col-result" style={{ width: 65 }}>
                  Tooling
                </th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleProcs.map((proc, vi) => {
                const i = proc._idx;
                const r = results[i];
                const wcOpts = lib ? getWCOptionsByType(lib, proc.process_type) : [];
                return (
                  <tr key={proc._mid || `idx-${i}`}>
                    <td className="sc-td-idx">Process {vi + 1}</td>
                    <td>
                      <select
                        value={proc.process_type || ''}
                        onChange={(e) => handleProcessType(i, e.target.value)}
                        className="sc-input-sm sc-select-bare"
                      >
                        <option value="">--</option>
                        {processOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={proc.workcenter || ''}
                        onChange={(e) => handleWorkcenter(i, e.target.value)}
                        className="sc-input-sm sc-select-bare"
                      >
                        <option value="">--</option>
                        {wcOpts.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={proc.repeat ?? 1}
                        onChange={(e) => handleField(i, 'repeat', e.target.value, true)}
                        className="sc-input-sm sc-input-num"
                        style={{ background: '#fef3c7' }}
                      />
                    </td>
                    <td className="sc-td-auto">
                      {r ? r.crew || proc.crew || '\u2014' : proc.crew || '\u2014'}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={proc.speed || ''}
                        onChange={(e) => handleField(i, 'speed', e.target.value, true)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={proc.layout || ''}
                        onChange={(e) => handleField(i, 'layout', e.target.value, true)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                        title="Layout/batch count — required for machine workcenters (see Rate Table Machine USD/H)"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={proc.efficiency != null ? Math.round(proc.efficiency * 100) : 85}
                        onChange={(e) =>
                          handleField(
                            i,
                            'efficiency',
                            (parseLocaleNumber(e.target.value) || 0) / 100
                          )
                        }
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    {/* Sprint 1.6 — Setup H tracks active MOQ, amber when override. */}
                    <td>
                      <DecimalInput
                        value={getSetupHActive(proc, i)}
                        onChange={(v) => setSetupHActive(i, v)}
                        placeholder="—"
                        title={
                          isSetupHOverride(i)
                            ? `MOQ ${activeMoqIdx + 1} override (base = ${proc.setup_h ?? 0})`
                            : activeMoqIdx === 0
                              ? 'Base value (MOQ 1)'
                              : `Inherits MOQ 1 base (${proc.setup_h ?? 0}) — type to override`
                        }
                        className={`sc-input-sm sc-input-num ${isSetupHOverride(i) ? 'sc-smt-inp-ovr' : ''}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={proc.scrap_pct != null ? Math.round(proc.scrap_pct * 100) : 3}
                        onChange={(e) =>
                          handleField(
                            i,
                            'scrap_pct',
                            (parseLocaleNumber(e.target.value) || 0) / 100
                          )
                        }
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td className="sc-td-derived" style={{ color: '#1a4a8a', fontWeight: 700 }}>
                      {r && r.uph ? Math.round(r.uph).toLocaleString() : '\u2014'}
                    </td>
                    <td>
                      <DecimalInput
                        value={proc.manual_uph}
                        onChange={(v) => setProcessField(i, 'manual_uph', v)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                        style={{ color: '#b45309' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={proc.tool_cost || ''}
                        onChange={(e) => handleField(i, 'tool_cost', e.target.value, true)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td>
                      <select
                        value={proc.tool_type || ''}
                        onChange={(e) => handleToolType(i, e.target.value)}
                        className="sc-input-sm sc-select-bare"
                      >
                        <option value="">--</option>
                        {toolTypeOpts.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={proc.tool_life || ''}
                        onChange={(e) => handleField(i, 'tool_life', e.target.value, true)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td className="sc-td-derived">
                      {r && r.total_time ? (r.total_time / 60).toFixed(2) : '\u2014'}
                    </td>
                    <td className="sc-td-result">{r ? fmtN(r.setup_mach) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.setup_labor) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.run_mach) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.run_labor) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.tooling) : '\u2014'}</td>
                    <td>
                      <button
                        className="sc-btn-del-circle sc-btn-del-sm"
                        onClick={() => removeRow(i)}
                        title="Remove row"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="sc-add-row">
            <button className="op-btn op-btn-tertiary" onClick={addRow}>
              + Add Process Row
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
