/**
 * Dataset Registry — single source of truth for the Import Wizard.
 *
 * Each dataset declares:
 *   - storage: where + how the canonical file is written
 *   - canonicalHeaders: the column order used for the .js / template export
 *   - requiredHeaders: must be present after alias-mapping or the import is refused
 *   - naturalKey: which canonical headers form the unique row key (for upsert)
 *   - aliases: user-friendly headers → canonical (case/space-insensitive, EN+VN)
 *   - columnTypes: optional canonical-header → type ('number'|'date'|'string'|...)
 *   - shadowWriter / shadowClearer: optional symbols looked up in shadowWrite.js
 *
 * The wizard's preview/commit pipeline drives entirely off this table —
 * adding a new tab is a matter of adding an entry here, not coding a
 * new endpoint.
 */

// Storage kinds:
//   'js-array-of-arrays' = legacy IFS loader: window._VAR={headers:[...], rows:[[...]]}
//   'json-array-of-objects' = NPI/Sourcing: [{field: value, ...}, ...]
export const STORAGE_JS_AOA = 'js-array-of-arrays';
export const STORAGE_JSON_AOO = 'json-array-of-objects';

// ─── Helper alias-block generators ───
const VN = {
  partNo: ['Part No', 'Part Number', 'Part #', 'Mã hàng', 'Mã vật tư', 'Số part', 'PartNo'],
  partDesc: ['Part Description', 'Description', 'Tên hàng', 'Mô tả', 'Tên vật tư'],
  qty: ['Qty Per Assembly', 'Quantity', 'Qty', 'Số lượng', 'SL', 'SL/Cụm'],
  uom: ['UOM', 'Unit', 'Đơn vị', 'ĐVT', 'Unit of Measure'],
  supplier: ['Supplier', 'Vendor', 'NCC', 'Nhà cung cấp'],
  site: ['Site', 'Plant', 'Nhà máy', 'Location'],
};

// Build canonical → [aliases...]. Note canonical itself is included so the
// case-insensitive lookup catches the "exact match" path.
function aliasMap(spec) {
  const m = {};
  for (const [canonical, aliases] of Object.entries(spec)) {
    const all = [canonical, ...(aliases || [])];
    for (const a of all) {
      m[normKey(a)] = canonical;
    }
  }
  return m;
}

/**
 * One export cell: the row's own value, or the dataset's `exportDefaults`
 * entry when the row has none.
 *
 * A column added after rows were written is absent (or blank) on every older
 * row. `exportDefaults` says what the app already SHOWS for those rows, so an
 * export matches the screen rather than reading as "no data" — NPI currency
 * is the case: 3058 rows predate the column and every one of them displays
 * USD, because that is what the old `USD / m²` header promised.
 *
 * Blank counts as unset, not as a value: a blank cell survives an
 * export → re-import round-trip, so treating `''` as data would make the
 * default apply on the first export and never again.
 */
export function exportCell(dataset, row, k) {
  const v = row?.[k];
  if (v == null || v === '') return dataset?.exportDefaults?.[k] ?? '';
  return v;
}

