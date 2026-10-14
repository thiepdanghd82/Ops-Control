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
  // Saved-result drift banner (Std + Cpx). Trade terms stay English per the
  // glossary rule: Subtotal, Save, Quote History, Cost Breakdown.
  'pricing.drift.title': {
    en: 'Recalculated numbers differ from the saved quote',
    vi: 'Số tính lại khác số đã lưu',
  },
  'pricing.drift.subtotal': { en: 'Subtotal {was} → {now}', vi: 'Subtotal {was} → {now}' },
  'pricing.drift.body': {
    en: 'Exports, Quote History and the Cost Breakdown list still show the saved numbers. Save to update them.',
    vi: 'File xuất, Quote History và danh sách Cost Breakdown vẫn hiện số đã lưu. Bấm Save để cập nhật.',
  },
  'pricing.drift.blocked_title': {
    en: 'Recalculated numbers are far from the saved quote',
    vi: 'Số tính lại lệch quá xa số đã lưu',
  },
  'pricing.drift.blocked_body': {
    en: 'The subtotal would move by {pct}% of the selling price — more than a formula change explains. An input probably reads differently than when this quote was saved (tool life, speed, workcenter). Check them first; Save turns on once you edit.',
    vi: 'Subtotal sẽ thay đổi {pct}% giá bán — lớn hơn mức một thay đổi công thức có thể giải thích. Có thể một ô nhập đang được hiểu khác so với lúc báo giá này được lưu (tool life, speed, workcenter). Hãy kiểm tra trước; nút Save sẽ bật khi có chỉnh sửa.',
  },
  'cgrid.proc.wc_unknown': {
    en: 'Workcenter "{wc}" is not in the Rate Table — its rates read as 0, and a speed on it is costed as hand labour. Pick it again from the list.',
    vi: 'Workcenter "{wc}" không có trong Rate Table — đơn giá đọc thành 0, và speed trên dòng này bị tính như nhân công thủ công. Hãy chọn lại từ danh sách.',
  },
  'cgrid.proc.tool_life_missing': {
    en: 'No tool life for "{tt}": the row has none and the tool list gives none, so its tooling is costed as if the tool lasted 1 shot. Enter the tool life, or pick the type again.',
    vi: 'Không có tool life cho "{tt}": dòng này chưa nhập và danh sách loại dao cũng không có, nên tiền dao đang tính như dao chỉ dùng được 1 shot. Hãy nhập tool life, hoặc chọn lại loại dao.',
  },
  'savechoice.title': { en: 'Save quote', vi: 'Lưu báo giá' },
  'savechoice.quote': { en: 'Quote #{id}', vi: 'Báo giá #{id}' },
  'savechoice.prompt': {
    en: 'This quote was loaded from history. How would you like to save your changes?',
    vi: 'Báo giá này được mở từ lịch sử. Chọn cách lưu các thay đổi:',
  },
  'savechoice.update_label': { en: 'Update existing', vi: 'Cập nhật bản hiện có' },
  'savechoice.update_desc': {
    en: 'replace the current revision in place. Anyone viewing quote #{id} will see the new values.',
    vi: 'thay thế bản hiện tại. Ai đang xem báo giá #{id} sẽ thấy số mới.',
  },
  'savechoice.saveas_label': { en: 'Save as new version', vi: 'Lưu thành bản mới' },
  'savechoice.saveas_desc': {
    en: 'keep the original quote untouched and create a separate revision from your edits.',
    vi: 'giữ nguyên báo giá gốc và tạo một bản riêng từ các chỉnh sửa.',
  },
  'savechoice.cancel': { en: 'Cancel', vi: 'Huỷ' },
  'savechoice.drift_title': {
    en: 'What you are about to save is far from the saved quote',
    vi: 'Số sắp lưu lệch quá xa số đã lưu',
  },
  'savechoice.drift_body': {
    en: 'Subtotal {was} → {now}: {pct}% of the selling price — more than a formula change explains. Check the workcenters, speeds and tool life first.',
    vi: 'Subtotal {was} → {now}: {pct}% giá bán — lớn hơn mức một thay đổi công thức có thể giải thích. Hãy kiểm tra workcenter, speed và tool life trước.',
  },
  'savechoice.go_back': { en: 'Go back and check', vi: 'Quay lại kiểm tra' },
  'savechoice.update_anyway': { en: 'Update anyway', vi: 'Vẫn cập nhật' },
  'savechoice.saveas_anyway': { en: 'Save as new anyway', vi: 'Vẫn lưu bản mới' },
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
  // ─── Design Tools / Gallus press calculator (wave 3) ────────────────────
  // This file carried the most tangled bilingualism of the three calculators:
  // 21 labels concatenated both languages into ONE string ("All · Tất cả",
  // "Optimal · Tối ưu"), and 8 more were Vietnamese-only, so an English reader
  // saw Vietnamese with no English anywhere. Both shapes collapse to one key
  // with a value per language.
  //
  // Press vocabulary stays English — Gallus, ECS340, anilox, pitch, web, lane,
  // die-cut, MD/TD, RL, imp — and so do the step numbers 1A..1E, which are
  // positions in a fixed workflow rather than prose.

  'gal.add_cylinder': { en: 'Add a brand-new cylinder Z', vi: 'Thêm cylinder Z mới' },

  // ─── Print Area explainer headings (wave 6) ─────────────────────────────
  // These carried both languages in ONE string ("Pipeline / Quy trình xử lý"),
  // so every reader saw both. The paragraphs below them are handled
  // differently — they are authored as EN/VI element pairs and CSS shows the
  // matching half; see LegendTab in PrintAreaCalc.jsx.

  // ─── Print Area Calculator (wave 3) ─────────────────────────────────────
  // Stays English: DPI, SKU, ROI, SPOT, Hex, Lab/ΔE76, and the file-type list.
  // Everything an operator sets or reads while measuring a label is translated.
  'pac.title': { en: 'Print Area Calculator', vi: 'Máy tính diện tích in' },
  'pac.subtabs': { en: 'Print Area sub-tabs', vi: 'Tab con Diện tích in' },
  'pac.name': { en: 'Name', vi: 'Tên' },
  'pac.library': { en: 'Library', vi: 'Thư viện' },

  // ─── Library tabs: DDL, Finance, Rates, Mfg, Routing (wave 4) ───────────
  // Accounting and work-centre abbreviations stay as the finance team writes
  // them — WC, OH, SGA, YTD, KPI, UOM, USD/H, GT+OH, Dep/hr, Labor/hr — and so
  // do KH May, KH NX and OH SX, which are already Vietnamese.
  //
  // Two strings here were Vietnamese-only, so an English reader saw Vietnamese
  // with no English anywhere: "Tải lại" and the catch-all tier note.
  'lib.ddl_title': { en: 'Drop-Down Lists', vi: 'Danh sách chọn' },
  'lib.table_name': { en: 'Table name', vi: 'Tên bảng' },
  'lib.table_title': { en: 'Table title', vi: 'Tiêu đề bảng' },
  'lib.new_custom_table': { en: 'New custom table', vi: 'Bảng tuỳ chỉnh mới' },
  'lib.rename_table': { en: 'Rename table', vi: 'Đổi tên bảng' },
  'lib.rename_this_table': { en: 'Rename this table', vi: 'Đổi tên bảng này' },
  'lib.delete_table': { en: 'Delete table', vi: 'Xoá bảng' },
  'lib.delete_custom_table': { en: 'Delete the custom table', vi: 'Xoá bảng tuỳ chỉnh' },
  'lib.delete_this_custom_table': { en: 'Delete this custom table', vi: 'Xoá bảng tuỳ chỉnh này' },
  'lib.delete_row': { en: 'Delete row', vi: 'Xoá dòng' },
  'lib.remove_tier': { en: 'Remove tier', vi: 'Bỏ bậc' },
  'lib.key': { en: 'Key', vi: 'Khoá' },
  'lib.value': { en: 'Value', vi: 'Giá trị' },
  'lib.cost_usd': { en: 'cost $', vi: 'chi phí $' },
  'lib.reload': { en: 'Reload', vi: 'Tải lại' },
  'lib.catch_all_tier': {
    en: 'Catch-all: every perimeter at or above the last threshold',
    vi: 'Catch-all: mọi chu vi ≥ mốc cuối',
  },
  'lib.add_tool_types_hint': {
    en: 'Add tool types in the Tool Type card.',
    vi: 'Thêm loại tool ở thẻ Tool Type.',
  },
  'lib.ph_table_name': { en: 'e.g. Freight Rates', vi: 'ví dụ Freight Rates' },

  'lib.finance_data': { en: 'Cost refer', vi: 'Cost refer' },
  'lib.db_finance_data': { en: 'DB Finance Data', vi: 'Dữ liệu tài chính DB' },
  'lib.no_db_finance': { en: 'No DB Finance data', vi: 'Chưa có dữ liệu tài chính DB' },
  'lib.cost_groups': { en: 'Cost Groups', vi: 'Nhóm chi phí' },
  'lib.expenses': { en: 'Expenses', vi: 'Chi phí' },
  'lib.no_expense_data': { en: 'No expense data', vi: 'Chưa có dữ liệu chi phí' },
  'lib.wc_cost_summary': { en: 'WC Cost Summary', vi: 'Tổng hợp chi phí WC' },
  'lib.no_wc_cost': { en: 'No work-center cost data', vi: 'Chưa có dữ liệu chi phí work-center' },
  'lib.kpi_summary': { en: 'KPI Summary', vi: 'Tổng hợp KPI' },
  'lib.sga_by_site': { en: 'SGA Overhead by Site', vi: 'SGA overhead theo site' },
  'lib.work_center_rates': { en: 'Work Center Rates', vi: 'Định mức work center' },
  'lib.wc_code': { en: 'WC Code', vi: 'Mã WC' },
  'lib.basis': { en: 'Basis', vi: 'Cơ sở' },
  'lib.group': { en: 'Group', vi: 'Nhóm' },
  'lib.item': { en: 'Item', vi: 'Khoản mục' },
  'lib.description': { en: 'Description', vi: 'Mô tả' },
  'lib.rate': { en: 'Rate', vi: 'Định mức' },
  'lib.total_rate': { en: 'Total Rate', vi: 'Tổng định mức' },
  'lib.total_alloc': { en: 'Total Alloc', vi: 'Tổng phân bổ' },
  'lib.labor': { en: 'Labor', vi: 'Nhân công' },
  'lib.power': { en: 'Power', vi: 'Điện' },
  'lib.prod_hrs': { en: 'Prod Hrs', vi: 'Giờ sản xuất' },
  'lib.read_only_admin': {
    en: 'Read-only — admin role required to edit SGA rates.',
    vi: 'Chỉ đọc — cần quyền admin để sửa tỷ lệ SGA.',
  },
  'lib.sga_pct_hint': {
    en: 'Applied as a percent of COGS (g_ttl) per quote. 0 = no SGA burden.',
    vi: 'Áp theo % của COGS (g_ttl) mỗi báo giá. 0 = không gánh SGA.',
  },
  'lib.reload_server': { en: 'Reload server values', vi: 'Tải lại giá trị từ server' },
  'lib.ph_search_wc': {
    en: 'Search by WC code or name...',
    vi: 'Tìm theo mã hoặc tên WC...',
  },

  'lib.rate_table': { en: 'Work Center Rate Table', vi: 'Bảng định mức work center' },
  'lib.workcenter_name': { en: 'Workcenter Name', vi: 'Tên work center' },
  'lib.add_wc_row': { en: 'Add a new workcenter row', vi: 'Thêm dòng work center' },
  'lib.crew': { en: 'Crew', vi: 'Thợ' },
  'lib.oh_cost': { en: 'OH Cost', vi: 'Chi phí OH' },
  'lib.manage_uom': { en: 'Manage units (UOM)', vi: 'Quản lý đơn vị (UOM)' },
  'lib.custom_units': { en: 'Custom units', vi: 'Đơn vị tuỳ chỉnh' },
  'lib.no_custom_units': { en: 'No custom units yet.', vi: 'Chưa có đơn vị tuỳ chỉnh.' },
  'lib.builtin_units': {
    en: 'Built-in (used for machine speed — read-only)',
    vi: 'Có sẵn (dùng cho tốc độ máy — chỉ đọc)',
  },
  'lib.ph_new_unit': {
    en: 'New unit (e.g. RPM, Cuts/min)',
    vi: 'Đơn vị mới (ví dụ RPM, Cuts/min)',
  },
  'lib.import_rates': {
    en: 'Import rates from CSV or XLSX (auto-maps columns, filters blank rows, syncs to server)',
    vi: 'Nhập định mức từ CSV hoặc XLSX (tự map cột, lọc dòng trống, đồng bộ lên server)',
  },
  'lib.no_backups': { en: 'No backups found', vi: 'Không có bản sao lưu' },
  'lib.restore': { en: 'Restore', vi: 'Khôi phục' },
  'lib.rename': { en: 'Rename', vi: 'Đổi tên' },
  'lib.backup': { en: 'Backup', vi: 'Sao lưu' },

  'lib.mfg_structures': { en: 'Manufacturing Structures', vi: 'Cấu trúc sản xuất' },
  'lib.mfg_loading': {
    en: 'Loading Manufacturing Structures...',
    vi: 'Đang tải Cấu trúc sản xuất...',
  },
  'lib.mfg_import': {
    en: 'Import manufacturing structures from CSV or XLSX (preview before commit)',
    vi: 'Nhập cấu trúc sản xuất từ CSV hoặc XLSX (xem trước khi ghi)',
  },
  'lib.mfg_clear': {
    en: 'Clear all Manufacturing Structures data (backup kept)',
    vi: 'Xoá toàn bộ dữ liệu Cấu trúc sản xuất (vẫn giữ bản sao lưu)',
  },
  'lib.rop_title': { en: 'Routing Operations', vi: 'Công đoạn định tuyến' },
  'lib.rop_loading': {
    en: 'Loading Routing Operations...',
    vi: 'Đang tải Công đoạn định tuyến...',
  },
  'lib.rop_import': {
    en: 'Import routing operations from CSV or XLSX (preview before commit)',
    vi: 'Nhập công đoạn định tuyến từ CSV hoặc XLSX (xem trước khi ghi)',
  },
  'lib.rop_clear': {
    en: 'Clear all Routing Operations data (backup kept)',
    vi: 'Xoá toàn bộ dữ liệu Công đoạn định tuyến (vẫn giữ bản sao lưu)',
  },

  // ─── License Manager (wave 5) ───────────────────────────────────────────
  // This screen shipped Vietnamese-only in PR #105 — an English reader saw
  // Vietnamese with no English anywhere, the mirror of what waves 3 and 4 were
  // fixing elsewhere. My file, so my debt.
  //
  // Installation ID, Tier, heartbeat and mint-license stay English: they are
  // the words the licence workflow and mint-license.command already use.
  'licmgr.title': { en: 'License Manager', vi: 'License Manager' },
  'licmgr.machine': { en: 'Machine', vi: 'Máy' },
  'licmgr.installation_id': { en: 'Installation ID', vi: 'Installation ID' },
  'licmgr.status': { en: 'Status ⓘ', vi: 'Trạng thái ⓘ' },
  'licmgr.tier': { en: 'Tier ⓘ', vi: 'Tier ⓘ' },
  'licmgr.expires': { en: 'Expires ⓘ', vi: 'Hết hạn ⓘ' },
  'licmgr.remaining': { en: 'Remaining', vi: 'Còn lại' },
  'licmgr.last_seen': { en: 'Last seen', vi: 'Last seen' },
  'licmgr.actions': { en: 'Actions', vi: 'Hành động' },
  'licmgr.export_request': { en: 'Export request', vi: 'Export request' },
  'licmgr.upload_license': { en: 'Upload license', vi: 'Upload license' },
  'licmgr.forget': { en: 'Remove from table', vi: 'Gỡ khỏi bảng' },
  'licmgr.forget_tip': { en: 'Remove this machine from the table', vi: 'Gỡ máy này khỏi bảng' },
  'licmgr.forget_title': { en: 'Remove machine from the table?', vi: 'Gỡ máy khỏi bảng?' },
  'licmgr.forget_reappear': {
    en: 'If that machine is still in use it will reappear at its next heartbeat.',
    vi: 'Nếu máy đó còn dùng, nó sẽ tự hiện lại ở heartbeat kế tiếp.',
  },
  'licmgr.copy_id_aria': { en: 'Copy Installation ID', vi: 'Chép Installation ID' },
  'licmgr.copy_id_tip': {
    en: 'Copy the full 64-character Installation ID to paste into mint-license',
    vi: 'Chép đủ 64 ký tự Installation ID để dán vào mint-license',
  },
  'licmgr.self_reported_tip': {
    en: 'Self-reported by the machine in its heartbeat — the server cannot verify it',
    vi: 'Máy tự khai trong heartbeat — server không kiểm chứng',
  },
  'licmgr.no_machines': {
    en: 'No machine has sent a heartbeat yet. Desktop installs report themselves when an operator signs in.',
    vi: 'Chưa có máy nào gửi heartbeat. Máy desktop sẽ tự báo cáo khi operator đăng nhập.',
  },

  // ─── Material Cost libraries (wave 4) ───────────────────────────────────
  // NPI Materials, IFS Materials, Sourcing Database and Material Inquiry.
  // Reference data the costing team reads rather than edits, so the column
  // heads matter more than the chrome.
  //
  // Stays English: MOQ, IFS, NPI, UoM, DAP, EXW, USD, m² — and "Part No",
  // which is the IFS field name the import canonicals already pin.
  'matlib.npi_materials': { en: 'NPI Materials', vi: 'Vật tư NPI' },
  'matlib.ifs_materials': { en: 'IFS Materials', vi: 'Vật tư IFS' },
  'matlib.sourcing_db': { en: 'Sourcing Database', vi: 'CSDL nguồn cung' },
  'matlib.material_inquiry': { en: 'Material Inquiry', vi: 'Yêu cầu vật tư' },
  'matlib.identification': { en: 'Identification', vi: 'Định danh' },
  'matlib.specifications': { en: 'Specifications', vi: 'Thông số kỹ thuật' },
  'matlib.specs': { en: 'Specs', vi: 'Thông số' },
  'matlib.pricing': { en: 'Pricing', vi: 'Giá' },
  'matlib.logistics': { en: 'Logistics', vi: 'Hậu cần' },
  'matlib.conversion': { en: 'Conversion', vi: 'Quy đổi' },
  'matlib.tax_status': { en: 'Tax & Status', vi: 'Thuế & trạng thái' },
  'matlib.material_name': { en: 'Material Name', vi: 'Tên vật tư' },
  'matlib.type_desc': { en: 'Type / Description', vi: 'Loại / Mô tả' },
  'matlib.type_designation': { en: 'Type Designation', vi: 'Ký hiệu loại' },
  'matlib.part_no': { en: 'Part No', vi: 'Part No' },
  'matlib.part_description': { en: 'Part Description', vi: 'Mô tả part' },
  'matlib.product_family': { en: 'Product Family', vi: 'Nhóm sản phẩm' },
  'matlib.size_spec': { en: 'Size / Spec', vi: 'Kích thước / Thông số' },
  'matlib.thickness': { en: 'Thickness', vi: 'Độ dày' },
  'matlib.color': { en: 'Color', vi: 'Màu' },
  'matlib.surface': { en: 'Surface', vi: 'Bề mặt' },
  'matlib.adhesive': { en: 'Adhesive', vi: 'Keo' },
  'matlib.supplier': { en: 'Supplier', vi: 'Nhà cung cấp' },
  'matlib.supplier_id': { en: 'Supplier ID', vi: 'Mã nhà cung cấp' },
  'matlib.supplier_name': { en: 'Supplier Name', vi: 'Tên nhà cung cấp' },
  'matlib.supplier_moq': { en: 'Supplier MOQ', vi: 'MOQ nhà cung cấp' },
  'matlib.country': { en: 'Country', vi: 'Quốc gia' },
  'matlib.currency': { en: 'Currency', vi: 'Tiền tệ' },
  'matlib.sort_by_date': {
    en: 'Sort by update date — newest first, click again for oldest first',
    vi: 'Sắp xếp theo ngày cập nhật — mới nhất trước, bấm lần nữa để cũ nhất trước',
  },
  'matlib.price': { en: 'Price', vi: 'Giá' },
  'matlib.price_uom': { en: 'Price UoM', vi: 'ĐVT giá' },
  'matlib.price_incl_tax': { en: 'Price incl. Tax', vi: 'Giá đã gồm thuế' },
  'matlib.exw_price': { en: 'EXW Price', vi: 'Giá EXW' },
  'matlib.dap_price': { en: 'DAP Price', vi: 'Giá DAP' },
  'matlib.usd_per_m2': { en: 'USD / m²', vi: 'USD / m²' },
  // The NPI price column no longer asserts USD in its header — the row says
  // which currency it is in. The unit (per square metre) still belongs there.
  'matlib.per_m2': { en: 'm²', vi: 'm²' },
  'matlib.currency_usd_only': {
    en: 'Enter the USD rate in RFQ & MOQ Info before picking a VND-priced material',
    vi: 'Nhập USD rate ở tab RFQ & MOQ Info trước khi chọn vật tư báo giá bằng VND',
  },
  'matlib.price_unusable': {
    en: 'This material has no usable price',
    vi: 'Vật tư này chưa có giá dùng được',
  },
  'matlib.moq': { en: 'MOQ', vi: 'MOQ' },
  'matlib.lead_time': { en: 'Lead Time', vi: 'Thời gian giao' },
  'matlib.mfg_leadtime': { en: 'Mfg Leadtime', vi: 'Thời gian sản xuất' },
  'matlib.tax_code': { en: 'Tax Code', vi: 'Mã thuế' },
  'matlib.tax_code_desc': { en: 'Tax Code Desc.', vi: 'Diễn giải mã thuế' },
  'matlib.status_desc': { en: 'Status Desc.', vi: 'Diễn giải trạng thái' },
  'matlib.status_remark': { en: 'Status / Remark', vi: 'Trạng thái / Nhận xét' },
  'matlib.notes_remarks': { en: 'Notes / Remarks', vi: 'Ghi chú / Nhận xét' },
  'matlib.customer_project': { en: 'Customer / Project', vi: 'Khách hàng / Dự án' },
  'matlib.requester': { en: 'Requester', vi: 'Người yêu cầu' },
  'matlib.req_date': { en: 'Req. Date', vi: 'Ngày yêu cầu' },
  'matlib.request_info': { en: 'Request Info', vi: 'Thông tin yêu cầu' },
  'matlib.update_date': { en: 'Update Date', vi: 'Ngày cập nhật' },
  'matlib.all_years': { en: 'All years', vi: 'Mọi năm' },
  'matlib.add_row': { en: 'Add Row', vi: 'Thêm dòng' },
  'matlib.save_changes': { en: 'Save Changes', vi: 'Lưu thay đổi' },
  'matlib.next': { en: 'Next →', vi: 'Sau →' },
  'matlib.no_materials': { en: 'No materials found', vi: 'Không tìm thấy vật tư' },
  'matlib.no_sourcing': { en: 'No sourcing records', vi: 'Chưa có bản ghi nguồn cung' },
  'matlib.ph_notes': { en: 'Additional notes…', vi: 'Ghi chú thêm…' },
  'matlib.ph_status': { en: 'Status or remarks…', vi: 'Trạng thái hoặc nhận xét…' },
  'matlib.ctx_open': { en: 'Open', vi: 'Mở' },
  'matlib.ctx_copy': { en: 'Copy', vi: 'Nhân bản' },
  'matlib.ctx_delete': { en: 'Delete', vi: 'Xoá' },
  'matlib.search_clear': { en: 'Clear search', vi: 'Xoá ô tìm kiếm' },
  'matlib.ph_search_material': {
    en: 'Search by material name, type, supplier…',
    vi: 'Tìm theo tên vật tư, loại, nhà cung cấp…',
  },
  'matlib.ph_search_sourcing': {
    en: 'Search by material, supplier, customer…',
    vi: 'Tìm theo vật tư, nhà cung cấp, khách hàng…',
  },
  'matlib.ph_search_part': {
    en: 'Search by part no, description, supplier…',
    vi: 'Tìm theo part no, mô tả, nhà cung cấp…',
  },

  // ─── Ink Calculator (wave 3) ────────────────────────────────────────────
  // The three floating utility calculators — ink-calc, print-area,
  // design-tools — are a real grouping, not one invented for this wave:
  // windowLogic.js FLOATING_BY_DEFAULT is what separates them from the
  // data-grid screens that open maximised.
  //
  // WHAT STAYS ENGLISH HERE, and why it is most of the file:
  //   * Formulas. "= BCM x 1.55", "Open Area (Calc) = w² / (w+d)² × 100".
  //     Translating a formula is how a formula becomes wrong.
  //   * Press vocabulary operators use in English at the machine: BCM, QPA,
  //     Anilox, Mesh Count, Cell Depth, Cell Opening, Line Count, Thread Dia,
  //     Open Area, Pitch, Density, Flexo, Silkscreen, CMYK.
  //   * Dense grid heads already at their width limit, per the rule wave 1
  //     set in SubProductRow: Act, Spec, Vol (cm³), Wt (g), Supply (g),
  //     Unit/kg, Syns.
  // The LEGEND table lower in the file already carries its own EN/VI pair per
  // row and is left alone — it is data, not chrome.
  // The notes card used to render an English line and a Vietnamese line
  // stacked, both at once, in every locale — `.ink-note-vi` divs beside their
  // English twins. Collapsed to one key per note, so a reader sees their own
  // language once instead of both languages always.
  'inkc.color_coding': { en: 'COLOR CODING', vi: 'MÃ MÀU Ô' },
  'inkc.main_formulas': { en: 'Main Formulas', vi: 'Công thức chính' },
  'inkc.notes_title_silk': { en: 'SILKSCREEN NOTES', vi: 'GHI CHÚ SILKSCREEN' },
  'inkc.notes_title_flexo': { en: 'FLEXO NOTES', vi: 'GHI CHÚ FLEXO' },
  'inkc.note_mesh_count': {
    en: 'Mesh Count (n/cm) = threads per centimeter',
    vi: 'Mesh Count (n/cm) = số sợi trên 1 cm',
  },
  'inkc.note_volume_recipe': {
    en: 'Volume Recipe V_r = α_calc × D / 100 (D = thread thickness)',
    vi: 'Volume Recipe V_r = α_calc × D / 100 (D = độ dày sợi)',
  },
  'inkc.note_open_area': {
    en: 'Open Area (Calc) = w² / (w+d)² × 100',
    vi: 'Diện tích mở (Calc) = w² / (w+d)² × 100',
  },
  'inkc.note_bcm': {
    en: '(Billion Cubic Microns) — US standard for anilox cell volume',
    vi: '(Tỷ micron khối) — đơn vị Mỹ đo thể tích ô anilox',
  },
  'inkc.note_bcm_conv': { en: '(conversion factor)', vi: '(hệ số quy đổi)' },
  'inkc.note_transfer_eff': {
    en: ': typically 50–70% for Flexo',
    vi: ': thường 50–70% với Flexo',
  },
  'inkc.note_adjust_te': {
    en: 'Adjust Transfer Efficiency per ink/material type in Anilox DB',
    vi: 'Điều chỉnh Transfer Efficiency theo loại mực/vật liệu trong Anilox DB',
  },
  'inkc.subtab_ink_calc': { en: 'Ink Calculator', vi: 'Tính mực' },

  'inkc.title': { en: 'Inks Calculator', vi: 'Máy tính mực' },
  'inkc.loading': { en: 'Loading Inks Calculator...', vi: 'Đang tải Máy tính mực...' },
  'inkc.legend': { en: 'Legend', vi: 'Chú giải' },
  'inkc.search_ph': { en: 'Search...', vi: 'Tìm...' },
  'inkc.save_db': { en: 'Save DB', vi: 'Lưu DB' },
  'inkc.anilox_db': { en: 'Anilox DB', vi: 'DB Anilox' },
  'inkc.mesh_spec': { en: 'Mesh Spec', vi: 'Thông số lưới' },
  'inkc.ink_price': { en: 'Ink Price', vi: 'Giá mực' },
  'inkc.unit_price': { en: 'Unit Price', vi: 'Đơn giá' },
  'inkc.total_unit_price': { en: 'TOTAL UNIT PRICE / UNIT', vi: 'TỔNG ĐƠN GIÁ / ĐƠN VỊ' },
  'inkc.costs': { en: 'Costs', vi: 'Chi phí' },
  'inkc.production_costs': { en: 'Production costs', vi: 'Chi phí sản xuất' },
  'inkc.print_info': { en: 'Print info', vi: 'Thông tin in' },
  'inkc.spec_info': { en: 'info', vi: 'thông tin' },
  'inkc.inks_vol_weight': { en: 'Inks volume & weight', vi: 'Thể tích & khối lượng mực' },
  'inkc.print_area': { en: 'Print Area', vi: 'Diện tích in' },
  'inkc.total_mat_area': { en: 'Total Mat Area', vi: 'Tổng diện tích VT' },
  'inkc.mat_width': { en: 'Mat Width', vi: 'Khổ VT' },
  'inkc.layout': { en: 'Layout', vi: 'Layout' },
  'inkc.process': { en: 'Process', vi: 'Công đoạn' },
  'inkc.setup': { en: 'Setup', vi: 'Setup' },
  'inkc.waste': { en: 'Waste', vi: 'Hao phí' },
  'inkc.lost_pct': { en: 'Lost %', vi: 'Hao %' },
  'inkc.tolerance': { en: 'Tolerance', vi: 'Dung sai' },
  'inkc.efficiency': { en: 'Efficiency', vi: 'Hiệu suất' },
  'inkc.transfer_eff': { en: 'Transfer Efficiency', vi: 'Hiệu suất truyền' },
  'inkc.transfer_eff_short': { en: 'Transfer Eff.', vi: 'HS truyền' },
  'inkc.calc_volume': { en: 'Calc Volume', vi: 'Thể tích tính' },
  'inkc.volume_recipe': { en: 'Volume Recipe', vi: 'Công thức thể tích' },
  'inkc.theo_ink_vol': { en: 'Theo. Ink Vol', vi: 'TT mực lý thuyết' },
  'inkc.actual_ink': { en: 'Actual Ink', vi: 'Mực thực tế' },
  'inkc.ink_vol_max': { en: 'Ink Vol Max', vi: 'TT mực tối đa' },
  'inkc.weight_per_time': { en: 'Weight/', vi: 'KL/' },
  'inkc.total': { en: 'Total', vi: 'Tổng' },
  'inkc.row': { en: 'Row', vi: 'Dòng' },
  'inkc.color': { en: 'Color', vi: 'Màu' },
  'inkc.cavities': { en: 'Cavities', vi: 'Cavities' },
  'inkc.run_standard': { en: 'Run Standard', vi: 'Chạy Standard' },
  'inkc.run_complex': { en: 'Run Complex', vi: 'Chạy Complex' },
  'inkc.run_standard_tip': {
    en: 'Run calculation from Standard calculator state',
    vi: 'Tính từ dữ liệu đang có của Standard',
  },
  'inkc.run_complex_tip': {
    en: 'Run calculation from Complex calculator sub-products',
    vi: 'Tính từ các sub-product của Complex',
  },
  'inkc.cal_qpa_cost': { en: 'Cal. QPA and Cost', vi: 'Tính QPA và chi phí' },
  'inkc.ref_db_tip': {
    en: 'Reference ink database for cost calculator',
    vi: 'Cơ sở dữ liệu mực tham chiếu cho máy tính chi phí',
  },
  'inkc.no_data': { en: 'No data yet — click', vi: 'Chưa có dữ liệu — bấm' },
  'inkc.no_records': { en: 'No records — click', vi: 'Chưa có bản ghi — bấm' },
  'inkc.cells_blue': { en: 'Blue cells', vi: 'Ô xanh dương' },
  'inkc.cells_green': { en: 'Green cells', vi: 'Ô xanh lá' },
  'inkc.cells_purple': { en: 'Purple cells', vi: 'Ô tím' },
  'inkc.cells_yellow': { en: 'Yellow cells', vi: 'Ô vàng' },

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
  // MOQ and Tier stay English per the glossary confirmed with the NPI
  // manager 2026-09-10; only the ordinary words around them translate.
  'sumbar.tier_select_aria': { en: 'Switch MOQ tier', vi: 'Đổi tier MOQ' },
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
  // Says view-only in the tooltip, because otherwise an operator has to
  // guess whether picking a tier here re-points the whole quote.
  'cb.tier_view_aria': {
    en: 'View another MOQ tier (does not change the quote)',
    vi: 'Xem tier MOQ khác (không đổi tier của quote)',
  },
  'cb.bucket': { en: 'Cost bucket', vi: 'Khoản mục' },
  // Each ratio column names what it is divided BY (Henry, 2026-09-29): the three
  // percentages have three different denominators and read alike otherwise.
  'cb.pct_cost': { en: '% of cost', vi: '% chi phí' },
  'cb.pct_cost_tip': {
    en: "Share of total cost: this bucket ÷ the table's total cost (S.TOTAL, plus SGA when the table shows an SGA row).",
    vi: 'Tỷ trọng trong tổng chi phí: khoản mục này ÷ tổng chi phí của bảng (S.TOTAL, cộng SGA nếu bảng có dòng SGA).',
  },
  'cb.value': { en: 'Value $/pc', vi: 'Giá trị $/pc' },
  'cb.value_tip': {
    en: 'Cost of this bucket per piece, in USD.',
    vi: 'Chi phí của khoản mục này trên mỗi sản phẩm, tính bằng USD.',
  },
  'cb.pct_sell': { en: '% of sell', vi: '% giá bán' },
  'cb.pct_sell_tip': {
    en: 'This bucket ÷ the selling price. 100% minus the Grand Total here is GM%.',
    vi: 'Khoản mục này ÷ giá bán. 100% trừ dòng Tổng cộng ở cột này chính là GM%.',
  },
  'cb.pct_target': { en: '% of target', vi: '% giá target' },
  'cb.pct_target_tip': {
    en: "This bucket ÷ the customer's target price. A Grand Total above 100% means cost exceeds the target.",
    vi: 'Khoản mục này ÷ giá target của khách. Tổng cộng trên 100% nghĩa là chi phí đã vượt giá target.',
  },
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

  // ─── i18n wave 7 (2026-09-14) — CalcLegend chrome. The Legend's body
  // copy stays inline next to the formulas it explains (nameVi / noteVi /
  // bodyVi / vi=); only buttons, toasts, badges and labels live here.
  'lgd.loading': { en: 'Loading the manual…', vi: 'Đang tải tài liệu…' },
  'lgd.title': { en: 'Formula Reference', vi: 'Tra cứu công thức' },
  'lgd.verified_sub': { en: 'Verified · calcEngine.js', vi: 'Đã xác thực · calcEngine.js' },
  'lgd.word': { en: '⬇ Word', vi: '⬇ Word' },
  'lgd.word_title': { en: 'Download as Word', vi: 'Tải về dạng Word' },
  'lgd.print': { en: '🖨 Print', vi: '🖨 In' },
  'lgd.print_title': { en: 'Print', vi: 'In' },
  'lgd.find_hint_pre': { en: 'Press', vi: 'Nhấn' },
  'lgd.find_hint_post': {
    en: 'to find any formula or field.',
    vi: 'để tìm bất kỳ công thức hay trường nào.',
  },
  'lgd.example': { en: 'Example:', vi: 'Ví dụ:' },
  'lgd.case': { en: 'Case {n}', vi: 'Trường hợp {n}' },
  'lgd.load_example': { en: '📋 Load this example', vi: '📋 Nạp ví dụ này' },
  'lgd.toast.loaded': {
    en: 'Loaded: {label} — switch to Layout tab to inspect.',
    vi: 'Đã nạp: {label} — chuyển sang tab Layout để xem.',
  },
  'lgd.toast.load_failed': {
    en: 'Failed to load example — see console.',
    vi: 'Nạp ví dụ thất bại — xem console.',
  },
  'lgd.trouble.root': { en: 'Root cause:', vi: 'Nguyên nhân:' },
  'lgd.trouble.fix': { en: 'Fix:', vi: 'Cách sửa:' },
  'lgd.trouble.prev': { en: 'Prevention:', vi: 'Phòng ngừa:' },
  'lgd.sev.critical': { en: 'CRITICAL', vi: 'NGHIÊM TRỌNG' },
  'lgd.sev.medium': { en: 'MEDIUM', vi: 'TRUNG BÌNH' },
  'lgd.sev.minor': { en: 'MINOR', vi: 'NHẸ' },
  'lgd.sev.info': { en: 'INFO', vi: 'THÔNG TIN' },
  'lgd.footer.end': { en: 'End of Formula Reference', vi: 'Hết tài liệu tham chiếu' },
  'lgd.footer.source': { en: 'Source of truth:', vi: 'Nguồn:' },
  'lgd.footer.audit_date': { en: 'Audit date:', vi: 'Ngày soát:' },
  'lgd.footer.corrections': {
    en: '14 corrections vs xlsx v3.3 + re-audit refresh (EAU 0.8 cap, Indigo setup; +3 new sections) — see §00',
    vi: '14 điểm sửa so với xlsx v3.3 + soát lại (trần EAU 0.8, setup Indigo; +3 mục mới) — xem §00',
  },

  // ─── i18n wave 8 (2026-09-14) — Cost Breakdown detail (Standard +
  // Complex share this block) and the Formal Quotation toolbar. The
  // Formal Quotation DOCUMENT itself stays English on purpose — see the
  // note at the top of FormalQuotation.jsx.
  'cb.loading_lib': { en: 'Loading library data...', vi: 'Đang tải dữ liệu thư viện...' },
  'cb.enter_data': { en: 'Enter data to calculate', vi: 'Nhập dữ liệu để tính' },
  'cb.target_unit': { en: 'Target /unit (USD)', vi: 'Giá mục tiêu /sản phẩm (USD)' },
  'cb.detail_title': { en: 'Detailed Breakdown — MOQ {n}', vi: 'Phân tích chi tiết — MOQ {n}' },
  'cb.setup_mat': { en: 'Setup Mat', vi: 'Vật tư setup' },
  'cb.run_mat': { en: 'Run Mat', vi: 'Vật tư chạy máy' },
  'cb.total_mat': { en: 'Total Mat', vi: 'Tổng vật tư' },
  'cb.setup_ink': { en: 'Setup Ink', vi: 'Mực setup' },
  'cb.run_ink': { en: 'Run Ink', vi: 'Mực chạy máy' },
  'cb.total_ink': { en: 'Total Ink', vi: 'Tổng mực' },
  'cb.setup_mach': { en: 'Setup Mach', vi: 'Máy setup' },
  'cb.setup_labor': { en: 'Setup Labor', vi: 'Nhân công setup' },
  'cb.overhead': { en: 'Overhead', vi: 'Overhead' },
  'cb.labor': { en: 'Labor', vi: 'Nhân công' },
  'cb.tooling': { en: 'Tooling', vi: 'Khuôn' },
  'cb.total_proc': { en: 'Total Proc', vi: 'Tổng công đoạn' },
  'cb.other': { en: 'Other', vi: 'Khác' },
  'cb.packing_ship': { en: 'Packing & Ship', vi: 'Đóng gói & Vận chuyển' },
  'cb.vat_loss': { en: 'VAT Loss', vi: 'Hao VAT' },
  'cb.extra': { en: 'Extra', vi: 'Chi phí phụ' },

  // ─── Header entry gate (2026-09-14) — MOQ / EAU / USD rate / Product
  // lifetime must be filled before the RFQ & MOQ tab releases navigation.
  'gate.title': { en: 'Fill the required fields first', vi: 'Điền các trường bắt buộc trước' },
  'gate.subtitle': {
    en: 'RFQ & MOQ Info — {n} field(s) still empty',
    vi: 'Thông tin RFQ & MOQ — còn {n} trường trống',
  },
  'gate.body': {
    en: 'These drive every later tab: the USD rate converts Selling/Target to VND, and EAU × Product lifetime caps tooling amortisation. Leaving them empty produces a quote with silently wrong costs.',
    vi: 'Các trường này chi phối mọi tab sau: USD rate quy đổi Giá bán/Mục tiêu sang VND, còn EAU × Vòng đời sản phẩm là mức trần phân bổ khuôn. Bỏ trống sẽ ra báo giá sai chi phí mà không báo lỗi.',
  },
  'gate.ok': { en: 'Back to the form', vi: 'Quay lại điền' },
  // USD rate inherited from the most recently saved quote — stated once on
  // the way out of the RFQ tab so the operator knows nobody typed it.
  'rate_notice.title': { en: 'USD Rate carried over', vi: 'Tỷ giá USD được mang sang' },
  'rate_notice.from': {
    en: 'Taken from your most recent quote ({from}).',
    vi: 'Lấy từ báo giá gần nhất của bạn ({from}).',
  },
  'rate_notice.from_any': {
    en: 'Taken from your most recent saved quote.',
    vi: 'Lấy từ báo giá đã lưu gần nhất của bạn.',
  },
  'rate_notice.body': {
    en: 'Nobody entered this for this RFQ. Change it here if it is wrong, then confirm.',
    vi: 'Chưa ai nhập số này cho RFQ hiện tại. Sai thì sửa ngay tại đây rồi xác nhận.',
  },
  'rate_notice.confirm': { en: 'Confirm', vi: 'Xác nhận' },
  'rate_notice.back': { en: 'Go back', vi: 'Quay lại' },
  'gate.field.moq': { en: 'MOQ', vi: 'MOQ' },
  'gate.field.annual_qty': { en: 'EAU (Annual Qty)', vi: 'EAU (Sản lượng năm)' },
  'gate.field.usd_rate': { en: 'USD rate', vi: 'Tỉ giá USD' },
  'gate.field.product_lifetime': { en: 'Product lifetime', vi: 'Vòng đời sản phẩm' },
  'gate.required_tip': {
    en: 'Required — fill this before leaving the tab',
    vi: 'Bắt buộc — điền trước khi rời tab',
  },
  'moqcard.eau_required': {
    en: 'EAU is required for tooling cost to be correct',
    vi: 'EAU bắt buộc để tính giá khuôn (Tooling) đúng',
  },
  'moqcard.usd_rate_tip_std': {
    en: 'VND per 1 USD. Bi-directionally syncs Selling/Target USD ↔ VND. Saved per RFQ.',
    vi: 'VND cho 1 USD. Đồng bộ hai chiều Giá bán/Mục tiêu USD ↔ VND. Lưu theo từng RFQ.',
  },

  // ─── i18n wave 10 (2026-09-14) — the Standard Calc data-entry grids
  // (Materials · Inks · Processes on the Materials & Process tab) and the
  // Balancing sub-tab. Column names the operator says in English stay in
  // English on both sides (QPA, LM, UPH, MOQ, IFS, DRW, Eff%, Scrap%).
  'cgrid.rows': { en: '{n} rows', vi: '{n} dòng' },
  'cgrid.setup': { en: 'Setup:', vi: 'Setup:' },
  'cgrid.run': { en: 'Run:', vi: 'Chạy máy:' },
  'cgrid.total': { en: 'Total:', vi: 'Tổng:' },
  'cgrid.mach': { en: 'Mach:', vi: 'Máy:' },
  'cgrid.labor': { en: 'Labor:', vi: 'Nhân công:' },
  'cgrid.tool': { en: 'Tool:', vi: 'Khuôn:' },
  'cgrid.scrap_pct': { en: 'Scrap%', vi: '% phế' },
  'cgrid.tip_scrap': { en: 'Scrap factor from processes', vi: 'Hệ số phế phẩm từ công đoạn' },
  'cgrid.tip_remove_row': { en: 'Remove row', vi: 'Xoá dòng' },

  // Materials grid
  'cgrid.mat.title': { en: 'Materials', vi: 'Vật tư' },
  'cgrid.mat.add': { en: '+ Add Material Row', vi: '+ Thêm dòng vật tư' },
  'cgrid.mat.ifs_code': { en: 'IFS Code', vi: 'Mã IFS' },
  'cgrid.mat.drw': { en: 'DRW materials', vi: 'Vật tư bản vẽ' },
  'cgrid.mat.setup_lm': { en: 'Setup LM', vi: 'Setup LM' },
  'cgrid.mat.pitch': { en: 'Pitch', vi: 'Pitch' },
  'cgrid.mat.tip_pitch': {
    en: 'Override pitch from Layout. Empty = auto from Layout',
    vi: 'Ghi đè pitch từ Layout. Để trống = tự lấy từ Layout',
  },
  'cgrid.mat.tip_width': {
    en: 'Material width. Placeholder from Layout (Web Width TD)',
    vi: 'Khổ vật tư. Gợi ý lấy từ Layout (Web Width TD)',
  },
  'cgrid.mat.cav': { en: 'Cav.', vi: 'Cavity' },
  'cgrid.mat.tip_cav': {
    en: 'Cavities. Placeholder from Layout (Parts Across × Parts MD)',
    vi: 'Số cavity. Gợi ý lấy từ Layout (Parts Across × Parts MD)',
  },
  'cgrid.mat.offcut': { en: 'Offcut', vi: 'Offcut' },
  'cgrid.mat.offcut_pct': { en: 'Offcut %', vi: 'Offcut %' },
  'cgrid.mat.tip_offcut_pct': {
    en: 'Offcut % — matches COST V1.0 Sheet 1 formula MOD(Cavities, Width) / Cavities. Type to override.',
    vi: 'Offcut % — theo công thức COST V1.0 Sheet 1 MOD(Cavities, Width) / Cavities. Gõ để ghi đè.',
  },
  'cgrid.mat.slit': { en: 'Slit', vi: 'Slit' },
  'cgrid.mat.qpa_m2': { en: 'QPA (m²)', vi: 'QPA (m²)' },
  'cgrid.mat.tip_qpa_m2': {
    en: 'QPA m² = pitch × width / 1e6 / cavities / webs × usage',
    vi: 'QPA m² = pitch × khổ / 1e6 / cavity / web × định mức',
  },
  'cgrid.mat.qpa_lm': { en: 'QPA (lm)', vi: 'QPA (lm)' },
  'cgrid.mat.tip_qpa_lm': {
    en: 'QPA lm = pitch / 1000 / cavities / webs × usage',
    vi: 'QPA lm = pitch / 1000 / cavity / web × định mức',
  },
  'cgrid.mat.moq_m2': { en: 'Mats./MOQ (m²)', vi: 'VT/MOQ (m²)' },
  'cgrid.mat.moq_lm': { en: 'Mats./MOQ (lm)', vi: 'VT/MOQ (lm)' },
  'cgrid.mat.tip_moq_m2': {
    en: 'Gross material for MOQ (m²) incl. setup + scrap + offcut',
    vi: 'Vật tư gộp cho MOQ (m²) gồm setup + phế + offcut',
  },
  'cgrid.mat.tip_moq_lm': {
    en: 'Gross material for MOQ (lm) incl. setup + scrap + offcut',
    vi: 'Vật tư gộp cho MOQ (lm) gồm setup + phế + offcut',
  },
  'cgrid.mat.setup_cost': { en: 'Setup Cost', vi: 'Chi phí setup' },
  'cgrid.mat.run_cost': { en: 'Run Cost', vi: 'Chi phí chạy máy' },
  'cgrid.mat.total': { en: 'Total', vi: 'Tổng' },
  'cgrid.mat.process_mat': { en: 'Process Mat', vi: 'Vật tư công đoạn' },

  // Inks grid
  'cgrid.ink.title': { en: 'Inks', vi: 'Mực in' },
  'cgrid.ink.add': { en: '+ Add Ink Row', vi: '+ Thêm dòng mực' },
  'cgrid.ink.desc': { en: 'Desc', vi: 'Mô tả' },
  'cgrid.ink.ph_desc': { en: 'Description', vi: 'Mô tả' },
  'cgrid.ink.ph_ifs': { en: 'IFS code', vi: 'Mã IFS' },
  'cgrid.ink.pitch_mm': { en: 'Pitch (mm)', vi: 'Pitch (mm)' },
  'cgrid.ink.tip_pitch': {
    en: 'Pitch (mm). Empty = inherit from Layout. Type to override per ink.',
    vi: 'Pitch (mm). Để trống = kế thừa từ Layout. Gõ để ghi đè riêng từng mực.',
  },
  'cgrid.ink.tip_width': {
    en: 'Width (mm). Empty = inherit Web Width TD from Layout. Type to override per ink.',
    vi: 'Khổ (mm). Để trống = kế thừa Web Width TD từ Layout. Gõ để ghi đè riêng từng mực.',
  },
  'cgrid.ink.tip_width_head': {
    en: "Web width (mm) — defaults to Layout's Web Width TD when blank",
    vi: 'Bề rộng web (mm) — để trống thì lấy Web Width TD của Layout',
  },
  'cgrid.ink.setup_kg': { en: 'Setup kg', vi: 'Setup kg' },
  'cgrid.ink.area_pct': { en: 'Area %', vi: '% diện tích' },
  'cgrid.ink.cov_ovr': { en: 'Cov Ovr', vi: 'Ghi đè phủ' },
  'cgrid.ink.tip_cov_ovr': {
    en: 'Coverage override (non-Indigo)',
    vi: 'Ghi đè độ phủ (không phải Indigo)',
  },
  'cgrid.ink.clicks': { en: 'Clicks', vi: 'Clicks' },
  'cgrid.ink.tip_reset_cov': {
    en: 'Reset to default coverage',
    vi: 'Đặt lại độ phủ mặc định',
  },
  'cgrid.ink.row': { en: 'Ink', vi: 'Mực' },

  // Processes grid
  'cgrid.proc.title': { en: 'Processes', vi: 'Công đoạn' },
  'cgrid.proc.add': { en: '+ Add Process Row', vi: '+ Thêm dòng công đoạn' },
  'cgrid.proc.row': { en: 'Process', vi: 'Công đoạn' },
  'cgrid.proc.move_up': { en: 'Move up', vi: 'Chuyển lên' },
  'cgrid.proc.move_down': { en: 'Move down', vi: 'Chuyển xuống' },
  'cgrid.proc.process_type': { en: 'Process Type', vi: 'Loại công đoạn' },
  'cgrid.proc.workcenter': { en: 'Workcenter', vi: 'Trạm/Máy' },
  'cgrid.proc.rpt': { en: 'Rpt', vi: 'Lặp' },
  'cgrid.proc.uom': { en: 'UoM', vi: 'Đơn vị' },
  'cgrid.proc.tip_uom': {
    en: 'Speed unit of measure from Rate Table',
    vi: 'Đơn vị tốc độ lấy từ bảng đơn giá',
  },
  'cgrid.proc.layout': { en: 'Layout', vi: 'Layout' },
  'cgrid.proc.tip_layout': {
    en: 'Layout/batch count — required for machine workcenters (see Rate Table Machine USD/H)',
    vi: 'Số layout/mẻ — bắt buộc với trạm máy (xem Machine USD/H ở bảng đơn giá)',
  },
  // Layout follows the Layout tab (2026-10-06) — ProcessLayoutCell.
  'cgrid.proc.layout_sync_print': {
    en: 'Follows Print Total / Shot on the Layout tab ({n}). Type another number to override it.',
    vi: 'Theo Print Total / Shot ở tab Layout ({n}). Gõ số khác để ghi đè.',
  },
  'cgrid.proc.layout_sync_cutter': {
    en: 'Follows the cavities of Cutter {i} · {type} on the Layout tab ({n}). Type another number to override it.',
    vi: 'Theo số cavity của Cutter {i} · {type} ở tab Layout ({n}). Gõ số khác để ghi đè.',
  },
  'cgrid.proc.layout_ovr': {
    en: 'Typed over — the Layout tab gives {n}.',
    vi: 'Đã gõ đè — tab Layout cho {n}.',
  },
  'cgrid.proc.layout_reset': {
    en: 'Follow the Layout tab again ({n})',
    vi: 'Theo lại tab Layout ({n})',
  },
  'cgrid.proc.eff_pct': { en: 'Eff%', vi: 'Hiệu suất %' },
  'cgrid.proc.setup_h': { en: 'Setup H', vi: 'Giờ setup' },
  'cgrid.proc.mc_uph': { en: 'MC UPH', vi: 'UPH máy' },
  'cgrid.proc.tip_mc_uph': { en: 'Machine UPH from rate table', vi: 'UPH máy từ bảng đơn giá' },
  'cgrid.proc.man_uph': { en: 'Man UPH', vi: 'UPH tay' },
  'cgrid.proc.tip_man_uph': {
    en: 'Manual labor UPH (per person)',
    vi: 'UPH thủ công (mỗi người)',
  },
  'cgrid.proc.tip_man_uph_auto': {
    en: 'Auto-synced from Crew × Eff% × Speed — change Crew or Speed to rebalance this manual stage',
    vi: 'Tự đồng bộ từ Số thợ × Hiệu suất % × Tốc độ — đổi Số thợ hoặc Tốc độ để cân lại công đoạn thủ công này',
  },
  'cgrid.proc.tool_type': { en: 'Tool Type', vi: 'Loại khuôn' },
  'cgrid.proc.tool_life': { en: 'Tool Life (shot)', vi: 'Tuổi thọ khuôn (shot)' },
  // The unit is IN the header on purpose. tool_life is a SHOT count, EAU is a
  // PIECE count, and the engine bridges them with `tool_life × layout` — the
  // one thing an operator cannot see from the number alone (Henry, 2026-09-20).
  'cgrid.proc.tip_tool_life': {
    en: 'Tool life counted in SHOTS, not pieces. Pieces per tool = Tool Life × Layout (a Jig ignores Layout).',
    vi: 'Tuổi thọ khuôn tính bằng SHOT, không phải pcs. Số pcs/khuôn = Tuổi thọ × Layout (Jig không nhân Layout).',
  },
  'cgrid.proc.prod_time': { en: 'Prod Time', vi: 'Thời gian SX' },
  'cgrid.proc.tip_prod_time': {
    en: 'Production time in hours',
    vi: 'Thời gian sản xuất (giờ)',
  },
  'cgrid.proc.s_mach': { en: 'S.Mach', vi: 'Máy setup' },
  'cgrid.proc.s_labor': { en: 'S.Labor', vi: 'NC setup' },
  'cgrid.proc.r_mach': { en: 'R.Mach', vi: 'Máy chạy' },
  'cgrid.proc.r_labor': { en: 'R.Labor', vi: 'NC chạy' },
  'cgrid.proc.tooling': { en: 'Tooling', vi: 'Khuôn' },

  // ─── Balancing sub-tab ───
  'bal.title': { en: 'Process Balancing', vi: 'Cân bằng chuyền' },
  'bal.subtitle': {
    en: 'Bottleneck detection · Crew simulation · Line efficiency',
    vi: 'Phát hiện nút thắt · Mô phỏng nhân lực · Hiệu suất chuyền',
  },
  'bal.empty_no_proc': {
    en: 'Add processes with workcenter data first.',
    vi: 'Thêm công đoạn có dữ liệu trạm/máy trước đã.',
  },
  'bal.empty_no_uph': {
    en: 'No processes have UPH data. Set MC UPH or Manual UPH in Processes tab.',
    vi: 'Chưa công đoạn nào có UPH. Đặt UPH máy hoặc UPH tay ở tab Công đoạn.',
  },
  'bal.bottleneck': { en: 'BOTTLENECK', vi: 'NÚT THẮT' },
  'bal.balance_eff': { en: 'BALANCE EFF.', vi: 'HIỆU SUẤT CÂN BẰNG' },
  'bal.total_crew': { en: 'TOTAL CREW', vi: 'TỔNG NHÂN LỰC' },
  'bal.target_uph': { en: 'TARGET UPH', vi: 'UPH MỤC TIÊU' },
  'bal.pcs_hr': { en: 'pcs/hr', vi: 'pcs/giờ' },
  'bal.grp.process_info': { en: 'PROCESS INFO', vi: 'THÔNG TIN CÔNG ĐOẠN' },
  'bal.grp.throughput': { en: 'THROUGHPUT (UPH)', vi: 'NĂNG SUẤT (UPH)' },
  'bal.grp.time_before': {
    en: 'TIME BEFORE ADJ (HRS) ← FROM PROCESS DB',
    vi: 'THỜI GIAN TRƯỚC ĐIỀU CHỈNH (GIỜ) ← TỪ PROCESS DB',
  },
  'bal.grp.crew_sim': { en: 'CREW SIMULATION', vi: 'MÔ PHỎNG NHÂN LỰC' },
  'bal.grp.line_speed': { en: 'LINE SPEED', vi: 'TỐC ĐỘ CHUYỀN' },
  'bal.grp.analysis': { en: 'ANALYSIS', vi: 'PHÂN TÍCH' },
  'bal.col.process': { en: 'PROCESS', vi: 'CÔNG ĐOẠN' },
  'bal.col.type': { en: 'TYPE', vi: 'LOẠI' },
  'bal.col.workcenter': { en: 'WORKCENTER', vi: 'TRẠM/MÁY' },
  'bal.col.mc_uph': { en: 'MC UPH', vi: 'UPH MÁY' },
  'bal.col.machine': { en: 'MACHINE', vi: 'MÁY' },
  'bal.col.manual_uph': { en: 'MANUAL UPH', vi: 'UPH TAY' },
  'bal.col.per_person': { en: 'PER PERSON', vi: 'MỖI NGƯỜI' },
  'bal.col.setup': { en: 'SETUP', vi: 'SETUP' },
  'bal.col.hrs': { en: '(HRS)', vi: '(GIỜ)' },
  'bal.col.running': { en: 'RUNNING', vi: 'CHẠY MÁY' },
  'bal.col.prod_time': { en: 'PROD TIME', vi: 'THỜI GIAN SX' },
  'bal.col.before_hrs': { en: 'BEFORE (HRS)', vi: 'TRƯỚC (GIỜ)' },
  'bal.col.after_hrs': { en: 'AFTER (HRS)', vi: 'SAU (GIỜ)' },
  'bal.col.adj': { en: 'ADJ.', vi: 'ĐIỀU CHỈNH' },
  'bal.col.crew': { en: 'CREW', vi: 'NHÂN LỰC' },
  'bal.col.eff_uph': { en: 'EFF. UPH', vi: 'UPH THỰC' },
  'bal.col.with_crew': { en: 'WITH CREW', vi: 'THEO NHÂN LỰC' },
  'bal.col.cycle_time': { en: 'CYCLE TIME', vi: 'THỜI GIAN CHU KỲ' },
  'bal.col.per_piece': { en: 'PER PIECE', vi: 'MỖI SẢN PHẨM' },
  'bal.col.load': { en: 'LOAD', vi: 'TẢI' },
  'bal.col.vs_target': { en: '| TARGET', vi: '| MỤC TIÊU' },
  'bal.col.status': { en: 'STATUS', vi: 'TRẠNG THÁI' },
  'bal.col.crew_suggestion': { en: 'CREW SUGGESTION', vi: 'ĐỀ XUẤT NHÂN LỰC' },
  'bal.no_uph': { en: 'No UPH', vi: 'Chưa có UPH' },
  'bal.slow': { en: 'SLOW', vi: 'CHẬM' },
  'bal.ok': { en: 'OK', vi: 'ĐẠT' },
  'bal.machine_paced': { en: 'Machine-paced', vi: 'Máy quyết định nhịp' },
  'bal.foot_synced': {
    en: 'Setup / Running / Prod Time Before — synced from Process DB.',
    vi: 'Setup / Chạy máy / Thời gian SX trước — đồng bộ từ Process DB.',
  },
  'bal.foot_after': {
    en: '— recalculated when Adj. Crew changes (manual component scales by 1/crew). Simulation only — does',
    vi: '— tính lại khi Điều chỉnh nhân lực thay đổi (phần thủ công tỉ lệ 1/số người). Chỉ là mô phỏng —',
  },
  'bal.foot_not': { en: 'not', vi: 'không' },
  'bal.foot_affect': { en: 'affect cost.', vi: 'ảnh hưởng tới chi phí.' },
  'bal.foot_formula': {
    en: 'Balance Eff. = Σ(CT) / (n × CT',
    vi: 'Hiệu suất cân bằng = Σ(CT) / (n × CT',
  },
  'bal.foot_target': { en: ') — target ≥ 85%', vi: ') — mục tiêu ≥ 85%' },
});
