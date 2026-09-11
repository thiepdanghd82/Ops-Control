/**
 * Costing domain i18n (v1.3 G2).
 *
 * Owns: pricing breakdown column headers + summary labels used by
 * Standard / Complex calculator and Quote History row totals.
 *
 * Key prefixes: `pricing.*`. Other costing-adjacent prefixes
 * (`qh.*`, `formal.*`) stay in their own domain modules — keep one
 * SAP module per file so ownership is clear.
 *
 * Industry acronyms (MOQ, EAU, GM%, VA%) intentionally stay in EN per
 * the convention documented at the top of strings.js — operators
 * speak them in English regardless of locale.
 *
 * Confirmed with the NPI manager 2026-09-10, the terms that stay EN are:
 * MOQ, EAU, Tier, Coverage — plus the ones this codebase had already
 * settled on in CalcLegend's bilingual pairs: Layout ("Layout Tab" →
 * "Tab Layout"), Lead time ("Lead time & Notice" → "Lead time & Ghi
 * chú"), KPI, BOM, RFQ. The house rule is: keep the trade term,
 * translate the ordinary words around it.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // Sprint S-PRICING-COMBINED-P1 (2026-06-17) — Combined sub-tab on
  // Pricing (Std) that stacks Materials / Inks / Processes in one
  // scrollable surface. Tab label + 3 section headings live here so
  // future Phase 2 (retire 3 originals) can flip references without
  // touching component code.
  // Sprint S-PRICING-COMBINED-P2 (2026-06-18) — Phase 2 renamed the
  // tab now that it's the sole pricing-phase surface (3 standalone
  // tabs retired). Key id stays 'pricing.tab.combined' so callers
  // (StandardCalc.jsx SUB_TABS labelKey) keep working without churn.
  'pricing.tab.combined': { en: 'Materials & Process', vi: 'Vật tư & Công đoạn' },
  // Sprint 2026-09-10 — the remaining Std/Cpx sub-tabs. StandardCalc has had
  // labelKey wired since S-PRICING-COMBINED-P1 but only `combined` used it,
  // so in Vietnamese one tab rendered translated and eight rendered English.
  // Wording reuses what CalcLegend's bilingual pairs already committed to.
  'pricing.tab.header': { en: 'RFQ & MOQ Info', vi: 'Thông tin RFQ & MOQ' },
  'pricing.tab.layout': { en: 'Layout', vi: 'Layout' },
  'pricing.tab.packing': { en: 'Pack & Ship', vi: 'Đóng gói & Vận chuyển' },
  'pricing.tab.leadtime': { en: 'Lead time & Notice', vi: 'Lead time & Ghi chú' },
  'pricing.tab.breakdown': { en: 'Cost Breakdown', vi: 'Phân tích chi phí' },
  'pricing.tab.balancing': { en: 'Balancing', vi: 'Cân bằng chuyền' },
  'pricing.tab.summarize': { en: 'Summarize', vi: 'Tổng hợp' },
  'pricing.tab.legend': { en: 'Legend', vi: 'Chú giải' },
  'pricing.tab.calculators': { en: 'Calculators', vi: 'Bộ tính toán' },
  'pricing.tab.bomtree': { en: 'BOM Tree', vi: 'Cây BOM' },

  // RFQ Information card — shared by Standard and Complex, so one set of
  // keys covers both. Trade terms stay EN per the glossary above: Site,
  // CU PN and UL are IFS / certification identifiers an operator reads as
  // codes, and CCL PN (80#) is a part-number format, not a phrase.
  'rfqcard.title': { en: 'RFQ Information', vi: 'Thông tin RFQ' },
  'rfqcard.sec.identification': { en: 'Identification', vi: 'Định danh' },
  'rfqcard.sec.customer': { en: 'Customer', vi: 'Khách hàng' },
  'rfqcard.sec.product': { en: 'Product', vi: 'Sản phẩm' },
  'rfqcard.sec.certification': { en: 'RFQ & Certification', vi: 'RFQ & Chứng nhận' },
  'rfqcard.site': { en: 'Site', vi: 'Site' },
  'rfqcard.npi_owner': { en: 'NPI Owner', vi: 'Phụ trách NPI' },
  'rfqcard.sale_owner': { en: 'Sale Owner', vi: 'Phụ trách Sale' },
  'rfqcard.direct_customer': { en: 'Direct Customer', vi: 'Khách hàng trực tiếp' },
  'rfqcard.direct_cu_pn': { en: 'Direct CU PN', vi: 'Direct CU PN' },
  'rfqcard.end_customer': { en: 'End Customer', vi: 'Khách hàng cuối' },
  'rfqcard.end_cu_pn': { en: 'End CU PN', vi: 'End CU PN' },
  'rfqcard.project': { en: 'Project', vi: 'Dự án' },
  'rfqcard.description': { en: 'Description', vi: 'Mô tả' },
  'rfqcard.product_life_time': { en: 'Product Life Time', vi: 'Vòng đời sản phẩm' },
  'rfqcard.trade_mode': { en: 'Trade Mode', vi: 'Hình thức thương mại' },
  'rfqcard.design_process': { en: 'Design Process', vi: 'Quy trình thiết kế' },
  'rfqcard.rfq_number': { en: 'RFQ Number', vi: 'Số RFQ' },
  'rfqcard.options': { en: 'Options', vi: 'Tùy chọn' },
  'rfqcard.request_ul': { en: 'Request UL', vi: 'Yêu cầu UL' },
  'rfqcard.ul_description': { en: 'UL Description', vi: 'Mô tả UL' },
  'rfqcard.generate': { en: 'Generate', vi: 'Tạo' },
  'rfqcard.generate_rfq': { en: 'Generate RFQ number', vi: 'Tạo số RFQ' },
  // Cost summary strip above the worksheet. 13 columns in a very narrow
  // band, so only the ordinary words are translated — the acronyms stay EN
  // per the glossary and because a longer string would wrap the column.
  // Confirmed with the NPI manager 2026-09-10.
  // Complex Calc — mostly ordinary business vocabulary, so most of it
  // translates. What stays EN: Contr%, MOQ, SP/DB codes, PE Bag, VND/USD
  // column heads, and the FOB/CIF placeholder (Incoterms).
  // SubProductRow — a dense table, so a column head only gets translated
  // when Vietnamese has a word at least as short. Everything else stays EN:
  // Area% Cav Eff% Scrap% Mesh Offcut Slit Setup H/LM/kg IFS Code
  // DRW materials Design Layout Layout Process Mat Tool Life Tool Type
  // Workcenter — trade terms Vietnamese print operators say in English.
  // Tooltips are full sentences with no layout risk, so all of them are
  // translated. Coverage stays EN per the glossary.
  'spr.color': { en: 'Color', vi: 'Màu' },
  'spr.crew': { en: 'Crew', vi: 'Thợ' },
  'spr.row': { en: 'Row', vi: 'Dòng' },
  'spr.type': { en: 'Type', vi: 'Loại' },
  'spr.usage': { en: 'Usage', vi: 'Định mức' },
  'spr.width': { en: 'Width', vi: 'Khổ' },
  'spr.speed': { en: 'Speed', vi: 'Tốc độ' },
  'spr.label': { en: 'Label', vi: 'Nhãn' },
  'spr.ink_price': { en: 'Ink Price', vi: 'Giá mực' },
  'spr.mat_price': { en: 'Mat Price', vi: 'Giá VT' },
  'spr.ref_price': { en: 'Ref Price', vi: 'Giá tham chiếu' },
  'spr.tool_cost': { en: 'Tool Cost', vi: 'Chi phí khuôn' },
  'spr.ship_qty': { en: 'Ship Qty', vi: 'SL giao' },
  'spr.quote_materials': { en: 'Quote materials', vi: 'Vật tư báo giá' },
  'spr.print_type': { en: 'Print Type', vi: 'Kiểu in' },
  'spr.ph_color_name': { en: 'Color name', vi: 'Tên màu' },
  'spr.lbl_customer_drawing': { en: 'Customer Drawing', vi: 'Bản vẽ khách hàng' },
  'spr.lbl_design_drawing': { en: 'Design Layout Drawing', vi: 'Bản vẽ Design Layout' },
  'spr.tip_reset_coverage': {
    en: 'Reset to default coverage',
    vi: 'Đặt lại Coverage mặc định',
  },
  'spr.tip_remove': { en: 'Remove', vi: 'Xoá' },
  'spr.tip_repeat': { en: 'Repeat', vi: 'Lặp lại' },
  'spr.tip_manual_uph': { en: 'Manual UPH', vi: 'UPH thủ công' },
  'spr.tip_prod_time': { en: 'Production time (hours)', vi: 'Thời gian sản xuất (giờ)' },
  'spr.tip_run_labor': { en: 'Run labor', vi: 'Nhân công chạy máy' },
  'spr.tip_run_machine': { en: 'Run machine', vi: 'Máy chạy' },
  'spr.tip_setup_labor': { en: 'Setup labor', vi: 'Nhân công setup' },
  'spr.tip_setup_machine': { en: 'Setup machine', vi: 'Máy setup' },
  'spr.tip_scrap_factor': {
    en: 'Scrap factor from processes',
    vi: 'Hệ số hao hụt từ các công đoạn',
  },
  'spr.tip_coverage_disabled': {
    en: 'Coverage override — disabled for Indigo',
    vi: 'Ghi đè Coverage — không dùng cho Indigo',
  },
  'spr.tip_indigo_only': { en: 'Enabled for Indigo only', vi: 'Chỉ dùng cho Indigo' },
  'spr.tip_override_eau': {
    en: 'Override EAU (total qty). Empty = annual × lifetime',
    vi: 'Ghi đè EAU (tổng SL). Để trống = SL năm × vòng đời',
  },
  'spr.tip_override_pitch': { en: 'Override pitch from layout', vi: 'Ghi đè pitch từ layout' },
  'spr.tip_ovr_pitch': {
    en: 'Override — clear to revert to layout pitch',
    vi: 'Ghi đè — xoá để quay lại Pitch của Layout',
  },
  'spr.tip_auto_layout': { en: 'Auto-synced from Layout', vi: 'Tự đồng bộ từ Layout' },
  'spr.tip_ovr_webwidth': {
    en: 'Override — clear to revert to layout Web Width TD',
    vi: 'Ghi đè — xoá để quay lại Web Width TD của Layout',
  },
  'spr.tip_auto_webwidth': {
    en: 'Auto-synced from Layout Web Width TD',
    vi: 'Tự đồng bộ từ Web Width TD của Layout',
  },
  'spr.tip_ovr_cav': {
    en: 'Override — clear to revert to Layout/Sheet',
    vi: 'Ghi đè — xoá để quay lại Layout/Sheet',
  },
  'spr.tip_auto_cav': { en: 'Auto-synced from Layout/Sheet', vi: 'Tự đồng bộ từ Layout/Sheet' },
  'spr.tip_ovr_auto': {
    en: 'Override — clear to revert to auto',
    vi: 'Ghi đè — xoá để quay lại tự động',
  },
  'spr.tip_auto_offcut_formula': {
    en: 'Auto = MOD(Cavities, Width) / Cavities',
    vi: 'Tự động = MOD(Cavities, Width) / Cavities',
  },
  'spr.tip_clicks': {
    en: 'Pick the click count — charges come from Click Charges table',
    vi: 'Chọn số click — phí lấy từ bảng Click Charges',
  },
  'spr.tip_clicks_indigo_only': { en: 'Indigo only', vi: 'Chỉ dùng cho Indigo' },
  'spr.tip_crew_base': {
    en: 'Crew size — drives labor + manual MAN UPH',
    vi: 'Số thợ — chi phối nhân công + MAN UPH thủ công',
  },
  'spr.tip_crew_ovr': {
    en: 'Override — rate crew = {base}. Drives labor + manual throughput.',
    vi: 'Ghi đè — số thợ định mức = {base}. Chi phối nhân công + năng suất thủ công.',
  },
  'spr.tip_moq_base': { en: 'Base value (MOQ 1)', vi: 'Giá trị gốc (MOQ 1)' },
  'spr.tip_moq_ovr': {
    en: 'MOQ {n} override (base = {base})',
    vi: 'Ghi đè MOQ {n} (gốc = {base})',
  },
  'spr.tip_moq_inherit': {
    en: 'Inherits MOQ 1 base ({base}) — type to override',
    vi: 'Kế thừa gốc MOQ 1 ({base}) — gõ để ghi đè',
  },
  'spr.tip_sync_print': {
    en: 'Sync print design · Pull a saved Design Tools record and apply Print-side fields onto this sub-product',
    vi: 'Đồng bộ thiết kế in · Lấy bản ghi Design Tools đã lưu và áp các trường phía In vào sub-product này',
  },
  'spr.tip_sync_cut': {
    en: 'Sync cut design · Pull a saved Design Tools record and apply Cut-side fields onto this sub-product',
    vi: 'Đồng bộ thiết kế cắt · Lấy bản ghi Design Tools đã lưu và áp các trường phía Cắt vào sub-product này',
  },
  'spr.tip_offcut_n': { en: 'Offcut=N → 0%', vi: 'Offcut=N → 0%' },
  'spr.tip_offcut_default': { en: 'Default → 5%', vi: 'Mặc định → 5%' },
  'spr.tip_area_required': {
    en: 'AREA % is required to compute RUN ink cost',
    vi: 'AREA % bắt buộc để tính giá mực RUN',
  },
  'spr.tip_auto_uph': {
    en: 'Auto-synced from Crew × Eff% × Speed — change Crew or Speed to rebalance this manual stage',
    vi: 'Tự đồng bộ từ Thợ × Eff% × Tốc độ — đổi Thợ hoặc Tốc độ để cân lại công đoạn thủ công này',
  },
  'spr.tip_gross_lm': {
    en: 'Gross material for MOQ (lm) incl. setup + scrap + offcut',
    vi: 'Vật tư gộp cho MOQ (lm) gồm setup + hao hụt + offcut',
  },
  'spr.tip_gross_m2': {
    en: 'Gross material for MOQ (m²) incl. setup + scrap + offcut',
    vi: 'Vật tư gộp cho MOQ (m²) gồm setup + hao hụt + offcut',
  },
  'spr.tip_layout_count': {
    en: 'Layout/batch count — required for machine workcenters (see Rate Table Machine USD/H)',
    vi: 'Số Layout/mẻ — bắt buộc với workcenter máy (xem Machine USD/H ở Bảng Định mức)',
  },
  'spr.tip_offcut': {
    en: 'Offcut % — matches COST V1.0 Sheet 1 formula MOD(Cavities, Width) / Cavities. Type to override.',
    vi: 'Offcut % — khớp công thức COST V1.0 Sheet 1: MOD(Cavities, Width) / Cavities. Gõ để ghi đè.',
  },
  'spr.tip_pitch_default': {
    en: "Pitch (mm) — defaults to SP Layout's Pitch when blank",
    vi: 'Pitch (mm) — để trống thì lấy Pitch của SP Layout',
  },
  'spr.tip_pitch_inherit': {
    en: 'Pitch (mm). Empty = inherit from SP Layout. Type to override.',
    vi: 'Pitch (mm). Để trống = kế thừa từ SP Layout. Gõ để ghi đè.',
  },
  'spr.tip_width_default': {
    en: "Width (mm) — defaults to SP Layout's Web Width TD when blank",
    vi: 'Khổ (mm) — để trống thì lấy Web Width TD của SP Layout',
  },
  'spr.tip_width_inherit': {
    en: 'Width (mm). Empty = inherit Web Width TD from SP Layout. Type to override.',
    vi: 'Khổ (mm). Để trống = kế thừa Web Width TD từ SP Layout. Gõ để ghi đè.',
  },
  'spr.tip_tool_life': {
    en: 'Tool life shots — auto-filled from DDL or override',
    vi: 'Số shot tuổi thọ khuôn — tự điền từ DDL hoặc ghi đè',
  },
  'cpx.actions': { en: 'Actions', vi: 'Thao tác' },
  'cpx.contribution': { en: 'Contribution', vi: 'Đóng góp' },
  'cpx.deliver_qty': { en: 'Deliver Quantity', vi: 'Số lượng giao' },
  'cpx.delivery_term': { en: 'Delivery Term', vi: 'Điều kiện giao hàng' },
  'cpx.description': { en: 'Description', vi: 'Mô tả' },
  'cpx.field': { en: 'Field', vi: 'Trường' },
  'cpx.grand_total': { en: 'GRAND TOTAL', vi: 'TỔNG CỘNG' },
  'cpx.gross_margin': { en: 'Gross Margin', vi: 'Lợi nhuận gộp' },
  'cpx.main_process': { en: 'Main Process', vi: 'Công đoạn chính' },
  'cpx.packing': { en: 'Packing', vi: 'Đóng gói' },
  'cpx.packing_method': { en: 'Packing Method', vi: 'Cách đóng gói' },
  'cpx.primary': { en: 'Primary', vi: 'Chính' },
  'cpx.selling_price': { en: 'Selling Price', vi: 'Giá bán' },
  'cpx.setup_per_moq': { en: 'Setup Data per MOQ', vi: 'Dữ liệu setup theo MOQ' },
  'cpx.shipping': { en: 'Shipping', vi: 'Vận chuyển' },
  'cpx.size_mm': { en: 'Size (mm)', vi: 'Kích thước (mm)' },
  'cpx.total_cost': { en: 'Total Cost', vi: 'Tổng chi phí' },
  'cpx.unsaved': { en: 'Unsaved', vi: 'Chưa lưu' },
  'cpx.value_add': { en: 'Value Add', vi: 'Giá trị gia tăng' },
  'cpx.box_cost': { en: 'Box Cost (USD)', vi: 'Chi phí thùng (USD)' },
  'cpx.other_cost_shipment': { en: 'Other Cost/shipment', vi: 'Chi phí khác/lô' },
  'cpx.other_packing_pcs': { en: 'Other Packing/pcs', vi: 'Đóng gói khác/pcs' },
  'cpx.shipping_cost': { en: 'Shipping Cost (USD total)', vi: 'Chi phí vận chuyển (tổng USD)' },
  'cpx.roll': { en: 'Roll', vi: 'Cuộn' },
  'cpx.sheet': { en: 'Sheet', vi: 'Tờ' },
  'cpx.tray': { en: 'Tray', vi: 'Khay' },
  'cpx.remove': { en: 'Remove', vi: 'Xoá' },
  'cpx.remove_tier': { en: 'Remove MOQ tier', vi: 'Xoá bậc MOQ' },
  'cpx.toggle_detail': { en: 'Toggle detail', vi: 'Ẩn/hiện chi tiết' },
  'cpx.ph_process': { en: 'Process', vi: 'Công đoạn' },
  'cpx.usd_rate_tip': {
    en: 'VND per 1 USD. Bi-directionally syncs Selling/Target USD ↔ VND. Saved per RFQ.',
    vi: 'Số VND cho 1 USD. Đồng bộ hai chiều Giá bán/Mục tiêu USD ↔ VND. Lưu theo từng RFQ.',
  },
  'moqcard.title': { en: 'MOQ & Pricing info', vi: 'Thông tin MOQ & Giá' },
  'moqcard.usd_rate': { en: 'USD Rate', vi: 'Tỷ giá USD' },
  'common.new': { en: 'New', vi: 'Tạo mới' },
  'common.save': { en: 'Save', vi: 'Lưu' },
  'common.saving': { en: 'Saving…', vi: 'Đang lưu…' },
  'common.select': { en: '-- Select --', vi: '-- Chọn --' },
  'common.years': { en: 'years', vi: 'năm' },
  'sumbar.tier': { en: 'Tier', vi: 'Tier' },
  'sumbar.end_cu_pn': { en: 'End CU PN', vi: 'End CU PN' },
  'sumbar.ttl_mat': { en: 'Ttl. Mat', vi: 'Ttl. Mat' },
  'sumbar.process': { en: 'Process', vi: 'Công đoạn' },
  'sumbar.pack_ship': { en: 'Pack & Ship', vi: 'Đóng gói' },
  'sumbar.subtotal': { en: 'Subtotal', vi: 'Tạm tính' },
  'sumbar.sell_price': { en: 'Sell Price', vi: 'Giá bán' },
  'sumbar.target': { en: 'Target', vi: 'Mục tiêu' },
  'sumbar.ttl_mat_tip': {
    en: 'Total Material = Materials + Inks',
    vi: 'Tổng vật tư = Vật tư + Mực in',
  },

  'rfqcard.site_locked': {
    en: 'Locked after {status} — revoke to change',
    vi: 'Đã khoá sau khi {status} — thu hồi phê duyệt để sửa',
  },
  'pricing.section.materials': { en: 'Materials', vi: 'Vật tư' },
  'pricing.section.inks': { en: 'Inks', vi: 'Mực in' },
  'pricing.section.processes': { en: 'Processes', vi: 'Công đoạn' },

  // Pricing breakdown columns
  'pricing.tier': { en: 'Tier', vi: 'Bậc' },
  'pricing.moq': { en: 'MOQ', vi: 'MOQ' },
  'pricing.eau': { en: 'EAU', vi: 'EAU' },
  'pricing.sell_price': { en: 'Sell Price', vi: 'Giá bán' },
  'pricing.target': { en: 'Target', vi: 'Mục tiêu' },
  'pricing.material': { en: 'Material', vi: 'Vật liệu' },
  'pricing.ink': { en: 'Ink', vi: 'Mực' },
  'pricing.process': { en: 'Process', vi: 'Công đoạn' },
  'pricing.pack_ship': { en: 'Pack & Ship', vi: 'Đóng gói & VC' },
  'pricing.subtotal': { en: 'Subtotal', vi: 'Tổng phụ' },
  'pricing.va_pct': { en: 'VA%', vi: 'VA%' },
  'pricing.contr_pct': { en: 'Contr%', vi: 'Đóng góp%' },
  'pricing.gm_pct': { en: 'GM%', vi: 'GM%' },
  'pricing.selling_unit': { en: 'Selling /unit (USD)', vi: 'Giá bán /sản phẩm (USD)' },
  // Cost Breakdown — Cost Structure what-if (display-only)
  'cb.cost_structure': { en: 'Cost Structure', vi: 'Cấu trúc chi phí' },
  'cb.bucket': { en: 'Cost bucket', vi: 'Khoản mục' },
  'cb.value': { en: 'Value', vi: 'Giá trị' },
  'cb.pct_sell': { en: '% Sell', vi: '% Bán' },
  'cb.pct_target': { en: '% Target', vi: '% Mục tiêu' },
  'cb.active': { en: 'Active', vi: 'Áp dụng' },
  'cb.reset': { en: 'Reset — re-check all buckets', vi: 'Đặt lại — bật lại tất cả' },
  'cb.grand_total': { en: 'GRAND TOTAL', vi: 'TỔNG CỘNG' },
  'cb.excluded': { en: 'Excluded', vi: 'Đã loại' },

  // Summary box (compact-form labels for narrow columns)
  'pricing.material_short': { en: 'Mat', vi: 'VL' },
  'pricing.ink_short': { en: 'Ink', vi: 'Mực' },
  'pricing.process_short': { en: 'Proc', vi: 'CĐ' },
  'pricing.packing_ship': { en: 'Pack+Ship', vi: 'Đóng gói+VC' },

  // Sprint S-PACK-SHIP-PER-TIER — banner shown at the top of the
  // Packing & Ship tab when active_moq_idx > 0, hinting that values
  // are inherited from MOQ1 unless the operator overrides them.
  // "MOQ1" is intentional verbatim (not interpolated qty) per Henry's
  // call — clearer than "MOQ 500" since the inheritance source IS
  // tier 0 regardless of its MOQ quantity.
  'pricing.pack_ship.inherit_hint': {
    en: 'Inherited from MOQ1 — edit to set a value specific to this MOQ',
    vi: 'Kế thừa từ MOQ1 — sửa để áp riêng cho MOQ này',
  },

  // ─── Material Library / Print Area / Inks (v1.3 M3) ───
  // Library-side material picker shares its search-placeholder string
  // here; the calc-side InkCalculator + PrintAreaCalc tabs use these
  // tiny labels too.
  'material_lib.search_placeholder': {
    en: 'Search by material name, type, supplier…',
    vi: 'Tìm theo tên vật liệu, loại, nhà cung cấp…',
  },
  'printarea.search_placeholder': {
    en: 'Search by SKU or product name…',
    vi: 'Tìm theo SKU hoặc tên sản phẩm…',
  },
  'printarea.optional': { en: 'Optional', vi: 'Tuỳ chọn' },
  'inks.mesh_code': { en: 'Mesh Code', vi: 'Mã lưới' },
  'inks.anilox_code': { en: 'Anilox Code', vi: 'Mã Anilox' },

  // ─── Alt-materials toggle (Sprint S-ALT-MAT, PR #A) ───
  // Two parallel material sets per quote (Main + Alternative); operator
  // picks one to drive cost via the radio toggle in Materials tab header.
  'pricing.materials.toggle.main': { en: 'Maint.Mat', vi: 'Maint.Mat' },
  'pricing.materials.toggle.alt': { en: 'Alternative.Mat', vi: 'Alternative.Mat' },
  'pricing.materials.alt.empty': {
    en: 'No alternative materials yet.',
    vi: 'Chưa có vật liệu thay thế.',
  },
  'pricing.materials.alt.copy_from_main': {
    en: 'Copy from Maint.Mat',
    vi: 'Sao chép từ Maint.Mat',
  },
  'pricing.materials.badge.row_count': { en: '{n}', vi: '{n}' },
  'pricing.materials.copy.tooltip': {
    en: 'Copy materials between Main ↔ Alternative',
    vi: 'Sao chép vật liệu giữa Main ↔ Alternative',
  },
  'pricing.materials.copy.main_to_alt': {
    en: 'Copy Maint.Mat → Alternative.Mat',
    vi: 'Sao chép Maint.Mat → Alternative.Mat',
  },
  'pricing.materials.copy.alt_to_main': {
    en: 'Copy Alternative.Mat → Maint.Mat',
    vi: 'Sao chép Alternative.Mat → Maint.Mat',
  },
  'pricing.materials.copy.confirm_title': {
    en: 'Overwrite materials?',
    vi: 'Ghi đè vật liệu?',
  },
  'pricing.materials.copy.confirm_body': {
    en: '{dest} currently has {count} row(s). Overwrite with {sourceCount} row(s) from {source}?',
    vi: '{dest} đang có {count} dòng. Ghi đè bằng {sourceCount} dòng từ {source}?',
  },
  'pricing.materials.copy.btn_overwrite': { en: 'Overwrite', vi: 'Ghi đè' },
  'pricing.materials.copy.btn_cancel': { en: 'Cancel', vi: 'Hủy' },

  // ─── PR #C — Quote History badge + tier override hint ───
  'pricing.materials.badge.main': { en: 'Main', vi: 'Main' },
  'pricing.materials.badge.alt': { en: 'Alt', vi: 'Alt' },
  'pricing.materials.badge.mixed': {
    en: 'Mixed ({altCount} alt / {mainCount} main)',
    vi: 'Trộn ({altCount} alt / {mainCount} main)',
  },
  'pricing.materials.badge.tooltip': {
    en: 'Which materials set drives this quote’s cost',
    vi: 'Bộ vật tư nào đang driver chi phí báo giá',
  },
  'pricing.materials.tier.alt_override_hint': {
    en: 'Per-tier Setup LM override applies to the ACTIVE material set (currently {set}). Switch the Maint.Mat / Alternative.Mat toggle to edit the other set.',
    vi: 'Setup LM ghi đè theo tier áp dụng vào bộ vật tư ĐANG ACTIVE ({set}). Chuyển toggle Maint.Mat / Alternative.Mat để edit bộ kia.',
  },

  // ─── Sprint S-MULTI-DRAW — FileUploadZone multi-drawing gallery ───
  'fuz.count': { en: '{n} files', vi: '{n} tệp' },
  'fuz.add': { en: 'Add drawing', vi: 'Thêm bản vẽ' },
  'fuz.remove': { en: 'Remove drawing', vi: 'Xoá bản vẽ' },
  'fuz.open_new': { en: 'Open in new window', vi: 'Mở ở cửa sổ mới' },
  'fuz.showing': { en: 'Showing', vi: 'Đang hiện' },
  'fuz.remove_confirm': { en: 'Remove "{name}"?', vi: 'Xoá "{name}"?' },
});