export function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════
// BOM / Manufacturing Structures
// ═══════════════════════════════════════════════════════════════════
const BOM_DATASET = {
  key: 'bom',
  label: 'Manufacturing Structures (BOM)',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'Manufacturing_Structures',
    file: 'mfg_structures_data.js',
    varName: 'window._CCL_MFG_DATA',
  },
  canonicalHeaders: [
    'Parent Part No',
    'Parent Part Description',
    'Component Part',
    'Component Part Description',
    'Qty Per Assembly',
    'UOM',
    'Component Scrap',
    'Scrap Factor (%)',
    'Pitch',
    'Cavity',
    'Color Nums',
    'Structure Type',
    'Alternative No',
    'Structure Effectivity',
    'Planner',
  ],
  requiredHeaders: ['Parent Part No', 'Component Part'],
  naturalKey: ['Parent Part No', 'Component Part', 'Alternative No'],
  columnTypes: {
    'Qty Per Assembly': 'number',
    'Scrap Factor (%)': 'number',
    Pitch: 'number',
    Cavity: 'integer',
    'Color Nums': 'integer',
  },
  aliases: aliasMap({
    'Parent Part No': ['Parent', 'Parent No', 'Parent Item', 'Mã cha', 'Part cha'],
    'Parent Part Description': ['Parent Desc', 'Parent Description', 'Tên cha'],
    'Component Part': ['Component', 'Comp Part', 'Comp', 'Mã con', 'Part con'],
    'Component Part Description': ['Component Desc', 'Comp Description', 'Tên con'],
    'Qty Per Assembly': VN.qty,
    UOM: VN.uom,
    'Component Scrap': ['Comp Scrap', 'Scrap', 'Hao hụt'],
    'Scrap Factor (%)': ['Scrap %', 'Scrap Pct', 'Scrap Factor', '% Hao hụt'],
    Pitch: ['Pitch', 'Bước'],
    Cavity: ['Cavity', 'Số khuôn'],
    'Color Nums': ['Colors', 'Color Count', 'Số màu'],
    'Structure Type': ['Type', 'Loại'],
    'Alternative No': ['Alternative', 'Alt', 'Alt No', 'Phương án'],
    'Structure Effectivity': ['Effectivity', 'Effective', 'Hiệu lực'],
    Planner: ['Planner', 'NV kế hoạch'],
  }),
  shadow: { writer: 'shadowWriteBom', clearer: 'shadowClearBom' },
};

// ═══════════════════════════════════════════════════════════════════
// Routing Operations
// ═══════════════════════════════════════════════════════════════════
const ROUTING_DATASET = {
  key: 'routing',
  label: 'Routing Operations',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'Routing_Operations',
    file: 'routing_ops_data.js',
    varName: 'window._CCL_ROP_DATA',
  },
  canonicalHeaders: [
    'Part No',
    'Part Description',
    'Operation No',
    'Operation Description',
    'Work Centre No',
    'Work Centre Desc',
    'Mach Setup Time',
    'Labour Setup Time',
    'Mach Run Factor',
    'Labour Run Factor',
    'Factor Unit',
    'Crew Size',
    'Setup Crew Size',
    'Labour Class',
    'Alternative',
    'Routing Effectivity',
    'Efficiency Factor',
    'Site',
    'Routing Type',
  ],
  requiredHeaders: ['Part No', 'Operation No', 'Work Centre No'],
  naturalKey: ['Part No', 'Operation No', 'Work Centre No', 'Alternative'],
  columnTypes: {
    'Mach Setup Time': 'number',
    'Labour Setup Time': 'number',
    'Mach Run Factor': 'number',
    'Labour Run Factor': 'number',
    'Crew Size': 'number',
    'Setup Crew Size': 'number',
    'Efficiency Factor': 'number',
  },
  aliases: aliasMap({
    'Part No': VN.partNo,
    'Part Description': VN.partDesc,
    'Operation No': ['Op No', 'Op', 'Operation', 'Số nguyên công'],
    'Operation Description': ['Op Desc', 'Op Description', 'Mô tả công đoạn'],
    'Work Centre No': [
      'Work Center No',
      'Work Center',
      'Workcenter',
      'Workcenter No',
      'WC',
      'WC No',
      'Work Centre',
      'Trạm',
    ],
    'Work Centre Desc': ['Work Center Desc', 'WC Desc', 'WC Description', 'Mô tả trạm'],
    'Mach Setup Time': ['Machine Setup', 'Setup Mach', 'Mach Setup', 'Setup máy'],
    'Labour Setup Time': ['Labor Setup', 'Setup Labor', 'Labour Setup', 'Setup nhân công'],
    'Mach Run Factor': ['Machine Run', 'Run Mach', 'Mach Run', 'Run rate máy'],
    'Labour Run Factor': ['Labor Run', 'Run Labor', 'Labour Run', 'Run rate nhân công'],
    'Factor Unit': ['Run Unit', 'Unit'],
    'Crew Size': ['Crew', 'Operators', 'Số người'],
    'Setup Crew Size': ['Setup Crew', 'Setup Operators'],
    'Labour Class': ['Labor Class', 'Class', 'Bậc'],
    Alternative: ['Alt', 'Alternative No', 'Phương án'],
    'Routing Effectivity': ['Effectivity', 'Hiệu lực'],
    'Efficiency Factor': ['Efficiency', 'Eff', 'Eff Factor', 'Hiệu suất'],
    Site: VN.site,
    'Routing Type': ['Type', 'Loại'],
  }),
  shadow: { writer: 'shadowWriteRouting', clearer: 'shadowClearRouting' },
};

