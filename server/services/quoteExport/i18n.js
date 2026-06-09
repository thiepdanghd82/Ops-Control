// @ts-check
/**
 * Quote-export label dictionary (EN + VN).
 *
 * Keep flat — every key resolves to `{ en, vi }`. The biLabel() helper
 * renders one of three forms depending on the export request's `lang`:
 *   'en'        → EN only
 *   'vi'        → VN only
 *   'bilingual' → "EN\nVN" (default — Excel renders with wrapText: true)
 *
 * Naming: `<sheet>.<section>.<field>` or `common.<field>`. Adding a key
 * here is cheap; missing keys fall back to the raw EN string with a
 * `?` suffix so QA spots the gap.
 *
 * NOT reused with client/src/utils/i18n.js by design — export labels
 * include tech terms ("QPA m²", "Bleed mm") that don't belong in
 * operator-facing UI. Decoupling lets each evolve independently.
 */

export const LABELS = {
  // ── common ──────────────────────────────────────────────────────
  'common.label': { en: 'Label', vi: 'Nhãn' },
  'common.code': { en: 'Code', vi: 'Mã' },
  'common.description': { en: 'Description', vi: 'Mô tả' },
  'common.value': { en: 'Value', vi: 'Giá trị' },
  'common.notes': { en: 'Notes', vi: 'Ghi chú' },
  'common.subtotal': { en: 'Subtotal', vi: 'Cộng' },
  'common.total': { en: 'Total', vi: 'Tổng' },
  'common.unit_usd': { en: 'USD/unit', vi: 'USD/đv' },
  'common.unit_pcs': { en: 'pcs', vi: 'cái' },
  'common.unit_mm': { en: 'mm', vi: 'mm' },
  'common.unit_m2': { en: 'm²', vi: 'm²' },
  'common.unit_lm': { en: 'LM', vi: 'LM' },
  'common.yes': { en: 'Yes', vi: 'Có' },
  'common.no': { en: 'No', vi: 'Không' },
  'common.na': { en: 'N/A', vi: 'N/A' },
  'common.computed_at_calc': {
    en: 'Per-row breakdown computed at calc time, not persisted on this snapshot.',
    vi: 'Chi phí theo hàng được tính lúc calc, không lưu trong snapshot này.',
  },

  // ── 00 Cover ────────────────────────────────────────────────────
  'cover.title': { en: 'QUOTATION', vi: 'BẢN BÁO GIÁ' },
  'cover.quote_id': { en: 'Quote ID', vi: 'Mã báo giá' },
  'cover.version': { en: 'Version', vi: 'Phiên bản' },
  'cover.variant': { en: 'Variant', vi: 'Bản' },
  'cover.variant_customer': { en: 'Customer copy', vi: 'Bản khách hàng' },
  'cover.variant_internal': { en: 'Internal copy', vi: 'Bản nội bộ' },
  'cover.generated': { en: 'Generated at', vi: 'Tạo lúc' },
  'cover.exported_by': { en: 'Exported by', vi: 'Người xuất' },
  'cover.engine_sha': { en: 'Engine SHA', vi: 'Mã engine' },
  'cover.customer': { en: 'Customer', vi: 'Khách hàng' },
  'cover.ccl_pn': { en: 'CCL Part No', vi: 'Mã CCL' },
  'cover.end_cu_pn': { en: 'End Customer PN', vi: 'Mã KH cuối' },
  'cover.tier_exported': { en: 'MOQ tier', vi: 'Bậc MOQ' },
  'cover.sell_price': { en: 'Sell Price', vi: 'Giá bán' },
  'cover.gm_pct': { en: 'GM %', vi: 'Lợi nhuận gộp %' },
  'cover.va_pct': { en: 'VA %', vi: 'Giá trị gia tăng %' },
  'cover.contr_pct': { en: 'CONTR %', vi: 'Đóng góp %' },
  'cover.target_gm': { en: 'Target GM %', vi: 'Mục tiêu GM %' },
  'cover.delta_to_target': { en: 'Δ to target', vi: 'Chênh lệch so với mục tiêu' },
  'cover.authorized_signatory': { en: 'Authorized signatory', vi: 'Người ký duyệt' },
  'cover.date': { en: 'Date', vi: 'Ngày' },
  'cover.customer_notes': { en: 'Customer notes', vi: 'Ghi chú khách hàng' },

  // ── 01 RFQ & MOQ ────────────────────────────────────────────────
  'rfq.section_id': { en: 'RFQ Information', vi: 'Thông tin RFQ' },
  'rfq.rfq_number': { en: 'RFQ Number', vi: 'Số RFQ' },
  'rfq.end_customer': { en: 'End Customer', vi: 'Khách hàng cuối' },
  'rfq.direct_cu': { en: 'Direct Customer', vi: 'Khách hàng trực tiếp' },
  'rfq.project': { en: 'Project', vi: 'Dự án' },
  'rfq.quote_date': { en: 'Quote Date', vi: 'Ngày báo giá' },
  'rfq.trade_mode': { en: 'Trade Mode', vi: 'Phương thức thương mại' },
  'rfq.site': { en: 'Site', vi: 'Nhà máy' },
  'rfq.salesperson': { en: 'Salesperson', vi: 'Nhân viên KD' },
  'rfq.npi_owner': { en: 'NPI Owner', vi: 'NPI phụ trách' },
  'rfq.section_moq': { en: 'MOQ Tiers', vi: 'Các bậc MOQ' },
  'rfq.tier': { en: 'Tier', vi: 'Bậc' },
  'rfq.moq': { en: 'MOQ', vi: 'SL tối thiểu' },
  'rfq.eau': { en: 'EAU', vi: 'SL hàng năm' },

  // ── 02 Layout ───────────────────────────────────────────────────
  'layout.section_common': { en: 'Shared dimensions', vi: 'Kích thước chung' },
  'layout.web_width_td': { en: 'Web Width TD', vi: 'Web Width TD' },
  'layout.sheet_length_md': { en: 'Sheet Length MD', vi: 'Chiều dài tờ MD' },
  'layout.num_webs': { en: '# Webs', vi: 'Số web' },
  'layout.rotary_cols': { en: 'Rotary Cols', vi: 'Số cột rotary' },
  'layout.pcs_per_roll': { en: 'Pcs/Roll', vi: 'Pcs/cuộn' },
  'layout.section_print': { en: 'Print Design', vi: 'Thiết kế in' },
  'layout.product_size_w': { en: 'Product Size W (TD)', vi: 'Khổ sản phẩm W (TD)' },
  'layout.product_size_l': { en: 'Product Size L (MD)', vi: 'Khổ sản phẩm L (MD)' },
  'layout.bleed_td': { en: 'Bleed TD', vi: 'Bleed TD' },
  'layout.bleed_md': { en: 'Bleed MD', vi: 'Bleed MD' },
  'layout.pitch': { en: 'Pitch', vi: 'Bước in' },
  'layout.print_cav': { en: 'Print Cav Across', vi: 'Cav in ngang' },
  'layout.print_total_shot': { en: 'Print Total / Shot', vi: 'Tổng in / nhịp' },
  'layout.plate_cyl': { en: 'Plate Cyl', vi: 'Cylinder' },
  'layout.section_cut': { en: 'Cutting Design', vi: 'Thiết kế cắt' },
  'layout.part_width': { en: 'Part Width (TD)', vi: 'Chiều rộng nhãn (TD)' },
  'layout.part_length_md': { en: 'Part Length (MD)', vi: 'Chiều dài nhãn (MD)' },
  'layout.cut_cav': { en: 'Cut Cav', vi: 'Cav cắt' },
  'layout.layout_per_sheet': { en: 'Layout / Sheet', vi: 'Layout / tờ' },

  // ── 03 Materials ────────────────────────────────────────────────
  'mat.section_main': { en: 'Main materials', vi: 'Vật tư chính' },
  'mat.section_alt': { en: 'Alternative materials', vi: 'Vật tư phương án 2' },
  'mat.row_type': { en: 'Row Type', vi: 'Loại' },
  'mat.ifs_code': { en: 'IFS Code', vi: 'Mã IFS' },
  'mat.drw_material': { en: 'DRW materials', vi: 'Vật tư bản vẽ' },
  'mat.quote_materials': { en: 'Quote materials', vi: 'Vật tư báo giá' },
  'mat.desc': { en: 'Description', vi: 'Mô tả' },
  'mat.usage': { en: 'Usage', vi: 'Sử dụng' },
  'mat.setup_lm': { en: 'Setup LM', vi: 'Setup LM' },
  'mat.pitch': { en: 'Pitch', vi: 'Pitch' },
  'mat.width': { en: 'Width', vi: 'Khổ' },
  'mat.cav': { en: 'Cavities', vi: 'Cavities' },
  'mat.offcut': { en: 'Offcut', vi: 'Offcut' },
  'mat.offcut_pct': { en: 'Offcut %', vi: 'Offcut %' },
  'mat.slit': { en: 'Slit', vi: 'Slit' },
  'mat.ref_price': { en: 'Ref Price', vi: 'Giá tham chiếu' },
  'mat.mat_price': { en: 'Mat Price', vi: 'Giá vật tư' },
  'mat.qpa_m2': { en: 'QPA (m²)', vi: 'QPA (m²)' },
  'mat.qpa_lm': { en: 'QPA (LM)', vi: 'QPA (LM)' },
  'mat.l_per_sheet': { en: 'L/Sheet', vi: 'L/tờ' },
  'mat.webs': { en: 'Webs', vi: 'Webs' },
  'mat.scrap_pct': { en: 'Scrap %', vi: 'Scrap %' },
  'mat.setup_cost': { en: 'Setup Cost', vi: 'Chi phí setup' },
  'mat.run_cost': { en: 'Run Cost', vi: 'Chi phí run' },

  // ── 04 Inks ─────────────────────────────────────────────────────
  'ink.section': { en: 'Inks', vi: 'Mực in' },
  'ink.print_type': { en: 'Print Type', vi: 'Kiểu in' },
  'ink.mesh_spec': { en: 'Mesh Spec', vi: 'Mesh' },
  'ink.pitch_mm': { en: 'Pitch (mm)', vi: 'Pitch (mm)' },
  'ink.width': { en: 'Width', vi: 'Khổ' },
  'ink.setup_kg': { en: 'Setup kg', vi: 'Setup kg' },
  'ink.area_pct': { en: 'Area %', vi: 'Diện tích %' },
  'ink.cov_ovr': { en: 'Cov Ovr', vi: 'Cov ghi đè' },
  'ink.cov_synced_note': {
    en: 'Auto-synced from Coverage Table for print_type',
    vi: 'Lấy tự động từ bảng Coverage theo print_type',
  },
  'ink.clicks': { en: 'Clicks', vi: 'Clicks' },
  'ink.ink_price': { en: 'Ink Price', vi: 'Giá mực' },

  // ── 05 Processes ────────────────────────────────────────────────
  'proc.section': { en: 'Processes', vi: 'Công đoạn' },
  'proc.process_type': { en: 'Process Type', vi: 'Loại công đoạn' },
  'proc.workcenter': { en: 'Workcenter', vi: 'Máy' },
  'proc.speed': { en: 'Speed', vi: 'Tốc độ' },
  'proc.speed_uom': { en: 'UOM', vi: 'Đơn vị' },
  'proc.layout': { en: 'Layout', vi: 'Layout' },
  'proc.efficiency': { en: 'Efficiency', vi: 'Hiệu suất' },
  'proc.setup_h': { en: 'Setup h', vi: 'Setup giờ' },
  'proc.scrap_pct': { en: 'Scrap %', vi: 'Scrap %' },
  'proc.manual_uph': { en: 'Manual UPH', vi: 'UPH thủ công' },
  'proc.tool_cost': { en: 'Tool Cost', vi: 'Giá khuôn' },
  'proc.tool_type': { en: 'Tool Type', vi: 'Loại khuôn' },
  'proc.tool_life': { en: 'Tool Life', vi: 'Tuổi thọ khuôn' },
  'proc.extra_cost': { en: 'Extra Cost', vi: 'Chi phí khác' },
  'proc.mach_rate': { en: 'Machine Rate', vi: 'Đơn giá máy' },
  'proc.labor_rate': { en: 'Labor Rate', vi: 'Đơn giá nhân công' },
  'proc.crew': { en: 'Crew', vi: 'Người vận hành' },
  'proc.uph_derived': { en: 'UPH', vi: 'UPH' },

  // ── 06 Balancing ────────────────────────────────────────────────
  'bal.section': { en: 'Capacity Balancing', vi: 'Cân đối công suất' },
  'bal.moq_time': { en: 'MOQ run time (h)', vi: 'Giờ chạy MOQ' },
  'bal.eau_time': { en: 'EAU run time (h)', vi: 'Giờ chạy EAU' },
  'bal.shifts': { en: '# shifts (8h)', vi: 'Số ca (8h)' },
  'bal.capacity_pct': { en: '% capacity', vi: '% công suất' },
  'bal.bottleneck': { en: 'Bottleneck', vi: 'Nút thắt' },

  // ── 07 Pack & Ship ──────────────────────────────────────────────
  'pack.section_packaging': { en: 'Packaging', vi: 'Đóng gói' },
  'pack.method': { en: 'Method', vi: 'Phương thức' },
  'pack.units_per_carton': { en: 'Units / Carton', vi: 'SL / thùng' },
  'pack.cartons_per_pallet': { en: 'Cartons / Pallet', vi: 'Thùng / pallet' },
  'pack.pallet_dims': { en: 'Pallet dimensions', vi: 'Kích thước pallet' },
  'pack.pallet_weight': { en: 'Pallet weight', vi: 'Khối lượng pallet' },
  'pack.box_cost': { en: 'Box cost', vi: 'Chi phí thùng' },
  'pack.bags_per_box': { en: 'Bags / Box', vi: 'Túi / thùng' },
  'pack.other_packing': { en: 'Other packing', vi: 'Đóng gói khác' },
  'pack.section_shipping': { en: 'Shipping', vi: 'Vận chuyển' },
  'pack.incoterm': { en: 'INCOTERM', vi: 'INCOTERM' },
  'pack.delivery_term': { en: 'Delivery Term', vi: 'Điều khoản giao' },
  'pack.container_cost': { en: 'Container cost', vi: 'Chi phí container' },
  'pack.other_ship': { en: 'Other shipping', vi: 'Vận chuyển khác' },

  // ── 08 Cost Breakdown ───────────────────────────────────────────
  'cb.section': { en: 'Cost Breakdown', vi: 'Phân tích chi phí' },
  'cb.category': { en: 'Category', vi: 'Hạng mục' },
  'cb.cost_per_unit': { en: 'Cost/unit', vi: 'Chi phí/đv' },
  'cb.pct_of_total': { en: '% of total', vi: '% tổng' },
  'cb.material': { en: 'Material', vi: 'Vật tư' },
  'cb.material_run': { en: 'Material — Run', vi: 'Vật tư — Run' },
  'cb.material_setup': { en: 'Material — Setup', vi: 'Vật tư — Setup' },
  'cb.ink_run': { en: 'Ink — Run', vi: 'Mực — Run' },
  'cb.ink_setup': { en: 'Ink — Setup', vi: 'Mực — Setup' },
  'cb.labor': { en: 'Labor', vi: 'Nhân công' },
  'cb.labor_run': { en: 'Labor — Run', vi: 'Nhân công — Run' },
  'cb.labor_setup': { en: 'Labor — Setup', vi: 'Nhân công — Setup' },
  'cb.overhead': { en: 'Machine Overhead', vi: 'Phí máy' },
  'cb.overhead_setup': { en: 'Machine OH — Setup', vi: 'Phí máy — Setup' },
  'cb.tooling': { en: 'Tooling', vi: 'Khuôn' },
  'cb.packing_ship': { en: 'Packing & Shipping', vi: 'Đóng gói + Vận chuyển' },
  'cb.manufacturing': { en: 'Manufacturing', vi: 'Sản xuất' },
  'cb.packaging': { en: 'Packaging', vi: 'Đóng gói' },
  'cb.vat_loss': { en: 'VAT loss', vi: 'Hao VAT' },
  'cb.extra': { en: 'Extra', vi: 'Khác' },
  'cb.s_total': { en: 'S.TOTAL (supplier)', vi: 'S.TOTAL (NCC)' },
  'cb.g_total': { en: 'G.TOTAL (purchase)', vi: 'G.TOTAL (mua)' },
  'cb.margin_usd': { en: 'Margin (USD)', vi: 'Margin (USD)' },

  // ── 09 Summary ──────────────────────────────────────────────────
  'summary.section': { en: 'Summary', vi: 'Tổng kết' },
  'summary.approval_status': { en: 'Approval status', vi: 'Trạng thái duyệt' },
  'summary.target_compare': { en: 'Target vs Actual', vi: 'Mục tiêu vs Thực tế' },
  'summary.feedback': { en: 'Customer feedback', vi: 'Phản hồi khách hàng' },

  // ── Approval status enum values ──────────────────────────────────
  'status.pending': { en: 'Pending', vi: 'Chờ duyệt' },
  'status.approved': { en: 'Approved', vi: 'Đã duyệt' },
  'status.rejected': { en: 'Rejected', vi: 'Từ chối' },
  'status.draft': { en: 'Draft', vi: 'Nháp' },

  // Multi-tier export footnotes — used when a non-active tier is exported.
  // Labor / overhead / tooling come from the active-tier snapshot because
  // recomputing them per tier requires calcEngine (locked server-side).
  // `{active_moq}` and `{this_tier_moq}` are substituted via simple
  // string replacement at render time.
  'cb.active_tier_footnote': {
    en: '[active-tier] — Labor, overhead, and tooling costs reflect the active tier (MOQ {active_moq}). Material, ink, and process costs are tier-specific (MOQ {this_tier_moq}).',
    vi: '[tier-hoạt-động] — Chi phí nhân công, overhead, và tooling phản ánh tier đang active (MOQ {active_moq}). Chi phí vật tư, mực, công đoạn được tính theo tier này (MOQ {this_tier_moq}).',
  },
};

/**
 * Resolve a label key into the requested language. Missing keys return
 * the key itself with a `?` suffix so QA spots gaps without crashing.
 *
 * @param {string} key
 * @param {'en'|'vi'|'bilingual'} [lang='bilingual']
 * @returns {string}
 */
export function L(key, lang = 'bilingual') {
  const entry = LABELS[key];
  if (!entry) return `${key}?`;
  if (lang === 'en') return entry.en;
  if (lang === 'vi') return entry.vi;
  return `${entry.en}\n${entry.vi}`;
}

/**
 * Pure helper to assemble an EN/VN cell value from raw strings. Use
 * sparingly — prefer registering a LABELS key so it's discoverable +
 * audit-able. Mainly here for ad-hoc cell content (e.g. computed
 * subtotal labels).
 *
 * @param {string} en
 * @param {string} vi
 * @param {'en'|'vi'|'bilingual'} [lang='bilingual']
 * @returns {string}
 */
export function biLabel(en, vi, lang = 'bilingual') {
  if (lang === 'en') return en;
  if (lang === 'vi') return vi;
  return `${en}\n${vi}`;
}

/** Test surface — exposed so tests can iterate keys without re-import. */
export const KEYS = Object.keys(LABELS);
