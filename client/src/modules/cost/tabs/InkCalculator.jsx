/**
 * InkCalculator — Ink Calculator with Silkscreen & Flexo sub-tabs
 * Matches COST V1.0 M16: renderLibInkCalc
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { sharedApi, costApi } from '../../../services/api';
import { useCalc } from '../../../context/CalcContext';
import { useAuth } from '../../../context/AuthContext';
import { meshRecalc, aniloxRecalc, runInkCalc } from '../../../services/inkCalcCore';
import DecimalInput from '../../../utils/DecimalInput';
import TabBarOverflow from '../../../components/Shared/TabBarOverflow';
import { toCSV, parseCSV, downloadCSV, pickCSVFile } from '../../../utils/csvIO';
import './InkCalculator.css';

// S-INK-IO (2026-05-05) — CSV column maps used for both export + import.
// Calculated columns (open_area_recipe, theo_ink_volume, calc_vol, vol_recipe)
// are EXPORTED for visibility but RECOMPUTED on import via meshRecalc /
// aniloxRecalc, so an out-of-date file can't pollute the live values.
const MESH_COLUMNS = [
  { key: 'mesh_code', header: 'Mesh Code', type: 'string' },
  { key: 'mesh_count', header: 'Mesh Count (n/cm)', type: 'number' },
  { key: 'thread_dia', header: 'Thread Dia (um)', type: 'number' },
  { key: 'mesh_thickness', header: 'Mesh Thickness (um)', type: 'number' },
  { key: 'tolerance', header: 'Tolerance', type: 'string' },
  { key: 'mesh_opening', header: 'Mesh Opening (um)', type: 'number' },
  { key: 'open_area', header: 'Open Area (%)', type: 'number' },
  { key: 'open_area_recipe', header: 'Open Area Calc (%)', type: 'number' },
  { key: 'theo_ink_volume', header: 'Theo Ink Vol (cm3/m2)', type: 'number' },
  { key: 'volume_recipe', header: 'Volume Recipe (cm3/m2)', type: 'number' },
];

const ANILOX_COLUMNS = [
  { key: 'anilox_code', header: 'Anilox Code', type: 'string' },
  { key: 'lpi', header: 'Line Count (lpi)', type: 'number' },
  { key: 'bcm', header: 'BCM', type: 'number' },
  { key: 'depth_um', header: 'Cell Depth (um)', type: 'number' },
  { key: 'tolerance', header: 'Tolerance', type: 'string' },
  { key: 'cell_opening_um', header: 'Cell Opening (um)', type: 'number' },
  { key: 'open_area_pct', header: 'Open Area (%)', type: 'number' },
  { key: 'calc_vol', header: 'Calc Volume (cm3/m2)', type: 'number' },
  { key: 'transfer_eff', header: 'Transfer Eff (%)', type: 'number' },
  { key: 'vol_recipe', header: 'V_R Recipe (cm3/m2)', type: 'number' },
];

function fmtN(v, d = 3) {
  if (v === undefined || v === '' || isNaN(v)) return '';
  return Number(v).toFixed(d);
}

// Run Calc (Silkscreen & Flexo) — formula extracted to services/inkCalcCore.js
// so it's testable without rendering the component. See Sprint 23 golden
// tests in inkCalcCore.golden.test.js for the validated behavior.

// ── Mesh Spec Sub-tab ──
function MeshSpecTab({ data, search, onUpdate, onAdd, onDelete }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(r => (r.mesh_code || '').toLowerCase().includes(q));
  }, [data, search]);

  // Accepts either a raw event string (legacy code paths) or a
  // pre-parsed number from DecimalInput. The typeof check lets both
  // call sites work without forking the recalc chain below.
  const handleChange = (idx, field, value, isNum = false) => {
    const realIdx = data.indexOf(filtered[idx]);
    if (realIdx < 0) return;
    const parsed = isNum
      ? (typeof value === 'number' ? value : (parseFloat(value) || 0))
      : value;
    const row = { ...data[realIdx], [field]: parsed };
    const recalced = ['thread_dia', 'mesh_thickness', 'mesh_opening', 'open_area_recipe'].includes(field)
      ? meshRecalc(row) : row;
    onUpdate(realIdx, recalced);
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ink-mesh-table">
        <thead>
          <tr>
            <th className="col-idx">#</th>
            <th>Mesh Code</th>
            <th colSpan={2}>Mesh Count <span style={{ fontWeight: 400, opacity: .7 }}>n</span></th>
            <th>Thread Dia <span style={{ fontWeight: 400, opacity: .7 }}>d</span></th>
            <th>Mesh Thickness <span style={{ fontWeight: 400, opacity: .7 }}>D</span></th>
            <th>Tolerance</th>
            <th>Mesh Opening <span style={{ fontWeight: 400, opacity: .7 }}>w</span></th>
            <th>Open Area <span style={{ fontWeight: 400, opacity: .7 }}>&alpha;</span></th>
            <th>Open Area <span style={{ fontWeight: 400, opacity: .7 }}>(calc)</span></th>
            <th>Theo. Ink Vol <span style={{ fontWeight: 400, opacity: .7 }}>V</span></th>
            <th>Volume Recipe <span style={{ fontWeight: 400, opacity: .7 }}>V_r</span></th>
            <th className="col-act">Act</th>
          </tr>
          <tr>
            <th className="unit-row"></th>
            <th className="unit-row"></th>
            <th className="unit-row" colSpan={2}>n/cm</th>
            <th className="unit-row">&mu;m</th>
            <th className="unit-row">&mu;m</th>
            <th className="unit-row">&mu;m</th>
            <th className="unit-row">&mu;m</th>
            <th className="unit-row">%</th>
            <th className="unit-row">% = w&sup2;/(w+d)&sup2;</th>
            <th className="unit-row">cm&sup3;/m&sup2;</th>
            <th className="unit-row">cm&sup3;/m&sup2; = &alpha;&times;D/100</th>
            <th className="unit-row"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, fi) => (
            <tr key={fi}>
              <td className="col-idx">{fi + 1}</td>
              <td><input type="text" value={r.mesh_code || ''} onChange={e => handleChange(fi, 'mesh_code', e.target.value)} /></td>
              <td colSpan={2}><DecimalInput value={r.mesh_count} onChange={v => handleChange(fi, 'mesh_count', v, true)} /></td>
              <td><DecimalInput value={r.thread_dia} onChange={v => handleChange(fi, 'thread_dia', v, true)} /></td>
              <td><DecimalInput value={r.mesh_thickness} onChange={v => handleChange(fi, 'mesh_thickness', v, true)} /></td>
              <td><input type="text" value={r.tolerance ?? ''} onChange={e => handleChange(fi, 'tolerance', e.target.value)} /></td>
              <td><DecimalInput value={r.mesh_opening} onChange={v => handleChange(fi, 'mesh_opening', v, true)} /></td>
              <td><DecimalInput value={r.open_area} onChange={v => handleChange(fi, 'open_area', v, true)} /></td>
              <td><DecimalInput value={r.open_area_recipe} className="ink-calc-input" onChange={v => handleChange(fi, 'open_area_recipe', v, true)} /></td>
              <td><DecimalInput value={r.theo_ink_volume} onChange={v => handleChange(fi, 'theo_ink_volume', v, true)} /></td>
              <td><DecimalInput value={r.volume_recipe} className="ink-calc-input" onChange={v => handleChange(fi, 'volume_recipe', v, true)} /></td>
              <td className="col-act"><button className="ink-del-btn" onClick={() => onDelete(data.indexOf(filtered[fi]))} title="Delete">&times;</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ink-add-row">
        <button className="ink-add-btn" onClick={onAdd}>+ Add Row</button>
      </div>
    </div>
  );
}

// ── Anilox DB Sub-tab ──
function AniloxDBTab({ data, search, onUpdate, onAdd, onDelete }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(r => (r.anilox_code || '').toLowerCase().includes(q));
  }, [data, search]);

  // Same dual-input pattern as MeshSpecTab above: accept a raw string
  // from legacy <input> paths OR a pre-parsed number from DecimalInput.
  const handleChange = (fi, field, value, isNum = false, recalc = false) => {
    const realIdx = data.indexOf(filtered[fi]);
    if (realIdx < 0) return;
    const parsed = isNum
      ? (typeof value === 'number' ? value : (parseFloat(value) || 0))
      : value;
    const row = { ...data[realIdx], [field]: parsed };
    const updated = recalc ? aniloxRecalc(row) : row;
    onUpdate(realIdx, updated);
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ink-anilox-table">
        <thead>
          <tr>
            <th className="col-idx">#</th>
            <th>Anilox Code</th>
            <th>Line Count <span className="unit-hint">lpi</span></th>
            <th>BCM <span className="unit-hint">10&sup6; in&sup3;/in&sup2;</span></th>
            <th>Cell Depth <span className="unit-hint">&mu;m</span></th>
            <th>Tolerance</th>
            <th>Cell Opening <span className="unit-hint">&mu;m</span></th>
            <th>Open Area &alpha; <span className="unit-hint">%</span></th>
            <th>Calc Volume <span className="unit-hint">cm&sup3;/m&sup2;</span></th>
            <th>Transfer Eff. <span className="unit-hint">%</span></th>
            <th>V_r (Recipe) <span className="unit-hint">cm&sup3;/m&sup2;</span></th>
            <th className="col-act">Act</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#6f6f6f', fontSize: 13 }}>No records &mdash; click <b>+ Add Row</b> to begin</td></tr>
          )}
          {filtered.map((r, fi) => (
            <tr key={fi}>
              <td className="col-idx">{fi + 1}</td>
              <td><input type="text" value={r.anilox_code || ''} onChange={e => handleChange(fi, 'anilox_code', e.target.value)} /></td>
              <td><DecimalInput value={r.lpi} onChange={v => handleChange(fi, 'lpi', v, true)} /></td>
              <td><DecimalInput value={r.bcm} onChange={v => handleChange(fi, 'bcm', v, true, true)} /></td>
              <td><DecimalInput value={r.depth_um} onChange={v => handleChange(fi, 'depth_um', v, true)} /></td>
              <td><input type="text" value={r.tolerance ?? ''} onChange={e => handleChange(fi, 'tolerance', e.target.value)} /></td>
              <td><DecimalInput value={r.cell_opening_um} onChange={v => handleChange(fi, 'cell_opening_um', v, true)} /></td>
              <td><DecimalInput value={r.open_area_pct} onChange={v => handleChange(fi, 'open_area_pct', v, true)} /></td>
              <td><input className="ink-auto-field" type="number" value={r.calc_vol ?? ''} readOnly title="= BCM x 1.55" /></td>
              <td><DecimalInput value={r.transfer_eff} onChange={v => handleChange(fi, 'transfer_eff', v, true, true)} /></td>
              <td><input className="ink-auto-field" type="number" value={r.vol_recipe ?? ''} readOnly title="= Calc Vol x Transfer Eff / 100" /></td>
              <td className="col-act"><button className="ink-del-btn" onClick={() => onDelete(data.indexOf(filtered[fi]))} title="Delete">&times;</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ink-add-row">
        <button className="ink-add-btn" onClick={onAdd}>+ Add Row</button>
      </div>
    </div>
  );
}

// ── QPA Cost Sub-tab (Silkscreen or Flexo) ──
function QPACostTab({ data, type, onRun }) {
  const totalUnit = data.reduce((s, r) => s + (r.unit_price || 0), 0);
  const totalSetup = data.reduce((s, r) => s + (r.setup_cost || 0), 0);
  const totalCost = data.reduce((s, r) => s + (r.total_cost || 0), 0);
  const displayMoq = data.length > 0 ? (data[0].moq || 2000) : 2000;
  const n = (v, d = 3) => (v !== undefined && v !== '' && !isNaN(v) && v !== 0) ? fmtN(v, d) : '\u2014';
  const pct = (v) => v != null && v !== '' ? fmtN((v || 0) * 100, 1) + '%' : '\u2014';
  const isSilk = type === 'silkscreen';
  const specLabel = isSilk ? 'Mesh' : 'Anilox';
  const specCountLabel = isSilk ? 'Mesh Count (n/cm)' : 'LPI';
  const footBg = isSilk ? '#1e3a5f' : '#4c1d95';

  return (
    <div>
      <div className="ink-qpa-toolbar">
        <button className="ink-run-btn ink-run-std" onClick={() => onRun && onRun('std')} title="Run calculation from Standard calculator state">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Standard
        </button>
        <button className="ink-run-btn ink-run-cplx" onClick={() => onRun && onRun('cplx')} title="Run calculation from Complex calculator sub-products">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Complex
        </button>
        <div style={{ flex: 1 }} />
        {data.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div className="ink-summary-badge ink-badge-unit">Unit: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>${fmtN(totalUnit, 5)}</span></div>
            <div className="ink-summary-badge ink-badge-setup">Setup: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>${fmtN(totalSetup, 5)}</span></div>
            <div className="ink-summary-badge ink-badge-total">Total: <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 900 }}>${fmtN(totalCost, 5)}</span></div>
            <div className="ink-summary-badge ink-badge-moq">MOQ: {displayMoq.toLocaleString()}</div>
          </div>
        )}
      </div>
      {data.length === 0 && (
        <div className="ink-empty">
          No data yet &mdash; click <b style={{ color: '#0f62fe' }}>Run Standard</b> or <b style={{ color: '#393939' }}>Run Complex</b> to calculate
        </div>
      )}
      {data.length > 0 && (
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        <table className="ink-qpa-table">
          <thead>
            <tr>
              <th className="section" colSpan={2} style={{ background: isSilk ? '#1e3a5f' : '#4c1d95' }}>Syns</th>
              <th className="section" colSpan={3} style={{ background: isSilk ? '#1e40af' : '#1e40af' }}>{specLabel} infor</th>
              <th className="section" colSpan={4} style={{ background: '#0f766e' }}>Print infor</th>
              <th className="section" colSpan={4} style={{ background: '#7c3aed' }}>Inks volume &amp; weight</th>
              <th className="section" colSpan={5} style={{ background: '#b45309' }}>Production costs</th>
              <th className="section" colSpan={3} style={{ background: '#166534' }}>Efficiency</th>
              <th className="section" colSpan={5} style={{ background: '#1d4ed8' }}>Costs</th>
            </tr>
            <tr>
              <th style={{ background: footBg, textAlign: 'left' }}>Row</th>
              <th style={{ background: footBg, textAlign: 'left' }}>Color</th>
              <th style={{ background: '#1e40af', textAlign: 'center' }}>{specLabel}<br />Spec</th>
              <th style={{ background: '#1e40af', textAlign: 'right' }}>{specCountLabel}</th>
              <th style={{ background: '#1e40af', textAlign: 'center' }}># Repeat</th>
              <th style={{ background: '#0f766e', textAlign: 'right' }}>Mat Width<br />(mm)</th>
              <th style={{ background: '#0f766e', textAlign: 'right' }}>Pitch<br />(mm)</th>
              <th style={{ background: '#0f766e', textAlign: 'right' }}>Print Area<br />(%)</th>
              <th style={{ background: '#0f766e', textAlign: 'center' }}>Density<br />(g/cm&sup3;)</th>
              <th style={{ background: '#7c3aed', textAlign: 'right' }}>Total Mat Area<br />(mm&sup2;)</th>
              <th style={{ background: '#7c3aed', textAlign: 'right' }}>Ink Vol Max<br />100% (cm&sup3;)</th>
              <th style={{ background: '#7c3aed', textAlign: 'right' }}>Actual Ink<br />Vol (cm&sup3;)</th>
              <th style={{ background: '#7c3aed', textAlign: 'right' }}>Actual Ink<br />Wt (g)</th>
              <th style={{ background: '#b45309', textAlign: 'right' }}>Process<br />Lost %</th>
              <th style={{ background: '#b45309', textAlign: 'center' }}>Setup<br />(kg)</th>
              <th style={{ background: '#b45309', textAlign: 'right' }}>Waste<br />(g)</th>
              <th style={{ background: '#b45309', textAlign: 'right' }}>Weight/<br />time (g)</th>
              <th style={{ background: '#b45309', textAlign: 'right' }}>Supply (g)</th>
              <th style={{ background: '#166534', textAlign: 'right' }}>Unit/kg</th>
              <th style={{ background: '#166534', textAlign: 'right' }}>m&sup2;/kg</th>
              <th style={{ background: '#166534', textAlign: 'right' }}>Layout<br />Cavities</th>
              <th style={{ background: '#1d4ed8', textAlign: 'right' }}>QPA<br />(kg/cav)</th>
              <th style={{ background: '#1d4ed8', textAlign: 'center' }}>Ink Price<br />($/kg)</th>
              <th style={{ background: '#1d4ed8', textAlign: 'right' }}>Unit Price<br />($)</th>
              <th style={{ background: '#1d4ed8', textAlign: 'right' }}>Setup<br />costs</th>
              <th style={{ background: '#1d4ed8', textAlign: 'right' }}>Total<br />costs</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.row_label ? `${r.row_label}-${r.color || ''}-${i}` : `ic-${i}`}>
                <td style={{ textAlign: 'left' }}>
                  <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 600 }}>{r.row_label || ''}</span>
                  {r.source === 'cplx' && <span style={{ marginLeft: 3, background: '#f3e8ff', color: '#7c3aed', borderRadius: 4, padding: '1px 4px', fontSize: 9 }}>{r.sp_label}</span>}
                </td>
                <td style={{ textAlign: 'left', fontWeight: 700, fontSize: 11 }}>{r.color || ''}</td>
                <td style={{ textAlign: 'center' }}>
                  {r[isSilk ? 'mesh_spec' : 'anilox_spec']
                    ? <span style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{r[isSilk ? 'mesh_spec' : 'anilox_spec']}</span>
                    : '\u2014'}
                </td>
                <td style={{ textAlign: 'right', color: '#4c1d95', fontWeight: 700 }}>{r[isSilk ? 'mesh_count' : 'lpi'] || '\u2014'}</td>
                <td style={{ textAlign: 'center', fontSize: 10 }}>{r.repeat || 1}</td>
                <td style={{ textAlign: 'right', color: '#475569' }}>{r.mat_width || '\u2014'}</td>
                <td style={{ textAlign: 'right', color: '#0f766e' }}>{n(r.pitch_mm, 1)}</td>
                <td style={{ textAlign: 'right', color: '#0f766e' }}>{pct(r.print_area_pct)}</td>
                <td style={{ textAlign: 'center', fontSize: 10 }}>{r.density || 1}</td>
                <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 700 }}>{r.total_area ? Math.round(r.total_area).toLocaleString() : '\u2014'}</td>
                <td style={{ textAlign: 'right', color: '#7c3aed' }}>{n(r.ink_volume, 4)}</td>
                <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{n(r.actual_ink_vol, 4)}</td>
                <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{n(r.ink_weight, 4)}</td>
                <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 700 }}>{pct(r.process_lost)}</td>
                <td style={{ textAlign: 'center', color: '#92400e', fontSize: 10, fontWeight: 600 }}>
                  {r.setup_kg_ovr > 0 ? fmtN(r.setup_kg_ovr, 4) : r.auto_setup_kg > 0 ? fmtN(r.auto_setup_kg, 4) : '\u2014'}
                </td>
                <td style={{ textAlign: 'right', color: '#dc2626' }}>{n(r.waste, 4)}</td>
                <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 700 }}>{n(r.weight_per_time, 4)}</td>
                <td style={{ textAlign: 'right', color: '#92400e' }}>{n(r.theo_supply, 4)}</td>
                <td style={{ textAlign: 'right', color: '#166534', fontWeight: 700 }}>{r.unit_per_kg ? r.unit_per_kg.toLocaleString() : '\u2014'}</td>
                <td style={{ textAlign: 'right', color: '#166534' }}>{r.m2_per_kg ? r.m2_per_kg.toLocaleString() : '\u2014'}</td>
                <td style={{ textAlign: 'right', color: '#475569' }}>{r.layout_cavities || '\u2014'}</td>
                <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{n(r.qpa_kg, 6)}</td>
                <td style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 700, fontSize: 10 }}>
                  {r.ink_price_ovr > 0 ? fmtN(r.ink_price_ovr, 2) : r.auto_price > 0 ? fmtN(r.auto_price, 2) : '\u2014'}
                </td>
                <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{n(r.unit_price, 5)}</td>
                <td style={{ textAlign: 'right', color: '#92400e' }}>{n(r.setup_cost, 5)}</td>
                <td style={{ textAlign: 'right', color: '#166534', fontWeight: 700 }}>{n(r.total_cost, 5)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: footBg }}>
              <td colSpan={23} style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.8)', letterSpacing: .5 }}>TOTAL UNIT PRICE / UNIT</td>
              <td style={{ textAlign: 'right', fontSize: 13, color: '#93c5fd', borderTop: '2px solid #3b82f6' }}>{fmtN(totalUnit, 5)}</td>
              <td style={{ textAlign: 'right', fontSize: 13, color: '#fcd34d', borderTop: '2px solid #fbbf24' }}>{fmtN(totalSetup, 5)}</td>
              <td style={{ textAlign: 'right', fontSize: 14, color: '#86efac', borderTop: '2px solid #4ade80' }}>{fmtN(totalCost, 5)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}

// ── Legend Sub-tab ──
// Each formula row is [col, nameEn, nameVi, formula, bg, fg]; the legend
// renders bilingual names so VN-first operators can scan the column letter
// against the field they remember from the worksheet header.
// S-INK-LEGEND (2026-05-05) — column-impact reference: which DB columns
// actually drive the ink calculation vs which are pure reference. Helps
// engineers focus on the right cells when editing or importing CSV.
// Tags: 'use' = drives formula · 'derived' = auto-computed output ·
// 'key' = lookup key · 'ref' = reference only.
const COLUMN_IMPACT = {
  flexo: [
    { col: 'Anilox Code',         tag: 'key',     en: 'Lookup key (matches ik.mesh_spec)',         vi: 'Khóa tra cứu (khớp với card mực)' },
    { col: 'Line Count (lpi)',    tag: 'ref',     en: 'Displayed in QPA output only',              vi: 'Chỉ hiện ở QPA, không vào công thức' },
    { col: 'BCM',                 tag: 'use',     en: 'Drives Calc Vol = BCM × 1.55',              vi: 'Tham gia Calc Vol = BCM × 1.55' },
    { col: 'Cell Depth (μm)',     tag: 'ref',     en: 'Physical reference, not in formula',        vi: 'Tham khảo vật lý, không vào công thức' },
    { col: 'Tolerance',           tag: 'ref',     en: 'Text note',                                 vi: 'Ghi chú text' },
    { col: 'Cell Opening (μm)',   tag: 'ref',     en: 'Physical reference, not in formula',        vi: 'Tham khảo vật lý, không vào công thức' },
    { col: 'Open Area α (%)',     tag: 'ref',     en: 'Physical reference, not in formula',        vi: 'Tham khảo vật lý, không vào công thức' },
    { col: 'Calc Volume',         tag: 'derived', en: 'Auto = BCM × 1.55',                         vi: 'Tự tính = BCM × 1.55' },
    { col: 'Transfer Eff. (%)',   tag: 'use',     en: 'Drives V_R = Calc Vol × Eff / 100',         vi: 'Tham gia V_R = Calc Vol × Eff / 100' },
    { col: 'V_R Recipe',          tag: 'derived', en: 'Final value read by Ink Calc',              vi: 'Giá trị Ink Calc thực sự dùng' },
  ],
  silkscreen: [
    { col: 'Mesh Code',           tag: 'key',     en: 'Lookup key (matches ik.mesh_spec)',         vi: 'Khóa tra cứu (khớp với card mực)' },
    { col: 'Mesh Count (n/cm)',   tag: 'ref',     en: 'Displayed in QPA output only',              vi: 'Chỉ hiện ở QPA, không vào công thức' },
    { col: 'Thread Dia d (μm)',   tag: 'use',     en: 'Drives Open Area Calc = w²/(w+d)² × 100',   vi: 'Tham gia Open Area Calc = w²/(w+d)² × 100' },
    { col: 'Mesh Thickness D (μm)', tag: 'use',   en: 'Drives Volume Recipe = α_calc × D / 100',   vi: 'Tham gia Volume Recipe = α_calc × D / 100' },
    { col: 'Tolerance',           tag: 'ref',     en: 'Text note',                                 vi: 'Ghi chú text' },
    { col: 'Mesh Opening w (μm)', tag: 'use',     en: 'Drives Open Area Calc = w²/(w+d)² × 100',   vi: 'Tham gia Open Area Calc = w²/(w+d)² × 100' },
    { col: 'Open Area α (%)',     tag: 'ref',     en: 'Measured value — Open Area Calc is used',   vi: 'Giá trị đo — engine dùng Open Area Calc' },
    { col: 'Open Area (Calc)',    tag: 'derived', en: 'Auto = w² / (w+d)² × 100',                  vi: 'Tự tính = w² / (w+d)² × 100' },
    { col: 'Theo Ink Vol',        tag: 'derived', en: 'Auto = α_calc × D / 100 (alias of V_r)',    vi: 'Tự tính = α_calc × D / 100 (alias V_r)' },
    { col: 'Volume Recipe V_r',   tag: 'derived', en: 'Final value read by Ink Calc',              vi: 'Giá trị Ink Calc thực sự dùng' },
  ],
};

const TAG_META = {
  use:     { label: 'In formula',  vi: 'Vào công thức', bg: '#defbe6', fg: '#0e6027' },
  derived: { label: 'Auto-derived', vi: 'Tự tính',      bg: '#edf5ff', fg: '#0043ce' },
  key:     { label: 'Lookup key',  vi: 'Khóa tra cứu', bg: '#f6f2ff', fg: '#6929c4' },
  ref:     { label: 'Reference',   vi: 'Tham khảo',    bg: '#f4f4f4', fg: '#525252' },
};

function LegendTab({ type }) {
  const isSilk = type === 'silkscreen';
  const impactRows = COLUMN_IMPACT[isSilk ? 'silkscreen' : 'flexo'];
  const formulas = isSilk ? [
    ['J', 'Total Mat Area (mm²)',     'Tổng diện tích vật liệu (mm²)', '= Mat Width × Pitch',                  '#dbeafe', '#1e40af'],
    ['K', 'Ink Vol Max (cm³)',         'Thể tích mực tối đa (cm³)',     '= V_r × Area / 1,000,000',             '#ede9fe', '#6d28d9'],
    ['L', 'Actual Ink Vol (cm³)',      'Thể tích mực thực tế (cm³)',    '= Ink Vol Max × Print Area %',         '#ede9fe', '#6d28d9'],
    ['M', 'Actual Ink Weight (g)',     'Khối lượng mực thực tế (g)',     '= Actual Vol × Density',               '#ede9fe', '#6d28d9'],
    ['P', 'Waste (g)',                 'Hao phí (g)',                    '= Ink Weight × Process Lost %',        '#fef3c7', '#92400e'],
    ['Q', 'Weight/time (g)',           'KL mỗi lần (g)',                 '= Ink Weight + Waste',                 '#fef3c7', '#92400e'],
    ['S', 'Unit/kg',                   'Đơn vị/kg',                      '= ROUND(1000 / Supply)',               '#dcfce7', '#166534'],
    ['V', 'QPA (kg/cav)',              'QPA (kg/cavity)',                '= (Weight/time / 1000) / Layout Cav.', '#dcfce7', '#166534'],
    ['X', 'Unit Price ($/unit)',       'Đơn giá ($/đơn vị)',             '= QPA × Ink Price',                    '#dbeafe', '#1d4ed8'],
    ['Y', 'Setup costs',               'Chi phí setup',                  '= Setup kg × Ink Price / MOQ',         '#fef3c7', '#92400e'],
  ] : [
    ['H', 'Calc Volume (cm³/m²)',     'Thể tích tính (cm³/m²)',         '= BCM × 1.55',                          '#dbeafe', '#1e40af'],
    ['J', 'V_r (Volume Recipe)',       'V_r (Recipe khối lượng)',         '= Calc Vol × Transfer Eff / 100',       '#dbeafe', '#1e40af'],
    ['K', 'Ink Vol Max (cm³)',         'Thể tích mực tối đa (cm³)',      '= V_r × Mat Area / 1,000,000',         '#ede9fe', '#6d28d9'],
    ['L', 'Actual Ink Vol (cm³)',      'Thể tích mực thực tế (cm³)',     '= Ink Vol Max × Print Area %',         '#ede9fe', '#6d28d9'],
    ['M', 'Actual Ink Weight (g)',     'Khối lượng mực thực tế (g)',     '= Actual Vol × Density',               '#ede9fe', '#6d28d9'],
    ['P', 'Waste (g)',                 'Hao phí (g)',                    '= Ink Weight × Process Lost %',        '#fef3c7', '#92400e'],
    ['Q', 'Weight/time (g)',           'KL mỗi lần (g)',                 '= Ink Weight + Waste',                 '#fef3c7', '#92400e'],
    ['R', 'Supply (g)',                'Cấp mực (g)',                    '= Weight/time × # Repeat',             '#fef3c7', '#92400e'],
    ['S', 'Unit/kg',                   'Đơn vị/kg',                      '= ROUND(1000 / Supply)',               '#dcfce7', '#166534'],
    ['V', 'QPA (kg/cavity)',           'QPA (kg/cavity)',                '= (Weight/time / 1000) / Layout Cav.', '#dcfce7', '#166534'],
    ['X', 'Unit Price ($/unit)',       'Đơn giá ($/đơn vị)',             '= QPA × Ink Price',                    '#dbeafe', '#1d4ed8'],
    ['Y', 'Setup costs',               'Chi phí setup',                  '= Setup kg × Ink Price / MOQ',         '#fef3c7', '#92400e'],
  ];

  return (
    <div className="ink-legend">
      <div className="ink-legend-header">
        <div className="ink-legend-title">
          LEGEND &mdash; {isSilk ? 'Silkscreen' : 'Flexo'} Ink Calculator
        </div>
        <div className="ink-legend-sub">
          <div>Reference guide for formulas, color coding, and {isSilk ? 'Silkscreen' : 'Flexo'} printing notes</div>
          <div className="ink-legend-sub-vi">Hướng dẫn công thức, mã màu và ghi chú in {isSilk ? 'lụa (Silkscreen)' : 'Flexo'}</div>
        </div>
      </div>
      <div className="ink-legend-grid">
        <div className="ink-legend-card">
          <div className="ink-legend-card-title">COLOR CODING / MÃ MÀU Ô</div>
          <div className="ink-color-list">
            <div className="ink-color-row"><div className="ink-color-swatch ink-swatch-blue" /><span><b className="ink-fg-blue">Blue cells</b> &mdash; Input fields / <b className="ink-fg-blue">Ô xanh</b> — trường nhập</span></div>
            <div className="ink-color-row"><div className="ink-color-swatch ink-swatch-yellow" /><span><b className="ink-fg-amber">Yellow cells</b> &mdash; Density input / <b className="ink-fg-amber">Ô vàng</b> — nhập tỷ trọng</span></div>
            <div className="ink-color-row"><div className="ink-color-swatch ink-swatch-purple" /><span><b className="ink-fg-violet">Purple cells</b> &mdash; Auto-calculated / <b className="ink-fg-violet">Ô tím</b> — tự tính</span></div>
            <div className="ink-color-row"><div className="ink-color-swatch ink-swatch-green" /><span><b className="ink-fg-green">Green cells</b> &mdash; Output results / <b className="ink-fg-green">Ô xanh lá</b> — kết quả</span></div>
          </div>
        </div>
        <div className="ink-legend-card">
          <div className="ink-legend-card-title">{isSilk ? 'SILKSCREEN NOTES / GHI CHÚ SILKSCREEN' : 'FLEXO NOTES / GHI CHÚ FLEXO'}</div>
          <div className="ink-notes-list">
            {isSilk ? (
              <>
                <div>Mesh Count (n/cm) = threads per centimeter</div>
                <div className="ink-note-vi">Mesh Count (n/cm) = số sợi trên 1 cm</div>
                <div>Volume Recipe V_r = &alpha;_calc &times; D / 100</div>
                <div className="ink-note-vi">Volume Recipe V_r = &alpha;_calc &times; D / 100 (D = độ dày sợi)</div>
                <div>Open Area (Calc) = w&sup2; / (w+d)&sup2; &times; 100</div>
                <div className="ink-note-vi">Diện tích mở (Calc) = w&sup2; / (w+d)&sup2; &times; 100</div>
              </>
            ) : (
              <>
                <div><b>BCM</b> (Billion Cubic Microns) &mdash; US standard for anilox cell volume</div>
                <div className="ink-note-vi"><b>BCM</b> (Tỷ micron khối) — đơn vị Mỹ đo thể tích ô anilox</div>
                <div><b>1 BCM &asymp; 1.55 cm&sup3;/m&sup2;</b> (conversion factor)</div>
                <div className="ink-note-vi"><b>1 BCM &asymp; 1.55 cm&sup3;/m&sup2;</b> (hệ số quy đổi)</div>
                <div><b>Transfer Efficiency</b>: typically 50&ndash;70% for Flexo</div>
                <div className="ink-note-vi"><b>Hiệu suất truyền</b>: thường 50&ndash;70% với Flexo</div>
                <div>Adjust Transfer Efficiency per ink/material type in Anilox DB</div>
                <div className="ink-note-vi">Điều chỉnh Transfer Efficiency theo loại mực/vật liệu trong Anilox DB</div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="ink-legend-card ink-legend-formulas-card">
        <div className="ink-legend-card-title">
          {isSilk ? 'Mesh Spec — Column Impact / Cột ảnh hưởng tính mực'
                  : 'Anilox DB — Column Impact / Cột ảnh hưởng tính mực'}
        </div>
        <div className="ink-impact-tag-row">
          {Object.entries(TAG_META).map(([k, m]) => (
            <span
              key={k}
              className="ink-impact-tag"
              style={{ background: m.bg, color: m.fg }}
            >
              {m.label} · {m.vi}
            </span>
          ))}
        </div>
        <table className="ink-impact-table">
          <thead>
            <tr>
              <th>Column / Cột</th>
              <th>Status</th>
              <th>Notes / Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {impactRows.map((r) => {
              const meta = TAG_META[r.tag];
              return (
                <tr key={r.col}>
                  <td className="ink-impact-col">{r.col}</td>
                  <td>
                    <span
                      className="ink-impact-tag"
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td>
                    <div>{r.en}</div>
                    <div className="ink-impact-vi">{r.vi}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ink-legend-card ink-legend-formulas-card">
        <div className="ink-legend-card-title">Main Formulas / Công thức chính</div>
        <div className="ink-formula-grid">
          {formulas.map(([col, nameEn, nameVi, formula, bg, color]) => (
            <div key={col} className="ink-formula-item" style={{ background: bg }}>
              <div className="ink-formula-badge" style={{ background: color }}>{col}</div>
              <div>
                <div className="ink-formula-name">{nameEn}</div>
                <div className="ink-formula-name-vi">{nameVi}</div>
                <div className="ink-formula-expr" style={{ color }}>{formula}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function InkCalculator() {
  const { stdState, cplxState } = useCalc();
  const { user } = useAuth();
  // S-INK-IO — sys + admin can replace the DB via CSV; everyone else
  // sees the buttons hidden. The /save-all endpoint also enforces tab
  // access server-side, so this is UX-only (defense-in-depth elsewhere).
  const canEditDB = !!user && (user.role === 'sys' || user.role === 'admin');
  const [inkCalc, setInkCalc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState('silkscreen');
  const [silkSub, setSilkSub] = useState('meshSpec');
  const [flexoSub, setFlexoSub] = useState('aniloxDB');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const d = await sharedApi.getInkCalc();
      // Ensure structure
      const data = d || {};
      if (!data.silkscreen) data.silkscreen = { meshSpec: [], qpaCost: [] };
      if (!data.flexo) data.flexo = { aniloxDB: [], qpaCost: [] };
      setInkCalc(data);
    } catch (err) {
      console.error('Failed to load ink calc:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveData = useCallback(async (newData) => {
    try {
      // Server /save-all expects key `inkCalcDB`, not `inkCalc`.
      await costApi.saveAll({ inkCalcDB: newData });
      setInkCalc(newData);
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, []);

  // Mesh Spec handlers
  const updateMeshRow = useCallback((idx, row) => {
    const newData = { ...inkCalc, silkscreen: { ...inkCalc.silkscreen, meshSpec: inkCalc.silkscreen.meshSpec.map((r, i) => i === idx ? row : r) } };
    setInkCalc(newData);
  }, [inkCalc]);

  const addMeshRow = useCallback(() => {
    const newData = { ...inkCalc, silkscreen: { ...inkCalc.silkscreen, meshSpec: [...inkCalc.silkscreen.meshSpec, { mesh_code: '', mesh_count: 0, thread_dia: 0, mesh_thickness: 0, tolerance: '', mesh_opening: 0, open_area: 0, open_area_recipe: 0, theo_ink_volume: 0, volume_recipe: 0 }] } };
    setInkCalc(newData);
  }, [inkCalc]);

  const deleteMeshRow = useCallback((idx) => {
    const newData = { ...inkCalc, silkscreen: { ...inkCalc.silkscreen, meshSpec: inkCalc.silkscreen.meshSpec.filter((_, i) => i !== idx) } };
    setInkCalc(newData);
  }, [inkCalc]);

  // Anilox DB handlers
  const updateAniloxRow = useCallback((idx, row) => {
    const newData = { ...inkCalc, flexo: { ...inkCalc.flexo, aniloxDB: inkCalc.flexo.aniloxDB.map((r, i) => i === idx ? row : r) } };
    setInkCalc(newData);
  }, [inkCalc]);

  const addAniloxRow = useCallback(() => {
    const newData = { ...inkCalc, flexo: { ...inkCalc.flexo, aniloxDB: [...inkCalc.flexo.aniloxDB, { anilox_code: '', lpi: 0, bcm: 0, depth_um: 0, tolerance: '', cell_opening_um: 0, open_area_pct: 0, calc_vol: 0, transfer_eff: 0, vol_recipe: 0 }] } };
    setInkCalc(newData);
  }, [inkCalc]);

  const deleteAniloxRow = useCallback((idx) => {
    const newData = { ...inkCalc, flexo: { ...inkCalc.flexo, aniloxDB: inkCalc.flexo.aniloxDB.filter((_, i) => i !== idx) } };
    setInkCalc(newData);
  }, [inkCalc]);

  // S-INK-IO — export current rows to CSV, named with today's date.
  const handleExportMesh = useCallback(() => {
    const rows = inkCalc?.silkscreen?.meshSpec || [];
    const csv = toCSV(rows, MESH_COLUMNS);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCSV(`mesh-spec-${ts}.csv`, csv);
  }, [inkCalc]);

  const handleExportAnilox = useCallback(() => {
    const rows = inkCalc?.flexo?.aniloxDB || [];
    const csv = toCSV(rows, ANILOX_COLUMNS);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCSV(`anilox-db-${ts}.csv`, csv);
  }, [inkCalc]);

  // Import: REPLACES the active table (matches IFS Inventory "Import"
  // semantics — full re-import). Calculated columns are recomputed via
  // meshRecalc / aniloxRecalc so an out-of-date export can't poison
  // derived values. Confirms before write so a bad pick is recoverable.
  const handleImportMesh = useCallback(async () => {
    const f = await pickCSVFile();
    if (!f) return;
    const { rows, skipped } = parseCSV(f.text, MESH_COLUMNS);
    if (rows.length === 0) {
      window.alert('No data rows found in CSV.\nKhông có dữ liệu trong file CSV.');
      return;
    }
    const ok = window.confirm(
      `Replace ${(inkCalc?.silkscreen?.meshSpec || []).length} existing Mesh Spec rows with ${rows.length} new rows from "${f.name}"?` +
        (skipped ? `\n(${skipped} blank rows skipped)` : '') +
        `\n\nThao tác này sẽ THAY THẾ toàn bộ Mesh Spec hiện tại.`,
    );
    if (!ok) return;
    const recalced = rows.map((r) => meshRecalc(r));
    const newData = {
      ...inkCalc,
      silkscreen: { ...inkCalc.silkscreen, meshSpec: recalced },
    };
    setInkCalc(newData);
    saveData(newData);
  }, [inkCalc, saveData]);

  const handleImportAnilox = useCallback(async () => {
    const f = await pickCSVFile();
    if (!f) return;
    const { rows, skipped } = parseCSV(f.text, ANILOX_COLUMNS);
    if (rows.length === 0) {
      window.alert('No data rows found in CSV.\nKhông có dữ liệu trong file CSV.');
      return;
    }
    const ok = window.confirm(
      `Replace ${(inkCalc?.flexo?.aniloxDB || []).length} existing Anilox DB rows with ${rows.length} new rows from "${f.name}"?` +
        (skipped ? `\n(${skipped} blank rows skipped)` : '') +
        `\n\nThao tác này sẽ THAY THẾ toàn bộ Anilox DB hiện tại.`,
    );
    if (!ok) return;
    const recalced = rows.map((r) => aniloxRecalc(r));
    const newData = {
      ...inkCalc,
      flexo: { ...inkCalc.flexo, aniloxDB: recalced },
    };
    setInkCalc(newData);
    saveData(newData);
  }, [inkCalc, saveData]);

  const handleSave = useCallback(() => {
    if (inkCalc) saveData(inkCalc);
  }, [inkCalc, saveData]);

  // Run QPA calc from current Standard or Complex state
  const runSilkscreen = useCallback((source) => {
    if (!inkCalc) return;
    const prev = inkCalc.silkscreen?.qpaCost || [];
    const rows = runInkCalc('silkscreen', source, stdState, cplxState, inkCalc, prev);
    setInkCalc({ ...inkCalc, silkscreen: { ...inkCalc.silkscreen, qpaCost: rows } });
  }, [inkCalc, stdState, cplxState]);

  const runFlexo = useCallback((source) => {
    if (!inkCalc) return;
    const prev = inkCalc.flexo?.qpaCost || [];
    const rows = runInkCalc('flexo', source, stdState, cplxState, inkCalc, prev);
    setInkCalc({ ...inkCalc, flexo: { ...inkCalc.flexo, qpaCost: rows } });
  }, [inkCalc, stdState, cplxState]);

  if (loading || !inkCalc) return <div className="ink-calc" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading Inks Calculator...</div>;

  const silkTotal = (inkCalc.silkscreen?.meshSpec?.length || 0) + (inkCalc.silkscreen?.qpaCost?.length || 0);
  const flexoTotal = (inkCalc.flexo?.aniloxDB?.length || 0) + (inkCalc.flexo?.qpaCost?.length || 0);

  let content;
  if (mainTab === 'silkscreen') {
    if (silkSub === 'meshSpec') {
      content = <MeshSpecTab data={inkCalc.silkscreen.meshSpec} search={search} onUpdate={updateMeshRow} onAdd={addMeshRow} onDelete={deleteMeshRow} />;
    } else if (silkSub === 'qpaCost') {
      content = <QPACostTab data={inkCalc.silkscreen.qpaCost} type="silkscreen" onRun={runSilkscreen} />;
    } else {
      content = <LegendTab type="silkscreen" />;
    }
  } else {
    if (flexoSub === 'aniloxDB') {
      content = <AniloxDBTab data={inkCalc.flexo.aniloxDB} search={search} onUpdate={updateAniloxRow} onAdd={addAniloxRow} onDelete={deleteAniloxRow} />;
    } else if (flexoSub === 'qpaCost') {
      content = <QPACostTab data={inkCalc.flexo.qpaCost} type="flexo" onRun={runFlexo} />;
    } else {
      content = <LegendTab type="flexo" />;
    }
  }

  return (
    <div className="ink-calc">
      {/* Header */}
      <div className="ink-calc-header">
        <div className="ink-calc-header-top">
          <div className="ink-calc-icon">&#127912;</div>
          <div className="ink-calc-title-wrap">
            <div className="ink-calc-title">Inks Calculator</div>
            <div className="ink-calc-subtitle">Reference ink database for cost calculator</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className={`ink-tab-btn ${mainTab === 'silkscreen' ? 'active' : ''}`} onClick={() => { setMainTab('silkscreen'); setSearch(''); }}>
              Silkscreen <span className="ink-tab-count">{silkTotal}</span>
            </button>
            <button className={`ink-tab-btn ${mainTab === 'flexo' ? 'active' : ''}`} onClick={() => { setMainTab('flexo'); setSearch(''); }}>
              Flexo <span className="ink-tab-count">{flexoTotal}</span>
            </button>
          </div>
          <input className="ink-search" type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          {canEditDB && mainTab === 'silkscreen' && silkSub === 'meshSpec' && (
            <>
              <button
                className="ink-io-btn"
                onClick={handleExportMesh}
                title="Export Mesh Spec to CSV (Excel compatible)"
              >
                {'⬇ Export CSV'}
              </button>
              <button
                className="ink-io-btn"
                onClick={handleImportMesh}
                title="Import Mesh Spec from CSV (replaces all rows; admin/sys only)"
              >
                {'⬆ Import CSV'}
              </button>
            </>
          )}
          {canEditDB && mainTab === 'flexo' && flexoSub === 'aniloxDB' && (
            <>
              <button
                className="ink-io-btn"
                onClick={handleExportAnilox}
                title="Export Anilox DB to CSV (Excel compatible)"
              >
                {'⬇ Export CSV'}
              </button>
              <button
                className="ink-io-btn"
                onClick={handleImportAnilox}
                title="Import Anilox DB from CSV (replaces all rows; admin/sys only)"
              >
                {'⬆ Import CSV'}
              </button>
            </>
          )}
          <button className="ink-save-btn" onClick={handleSave}>Save DB</button>
        </div>
        {/* Sub tabs — wrapped in TabBarOverflow for uniform responsive
            behavior across the 4 calc screens. 3 sub-tabs rarely
            overflow but arrows appear automatically if they do. */}
        {mainTab === 'silkscreen' && (
          <div className="ink-sub-tabs">
            <TabBarOverflow ariaLabel="Silkscreen sub-tabs">
              <button role="tab" aria-selected={silkSub === 'meshSpec'} aria-label="Mesh Spec" className={`ink-sub-btn ${silkSub === 'meshSpec' ? 'active' : ''}`} onClick={() => setSilkSub('meshSpec')}>Mesh Spec</button>
              <button role="tab" aria-selected={silkSub === 'qpaCost'}  aria-label="Cal. QPA and Cost" className={`ink-sub-btn ${silkSub === 'qpaCost' ? 'active' : ''}`}  onClick={() => setSilkSub('qpaCost')}>Cal. QPA and Cost</button>
              <button role="tab" aria-selected={silkSub === 'legend'}   aria-label="Legend" className={`ink-sub-btn ${silkSub === 'legend' ? 'active' : ''}`}   onClick={() => setSilkSub('legend')}>Legend</button>
            </TabBarOverflow>
          </div>
        )}
        {mainTab === 'flexo' && (
          <div className="ink-sub-tabs">
            <TabBarOverflow ariaLabel="Flexo sub-tabs">
              <button role="tab" aria-selected={flexoSub === 'aniloxDB'} aria-label="Anilox DB" className={`ink-sub-btn ${flexoSub === 'aniloxDB' ? 'active' : ''}`} onClick={() => setFlexoSub('aniloxDB')}>Anilox DB</button>
              <button role="tab" aria-selected={flexoSub === 'qpaCost'}  aria-label="Ink Calculator" className={`ink-sub-btn ${flexoSub === 'qpaCost' ? 'active' : ''}`}  onClick={() => setFlexoSub('qpaCost')}>Ink Calculator</button>
              <button role="tab" aria-selected={flexoSub === 'legend'}   aria-label="Legend" className={`ink-sub-btn ${flexoSub === 'legend' ? 'active' : ''}`}   onClick={() => setFlexoSub('legend')}>Legend</button>
            </TabBarOverflow>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="ink-body">
        <div className="ink-panel">
          {content}
        </div>
      </div>
    </div>
  );
}