// ═══════════════════════════════════════════════════════════════════
// NPI Materials (canonical-key JSON store)
// ═══════════════════════════════════════════════════════════════════
const NPI_DATASET = {
  key: 'npi-materials',
  label: 'NPI Materials',
  storage: {
    kind: STORAGE_JSON_AOO,
    folder: 'MaterialCost',
    file: 'npi_materials.json',
  },
  canonicalHeaders: [
    'date',
    'name',
    'exw',
    'price',
    'currency',
    'type',
    'thick',
    'color',
    'surface',
    'adhesive',
    'moq',
    'lt',
    'supplier',
    'note',
  ],
  // Pretty label per canonical key (used for the export template header row)
  prettyLabels: {
    date: 'Date',
    name: 'Material Name',
    // `price` is the DAP price: the edit card labels it so and the calculators
    // cost with it. Supplier sheets quote EXW beside it, and with no EXW column
    // the tolerant matcher handed "EXW price (m2)" to `price` and dropped the
    // DAP column (2026-10-05). EXW now has its own column, and the export names
    // both. Files exported under the older `Price (USD/m²)` and `Price (/m²)`
    // labels still import — those aliases are kept below.
    exw: 'EXW Price (/m²)',
    price: 'DAP Price (/m²)',
    currency: 'Currency',
    type: 'Type / Description',
    thick: 'Thickness (mm)',
    color: 'Color',
    surface: 'Surface',
    adhesive: 'Adhesive',
    moq: 'MOQ (m²)',
    lt: 'Lead Time (days)',
    supplier: 'Supplier',
    note: 'Note',
  },
  requiredHeaders: ['name'],
  naturalKey: ['name', 'supplier'],
  columnTypes: {
    exw: 'number',
    price: 'number',
    currency: 'enum',
    thick: 'number',
    moq: 'number',
    lt: 'number',
    date: 'date',
  },
  // Only these two are selectable in the UI, so only these two may be
  // imported. Blank is fine and means USD (see exportDefaults below); a third
  // currency must SURFACE, because `normalizeCurrency` on the client falls
  // back to USD, and a VND price of 64000 read as $64000 is invisible until
  // someone reads the margin.
  columnEnums: { currency: ['USD', 'VND'] },
  // Rows written before the column existed hold no currency at all. The app
  // shows them as USD (that is what the old `USD / m²` header promised), so
  // the export says USD too — otherwise the file contradicts the screen.
  exportDefaults: { currency: 'USD' },
  // Aliases also list the literal strings CCL's export writes verbatim
  // (belt-and-suspenders on top of the tolerant token matcher — Lesson 32).
  aliases: aliasMap({
    date: ['Date', 'Update Date', 'Updated', 'Ngày'],
    name: ['Material Name', 'Material', 'Name', 'Tên vật tư'],
    exw: ['EXW', 'EXW Price', 'EXW Price (/m²)', 'Giá EXW'],
    price: [
      'DAP',
      'DAP Price',
      'DAP Price (/m²)',
      'Giá DAP',
      'Price',
      'USD/m²',
      'USD per m2',
      'Unit Price',
      'Giá',
      'Price (USD/m²)',
      'Price (/m²)',
      'USD / m²',
      'USD / M² PRICE',
    ],
    currency: ['Currency', 'CCY', 'Currency (USD/VND)', 'Tiền tệ', 'Đơn vị tiền'],
    type: ['Type', 'Description', 'Desc', 'Type / Description', 'Mô tả'],
    thick: [
      'Thick',
      'Thickness',
      'Độ dày',
      'Dày',
      'Thickness (mm)',
      'mm Thickness',
      'MM THICKNESS',
    ],
    color: ['Color', 'Màu'],
    surface: ['Surface', 'Finish', 'Bề mặt'],
    adhesive: ['Adhesive', 'Glue', 'Keo'],
    moq: ['MOQ', 'Min Qty', 'Min Order', 'MOQ (m²)', 'm² MOQ', 'M² MOQ'],
    lt: ['LT', 'Lead Time', 'Leadtime', 'Lead Time (days)', 'Days Lead Time', 'DAYS LEAD TIME'],
    supplier: ['Supplier', 'Vendor', 'NCC'],
    note: ['Note', 'Notes', 'Remark', 'Remarks', 'Ghi chú', 'Notes / Remarks', 'NOTES / REMARKS'],
  }),
  shadow: { writer: 'shadowWriteMaterials', writerArg: 'npi' },
};

