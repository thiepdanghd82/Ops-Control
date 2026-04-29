/**
 * IFS Data Field Mapping Utility
 * Normalizes field name variations from different data sources to canonical names.
 */

const FIELD_ALIASES = {
  partNo:              ['Part No', 'part_no', 'PartNo', 'PART_NO'],
  parentPartNo:        ['Parent Part No', 'parent_part_no', 'ParentPartNo'],
  componentPart:       ['Component Part', 'component_part', 'ComponentPart'],
  componentDescription:['Component Description', 'description', 'Description'],
  qtyPerAssembly:      ['Qty Per Assembly', 'qty_per_assembly', 'QtyPerAssembly'],
  componentScrap:      ['Component Scrap', 'component_scrap', 'ComponentScrap', 'Scrap %'],
  uom:                 ['UOM', 'uom', 'Unit'],
  qtyOnHand:           ['Qty On Hand', 'qty_on_hand', 'Stock', 'stock', 'QtyOnHand'],
  operationNo:         ['Operation No', 'operation_no', 'OperationNo', 'Op No'],
  operationDesc:       ['Operation Description', 'description', 'Description', 'Op Description'],
  workCenter:          ['Work Center', 'work_center', 'WorkCenter', 'WC'],
  setupTime:           ['Setup Time', 'setup_time', 'SetupTime'],
  runFactor:           ['Run Factor', 'run_factor', 'RunFactor'],
};

// Build a reverse map: raw field name -> canonical name
const _reverseMap = {};
for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    _reverseMap[alias] = canonical;
  }
}

/**
 * Get a field value from a data row using any known alias.
 * @param {Object} row - Data row object
 * @param {string} canonical - Canonical field name (e.g., 'partNo')
 * @param {*} defaultVal - Default value if not found
 * @returns {*} The field value
 */
export function getField(row, canonical, defaultVal = '') {
  const aliases = FIELD_ALIASES[canonical];
  if (!aliases) return row[canonical] ?? defaultVal;
  for (const alias of aliases) {
    if (row[alias] != null) return row[alias];
  }
  return defaultVal;
}

/**
 * Get a numeric field value.
 */
export function getNumField(row, canonical, defaultVal = 0) {
  const v = getField(row, canonical, null);
  if (v == null) return defaultVal;
  const f = parseFloat(v);
  return isNaN(f) ? defaultVal : f;
}
