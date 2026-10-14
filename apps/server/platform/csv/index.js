// @ts-check
/**
 * platform/csv — shared CSV row formatters.
 *
 * v1.3 J1. Extracted from costApi.js so domain routers
 * (library/rate, library/ddl) can import them without re-creating the
 * column shapes. Pure functions, no I/O — safe to import from any tier.
 *
 * Functions:
 *   - rateRows(rate)  → [headers, rows] for the Rate library CSV
 *   - ddlToCsvRows(d) → [headers, rows] for the DDL CSV
 *
 * The legacy `server/routes/costApi.js` still defines local copies of
 * these for now (extract-first-mount-later, ADR-0008). Once costApi.js
 * is split fully, the local copies will be removed and costApi will
 * import from here too.
 */

/**
 * Format a Rate-library array into CSV header + rows.
 * Header order is FIXED — operators have spreadsheet templates that
 * depend on column position. Adding columns = append at end only.
 *
 * @param {Array<{workcenter?:string, crew?:string, machine_rate?:string|number, labor_rate?:string|number, speed_uom?:string, oh_cost?:string|number, mc_cost?:string|number}>} rate
 * @returns {[string[], any[][]]}
 */
export function rateRows(rate) {
  const H = ['workcenter', 'crew', 'machine_rate', 'labor_rate', 'speed_uom', 'oh_cost', 'W/C'];
  const rows = (rate || []).map((r) => [
    r.workcenter || '',
    r.crew || '',
    r.machine_rate || '',
    r.labor_rate || '',
    r.speed_uom || '',
    r.oh_cost || '',
    r.mc_cost || '',
  ]);
  return [H, rows];
}

/**
 * Format a DDL (drop-down list) object into CSV.
 * Top-level keys are sections; values are arrays of options. Output:
 *   section_name, option_index, option_value
 *
 * `_custom_sections` is intentionally excluded from the CSV — it
 * stores section metadata (icons, ordering hints) that doesn't map
 * cleanly to a flat CSV.
 *
 * @param {Record<string, any[]>} d
 * @returns {[string[], any[][]]}
 */
export function ddlToCsvRows(d) {
  const H = ['section', 'index', 'value'];
  const rows = [];
  for (const [section, values] of Object.entries(d || {})) {
    if (section === '_custom_sections') continue;
    if (!Array.isArray(values)) continue;
    values.forEach((val, idx) => {
      rows.push([section, idx, typeof val === 'string' ? val : JSON.stringify(val)]);
    });
  }
  return [H, rows];
}