// ═══════════════════════════════════════════════════════════════════
// IFS Materials (IFS "SupplierforPurchaseParts" export — canonical-key JSON)
// ═══════════════════════════════════════════════════════════════════
const IFS_DATASET = {
  key: 'ifs-materials',
  label: 'IFS Materials',
  storage: {
    kind: STORAGE_JSON_AOO,
    folder: 'MaterialCost',
    file: 'ifs_materials.json',
  },
  // Mirrors the IFS "SupplierforPurchaseParts" upload (16 cols; the "#"
  // row-index column is left unmapped) + 3 enrichment columns
  // (thickness / type_designation / product_family) sourced from the Full
  // Inventory export — blank until a richer file is imported or edited in.
  canonicalHeaders: [
    'part_no',
    'desc',
    'supplier_id',
    'supplier',
    'conv',
    'price',
    'price_tax',
    'currency',
    'uom',
    'tax_code',
    'leadtime',
    'thickness',
    'type_designation',
    'product_family',
    'tax_code_desc',
    'status_code',
    'status_code_desc',
    'country',
  ],
  prettyLabels: {
    part_no: 'Part No',
    desc: 'Part Description',
    supplier_id: 'Supplier ID',
    supplier: 'Supplier Name',
    conv: 'Conversion Factor',
    price: 'Price',
    price_tax: 'Price incl. Tax',
    currency: 'Currency',
    uom: 'Price Unit Measure',
    tax_code: 'Tax Code',
    leadtime: 'Supplier Manufacturing Leadtime',
    thickness: 'Thickness',
    type_designation: 'Type Designation',
    product_family: 'Part Product Family Description',
    tax_code_desc: 'Tax Code Description',
    status_code: 'Status Code',
    status_code_desc: 'Status Code Description',
    country: 'Country of Origin',
  },
  requiredHeaders: ['part_no'],
  naturalKey: ['part_no', 'supplier_id'],
  columnTypes: {
    conv: 'number',
    price: 'number',
    price_tax: 'number',
    leadtime: 'number',
    thickness: 'number',
  },
  aliases: aliasMap({
    part_no: ['Part No', 'Part Number', 'Mã hàng', 'Part'],
    desc: ['Part Description', 'Description', 'Desc', 'Mô tả'],
    supplier_id: ['Supplier ID', 'Supplier Code', 'Mã NCC'],
    supplier: ['Supplier Name', 'Supplier', 'Vendor', 'NCC', 'Nhà cung cấp'],
    conv: ['Conversion Factor', 'Conv', 'Hệ số quy đổi'],
    price: ['Price', 'Unit Price', 'Giá'],
    price_tax: ['Price incl. Tax', 'Price incl Tax', 'Price with Tax', 'Giá gồm thuế'],
    currency: ['Currency', 'Tiền tệ'],
    uom: ['Price Unit Measure', 'Unit Measure', 'UoM', 'Unit', 'Đơn vị'],
    tax_code: ['Tax Code', 'Mã thuế'],
    leadtime: [
      'Supplier Manufacturing Leadtime',
      'Manufacturing Leadtime',
      'Leadtime',
      'Lead Time',
    ],
    thickness: ['Thickness', 'Thick', 'Thickness (mm)', 'Độ dày'],
    type_designation: ['Type Designation', 'Type', 'Material Type', 'Type Designation Description'],
    product_family: [
      'Part Product Family Description',
      'Product Family',
      'Part Product Family',
      'Product Family Description',
    ],
    tax_code_desc: ['Tax Code Description', 'Tax Description'],
    status_code: ['Status Code', 'Status'],
    status_code_desc: ['Status Code Description', 'Status Description'],
    country: ['Country of Origin', 'Country', 'Origin', 'Xuất xứ'],
  }),
  // No shadow-write: this dataset is read straight from ifs_materials.json by
  // shared.getMaterials (like NPI/Sourcing), and is not consumed by calc, so it
  // needs no SQLite materials-table mirror.
};

