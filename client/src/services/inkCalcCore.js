// @ts-check
/**
 * Ink Calculator — pure formula engine extracted from InkCalculator.jsx
 * (Sprint 23). The component previously held these functions inline,
 * which meant:
 *   - No test import path — they were coupled to the React file.
 *   - A bug in the ink formula (like Sprint 5's negative-width) could
 *     only be caught by a running browser, not a fast unit test.
 *   - Golden end-to-end scenarios (Sprint 21/22 pattern) couldn't
 *     cover the ink path at all.
 *
 * Extraction is mechanical — functions are unchanged. Same return
 * shapes, same row mutation contract (meshRecalc / aniloxRecalc still
 * mutate the passed row; callers must pass fresh copies if they
 * want immutable updates — same as before).
 *
 * Dependencies: pulls three shared helpers from calcEngine.js
 * (calcPitch, calcLayoutPerSheet, calcMatScrapFactor). Layout math
 * stays in one module.
 */
import { calcPitch, calcLayoutPerSheet, calcMatScrapFactor } from './calcEngine.js';

/**
 * Silkscreen mesh recipe recalc. Mutates + returns the row for caller
 * convenience (historical contract from InkCalculator.jsx).
 *   open_area = w² × 100 / (w+d)²
 *   volume    = open_area × thickness / 100
 * @param {any} row
 */
export function meshRecalc(row) {
  const w = row.mesh_opening || 0;
  const d = row.thread_dia || 0;
  const D = row.mesh_thickness || 0;
  if (w > 0 && d > 0) {
    row.open_area_recipe = parseFloat(((w * w * 100) / ((w + d) * (w + d))).toFixed(3));
  }
  if (row.open_area_recipe > 0 && D > 0) {
    row.volume_recipe = parseFloat(((row.open_area_recipe * D) / 100).toFixed(3));
  }
  return row;
}

/**
 * Flexo anilox recipe recalc.
 *   calc_vol   = bcm × 1.55          (BCM → g/m² at 1.55 g/cm³)
 *   vol_recipe = calc_vol × eff / 100 (transfer efficiency)
 * @param {any} row
 */
export function aniloxRecalc(row) {
  const bcm = row.bcm || 0;
  row.calc_vol = bcm > 0 ? parseFloat((bcm * 1.55).toFixed(5)) : 0;
  const eff = row.transfer_eff || 0;
  row.vol_recipe =
    row.calc_vol > 0 && eff > 0 ? parseFloat(((row.calc_vol * eff) / 100).toFixed(5)) : 0;
  return row;
}

/**
 * Full ink cost runner. For each visible ink on each referenced state
 * (std or each cplx sub-product), produces a row with mat_width,
 * pitch_mm, ink_volume, setup_cost, total_cost, etc. Port of
 * COST V1.0 `_inkCalcRunCalc` / `_inkCalcRunCalcFlexo`.
 *
 * @param {'silkscreen' | 'flexo'} kind
 * @param {'std' | 'cplx'} source
 * @param {any} stdState
 * @param {any} cplxState
 * @param {any} inkCalc
 * @param {any[]} [prevRows]
 * @returns {any[]}
 */
