/**
 * calcValidation — pure input-validation for the Standard / Complex
 * calculator state. Returns a flat list of English warning objects that
 * the WarningBar component renders at the bottom of the main layout.
 *
 * Contract: the validators NEVER mutate state; they only read it. The
 * WarningBar re-runs validation on every state change (via useMemo) so
 * the bar auto-hides the moment the last warning is resolved.
 *
 * Each warning has:
 *   - id:       stable string, used as React key
 *   - severity: 'error' (blocks save) | 'warn' (weird but allowed)
 *   - scope:    'Header' | 'Layout' | 'Materials' | 'Processes' | 'Pricing'
 *              | 'SubProduct' | 'MOQ'
 *   - message:  English, user-facing
 *
 * Extend by adding a new check to the relevant `validate<Thing>` helper.
 * Keep messages short — the bar is a single horizontal line.
 */

// ── Helpers ───────────────────────────────────────────────────────

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

// A material/process/ink row counts as "started" if the user filled any
// non-default field on it. Only started rows are validated for
// completeness — an untouched blank row shouldn't produce 8 warnings.
function materialStarted(m) {
  if (!m) return false;
  return !isBlank(m.code) || num(m.usage) > 0 || num(m.width) > 0 || num(m.s_price) > 0 || num(m.setup_lm) > 0;
}

function processStarted(p) {
  if (!p) return false;
  return !isBlank(p.process_type) || !isBlank(p.workcenter) || num(p.speed) > 0 || num(p.setup_h) > 0 || num(p.tool_cost) > 0;
}

// ── Per-section validators ────────────────────────────────────────

function validateHeader(st, scopeLabel = 'Header') {
  const out = [];
  if (isBlank(st.ccl_pn)) {
    out.push({ id: 'hdr-ccl-pn', severity: 'error', scope: scopeLabel, message: 'CCL Part Number is required' });
  }
  if (num(st.moq) < 0) {
    out.push({ id: 'hdr-moq-neg', severity: 'error', scope: scopeLabel, message: 'MOQ is negative — must be a positive number' });
  } else if (num(st.moq) <= 0) {
    out.push({ id: 'hdr-moq', severity: 'error', scope: scopeLabel, message: 'MOQ must be greater than 0 (MOQ = 0 inflates Setup/Tooling)' });
  }
  if (num(st.annual_qty) < 0) {
    out.push({ id: 'hdr-eau-neg', severity: 'error', scope: scopeLabel, message: 'Annual Qty (EAU) is negative — must be a positive number' });
  } else if (num(st.annual_qty) <= 0) {
    out.push({ id: 'hdr-eau', severity: 'error', scope: scopeLabel, message: 'Annual Qty (EAU) must be greater than 0' });
  }
  if (isBlank(st.trade_mode)) {
    out.push({ id: 'hdr-trade', severity: 'error', scope: scopeLabel, message: 'Trade Mode is required (USD Normal / USD Book)' });
  }
  if (isBlank(st.site)) {
    out.push({ id: 'hdr-site', severity: 'error', scope: scopeLabel, message: 'Site is required' });
  }
  if (num(st.selling_price) <= 0) {
    out.push({ id: 'hdr-sp', severity: 'warn', scope: scopeLabel, message: 'Selling Price is 0 — GM% / VA% / Contr% will show as N/A' });
  }
  return out;
}

function validateLayout(st, scopeLabel = 'Layout') {
  const out = [];
  if (num(st.part_width) <= 0) {
    out.push({ id: 'lay-width', severity: 'error', scope: scopeLabel, message: 'Part Width (TD) must be greater than 0' });
  }
  // Either sheet_length or part_length_md drives Pitch — require at least one
  if (num(st.sheet_length) <= 0 && num(st.part_length_md) <= 0) {
    out.push({ id: 'lay-length', severity: 'error', scope: scopeLabel, message: 'Part Length (MD) must be greater than 0' });
  }
  if (num(st.parts_in_md) <= 0) {
    out.push({ id: 'lay-parts-md', severity: 'warn', scope: scopeLabel, message: 'Parts in MD is 0 — Layout/Sheet will be 0' });
  }
  if (num(st.parts_web_across) <= 0) {
    out.push({ id: 'lay-parts-td', severity: 'warn', scope: scopeLabel, message: 'Parts across TD is 0 — Layout/Sheet will be 0' });
  }
  return out;
}