// ═══════════════════════════════════════════════════════════════════
// Sourcing DB
// ═══════════════════════════════════════════════════════════════════
const SOURCING_DATASET = {
  key: 'sourcing-db',
  label: 'Sourcing DB',
  storage: {
    kind: STORAGE_JSON_AOO,
    folder: 'MaterialCost',
    file: 'sourcing_db.json',
  },
  canonicalHeaders: [
    'month',
    'req',
    'cust',
    'material',
    'size',
    'exw',
    'dap',
    'moq',
    'lt',
    'supplier',
    'status',
  ],
  prettyLabels: {
    month: 'Req. Date',
    req: 'Requester',
    cust: 'Customer / Project',
    material: 'Material Inquiry',
    size: 'Size / Spec',
    exw: 'EXW Price (USD/m²)',
    dap: 'DAP Price (USD/m²)',
    moq: 'MOQ',
    lt: 'Lead Time (days)',
    supplier: 'Supplier',
    status: 'Status / Remark',
  },
  requiredHeaders: ['material'],
  naturalKey: ['cust', 'material', 'supplier'],
  columnTypes: {
    exw: 'number',
    dap: 'number',
    moq: 'number',
    lt: 'number',
    month: 'date',
  },
  aliases: aliasMap({
    month: ['Month', 'Req. Date', 'Req Date', 'Request Date', 'Date'],
    req: ['Requester', 'Req', 'By', 'Người yêu cầu'],
    cust: ['Customer', 'Cust', 'Project', 'Customer / Project', 'Khách hàng'],
    material: ['Material', 'Material Inquiry', 'Inquiry', 'Vật liệu'],
    size: ['Size', 'Spec', 'Size / Spec', 'Kích thước'],
    exw: ['EXW', 'EXW Price', 'EXW Price (USD/m²)', 'Giá EXW'],
    dap: ['DAP', 'DAP Price', 'DAP Price (USD/m²)', 'Giá DAP'],
    moq: ['MOQ', 'Supplier MOQ', 'Min Order', 'MOQ (m²)'],
    lt: ['LT', 'Lead Time', 'Leadtime', 'Lead Time (days)', 'Days Lead Time'],
    supplier: ['Supplier', 'Vendor', 'NCC'],
    status: ['Status', 'Remark', 'Remarks', 'Status / Remark', 'Ghi chú'],
  }),
  shadow: { writer: 'shadowWriteMaterials', writerArg: 'sourcing' },
};

