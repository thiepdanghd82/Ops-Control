/**
 * CalcMaterials — Materials table for Standard Calculator
 * Matches COST V1.0 M05 materials section (20 rows, inline edit, material lookup)
 */
import { useCallback, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { useLibraryPicker } from '../../../../components/LibraryPicker/LibraryPicker';
import { calcMat, calcPitch, calcLayoutPerSheet, getActiveTierState } from '../../../../services/calcEngine';
import { fmtN } from '../../../../utils/format';
import DecimalInput from '../../../../utils/DecimalInput';

export default function CalcMaterials() {
  const { stdState, setMaterialField, dispatch } = useCalc();
  const { lib, getMatByCode } = useCostLib();
  const { openMenu } = useLibraryPicker();
  const st = stdState;
  const materials = useMemo(() => st.materials || [], [st.materials]);

  // Narrow dependencies: pitch/layout only depend on the fields that
  // actually feed calcPitch/calcLayoutPerSheet. Previously these memos
  // listed the whole `st` object, causing re-renders on every keystroke
  // in unrelated fields (selling_price, moq, …).
  const { sheet_length, min_gap_md, rotary_cols, parts_web_across, parts_in_md, num_webs } = st;

  const tierSt = useMemo(() => getActiveTierState(st), [st]);

  const globalPitch = useMemo(() => {
    try { return calcPitch({ sheet_length, min_gap_md, rotary_cols }); } catch { return 0; }
  }, [sheet_length, min_gap_md, rotary_cols]);

  const layoutWidth = st.web_width_td || 0;

  const layoutCavities = useMemo(() => {
    try { return calcLayoutPerSheet({ parts_web_across, parts_in_md, num_webs }); } catch { return 0; }
  }, [parts_web_across, parts_in_md, num_webs]);

  // Scrap% display = Σ(process scrap_pct). Display-only metric; the
  // underlying cost math still uses calcMatScrapFactor (compound yield)
  // via calcMat.
  const scrapDisplay = useMemo(() => {
    return (st.processes || []).reduce((acc, p) => {
      if (!p.workcenter || p.hidden) return acc;
      return acc + (p.scrap_pct || 0);
    }, 0);
  }, [st.processes]);

  const results = useMemo(() => {
    if (!lib) return [];
    return materials.map((mat) => {
      if (mat.hidden || !mat.code) return null;
      try {
        const moq = tierSt.moq || st.moq || 0;
        return calcMat(mat, tierSt, moq, null, null);
      } catch { return null; }
    });
  }, [materials, tierSt, lib, st.moq]);

  const handleField = useCallback((idx, field, value, isNum = false) => {
    setMaterialField(idx, field, isNum ? (parseFloat(value) || 0) : value);
  }, [setMaterialField]);

  // Sprint 1.6 — Setup LM is per-MOQ. The Setup Data per MOQ table in the
  // header already supports overrides, but operators expect the inline
  // Setup LM cell here to also follow the active MOQ — a per-MOQ value
  // they enter while MOQ 2 is active should NOT clobber MOQ 1's base.
  // Routes the write to base when active MOQ = 1 and to the per-tier
  // override slot otherwise. Read path mirrors getActiveTierState.
  const activeMoqIdx = st.active_moq_idx || 0;

  const setSetupLmActive = useCallback((matIdx, value) => {
    if (activeMoqIdx === 0) {
      setMaterialField(matIdx, 'setup_lm', (value === '' || value == null) ? 0 : Number(value));
      return;
    }
    const ei = activeMoqIdx - 1;
    const em = (st.extra_moqs || [])[ei] || {};
    const arr = Array.isArray(em.mat_setup_lm) ? [...em.mat_setup_lm] : [];
    // Empty / null → revert to base (drop the override). Number → store.
    arr[matIdx] = (value === '' || value == null) ? null
      : (Number.isFinite(Number(value)) ? Number(value) : null);
    dispatch({ type: 'SET_EXTRA_MOQ', payload: { idx: ei, field: 'mat_setup_lm', value: arr } });
  }, [activeMoqIdx, st.extra_moqs, setMaterialField, dispatch]);

  const getSetupLmActive = useCallback((mat, matIdx) => {
    if (activeMoqIdx === 0) return mat.setup_lm;
    const em = (st.extra_moqs || [])[activeMoqIdx - 1];
    const ovr = em?.mat_setup_lm?.[matIdx];
    return ovr != null ? ovr : mat.setup_lm;
  }, [activeMoqIdx, st.extra_moqs]);

  // True when the active MOQ has its own override for this row — drives
  // the amber visual cue so operators can see "this is a per-MOQ value"
  // at a glance, matching the legend in the Setup Data per MOQ table.
  const isSetupLmOverride = useCallback((matIdx) => {
    if (activeMoqIdx === 0) return false;
    const em = (st.extra_moqs || [])[activeMoqIdx - 1];
    return em?.mat_setup_lm?.[matIdx] != null;
  }, [activeMoqIdx, st.extra_moqs]);

  const lookupMat = useCallback((idx, code) => {
    const found = getMatByCode(code);
    if (found) {
      setMaterialField(idx, 'desc', found.description || found.desc || '');
      if (found.price) setMaterialField(idx, 'g_price', parseFloat(found.price) || 0);
      if (found.width) setMaterialField(idx, 'width', parseFloat(found.width) || 0);
    }
  }, [getMatByCode, setMaterialField]);

  const addRow = useCallback(() => {
    dispatch({ type: 'ADD_MATERIAL_ROW' });
  }, [dispatch]);

  const removeRow = useCallback((idx) => {
    dispatch({ type: 'REMOVE_MATERIAL_ROW', payload: { idx } });
  }, [dispatch]);

  // Right-click picker (Phase 10M). Opens the shared library menu;
  // the onPick callback receives a normalized row from whichever
  // library the user chose and fills code/IFS/desc/price in place.
  const handleRowContextMenu = useCallback((idx, event) => {
    openMenu({
      event,
      onPick: (hit) => {
        setMaterialField(idx, 'code', hit.code || '');
        setMaterialField(idx, 'ifs_code', hit.ifs_code || '');
        setMaterialField(idx, 'desc', hit.desc || '');
        if (hit.g_price) setMaterialField(idx, 'g_price', Number(hit.g_price) || 0);
      },
    });
  }, [openMenu, setMaterialField]);

  // Build the render list: tag each material with its original index (`_idx`)
  // so edit/remove handlers can target the underlying array, then drop rows
  // the user has explicitly hidden. Row count itself is user-controlled via
  // the "+ Add" / "×" buttons.
  const visibleMats = materials
    .map((m, i) => ({ ...m, _idx: i }))
    .filter(m => !m.hidden);

  // Totals
  const totals = useMemo(() => {
    let setup = 0, run = 0, total = 0;
    results.forEach(r => {
      if (r) { setup += r.setup_s || 0; run += r.run_s || 0; total += (r.setup_s || 0) + (r.run_s || 0); }
    });
    return { setup, run, total };
  }, [results]);

  return (
    <div className="sc-section">
      <div className="sc-card">
        <div className="sc-card-header sc-header-blue">
          <span className="sc-card-icon">&#9672;</span>
          <span className="sc-card-title">Materials ({visibleMats.length} rows)</span>
          <div className="sc-header-totals">
            <span className="sc-header-total-item">Setup: <b>${fmtN(totals.setup)}</b></span>
            <span className="sc-header-total-item">Run: <b>${fmtN(totals.run)}</b></span>
            <span className="sc-header-total-item sc-header-total-main">Total: <b>${fmtN(totals.total)}</b></span>
          </div>
        </div>
        <div className="sc-card-body sc-table-wrap">
          <table className="sc-table sc-mat-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Row</th>
                <th style={{ width: 85 }}>IFS Code</th>
                <th style={{ width: 130 }}>Desc.</th>
                <th style={{ width: 55 }}>Usage</th>
                <th style={{ width: 55 }}>Setup LM</th>
                <th style={{ width: 65 }} title="Override pitch from Layout. Empty = auto from Layout">Pitch</th>
                <th style={{ width: 50 }} title="Material width. Placeholder from Layout (Web Width TD)">Width</th>
                <th style={{ width: 45 }} title="Cavities. Placeholder from Layout (Parts Across × Parts MD)">Cav.</th>
                <th style={{ width: 50 }}>Offcut</th>
                <th style={{ width: 55 }} title="Offcut % — matches COST V1.0 Sheet 1 formula MOD(Cavities, Width) / Cavities. Type to override.">Offcut %</th>
                <th style={{ width: 50 }}>Slit</th>
                <th style={{ width: 65 }}>Ref. Price</th>
                <th style={{ width: 65 }}>Mat Price</th>
                <th className="sc-col-derived" style={{ width: 65 }} title="QPA m² = pitch × width / 1e6 / cavities / webs × usage">QPA (m²)</th>
                <th className="sc-col-derived" style={{ width: 65 }} title="QPA lm = pitch / 1000 / cavities / webs × usage">QPA (lm)</th>
                <th className="sc-col-derived" style={{ width: 50 }} title="Layout per sheet = parts_across × parts_md">L/Sheet</th>
                <th className="sc-col-derived" style={{ width: 50 }} title="Number of webs">Webs</th>
                <th className="sc-col-derived" style={{ width: 55 }} title="Scrap factor from processes">Scrap%</th>
                <th className="sc-col-result" style={{ width: 70 }}>Setup Cost</th>
                <th className="sc-col-result" style={{ width: 70 }}>Run Cost</th>
                <th className="sc-col-result" style={{ width: 70 }}>Total</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {(() => { let mc = 0, pc = 0; return visibleMats.map((mat) => {
                const i = mat._idx;
                const r = results[i];
                const isMain = mat.row_type === 'Main.Mat';
                if (isMain) mc++; else pc++;
                const hasErr = mat.code && (!mat.usage || !mat.width || !mat.cavities);

                const hasCode = !!mat.code;
                const selClass = !hasCode
                  ? 'sc-row-type-dim'
                  : (isMain ? 'sc-row-type-main' : 'sc-row-type-proc');
                const numClass = !hasCode
                  ? 'sc-row-num-dim'
                  : (isMain ? 'sc-row-num-main' : 'sc-row-num-proc');
                return (
                  <tr
                    key={mat._mid || `idx-${i}`}
                    className={hasErr ? 'sc-row-warn' : ''}
                    onContextMenu={e => handleRowContextMenu(i, e)}
                  >
                    <td>
                      <span className={`sc-row-label-cell${hasCode ? '' : ' sc-row-label-empty'}`}>
                        <select
                          value={mat.row_type || 'Main.Mat'}
                          onChange={e => handleField(i, 'row_type', e.target.value)}
                          className={`sc-row-type-sel ${selClass}`}
                        >
                          <option value="Main.Mat">Main.Mat</option>
                          <option value="Process Mat">Process Mat</option>
                        </select>
                        <span className={`sc-row-num ${numClass}`}>{isMain ? mc : pc}</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <input type="text" value={mat.code || ''} onChange={e => handleField(i, 'code', e.target.value)}
                          onBlur={e => lookupMat(i, e.target.value)} className="sc-input-sm" style={{ flex: 1 }} />
                      </div>
                    </td>
                    <td><input type="text" value={mat.desc || ''} onChange={e => handleField(i, 'desc', e.target.value)} className="sc-input-sm sc-input-desc" /></td>
                    <td><DecimalInput value={mat.usage} onChange={v => setMaterialField(i, 'usage', v)} placeholder="—" className={`sc-input-sm sc-input-num ${!mat.usage && mat.code ? 'sc-input-err' : ''}`} /></td>
                    {/* Sprint 1.6 — Setup LM tracks the active MOQ. Amber tint
                        when the active MOQ holds an override (matches the
                        Setup Data per MOQ legend). Editing routes to the
                        per-tier override slot, NOT the base. */}
                    <td><DecimalInput
                      value={getSetupLmActive(mat, i)}
                      onChange={v => setSetupLmActive(i, v)}
                      placeholder="—"
                      title={isSetupLmOverride(i)
                        ? `MOQ ${activeMoqIdx + 1} override (base = ${mat.setup_lm ?? 0})`
                        : (activeMoqIdx === 0 ? 'Base value (MOQ 1)' : `Inherits MOQ 1 base (${mat.setup_lm ?? 0}) — type to override`)}
                      className={`sc-input-sm sc-input-num ${isSetupLmOverride(i) ? 'sc-smt-inp-ovr' : ''} ${!getSetupLmActive(mat, i) && mat.code ? 'sc-input-err' : ''}`}
                    /></td>
                    {/* Pitch OVR / Width / Cav auto-sync from Layout tab.
                        Layout-derived values display in BLACK; once the user
                        types a non-zero value the cell switches to PURPLE
                        (bold) to mark it as an override. Clearing the cell
                        back to empty reverts state to 0 → black auto value.
                        Standard-Calc-specific: we also keep `.sc-input-err`
                        when mat.code is set but the field resolves to 0,
                        i.e. no layout default AND no override. */}
                    <td><input type="number" step="0.001"
                      value={mat.pitch_ovr > 0 ? mat.pitch_ovr : (globalPitch > 0 ? globalPitch.toFixed(1) : '')}
                      onChange={e => handleField(i, 'pitch_ovr', e.target.value, true)}
                      className="sc-input-sm sc-input-num"
                      style={mat.pitch_ovr > 0
                        ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                        : { color: 'var(--color-slate-900)' }}
                      title={mat.pitch_ovr > 0 ? 'Override — clear to revert to layout pitch' : 'Auto-synced from Layout'}
                    /></td>
                    <td><input type="number"
                      value={mat.width > 0 ? mat.width : (layoutWidth > 0 ? layoutWidth : '')}
                      onChange={e => handleField(i, 'width', e.target.value, true)}
                      className={`sc-input-sm sc-input-num ${!(mat.width > 0) && !(layoutWidth > 0) && mat.code ? 'sc-input-err' : ''}`}
                      style={mat.width > 0
                        ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                        : { color: 'var(--color-slate-900)' }}
                      title={mat.width > 0 ? 'Override — clear to revert to Web Width TD' : 'Auto-synced from Layout Web Width TD'}
                    /></td>
                    <td><input type="number" min="0"
                      value={mat.cavities > 0 ? mat.cavities : (layoutCavities > 0 ? layoutCavities : '')}
                      onChange={e => handleField(i, 'cavities', e.target.value, true)}
                      className={`sc-input-sm sc-input-num ${!(mat.cavities > 0) && !(layoutCavities > 0) && mat.code ? 'sc-input-err' : ''}`}
                      style={mat.cavities > 0
                        ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                        : { color: 'var(--color-slate-900)' }}
                      title={mat.cavities > 0 ? 'Override — clear to revert to Layout/Sheet' : 'Auto-synced from Layout/Sheet'}
                    /></td>
                    <td>
                      <select value={mat.offcut_yn ?? ''} onChange={e => handleField(i, 'offcut_yn', e.target.value)} className="sc-input-sm sc-select-bare">
                        <option value="Y">Y</option><option value="N">N</option><option value=""></option>
                      </select>
                    </td>
                    {/* Offcut % display mirrors Offcut Y/N selection:
                        - Y     → auto MOD(cav,width)/cav (or user override)
                        - N     → force 0%
                        - empty → Default 5% */}
                    {(() => {
                      const yn = mat.offcut_yn ?? '';
                      const effW = mat.width > 0 ? mat.width : (layoutWidth || 0);
                      const effCav = mat.cavities > 0 ? mat.cavities : (layoutCavities || 0);
                      const overridden = yn === 'Y' && mat.offcut_pct > 0;
                      let shown;
                      if (yn === 'N') shown = '0';
                      else if (yn === '') shown = '5';
                      else if (overridden) shown = mat.offcut_pct;
                      else if (effW > 0 && effCav > 0) shown = (((effCav % effW) / effCav) * 100).toFixed(1);
                      else shown = '';
                      return (
                        <td><input type="number" step="0.01" min="0" max="100"
                          value={shown}
                          onChange={e => handleField(i, 'offcut_pct', e.target.value, true)}
                          readOnly={yn !== 'Y'}
                          className="sc-input-sm sc-input-num"
                          style={overridden
                            ? { color: 'var(--color-violet-500)', fontWeight: 700 }
                            : { color: 'var(--color-slate-900)' }}
                          title={yn === 'N' ? 'Offcut=N → 0%' : yn === '' ? 'Default → 5%' : overridden ? 'Override — clear to revert to auto' : 'Auto = MOD(Cavities, Width) / Cavities'}
                        /></td>
                      );
                    })()}
                    <td>
                      <select value={mat.slitting_yn ?? ''} onChange={e => handleField(i, 'slitting_yn', e.target.value)} className="sc-input-sm sc-select-bare">
                        <option value="N">N</option><option value="Y">Y</option><option value=""></option>
                      </select>
                    </td>
                    <td><DecimalInput value={mat.g_price} onChange={v => setMaterialField(i, 'g_price', v)} placeholder="—" className="sc-input-sm sc-input-num" /></td>
                    <td><DecimalInput value={mat.latest} onChange={v => setMaterialField(i, 'latest', v)}
                      placeholder="—" className="sc-input-sm sc-input-num" style={mat.latest ? { color: '#7c3aed', fontWeight: 700 } : {}} /></td>
                    {/* Layout-derived columns */}
                    <td className="sc-td-derived">{r ? fmtN(r.qpa_m2, 6) : '\u2014'}</td>
                    <td className="sc-td-derived">{r ? fmtN(r.qpa_lm, 7) : '\u2014'}</td>
                    <td className="sc-td-derived">{r ? (r.layout_sheet || layoutCavities || '\u2014') : '\u2014'}</td>
                    <td className="sc-td-derived">{st.num_webs || '\u2014'}</td>
                    <td className="sc-td-derived" style={{ color: '#059669' }}>{r ? (scrapDisplay * 100).toFixed(1) + '%' : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.setup_s) : '\u2014'}</td>
                    <td className="sc-td-result">{r ? fmtN(r.run_s) : '\u2014'}</td>
                    <td className="sc-td-result sc-td-total">{r ? fmtN((r.setup_s || 0) + (r.run_s || 0)) : '\u2014'}</td>
                    <td><button className="sc-btn-del-circle sc-btn-del-sm" onClick={() => removeRow(i)} title="Remove row">&times;</button></td>
                  </tr>
                );
              }); })()}
            </tbody>
          </table>
          <div className="sc-add-row">
            <button className="op-btn op-btn-tertiary" onClick={addRow}>+ Add Material Row</button>
          </div>
        </div>
      </div>
    </div>
  );
}