function validateMaterials(materials, scopeLabel = 'Materials', layoutWidth = 0) {
  const out = [];
  const started = (materials || []).filter(materialStarted);

  if (started.length === 0) {
    out.push({
      id: 'mat-empty',
      severity: 'error',
      scope: scopeLabel,
      message: 'Add at least one material row with code, width and usage > 0',
    });
    return out;
  }

  started.forEach((m, origIdx) => {
    // Find the original index so the message points at the right row
    const rowNum = (materials || []).indexOf(m) + 1;
    if (isBlank(m.code)) {
      out.push({
        id: `mat-code-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Material row ${rowNum}: Code is required`,
      });
    }
    // Width: row-level override OR layout fallback (CalcMaterials.jsx:213
    // displays layoutWidth when mat.width is 0). Only error if BOTH
    // effective sources are empty.
    if (num(m.width) <= 0 && num(layoutWidth) <= 0) {
      out.push({
        id: `mat-width-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Material row ${rowNum}: Width must be greater than 0`,
      });
    }
    if (num(m.usage) <= 0) {
      out.push({
        id: `mat-usage-${origIdx}`,
        severity: 'warn',
        scope: scopeLabel,
        message: `Material row ${rowNum}: Usage is 0 — this row will not contribute to cost`,
      });
    }
    if (num(m.s_price) <= 0 && num(m.g_price) <= 0 && num(m.latest) <= 0) {
      out.push({
        id: `mat-price-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Material row ${rowNum}: S.Price / G.Price / Latest all 0 — material cost will be 0`,
      });
    }
  });

  return out;
}

function getUomForWC(lib, wc) {
  if (!lib || !wc) return '';
  const rate = (lib.rate || []).find(r => r.workcenter === wc);
  return (rate?.speed_uom || '').replace(/\s/g, '').toLowerCase();
}

function getMachineRateForWC(lib, wc) {
  if (!lib || !wc) return 0;
  const rate = (lib.rate || []).find(r => r.workcenter === wc);
  return num(rate?.machine_rate);
}

function isHrsUom(uom) {
  return uom === 'hrs' || uom === 'hr';
}

function validateProcesses(processes, scopeLabel = 'Processes', lib = null) {
  const out = [];
  const started = (processes || []).filter(processStarted);

  if (started.length === 0) {
    out.push({
      id: 'proc-empty',
      severity: 'error',
      scope: scopeLabel,
      message: 'Add at least one process row with Workcenter and Speed > 0',
    });
    return out;
  }

  started.forEach((p, origIdx) => {
    const rowNum = (processes || []).indexOf(p) + 1;
    if (isBlank(p.workcenter)) {
      out.push({
        id: `proc-wc-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Process row ${rowNum}: Workcenter is required`,
      });
    }

    const uom = getUomForWC(lib, p.workcenter);
    const hrsMode = isHrsUom(uom);

    if (hrsMode) {
      // Hrs-UOM workcenters: cost is purely time-based (Setup H), no Speed needed.
      // BUT: if the workcenter's Machine USD/H (machine_rate) in Rate Table is 0/blank,
      // there is no machine cost to depend on Setup Hours — e.g. FQC (labor-only inspection).
      // In that case, Setup Hours is optional.
      const machineRate = getMachineRateForWC(lib, p.workcenter);
      if (machineRate > 0 && num(p.setup_h) <= 0) {
        out.push({
          id: `proc-setuph-${origIdx}`,
          severity: 'error',
          scope: scopeLabel,
          message: `Process row ${rowNum}: Setup Hours is required for "${p.workcenter}" (UOM = Hrs)`,
        });
      }
    } else {
      // Normal workcenters: require Speed or Manual UPH
      if (num(p.speed) <= 0 && num(p.manual_uph) <= 0) {
        out.push({
          id: `proc-speed-${origIdx}`,
          severity: 'error',
          scope: scopeLabel,
          message: `Process row ${rowNum}: Speed (or Manual UPH) must be greater than 0`,
        });
      }
      if (num(p.efficiency) <= 0) {
        out.push({
          id: `proc-eff-${origIdx}`,
          severity: 'warn',
          scope: scopeLabel,
          message: `Process row ${rowNum}: Efficiency is 0 — UPH will be 0 and cost will explode`,
        });
      }
    }

    // Tool type missing on a process that has a tool_cost > 0 is the
    // classic "tool_life fallback = 1" bug — escalate to error.
    if (num(p.tool_cost) > 0 && isBlank(p.tool_type)) {
      out.push({
        id: `proc-tool-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Process row ${rowNum}: Tool Type is required when Tool Cost > 0 (otherwise tool_life falls back to 1)`,
      });
    }

    // Layout (batch count) is required only for machine workcenters.
    // Rate Table: machine_rate > 0 → machine hours drive cost → Layout
    // must be explicit so we don't silently fall back to 1 and mis-cost.
    // Labor-only workcenters (machine_rate == 0, e.g. FQC) → Layout optional.
    const machineRateForLayout = getMachineRateForWC(lib, p.workcenter);
    if (machineRateForLayout > 0 && num(p.layout) <= 0 && !isBlank(p.workcenter)) {
      out.push({
        id: `proc-layout-${origIdx}`,
        severity: 'error',
        scope: scopeLabel,
        message: `Process row ${rowNum}: Layout is required for "${p.workcenter}" (Machine USD/H > 0 in Rate Table)`,
      });
    }
  });

  return out;
}