// ═══════════════════════════════════════════════════════════════════
// NPI Parts List (master reference — "NPI Quote part list", 64 cols)
// STORAGE_JS_AOA like BOM/Routing (25k×64 → compact arrays, not AoO).
// No prettyLabels: the 64 canonical headers ARE the verbatim operator
// strings, so export round-trips directly. No `shadow` block — the pricing
// calc does NOT consume NPI Parts (mirror ifs-materials).
// Bulk reference reload → commit in `replace` mode (the base file is the
// full set); upsert by the best-effort composite key is available too.
// ═══════════════════════════════════════════════════════════════════
const NPI_PARTS_HEADERS = [
  'PIC',
  'Type',
  'RFQ date',
  'Part Name',
  'Code IFS',
  'System code',
  'Unit price (VND)',
  'Unit price (USD)',
  'Customer',
  'Direct Project',
  'No.',
  'Remark',
  'Production part',
  'Size W',
  'Size L',
  'Material',
  'Size2 W',
  'Size2 L',
  'Num. of Webs',
  'Parts in MD',
  'Parts/Web across',
  'Min Gap MD btwn Sheets',
  'Cavity',
  'MOQ',
  'Process',
  'LP/Flexo',
  'SS',
  'Glue',
  'LP/Flexo Film',
  'SS Film',
  'Stencil Plate life',
  'Cutter life',
  'Dieset distribution',
  'Mat 2',
  'Mat 3',
  'Mat 4',
  'Mat 5',
  'GP%',
  'Cutter type',
  'Cutter Cavity',
  'Tooling fee (woodie)',
  'Tooling fee (Pinacle die)',
  'Tooling fee (Rotary Die)',
  'Tooling fee (Dieset)',
  'EAU',
  'Material in Drawing',
  'Plate Flexo',
  'Film + Plate (SS)',
  'Sale/PM',
  'Quoted date',
  'Quoted Approval (VND)',
  'Quoted Approval (USD)',
  'Delivery Term',
  'Tooling fee (NC die)',
  'Mat 6',
  'Mat 7',
  'Mat 8',
  'Mat 9',
  'Mat 10',
  'Week',
  'VA %',
  'Cont %',
  'GM %',
  'INK IN QUOATION',
];

