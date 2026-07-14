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
// IFS Inventory (Full / Finished Goods / Raw Materials)
// ═══════════════════════════════════════════════════════════════════
const INVENTORY_BASE_ALIASES = aliasMap({
  'Part No': VN.partNo,
  'Part Description': VN.partDesc,
  Site: VN.site,
  'Lot/Batch No': ['Lot No', 'Batch No', 'Lot', 'Batch', 'Số lô'],
  'Location No': ['Location', 'Bin', 'Vị trí'],
  'Qty On Hand': ['Qty', 'On Hand', 'OH', 'SL Tồn', 'Tồn kho'],
  UOM: VN.uom,
  'Unit Cost': ['Cost', 'Standard Cost', 'Giá vốn', 'Đơn giá'],
  'Total Cost': ['Value', 'Stock Value', 'Giá trị tồn'],
  'Receipt Date': ['Date Received', 'Receipt', 'Ngày nhập'],
  'Expiry Date': ['Expiry', 'Expiration', 'Ngày hết hạn'],
});

const INVENTORY_DATASET = {
  key: 'inventory',
  label: 'IFS Full Inventory',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'IFS_Inventory',
    file: 'inventory_data.js',
    varName: 'window._CCL_INV_DATA',
  },
  canonicalHeaders: [
    'Part No',
    'Part Description',
    'Site',
    'Lot/Batch No',
    'Location No',
    'Qty On Hand',
    'UOM',
    'Unit Cost',
    'Total Cost',
    'Receipt Date',
    'Expiry Date',
  ],
  requiredHeaders: ['Part No'],
  naturalKey: ['Part No', 'Site', 'Lot/Batch No', 'Location No'],
  columnTypes: {
    'Qty On Hand': 'number',
    'Unit Cost': 'number',
    'Total Cost': 'number',
    'Receipt Date': 'date',
    'Expiry Date': 'date',
  },
  aliases: INVENTORY_BASE_ALIASES,
  shadow: {
    writer: 'shadowWriteInventory',
    writerArg: 'inventory',
    clearer: 'shadowClearInventory',
    clearerArg: 'inventory',
  },
};

// Finished Goods is a customer DEAL-PRICE / catalog agreement list (keyed by
// Catalog No), NOT a parts-on-hand inventory — a distinct IFS schema from Full
// Inventory / Raw Materials (those are Part-No keyed). It used to inherit the
// Part-No inventory schema, so the app's own FG export failed to re-import
// ("Missing required columns: Part No"). Own schema fixes the round-trip.
const FINISHED_GOODS_DATASET = {
  key: 'finished-goods',
  label: 'Finished Goods Inventory',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'IFS_Inventory',
    file: 'finished_good_data.js',
    varName: 'window._CCL_FG_DATA',
  },
  canonicalHeaders: [
    'Catalog No',
    'Catalog Desc',
    'Min Quantity',
    'Currency Code',
    'Deal Price',
    'Deal Price Incl Tax',
    'Deal Price Base',
    'Deal Price Incl Tax Base',
    'Valid From Date',
    'Valid Until',
    'Agreement Id',
    'Customer No',
    'Site',
    'Name',
    'Association No',
  ],
  requiredHeaders: ['Catalog No'],
  naturalKey: ['Catalog No', 'Customer No', 'Agreement Id'],
  columnTypes: {
    'Min Quantity': 'number',
    'Deal Price': 'number',
    'Deal Price Incl Tax': 'number',
    'Deal Price Base': 'number',
    'Deal Price Incl Tax Base': 'number',
    'Valid From Date': 'date',
    'Valid Until': 'date',
  },
  aliases: aliasMap({
    'Catalog No': ['Catalog', 'Catalog Number', 'Mã catalog'],
    'Catalog Desc': ['Catalog Description', 'Catalog Desc.'],
    'Min Quantity': ['Min Qty', 'Minimum Quantity', 'SL tối thiểu'],
    'Currency Code': ['Currency', 'Tiền tệ'],
    'Deal Price': ['Price', 'Giá'],
    'Deal Price Incl Tax': ['Deal Price Including Tax', 'Price Incl Tax'],
    'Deal Price Base': ['Deal Price Base (VND)'],
    'Deal Price Incl Tax Base': ['Deal Price Incl Tax Base (VND)'],
    'Valid From Date': ['Valid From', 'From Date', 'Hiệu lực từ'],
    'Valid Until': ['Valid To', 'Until', 'Hiệu lực đến'],
    'Agreement Id': ['Agreement', 'Agreement No', 'Agreement ID'],
    'Customer No': ['Customer', 'Customer Number', 'Mã khách'],
    Site: ['Plant', 'Nhà máy'],
    Name: ['Customer Name', 'Tên khách'],
    'Association No': ['Association', 'Association Number'],
  }),
  shadow: {
    writer: 'shadowWriteInventory',
    writerArg: 'finished_goods',
    clearer: 'shadowClearInventory',
    clearerArg: 'finished_goods',
  },
};