function validateMOQ(st, scopeLabel = 'MOQ') {
  const out = [];
  const numMoq = Number(st.num_moq) || 1;
  if (numMoq > 1) {
    const extras = st.extra_moqs || [];
    if (extras.length !== numMoq - 1) {
      out.push({
        id: 'moq-count',
        severity: 'error',
        scope: scopeLabel,
        message: `num_moq = ${numMoq} but only ${extras.length} extra MOQ tier(s) defined`,
      });
    }
    extras.forEach((tier, i) => {
      if (num(tier?.moq) <= 0) {
        out.push({
          id: `moq-tier-${i}`,
          severity: 'error',
          scope: scopeLabel,
          message: `MOQ tier ${i + 2}: MOQ must be greater than 0`,
        });
      }
      if (num(tier?.price) <= 0) {
        out.push({
          id: `moq-price-${i}`,
          severity: 'warn',
          scope: scopeLabel,
          message: `MOQ tier ${i + 2}: Price is 0 — GM% / VA% will show as N/A for this tier`,
        });
      }
    });
  }
  return out;
}

// ── Top-level: Standard ───────────────────────────────────────────

export function validateStandard(stdState, lib = null) {
  if (!stdState) return [];
  return [
    ...validateHeader(stdState, 'Header'),
    ...validateLayout(stdState, 'Layout'),
    ...validateMaterials(stdState.materials, 'Materials', num(stdState.part_width)),
    ...validateProcesses(stdState.processes, 'Processes', lib),
    ...validateMOQ(stdState, 'MOQ'),
  ];
}

// ── Top-level: Complex ────────────────────────────────────────────

export function validateComplex(cplxState, lib = null) {
  if (!cplxState) return [];
  const out = [];

  // Top-level header / MOQ
  out.push(...validateHeader(cplxState, 'Header'));
  out.push(...validateMOQ(cplxState, 'MOQ'));

  // Sub-products
  const sps = cplxState.subproducts || [];
  if (sps.length === 0) {
    out.push({
      id: 'cplx-no-sp',
      severity: 'error',
      scope: 'SubProduct',
      message: 'Add at least one sub-product',
    });
    return out;
  }

  sps.forEach((sp, idx) => {
    const spLabel = `SP ${sp.code || String.fromCharCode(65 + idx)}`;
    // Layout
    validateLayout(sp, `${spLabel} · Layout`).forEach(w => {
      out.push({ ...w, id: `${w.id}-sp${idx}` });
    });
    // Materials
    validateMaterials(sp.materials, `${spLabel} · Materials`, num(sp.part_width)).forEach(w => {
      out.push({ ...w, id: `${w.id}-sp${idx}` });
    });
    // Processes
    validateProcesses(sp.processes, `${spLabel} · Processes`, lib).forEach(w => {
      out.push({ ...w, id: `${w.id}-sp${idx}` });
    });
  });

  return out;
}

// ── Convenience: dispatch by active tab ───────────────────────────

export function validateByActiveTab(activeTab, stdState, cplxState, lib = null) {
  if (activeTab === 'standard') return validateStandard(stdState, lib);
  if (activeTab === 'complex')  return validateComplex(cplxState, lib);
  return [];
}