const NPI_PARTS_DATASET = {
  key: 'npi-parts',
  label: 'NPI Parts List',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'NpiParts',
    file: 'npi_parts_data.js',
    varName: 'window._CCL_NPIPARTS_DATA',
  },
  canonicalHeaders: NPI_PARTS_HEADERS,
  // Part Name / Code IFS are mostly blank in real data → not reliable; guard
  // against importing the wrong file with System code + Customer instead.
  requiredHeaders: ['System code', 'Customer'],
  // Best-effort composite for upsert. Default commit mode is `replace`
  // (bulk reference reload) — the wizard's Replace option covers it (the
  // pipeline has no per-dataset defaultMode field).
  naturalKey: ['System code', 'Code IFS', 'RFQ date', 'Customer'],
  columnTypes: {
    'Unit price (VND)': 'number',
    'Unit price (USD)': 'number',
    MOQ: 'number',
    EAU: 'number',
    Cavity: 'number',
    'Cutter Cavity': 'number',
    'Num. of Webs': 'number',
    'Parts in MD': 'number',
    'Parts/Web across': 'number',
    'Min Gap MD btwn Sheets': 'number',
    'Size W': 'number',
    'Size L': 'number',
    'Size2 W': 'number',
    'Size2 L': 'number',
    'Tooling fee (woodie)': 'number',
    'Tooling fee (Pinacle die)': 'number',
    'Tooling fee (Rotary Die)': 'number',
    'Tooling fee (Dieset)': 'number',
    'Tooling fee (NC die)': 'number',
    'Quoted Approval (VND)': 'number',
    'Quoted Approval (USD)': 'number',
    'GP%': 'number',
    'VA %': 'number',
    'Cont %': 'number',
    'GM %': 'number',
    'RFQ date': 'date',
    'Quoted date': 'date',
    Week: 'date',
  },
  // Every canonical header maps to itself (exact-match path, like BOM/Routing)
  // via the spread below; the explicit entries add EN/VN + unit/paren/typo
  // variants the token matcher can't collapse on its own. The tolerant token
  // cascade (Lesson 32) handles everything else.
  aliases: aliasMap({
    ...Object.fromEntries(NPI_PARTS_HEADERS.map((h) => [h, []])),
    PIC: ['Owner', 'NPI PIC'],
    Type: ['Loại'],
    'RFQ date': ['RFQ Date', 'Ngày RFQ'],
    'Part Name': ['Tên hàng'],
    'Code IFS': ['IFS Code', 'Mã IFS'],
    'System code': ['System Code', 'Mã hệ thống'],
    // VND/USD are noise tokens → the two Unit-price columns share the token
    // set {unit,price}; only exact/explicit aliases disambiguate them.
    'Unit price (VND)': ['Unit price (VND)', 'VND Unit Price', 'Unit Price VND', 'Đơn giá VND'],
    'Unit price (USD)': ['Unit price (USD)', 'USD Unit Price', 'Unit Price USD', 'Đơn giá USD'],
    Customer: ['Customer', 'Khách hàng'],
    'Direct Project': ['Direct Project', 'Project', 'Dự án'],
    'No.': ['No.', 'No', 'STT'],
    'Num. of Webs': ['Num. of Webs', 'Number of Webs', 'Num of Webs', 'No. of Webs'],
    'GP%': ['GP%', 'GP %', 'GP'],
    'Cutter Cavity': ['Cutter Cavity', 'Cutter Cav'],
    'Tooling fee (woodie)': ['Tooling fee (woodie)', 'Woodie Tooling', 'Tooling Woodie'],
    'Tooling fee (Pinacle die)': [
      'Tooling fee (Pinacle die)',
      'Pinacle die Tooling',
      'Tooling Pinacle die',
      'Pinnacle die Tooling',
    ],
    'Tooling fee (Rotary Die)': [
      'Tooling fee (Rotary Die)',
      'Rotary Die Tooling',
      'Tooling Rotary Die',
    ],
    'Tooling fee (Dieset)': ['Tooling fee (Dieset)', 'Dieset Tooling', 'Tooling Dieset'],
    'Tooling fee (NC die)': ['Tooling fee (NC die)', 'NC die Tooling', 'Tooling NC die'],
    // Quoted Approval VND/USD share {quoted,approval} after noise-strip.
    'Quoted Approval (VND)': [
      'Quoted Approval (VND)',
      'VND Quoted Approval',
      'Quoted Approval VND',
    ],
    'Quoted Approval (USD)': [
      'Quoted Approval (USD)',
      'USD Quoted Approval',
      'Quoted Approval USD',
    ],
    'VA %': ['VA %', 'VA%', 'VA', 'Value Add %'],
    'Cont %': ['Cont %', 'Cont%', 'Contr %', 'Contr%', 'Contribution %', 'Contribution'],
    'GM %': ['GM %', 'GM%', 'GM', 'Gross Margin %'],
    // Typo-tolerance: the real file header is misspelt "QUOATION".
    'INK IN QUOATION': [
      'INK IN QUOATION',
      'Ink in quotation',
      'INK IN QUOTATION',
      'Ink in Quoation',
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════
// Public registry
// ═══════════════════════════════════════════════════════════════════
export const DATASETS = {
  bom: BOM_DATASET,
  routing: ROUTING_DATASET,
  'npi-materials': NPI_DATASET,
  'ifs-materials': IFS_DATASET,
  'sourcing-db': SOURCING_DATASET,
  'npi-parts': NPI_PARTS_DATASET,
};

export function getDataset(key) {
  return DATASETS[key] || null;
}

export function listDatasets() {
  return Object.values(DATASETS).map((d) => ({
    key: d.key,
    label: d.label,
    storageKind: d.storage.kind,
    canonicalHeaders: d.canonicalHeaders,
    requiredHeaders: d.requiredHeaders,
    naturalKey: d.naturalKey,
  }));
}
