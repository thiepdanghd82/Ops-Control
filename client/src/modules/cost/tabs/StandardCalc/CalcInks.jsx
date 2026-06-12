/**
 * CalcInks — Inks table for Standard Calculator
 * Matches COST V1.0 M05 inks section
 */
import { useCallback, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useLibraryPicker } from '../../../../components/LibraryPicker/LibraryPicker';
import { calcInk, calcPitch, getActiveTierState } from '../../../../services/calcEngine';
import { isIndigoPrintType } from '../../../../services/printTypeUtils';
import {
  getCovOvrState,
  getCovOvrTooltip,
  MANUAL_OVERRIDE_COLOR,
} from '../../../../services/covOvrState';
import { fmtN, parseLocaleNumber } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';

export default function CalcInks() {
  const { stdState, setInkField, dispatch } = useCalc();
  const { lib } = useCostLib();
  const { openMenu } = useLibraryPicker();
  const st = stdState;
  const inks = useMemo(() => st.inks || [], [st.inks]);

  // Layout-synced defaults for the Pitch + Width columns. Operator-typed
  // per-row values override; empty falls back to these placeholders.
  const layoutPitch = useMemo(() => {
    try {
      return Number(calcPitch(st)) || 0;
    } catch {
      return 0;
    }
  }, [st]);
  const layoutWebWidth = Number(st.web_width_td) || 0;

  const tierSt = useMemo(() => getActiveTierState(st), [st]);

  const results = useMemo(() => {
    if (!lib) return [];
    return inks.map((ink) => {
      // Identity-gate parity with calcInk: a row is "real" if any of
      // color (Desc), ifs_code, or print_type is filled. Pre-fix code
      // bypassed calcInk entirely when only IFS Code or only Print Type
      // was set — operator saw Setup/Run/Total = "—" with no signal why.
      if (ink.hidden) return null;
      if (!ink.color && !ink.ifs_code && !ink.print_type) return null;
      try {
        const moq = tierSt.moq || st.moq || 0;
        return calcInk(ink, tierSt, moq, lib);
      } catch {
        return null;
      }
    });
  }, [inks, tierSt, lib, st.moq]);

  const handleField = useCallback(
    (idx, field, value, isNum = false) => {
      // VN locale support: parseLocaleNumber accepts "12,5" (12.5).
      setInkField(idx, field, isNum ? parseLocaleNumber(value) || 0 : value);
    },
    [setInkField]
  );

  const addRow = useCallback(() => {
    dispatch({ type: 'ADD_INK_ROW' });
  }, [dispatch]);

  const removeRow = useCallback(
    (idx) => {
      dispatch({ type: 'REMOVE_INK_ROW', payload: { idx } });
    },
    [dispatch]
  );

  // Right-click picker (Phase 10M). Inks don't have a separate material
  // code — the `color` field carries the ink's identity/description
  // (surfaced in the UI as the "Desc" column). We fill ifs_code + color
  // and mirror the picker price into BOTH s_price (Ref Price column
  // binds here; calcInk reads it) and g_price so any downstream
  // consumer sees the same number.
  const handleRowContextMenu = useCallback(
    (idx, event) => {
      openMenu({
        event,
        onPick: (hit) => {
          setInkField(idx, 'ifs_code', hit.ifs_code || '');
          // Desc column — prefer the library description, fall back to
          // code so the cell is never blank (calcInk treats `color` as
          // the row's identity and skips empty rows).
          setInkField(idx, 'color', hit.desc || hit.code || '');
          if (hit.g_price) {
            const price = Number(hit.g_price) || 0;
            setInkField(idx, 's_price', price);
            setInkField(idx, 'g_price', price);
          }
        },
      });
    },
    [openMenu, setInkField]
  );

  // Scrap% display = Σ(process scrap_pct). Display-only metric;
  // underlying cost math still uses calcMatScrapFactor (compound yield).
  const scrapDisplay = useMemo(() => {
    return (st.processes || []).reduce((acc, p) => {
      if (!p.workcenter || p.hidden) return acc;
      return acc + (p.scrap_pct || 0);
    }, 0);
  }, [st.processes]);

  const visibleInks = inks.map((ik, i) => ({ ...ik, _idx: i })).filter((ik) => !ik.hidden);

  // FIX-40: Ink rows read print_type from lib.ddl.print_type (the
  // coverage/click-charge keyed list: SS / SS(Glue) / Flexo / LP /
  // Indigo / Indigo(Primer) / Indigo(Spot) / Indigo(oil)), NOT
  // lib.ddl.print_type_list (which is the Process tab Workcenter list
  // with press subtypes like Indigo6800, SS(Sheet), Flexo(Gallus4C)…
  // and is consumed by Processes via TYPE_TO_DDL.Print). Two distinct
  // library lists with names that differ by a single suffix — easy to
  // mis-wire and the cascade silently zeroes Ink Run cost because the
  // Coverage Table key lookup misses.
  const printTypeOpts = useMemo(() => {
    if (!lib?.ddl?.print_type) return [];
    return Array.isArray(lib.ddl.print_type) ? lib.ddl.print_type : [];
  }, [lib]);

  const meshOpts = useMemo(() => {
    if (!lib?.inkCalc?.silkscreen?.meshSpec) return [];
    return lib.inkCalc.silkscreen.meshSpec.map((m) => m.mesh_code).filter(Boolean);
  }, [lib]);

  // Cov Ovr placeholder syncs from lib.ddl.coverage keyed by the row's
  // print_type so the operator can see the actual value calcInk uses
  // (e.g. SS → 30, Flexo → 300). Override still goes into coverage_override
  // and renders in violet. Indigo returns '' so the disabled cell stays
  // blank — Indigo uses click-charges, not coverage.
  const covLookup = useMemo(() => {
    const arr = lib?.ddl?.coverage || [];
    const m = new Map();
    for (const c of arr) {
      if (c && c.pt) m.set(c.pt, c.cov);
    }
    return m;
  }, [lib]);

  // Clicks dropdown options come from lib.ddl.click_charges keys (1, 2, 4,
  // 6, 7, 8, 10, 12, …) — matches V3.3 behaviour and prevents operators
  // from typing a click count the rate-card doesn't actually cover.
  const clickOpts = useMemo(() => {
    const ccTbl = lib?.ddl?.click_charges || {};
    return Object.keys(ccTbl)
      .map(Number)
      .filter((k) => !Number.isNaN(k) && k > 0)
      .sort((a, b) => a - b);
  }, [lib]);

  const totals = useMemo(() => {
    let setup = 0,
      run = 0,
      total = 0;
    results.forEach((r) => {
      if (r) {
        setup += r.setup_s || 0;
        run += r.run_s || 0;
        total += r.total || 0;
      }
    });
    return { setup, run, total };
  }, [results]);

  return (
    <div className="sc-section">
      <div className="sc-card">
        <div className="sc-card-header sc-header-cyan">
          <span className="sc-card-icon">&#8853;</span>
          <span className="sc-card-title">Inks ({visibleInks.length} rows)</span>
          <div className="sc-header-totals">
            <span className="sc-header-total-item">
              Setup: <b>${fmtN(totals.setup)}</b>
            </span>
            <span className="sc-header-total-item">
              Run: <b>${fmtN(totals.run)}</b>
            </span>
            <span className="sc-header-total-item sc-header-total-main">
              Total: <b>${fmtN(totals.total)}</b>
            </span>
          </div>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-ink-table">
            <thead>
              <tr>
                <th style={{ width: 55 }}>Label</th>
                <th style={{ width: 85 }}>IFS Code</th>
                <th style={{ width: 110 }}>Desc</th>
                <th style={{ width: 100 }}>Print Type</th>
                <th style={{ width: 90 }}>Mesh Spec</th>
                <th style={{ width: 70 }}>Pitch (mm)</th>
                <th
                  style={{ width: 80 }}
                  title="Web width (mm) — defaults to Layout's Web Width TD when blank"
                >
                  Width
                </th>
                <th style={{ width: 55 }}>Setup kg</th>
                <th style={{ width: 55 }}>Area %</th>
                <th style={{ width: 55 }} title="Coverage override (non-Indigo)">
                  Cov Ovr
                </th>
                <th style={{ width: 55 }}>Clicks</th>
                <th
                  style={{ width: 50 }}
                  className="sc-col-derived"
                  title="Scrap factor from processes"
                >
                  Scrap%
                </th>
                <th style={{ width: 65 }}>Ref Price</th>
                <th style={{ width: 65 }}>Ink Price</th>
                <th className="sc-col-result" style={{ width: 70 }}>
                  Setup
                </th>
                <th className="sc-col-result" style={{ width: 70 }}>
                  Run
                </th>
                <th className="sc-col-result" style={{ width: 70 }}>
                  Total
                </th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleInks.map((ink, vi) => {
                const i = ink._idx;
                const r = results[i];
                return (
                  <tr
                    key={ink._mid || `idx-${i}`}
                    onContextMenu={(e) => handleRowContextMenu(i, e)}
                  >
                    <td className="sc-td-idx">Ink {vi + 1}</td>
                    <td>
                      <input
                        type="text"
                        value={ink.ifs_code || ''}
                        onChange={(e) => handleField(i, 'ifs_code', e.target.value)}
                        className="sc-input-sm"
                        placeholder="IFS code"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={ink.color || ''}
                        onChange={(e) => handleField(i, 'color', e.target.value)}
                        className="sc-input-sm"
                        placeholder="Description"
                      />
                    </td>
                    <td>
                      <select
                        value={ink.print_type || ''}
                        onChange={(e) => handleField(i, 'print_type', e.target.value)}
                        className="sc-input-sm sc-select-bare"
                      >
                        <option value="">--</option>
                        {printTypeOpts.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={ink.mesh_spec || ''}
                        onChange={(e) => handleField(i, 'mesh_spec', e.target.value)}
                        className="sc-input-sm sc-select-bare"
                      >
                        <option value="">--</option>
                        {meshOpts.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <DecimalInput
                        value={ink.pitch_mm}
                        onChange={(v) => setInkField(i, 'pitch_mm', v)}
                        placeholder={
                          layoutPitch > 0 ? String(Math.round(layoutPitch * 100) / 100) : '—'
                        }
                        title="Pitch (mm). Empty = inherit from Layout. Type to override per ink."
                        className="sc-input-sm sc-input-num"
                        style={ink.pitch_mm > 0 ? { color: '#7c3aed', fontWeight: 700 } : undefined}
                      />
                    </td>
                    <td>
                      <DecimalInput
                        value={ink.width}
                        onChange={(v) => setInkField(i, 'width', v)}
                        placeholder={layoutWebWidth > 0 ? String(layoutWebWidth) : '—'}
                        title="Width (mm). Empty = inherit Web Width TD from Layout. Type to override per ink."
                        className="sc-input-sm sc-input-num"
                        style={ink.width > 0 ? { color: '#7c3aed', fontWeight: 700 } : undefined}
                      />
                    </td>
                    <td>
                      <DecimalInput
                        value={ink.setup_kg}
                        onChange={(v) => setInkField(i, 'setup_kg', v)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td>
                      {(() => {
                        const isInkReal = !!(ink.color || ink.ifs_code || ink.print_type);
                        const needsArea = isInkReal && !(Number(ink.area_pct) > 0);
                        return (
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            value={ink.area_pct ? Math.round(ink.area_pct * 100) : ''}
                            onChange={(e) =>
                              handleField(
                                i,
                                'area_pct',
                                (parseLocaleNumber(e.target.value) || 0) / 100
                              )
                            }
                            placeholder="—"
                            className={`sc-input-sm sc-input-num ${needsArea ? 'sc-input-warn' : ''}`}
                            title={needsArea ? 'AREA % bắt buộc để tính giá mực RUN' : undefined}
                          />
                        );
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const cov = getCovOvrState({
                          override: ink.coverage_override,
                          printType: ink.print_type,
                          covLookup,
                          isIndigo: isIndigoPrintType(ink.print_type),
                        });
                        const cls =
                          cov.state === 'auto'
                            ? 'sc-input-sm sc-input-num sc-cov-auto'
                            : 'sc-input-sm sc-input-num';
                        return (
                          <div className="sc-cov-cell">
                            <DecimalInput
                              value={ink.coverage_override}
                              onChange={(v) => setInkField(i, 'coverage_override', v)}
                              className={cls}
                              disabled={cov.state === 'indigo'}
                              style={
                                cov.state === 'manual'
                                  ? { color: MANUAL_OVERRIDE_COLOR, fontWeight: 700 }
                                  : {}
                              }
                              placeholder={cov.displayPlaceholder}
                              title={getCovOvrTooltip(cov)}
                            />
                            {cov.showReset && (
                              <button
                                type="button"
                                className="sc-cov-reset"
                                onClick={() => setInkField(i, 'coverage_override', null)}
                                title="Reset to default coverage"
                                aria-label="Reset to default coverage"
                              >
                                ↻
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <select
                        value={ink.clicks ? String(ink.clicks) : ''}
                        onChange={(e) =>
                          handleField(i, 'clicks', e.target.value ? Number(e.target.value) : 0)
                        }
                        className="sc-input-sm sc-select-bare"
                        disabled={!isIndigoPrintType(ink.print_type)}
                        title={
                          isIndigoPrintType(ink.print_type)
                            ? 'Pick the click count — charges come from Click Charges table'
                            : 'Indigo only'
                        }
                      >
                        <option value="">—</option>
                        {clickOpts.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="sc-td-derived" style={{ color: '#059669' }}>
                      {(scrapDisplay * 100).toFixed(1) + '%'}
                    </td>
                    <td>
                      <DecimalInput
                        value={ink.s_price}
                        onChange={(v) => setInkField(i, 's_price', v)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                      />
                    </td>
                    <td>
                      <DecimalInput
                        value={ink.latest}
                        onChange={(v) => setInkField(i, 'latest', v)}
                        placeholder="—"
                        className="sc-input-sm sc-input-num"
                        style={ink.latest ? { color: '#7c3aed', fontWeight: 700 } : {}}
                      />
                    </td>
                    <td className="sc-td-result">{r ? fmtN(r.setup_s) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.run_s) : '\u2014'}</td>
                    <td className="sc-td-result sc-td-total">{r ? fmtN(r.total) : '\u2014'}</td>
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
              + Add Ink Row
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