const RAW_MATERIALS_DATASET = {
  ...INVENTORY_DATASET,
  key: 'raw-materials',
  label: 'Raw Materials Inventory',
  storage: {
    kind: STORAGE_JS_AOA,
    folder: 'IFS_Inventory',
    file: 'raw_materials_data.js',
    varName: 'window._CCL_RM_DATA',
  },
  shadow: {
    writer: 'shadowWriteInventory',
    writerArg: 'raw_materials',
    clearer: 'shadowClearInventory',
    clearerArg: 'raw_materials',
  },
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
    'price',
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
    price: 'Price (USD/m²)',
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
    price: 'number',
    thick: 'number',
    moq: 'number',
    lt: 'number',
    date: 'date',
  },
  // Aliases also list the literal strings CCL's export writes verbatim
  // (belt-and-suspenders on top of the tolerant token matcher — Lesson 32).
  aliases: aliasMap({
    date: ['Date', 'Update Date', 'Updated', 'Ngày'],
    name: ['Material Name', 'Material', 'Name', 'Tên vật tư'],
    price: [
      'Price',
      'USD/m²',
      'USD per m2',
      'Unit Price',
      'Giá',
      'Price (USD/m²)',
      'USD / m²',
      'USD / M² PRICE',
    ],
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
// RFQ Tracking (master list of RFQs — "RFQ Master" sheet, 29 cols)
// Standalone tracking dataset (NOT fed to the pricing calc) → JSON-AoO,
// no `shadow` block (mirror IFS_DATASET). A RFQ has multiple quote
// rounds (1st / 2nd …), so the natural key is (rfq_no, qtn).
// DISTINCT from the kanban `rfq-tracker` tab (RFQTracker/rfq_tracker.json).
// ═══════════════════════════════════════════════════════════════════
const RFQ_TRACKING_DATASET = {
  key: 'rfq-tracking',
  label: 'RFQ Tracking',
  storage: {
    kind: STORAGE_JSON_AOO,
    folder: 'RFQTracking',
    file: 'rfq_tracking.json',
  },
  canonicalHeaders: [
    'rfq_no',
    'qtn',
    'customer',
    'end_customer',
    'part_no',
    'description',
    'main_material',
    'design_process',
    'print_type',
    'silkscreen',
    'moq',
    'rfq_date',
    'target_date',
    'actual_quote_date',
    'days_in_process',
    'month',
    'npi_stage',
    'npi_pic',
    'control_flag',
    'ccl_price',
    'target_price',
    'va',
    'contr',
    'gm',
    'eau',
    'est_revenue',
    'sales_pic',
    'sale_stage',
    'notes',
  ],
  // Pretty label per canonical key (export template header row + UI columns).
  // These are the verbatim "RFQ Master" sheet headers.
  prettyLabels: {
    rfq_no: 'RFQ No',
    qtn: 'Qtn #',
    customer: 'Customer',
    end_customer: 'End Customer/Project',
    part_no: 'Part Number',
    description: 'Description',
    main_material: 'Main Material',
    design_process: 'Design Process',
    print_type: 'Print (LP/Flexo)',
    silkscreen: 'SilkScreen',
    moq: 'MOQ',
    rfq_date: 'RFQ Date',
    target_date: 'Target Date',
    actual_quote_date: 'Actual Quote Date',
    days_in_process: 'Days in Process',
    month: 'Month',
    npi_stage: 'NPI Stage',
    npi_pic: 'NPI PIC',
    control_flag: 'Control Flag',
    ccl_price: 'CCL Price ($)',
    target_price: 'Target Price ($)',
    va: 'VA %',
    contr: 'Contr %',
    gm: 'GM %',
    eau: 'EAU / Qty',
    est_revenue: 'Est. Revenue ($)',
    sales_pic: 'Sales PIC',
    sale_stage: 'Sale Stage',
    notes: 'Notes / Reason',
  },
  requiredHeaders: ['rfq_no'],
  naturalKey: ['rfq_no', 'qtn'],
  columnTypes: {
    moq: 'number',
    rfq_date: 'date',
    target_date: 'date',
    actual_quote_date: 'date',
    days_in_process: 'number',
    ccl_price: 'number',
    target_price: 'number',
    va: 'number',
    contr: 'number',
    gm: 'number',
    eau: 'number',
    est_revenue: 'number',
  },
  // Aliases list the verbatim "RFQ Master" header (belt-and-suspenders on
  // top of the tolerant token matcher — Lesson 32) + common variants. Keep
  // variants distinct enough that no normalized alias maps to two canonicals.
  aliases: aliasMap({
    rfq_no: ['RFQ No', 'RFQ#', 'RFQ Number', 'RFQ No.', 'Số RFQ'],
    qtn: ['Qtn #', 'Qtn', 'Quote #', 'Quotation #', 'Qtn No', 'Round', 'Lần báo giá'],
    customer: ['Customer', 'Cust', 'Khách hàng'],
    end_customer: ['End Customer/Project', 'End Customer', 'Project', 'End Cust', 'Dự án'],
    part_no: ['Part Number', 'Part No', 'Part#', 'Part #', 'PN', 'Mã hàng'],
    description: ['Description', 'Desc', 'Mô tả'],
    main_material: ['Main Material', 'Material', 'Vật liệu chính'],
    design_process: ['Design Process', 'Process', 'Công đoạn'],
    print_type: ['Print (LP/Flexo)', 'Print', 'LP/Flexo', 'Print Type'],
    silkscreen: ['SilkScreen', 'Silk Screen', 'Silk'],
    moq: ['MOQ', 'Min Qty', 'Min Order', 'Số lượng tối thiểu'],
    rfq_date: ['RFQ Date', 'RFQ Dt', 'Ngày RFQ'],
    target_date: ['Target Date', 'Ngày mục tiêu'],
    actual_quote_date: ['Actual Quote Date', 'Quote Date', 'Ngày báo giá'],
    days_in_process: ['Days in Process', 'Days', 'Số ngày'],
    month: ['Month', 'Tháng'],
    npi_stage: ['NPI Stage', 'Stage', 'Giai đoạn NPI'],
    npi_pic: ['NPI PIC', 'NPI Owner', 'PIC NPI'],
    control_flag: ['Control Flag', 'Flag', 'Control', 'Trạng thái'],
    ccl_price: ['CCL Price ($)', 'CCL Price', 'CCL $', 'Giá CCL'],
    target_price: ['Target Price ($)', 'Target Price', 'Giá mục tiêu'],
    va: ['VA %', 'VA', 'VA%', 'Value Add %'],
    contr: ['Contr %', 'Contr', 'Contr%', 'Contribution', 'Contribution %'],
    gm: ['GM %', 'GM', 'GM%', 'Gross Margin', 'Gross Margin %'],
    eau: ['EAU / Qty', 'EAU', 'EAU/Qty', 'Annual Qty'],
    est_revenue: [
      'Est. Revenue ($)',
      'Est Revenue',
      'Estimated Revenue',
      'Revenue',
      'Doanh thu ước tính',
    ],
    sales_pic: ['Sales PIC', 'Sale PIC', 'Sales Owner', 'Sale Owner'],
    sale_stage: ['Sale Stage', 'Sales Stage', 'Giai đoạn bán'],
    notes: ['Notes / Reason', 'Notes', 'Note', 'Reason', 'Ghi chú', 'Lý do'],
  }),
};

// ═══════════════════════════════════════════════════════════════════
// Public registry
// ═══════════════════════════════════════════════════════════════════
export const DATASETS = {
  bom: BOM_DATASET,
  routing: ROUTING_DATASET,
  inventory: INVENTORY_DATASET,
  'finished-goods': FINISHED_GOODS_DATASET,
  'raw-materials': RAW_MATERIALS_DATASET,
  'npi-materials': NPI_DATASET,
  'ifs-materials': IFS_DATASET,
  'sourcing-db': SOURCING_DATASET,
  'rfq-tracking': RFQ_TRACKING_DATASET,
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
