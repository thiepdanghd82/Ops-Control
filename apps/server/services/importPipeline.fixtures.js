// @ts-check
/**
 * Fixture datasets for the import-pipeline tests.
 *
 * The BOM and Routing datasets were real registry entries until the
 * Manufacturing section (Mfg Structures, Routing Ops) was removed on
 * 2026-10-14. The pipeline they exercised — header matching, coercion,
 * merge modes — is shared by every remaining dataset, so the tests keep
 * running against these copies rather than losing their coverage. The
 * `shadow` blocks are dropped: their SQLite writers went with the tabs.
 */
import { STORAGE_JS_AOA, normKey } from './importDatasets.js';

const VN = {
  partNo: ['Part No', 'Part Number', 'Part #', 'Mã hàng', 'Mã vật tư', 'Số part', 'PartNo'],
  partDesc: ['Part Description', 'Description', 'Tên hàng', 'Mô tả', 'Tên vật tư'],
  qty: ['Qty Per Assembly', 'Quantity', 'Qty', 'Số lượng', 'SL', 'SL/Cụm'],
  uom: ['UOM', 'Unit', 'Đơn vị', 'ĐVT', 'Unit of Measure'],
  supplier: ['Supplier', 'Vendor', 'NCC', 'Nhà cung cấp'],
  site: ['Site', 'Plant', 'Nhà máy', 'Location'],
};

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

export const BOM_DATASET = {
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
};

export const ROUTING_DATASET = {
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
};