export function runInkCalc(kind, source, stdState, cplxState, inkCalc, prevRows) {
  const isFlexo = kind === 'flexo';
  const db = isFlexo ? inkCalc.flexo?.aniloxDB || [] : inkCalc.silkscreen?.meshSpec || [];
  const specKey = isFlexo ? 'anilox_spec' : 'mesh_spec';

  const prevMap = (prevRows || []).reduce((acc, r) => {
    const k = (r.sp_label || '') + '|' + (r.color || '') + '|' + (r[specKey] || '');
    acc[k] = {
      repeat: r.repeat || 1,
      ink_price_ovr: r.ink_price_ovr || 0,
      density: r.density || 0,
      setup_kg_ovr: r.setup_kg_ovr || 0,
    };
    return acc;
  }, {});

  const stArr = [];
  if (source === 'std') {
    stArr.push({ st: stdState, label: 'Standard' });
  } else {
    (cplxState?.subproducts || []).forEach((sp, si) => {
      if (sp && (sp.inks || []).some((ik) => !ik.hidden && ik.color))
        stArr.push({ st: sp, label: 'SP' + (si + 1) });
    });
    if (stArr.length === 0 && (cplxState?.subproducts || [])[0]) {
      stArr.push({ st: cplxState.subproducts[0], label: 'SP1' });
    }
  }

  const newRows = [];
  stArr.forEach(({ st, label: spLabel }) => {
    const scrapFactor = calcMatScrapFactor(st);
    const layoutCavities = calcLayoutPerSheet(st);
    const globalPitch = calcPitch(st);
    const visInks = (st.inks || []).filter((ik) => {
      if (ik.hidden || !ik.color) return false;
      if (!isFlexo) return true; // silkscreen: all visible inks
      // flexo: match print_type or any anilox code in DB
      return ik.print_type === 'Flexo' || db.some((a) => a.anilox_code === ik.mesh_spec);
    });
    visInks.forEach((ik, idx) => {
      const dbRow = isFlexo
        ? db.find((a) => a.anilox_code === ik.mesh_spec)
        : db.find((m) => m.mesh_code === ik.mesh_spec);
      const mesh_count = !isFlexo && dbRow ? parseFloat(dbRow.mesh_count) || 0 : 0;
      const lpi = isFlexo && dbRow ? parseFloat(dbRow.lpi) || 0 : 0;
      const vol_recipe = dbRow
        ? parseFloat(dbRow.volume_recipe) ||
          parseFloat(dbRow.theo_ink_volume) ||
          parseFloat(dbRow.vol_recipe) ||
          0
        : 0;
      const matRow = (st.materials || []).find((m) => m.code === ik.base_mat);
      // Fallback: extract rightmost positive numeric substring from base_mat code.
      // Uses the same regex approach as calcEngine.calcInk — slice(-4) +
      // parseFloat would return -200 for codes like "ABC-200" because
      // parseFloat parses leading signs, silently producing a NEGATIVE
      // width that propagates through total_area → ink_volume → cost.
      const _widthMatch = !isFlexo ? String(ik.base_mat || '').match(/(\d+(?:\.\d+)?)\s*$/) : null;
      const _widthFromCode = _widthMatch ? Math.max(0, parseFloat(_widthMatch[1])) : 0;
      const mat_width = matRow ? parseFloat(matRow.width) || 0 : _widthFromCode;
      const pitch_mm = ik.pitch_mm > 0 ? ik.pitch_mm : globalPitch;
      const total_area = mat_width * pitch_mm;
      const ink_volume_max = vol_recipe * total_area * 1e-6;
      const area_pct = ik.area_pct || 0;
      const actual_ink_vol = ink_volume_max * area_pct;
      const k = spLabel + '|' + (ik.color || '') + '|' + (ik.mesh_spec || '');
      const prev = prevMap[k] || {};
      const density = prev.density > 0 ? prev.density : 1.0;
      const actual_ink_wt = actual_ink_vol * density;
      const waste = actual_ink_wt * scrapFactor;
      const weight_per_time = actual_ink_wt + waste;
      const repeat = prev.repeat || 1;
      const theo_supply = weight_per_time * repeat;
      const unit_per_kg = theo_supply > 0 ? Math.round(1000 / theo_supply) : 0;
      const m2_per_kg = Math.floor(total_area * 1e-6 * unit_per_kg);
      const qpa_kg =
        layoutCavities > 0 && weight_per_time > 0 ? weight_per_time / 1000 / layoutCavities : 0;
      const auto_price = ik.latest > 0 ? ik.latest : ik.s_price || 0;
      const ink_price_ovr = prev.ink_price_ovr || 0;
      const ink_price = ink_price_ovr > 0 ? ink_price_ovr : auto_price;
      const unit_price = qpa_kg * ink_price;
      const auto_setup_kg = parseFloat(ik.setup_kg) || 0;
      const setup_kg_ovr = prev.setup_kg_ovr || 0;
      const setup_kg_val = setup_kg_ovr > 0 ? setup_kg_ovr : auto_setup_kg;
      const moq =
        parseFloat(st.moq) || (source === 'cplx' ? parseFloat(cplxState?.moq) || 2000 : 2000);
      const setup_cost = moq > 0 ? (setup_kg_val * ink_price) / moq : 0;
      const total_cost = unit_price + setup_cost;
      newRows.push({
        sp_label: spLabel,
        row_label: 'Ink ' + (idx + 1),
        color: ik.color || '',
        [specKey]: ik.mesh_spec || '',
        ...(isFlexo ? { lpi } : { mesh_count }),
        repeat,
        mat_width,
        pitch_mm,
        print_area_pct: area_pct,
        density,
        total_area,
        ink_volume: ink_volume_max,
        actual_ink_vol,
        ink_weight: actual_ink_wt,
        process_lost: scrapFactor,
        auto_setup_kg,
        setup_kg_ovr,
        setup_kg_val,
        waste,
        weight_per_time,
        theo_supply,
        unit_per_kg,
        m2_per_kg,
        layout_cavities: layoutCavities,
        qpa_kg,
        auto_price,
        ink_price_ovr,
        ink_price,
        unit_price,
        moq,
        setup_cost,
        total_cost,
        source,
      });
    });
  });
  return newRows;
}
