/**
 * Translation table — Phase 9P i18n.
 *
 * Flat key → { en, vi } structure. Keys use dot-notation for grouping
 * (nav.dashboard, login.title, common.save). If a key is missing for
 * a locale, t() falls back to English, then to the raw key — so
 * half-translated screens degrade gracefully instead of crashing.
 *
 * Translation policy (agreed with CCL Vietnam):
 *   - UI chrome (buttons, labels, nav, toasts) → full Vietnamese
 *   - Industry acronyms (BOM, RFQ, MOQ, SGA, GM, VA) → kept English
 *     because operators speak them in English day-to-day
 *   - Proper nouns (IBM Plex, Ops Control product name) → English
 *   - Customer-facing finance units ($, %) → unchanged
 *
 * Adding new strings:
 *   1. Add an entry here under a dot-namespaced key
 *   2. Call t('your.key') in the component
 *   3. CCL translator reviews the vi value (en authored by devs)
 *
 * Keep this file alphabetized within each section — makes merge
 * conflicts easier to resolve.
 */

export const STRINGS = {
  // ─── Common UI ───
  'common.save': { en: 'Save', vi: 'Lưu' },
  'common.cancel': { en: 'Cancel', vi: 'Hủy' },
  'common.new': { en: 'New', vi: 'Mới' },
  'common.edit': { en: 'Edit', vi: 'Sửa' },
  'common.actions': { en: 'Actions', vi: 'Thao tác' },
  'common.delete': { en: 'Delete', vi: 'Xóa' },
  'common.refresh': { en: 'Refresh', vi: 'Làm mới' },
  'common.retry': { en: 'Retry', vi: 'Thử lại' },
  'common.dismiss': { en: 'Dismiss', vi: 'Đóng' },
  'common.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'common.saving': { en: 'Saving…', vi: 'Đang lưu…' },
  'common.unsaved': { en: 'Unsaved', vi: 'Chưa lưu' },
  'common.saved': { en: 'Saved', vi: 'Đã lưu' },
  'common.active': { en: 'Active', vi: 'Đang dùng' },
  'common.yes': { en: 'Yes', vi: 'Có' },
  'common.no': { en: 'No', vi: 'Không' },
  'common.export_csv': { en: 'Export CSV', vi: 'Xuất CSV' },
  'common.all_time': { en: 'All time', vi: 'Toàn thời gian' },
  'common.last_30_days': { en: 'Last 30 days', vi: '30 ngày qua' },
  'common.last_90_days': { en: 'Last 90 days', vi: '90 ngày qua' },
  'common.last_year': { en: 'Last year', vi: 'Năm qua' },
  'common.range': { en: 'Range', vi: 'Khoảng' },

  // ─── Login + TOTP ───
  // v1.3 J2: 33 login.* keys MOVED to client/src/i18n/domains/security.js.
  // (Auth surface is the SAP-SU/security domain; sidebar/main.jsx
  // side-effect-imports the security module to merge them back.)

  // ─── Sidebar / Nav ───
  'nav.module_cost': { en: 'Ops Cost', vi: 'Ops Cost' },
  'nav.module_planning': { en: 'Planning', vi: 'Kế hoạch' },
  'nav.section.calculators': { en: 'PRICING WORKSHEET', vi: 'BẢNG TÍNH GIÁ' },
  'nav.section.quoting': { en: 'QUOTING & PRICING', vi: 'BÁO GIÁ' },
  'nav.section.manufacturing': { en: 'MANUFACTURING', vi: 'SẢN XUẤT' },
  'nav.section.tracking': { en: 'TRACKING', vi: 'THEO DÕI' },
  'nav.section.reports': { en: 'REPORTS', vi: 'BÁO CÁO' },
  'nav.section.libraries': { en: 'LIBRARIES', vi: 'DỮ LIỆU CHUẨN' },
  'nav.section.system': { en: 'SYSTEM', vi: 'HỆ THỐNG' },
  'nav.tab.standard': { en: 'Pricing (Std)', vi: 'Bảng tính giá (TC)' },
  'nav.tab.complex': { en: 'Pricing (Cpx)', vi: 'Bảng tính giá (PT)' },
  'nav.tab.material_cost': { en: 'Material Cost', vi: 'Giá Vật tư' },
  'nav.tab.inks_calc': { en: 'Inks Calculator', vi: 'Tính Mực in' },
  'nav.tab.print_area': { en: 'Print Area', vi: 'Diện tích In' },
  'nav.tab.messages': { en: 'Messages', vi: 'Tin nhắn' },
  'nav.tab.cost_breakdown': { en: 'Cost Breakdown', vi: 'Cơ cấu Chi phí' },
  'nav.tab.formal_quotation': { en: 'Formal Quotation', vi: 'Báo giá Chính thức' },
  'nav.tab.quote_history': { en: 'Quote History', vi: 'Lịch sử Báo giá' },
  'nav.tab.npi_parts_list': { en: 'NPI Parts List', vi: 'Danh sách NPI Parts' },
  'nav.tab.pending_approvals': { en: 'Pending Approvals', vi: 'Chờ Phê duyệt' },
  'nav.tab.mfg_structures': { en: 'Mfg Structures', vi: 'Cấu trúc SX' },
  'nav.tab.routing_ops': { en: 'Routing Ops', vi: 'Công đoạn SX' },
  'nav.tab.ifs_inventory': { en: 'IFS Inventory', vi: 'Tồn kho IFS' },
  'nav.tab.rfq_tracker': { en: 'RFQ Tracker', vi: 'Theo dõi RFQ' },
  'nav.tab.sample_tracking': { en: 'Sample Tracking', vi: 'Theo dõi Mẫu' },
  'nav.tab.dashboard': { en: 'Dashboard', vi: 'Bảng điều khiển' },
  'nav.tab.quote_analysis': { en: 'Quote Analysis', vi: 'Phân tích Báo giá' },
  'nav.tab.rate_table': { en: 'Rate Table', vi: 'Bảng Định mức' },
  'nav.tab.ddl': { en: 'Drop-Down Lists', vi: 'Danh sách lựa chọn' },
  'nav.tab.finance_data': { en: 'Finance Data', vi: 'Dữ liệu Tài chính' },
  'nav.tab.design_tools': { en: 'Design Tools', vi: 'Công cụ Thiết kế' },
  'nav.tab.machine_technical': { en: 'Machine Technical', vi: 'Thông số máy' },
  'nav.tab.settings': { en: 'Settings', vi: 'Cài đặt' },
  'nav.tab.metrics': { en: 'Admin Metrics', vi: 'Số liệu Quản trị' },
  'nav.tab.audit_log': { en: 'Audit Log', vi: 'Nhật ký Kiểm toán' },
  'nav.tab.kiosk_admin': { en: 'Kiosk Admin', vi: 'Quản trị Kiosk' },
  'nav.tab.reason_codes': { en: 'Reason Codes', vi: 'Mã lý do' },
  'nav.tab.help': { en: 'Help', vi: 'Hướng dẫn' },
  'nav.tab.home': { en: 'Home', vi: 'Trang chủ' },
  // Planning section nav (Sprint S-I18N-COVER 2026-06-11) — retrofit
  // PLANNING_SECTIONS that were previously hardcoded English labels.
  'nav.section.production': { en: 'PRODUCTION', vi: 'SẢN XUẤT' },
  'nav.section.scheduling': { en: 'SCHEDULING', vi: 'LỊCH SẢN XUẤT' },
  'nav.section.planning_tracking': { en: 'TRACKING', vi: 'THEO DÕI' },
  'nav.tab.order_entry': { en: 'Order Entry', vi: 'Nhập đơn hàng' },
  'nav.tab.bom_explosion': { en: 'BOM Explosion', vi: 'Khai triển BOM' },
  'nav.tab.material_check': { en: 'Material Check', vi: 'Kiểm tra Vật tư' },
  'nav.tab.capacity_planning': { en: 'Capacity Planning', vi: 'Lập kế hoạch Công suất' },
  'nav.tab.work_orders': { en: 'Work Orders', vi: 'Lệnh sản xuất' },
  'nav.tab.wip_tracker': { en: 'WIP Tracker', vi: 'Theo dõi BTP' },
  'nav.team_online_title': { en: 'Team Online', vi: 'Đội ngũ đang online' },
  'nav.team_online_count': { en: '{n} online', vi: '{n} đang online' },
  'nav.badge_pending_tooltip': { en: '{n} awaiting your action', vi: '{n} đang chờ bạn xử lý' },
  // Footer status — operator-visible at all times.
  'nav.footer.me_tag': { en: '(me)', vi: '(tôi)' },
  'nav.footer.active_now': { en: 'Active now', vi: 'Đang hoạt động' },

  // ─── NPI Parts List (Sprint S-NPI-PARTS, v1.6 Option C read-only viewer) ───
  'npi_parts.title': { en: 'NPI Parts List', vi: 'Danh sách NPI Parts' },
  'npi_parts.row_count': {
    en: '{shown} of {total} rows',
    vi: '{shown} / {total} dòng',
  },
  'npi_parts.readonly_notice': {
    en: 'Read-only viewer (v1.6). Edit capability ships in v1.7.',
    vi: 'Chế độ xem chỉ đọc (v1.6). Tính năng chỉnh sửa sẽ có ở v1.7.',
  },
  'npi_parts.search_placeholder': {
    en: 'Search part name, Code IFS, System code, customer, PIC…',
    vi: 'Tìm theo Part Name, Code IFS, System code, customer, PIC…',
  },
  'npi_parts.year_filter_label': { en: 'Filter by year', vi: 'Lọc theo năm' },
  'npi_parts.year_all': { en: 'All years', vi: 'Tất cả các năm' },
  'npi_parts.columns_title': { en: 'Visible columns', vi: 'Cột hiển thị' },
  'npi_parts.no_match': { en: 'No matching rows.', vi: 'Không tìm thấy dòng phù hợp.' },
  'npi_parts.prev': { en: 'Prev', vi: 'Trước' },
  'npi_parts.next': { en: 'Next', vi: 'Tiếp' },
  'npi_parts.page_x_of_y': { en: 'Page {x} of {y}', vi: 'Trang {x} / {y}' },
  'npi_parts.snapshot_generated_at': {
    en: 'Snapshot generated {ts}',
    vi: 'Snapshot tạo {ts}',
  },
  'npi_parts.showcard_title': { en: 'Part details', vi: 'Chi tiết Part' },
  'npi_parts.showcard_tooling_fee': { en: 'Tooling Fees', vi: 'Phí Tooling' },
  'npi_parts.load_error_title': {
    en: 'Failed to load NPI parts snapshot',
    vi: 'Không tải được snapshot NPI parts',
  },
  'npi_parts.load_error_hint': {
    en: 'Check network + reload',
    vi: 'Kiểm tra mạng và tải lại',
  },

  // ─── Home Page (Sprint S-HOME 2026-05-03) ───
  'home.morning': { en: 'Good morning', vi: 'Chào buổi sáng' },
  'home.afternoon': { en: 'Good afternoon', vi: 'Chào buổi chiều' },
  'home.evening': { en: 'Good evening', vi: 'Chào buổi tối' },
  'home.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'home.view_all': { en: 'View all', vi: 'Xem tất cả' },
  'home.go_to_home': { en: 'Go to Home', vi: 'Về trang chủ' },
  'home.kpi.active_wos': { en: 'Active Work Orders', vi: 'Lệnh sản xuất đang hoạt động' },
  'home.kpi.due_today': { en: 'Due Today', vi: 'Đến hạn hôm nay' },
  'home.kpi.my_approvals': { en: 'My Approvals', vi: 'Đang chờ tôi duyệt' },
  'home.kpi.active_orders': { en: 'Open Orders', vi: 'Đơn hàng mở' },
  'home.kpi.overdue_suffix': { en: 'overdue', vi: 'quá hạn' },
  'home.section.todays_focus': { en: "Today's Focus", vi: 'Trọng tâm hôm nay' },
  'home.section.modules': { en: 'Modules', vi: 'Phân hệ' },
  'home.section.quick_actions': { en: 'Quick Actions', vi: 'Thao tác nhanh' },
  'home.empty.no_active_wo': {
    en: 'No active work orders. Time for a coffee ☕',
    vi: 'Không có lệnh sản xuất nào đang chạy. Nghỉ một chút ☕',
  },
  'home.qa.new_quote': { en: 'New Quote', vi: 'Báo giá mới' },
  'home.qa.new_order': { en: 'New Order', vi: 'Đơn hàng mới' },
  'home.qa.rfq': { en: 'RFQ Tracker', vi: 'Theo dõi RFQ' },
  'home.qa.approvals': { en: 'Approvals', vi: 'Duyệt' },
  'home.qa.inventory': { en: 'IFS Inventory', vi: 'Tồn kho IFS' },
  'home.qa.help': { en: 'Help', vi: 'Hướng dẫn' },

  // ─── Library picker (Phase 10M right-click on material/ink rows) ───
  'picker.menu_title': { en: 'Search from library', vi: 'Tìm từ thư viện' },
  'picker.lib.npi': { en: 'NPI Material', vi: 'NPI Material' },
  'picker.lib.sourcing': { en: 'Sourcing DB', vi: 'Sourcing DB' },
  'picker.lib.ifs': { en: 'IFS Materials', vi: 'IFS Materials' },
  'picker.close': { en: 'Close', vi: 'Đóng' },
  'picker.back': { en: 'Back to library list', vi: 'Quay lại danh sách thư viện' },
  'picker.search_placeholder': {
    en: 'Search by code, description, supplier…',
    vi: 'Tìm theo mã, mô tả, nhà cung cấp…',
  },
  'picker.result_count_suffix': { en: 'results', vi: 'kết quả' },
  'picker.col.code': { en: 'Code', vi: 'Mã' },
  'picker.col.desc': { en: 'Description', vi: 'Mô tả' },
  'picker.col.supplier': { en: 'Supplier', vi: 'Nhà cung cấp' },
  'picker.col.price': { en: 'Price', vi: 'Giá' },
  'picker.empty': {
    en: 'No matching materials found in this library',
    vi: 'Không tìm thấy vật liệu phù hợp',
  },
  'picker.double_click_hint': { en: 'Double-click to select', vi: 'Nhấn đúp để chọn' },
  'picker.footer_hint': {
    en: 'Right-click a row in your calc to reopen this picker. Double-click a result to auto-fill code, IFS, description, and price.',
    vi: 'Chuột phải vào dòng trong calc để mở lại. Nhấn đúp vào kết quả để tự điền mã, IFS, mô tả và giá.',
  },

  // ─── Reason Codes admin (MES-3-V2 KIOSK-002) ─────────────────────
  'library.reasonCodes.title': { en: 'Reason Codes', vi: 'Mã lý do' },
  'library.reasonCodes.subtitle': {
    en: 'Codes available to operators when pausing an operation on the kiosk.',
    vi: 'Mã hiển thị trên kiosk khi vận hành tạm dừng công đoạn.',
  },
  'library.reasonCodes.searchPlaceholder': {
    en: 'Search by code or label…',
    vi: 'Tìm theo mã hoặc nhãn…',
  },
  'library.reasonCodes.showDisabled': { en: 'Show disabled', vi: 'Hiện đã vô hiệu' },
  'library.reasonCodes.add': { en: 'Add Reason Code', vi: 'Thêm mã lý do' },
  'library.reasonCodes.edit': { en: 'Edit Reason Code', vi: 'Sửa mã lý do' },
  'library.reasonCodes.disable': { en: 'Disable', vi: 'Vô hiệu hoá' },
  'library.reasonCodes.enable': { en: 'Enable', vi: 'Kích hoạt' },
  'library.reasonCodes.code': { en: 'Code', vi: 'Mã' },
  'library.reasonCodes.codeHint': {
    en: 'Uppercase letters/digits/underscore. 2–32 chars.',
    vi: 'Chữ in hoa/số/dấu gạch dưới. 2–32 ký tự.',
  },
  'library.reasonCodes.labelEn': { en: 'Label (English)', vi: 'Nhãn (Tiếng Anh)' },
  'library.reasonCodes.labelVi': { en: 'Label (Vietnamese)', vi: 'Nhãn (Tiếng Việt)' },
  'library.reasonCodes.category': { en: 'Category', vi: 'Phân loại' },
  'library.reasonCodes.sortOrder': { en: 'Sort', vi: 'Thứ tự' },
  'library.reasonCodes.status': { en: 'Status', vi: 'Trạng thái' },
  'library.reasonCodes.statusActive': { en: 'Active', vi: 'Đang dùng' },
  'library.reasonCodes.statusDisabled': { en: 'Disabled', vi: 'Đã vô hiệu' },
  'library.reasonCodes.formSubtitle': {
    en: 'All four label fields are required (EN + VN parity).',
    vi: 'Bắt buộc đủ 4 trường nhãn (song ngữ EN + VN).',
  },
  'library.reasonCodes.disableTitle': {
    en: 'Disable {code}?',
    vi: 'Vô hiệu {code}?',
  },
  'library.reasonCodes.disableSubtitle': {
    en: 'Soft-delete only. Historical pause events keep their label.',
    vi: 'Chỉ xoá mềm. Sự kiện cũ vẫn giữ nguyên nhãn.',
  },
  'library.reasonCodes.confirmDisable': {
    en: 'Disable {code}? It will hide from kiosk pickers but stay in history.',
    vi: 'Vô hiệu {code}? Mã sẽ ẩn khỏi kiosk nhưng vẫn lưu trong lịch sử.',
  },
  'library.reasonCodes.disableEffect.kiosk': {
    en: 'Operators will no longer see this code on kiosk pause pickers.',
    vi: 'Vận hành sẽ không còn thấy mã này trên kiosk khi tạm dừng.',
  },
  'library.reasonCodes.disableEffect.history': {
    en: 'Audit log + historical events keep their reference to this code.',
    vi: 'Nhật ký kiểm toán và sự kiện cũ vẫn giữ tham chiếu đến mã này.',
  },
  'library.reasonCodes.disableEffect.reenable': {
    en: 'You can re-enable it anytime — Show Disabled toggle reveals all rows.',
    vi: 'Có thể kích hoạt lại bất kỳ lúc nào — bật "Hiện đã vô hiệu" để xem.',
  },
  'library.reasonCodes.empty.title': { en: 'No reason codes yet', vi: 'Chưa có mã lý do' },
  'library.reasonCodes.empty.hint': {
    en: 'Add your first code to seed the kiosk picker.',
    vi: 'Thêm mã đầu tiên để hiển thị trên kiosk.',
  },
  'library.reasonCodes.category.downtime': { en: 'Downtime', vi: 'Dừng máy' },
  'library.reasonCodes.category.quality': { en: 'Quality', vi: 'Chất lượng' },
  'library.reasonCodes.category.planned': { en: 'Planned', vi: 'Có kế hoạch' },
  'library.reasonCodes.category.other': { en: 'Other', vi: 'Khác' },
  'library.reasonCodes.err.codePattern': {
    en: 'Code must be uppercase letters/digits/underscore (2–32 chars).',
    vi: 'Mã phải là chữ in hoa/số/gạch dưới (2–32 ký tự).',
  },
  'library.reasonCodes.err.required': { en: 'Required', vi: 'Bắt buộc' },
  'library.reasonCodes.err.range': {
    en: 'Sort must be 0–9999.',
    vi: 'Thứ tự phải từ 0 đến 9999.',
  },
  'library.reasonCodes.err.collision': {
    en: 'Code already exists. Pick a different code.',
    vi: 'Mã đã tồn tại. Hãy chọn mã khác.',
  },
  'library.reasonCodes.err.pattern': {
    en: 'Invalid format.',
    vi: 'Định dạng không hợp lệ.',
  },
  'library.reasonCodes.err.enum': {
    en: 'Invalid value.',
    vi: 'Giá trị không hợp lệ.',
  },

  // ─── Chat (Phase 10A-10F) ───
  // v1.3 K1: 34 chat.* keys MOVED to client/src/i18n/domains/basis.js.

  // ─── Pricing (Std/Cpx) cost-breakdown column headers ───
  // v1.3 G2: 19 `pricing.*` keys MOVED to client/src/i18n/domains/costing.js.
  // Boot order: main.jsx side-effect-imports the costing module which
  // calls registerStrings() to put them back into this dict.

  // ─── Sales domain (qh.*, rfq.*) ───
  // v1.3 H2: 33 keys MOVED to client/src/i18n/domains/sales.js.
  // Boot order: main.jsx side-effect-imports the sales module which
  // calls registerStrings() to put them back into this dict.

  // ─── Hardware Devices + Connection Mode ───
  // v1.3 L3: 90 hw.* + mode.* keys MOVED to client/src/i18n/domains/mes.js.

  // ─── Lead time & Notice — Pricing sub-tab (Std + Cpx) ───
  // Cover-sheet free-text fields + read-only Tooling cost. Tab label
  // duplicated as a hardcoded string in SUB_TABS arrays (matching
  // neighbouring tabs' convention); this key reserved for Help System
  // + future breadcrumb / Search uses.
  'lt.tab_label': { en: 'Lead time & Notice', vi: 'L/T & Ghi chú' },
  'lt.col.tooling_cost': { en: 'Tooling cost (USD)', vi: 'Chi phí Tooling (USD)' },
  'lt.col.material_lt': { en: 'Material L/T', vi: 'L/T Vật liệu' },
  'lt.col.sample_lt': { en: 'Sample L/T', vi: 'L/T Mẫu' },
  'lt.col.po_lt': { en: 'PO L/T', vi: 'L/T PO' },
  'lt.col.remark': { en: 'Remark', vi: 'Ghi chú' },
  'lt.col.process': { en: 'Process', vi: 'Công đoạn' },
  'lt.col.material_type': {
    en: 'Type of Material (In quotation)',
    vi: 'Loại vật liệu (Báo giá)',
  },
  'lt.tooling.synced_tip': {
    en: 'Auto-synced from Processes tab — sum of Tool Cost column',
    vi: 'Tự đồng bộ từ tab Processes — tổng cột Tool Cost',
  },
  // Sprint S-LEADTIME-TABLE-POLISH (2026-06-19) — short visible
  // badge under the Tooling value. Distinct from `synced_tip`
  // which is the longer hover tooltip.
  'lt.tooling.caption': {
    en: 'Read-only · Auto-synced',
    vi: 'Chỉ đọc · Tự đồng bộ',
  },
  'lt.placeholder.multiline': { en: 'Type notes…', vi: 'Nhập ghi chú…' },
  // Sprint S-MAT-LT (2026-06-25) — Material L/T auto-derive + manual override.
  'lt.material.auto_caption': {
    en: 'Auto · max L/T + 7 days',
    vi: 'Tự động · L/T lớn nhất + 7 ngày',
  },
  'lt.material.manual_caption': { en: 'Manual override', vi: 'Nhập tay (ghi đè)' },
  'lt.material.auto_tip': {
    en: 'Auto-derived from IFS/NPI Materials lead time of the Main.Mat rows (max + 7 days). Type to override.',
    vi: 'Tự suy ra từ lead time IFS/NPI của các dòng Main.Mat (lớn nhất + 7 ngày). Gõ để ghi đè.',
  },
  'lt.material.manual_tip': {
    en: 'Manual override active — click ↻ to revert to the auto value.',
    vi: 'Đang ghi đè thủ công — bấm ↻ để quay lại giá trị tự động.',
  },
  'lt.material.auto_placeholder': { en: 'No library match', vi: 'Không khớp thư viện' },
  'lt.material.reset': { en: 'Reset to auto', vi: 'Đặt lại về tự động' },
  // Read-only Materials MOQ table (synced from Materials section + NPI library)
  'lt.matmoq.title': { en: 'Materials MOQ', vi: 'MOQ Vật tư' },
  'lt.matmoq.empty': { en: 'No synced materials', vi: 'Chưa có vật tư' },
  'lt.matmoq.row': { en: 'Row', vi: 'Dòng' },
  'lt.matmoq.ifs_code': { en: 'IFS code', vi: 'Mã IFS' },
  'lt.matmoq.quote_mat': { en: 'Quote Materials', vi: 'Vật tư báo giá' },
  'lt.matmoq.type': { en: 'Type / Description', vi: 'Loại / Mô tả' },
  'lt.matmoq.leadtime': { en: 'Leadtime', vi: 'Thời gian giao' },
  'lt.matmoq.qpa_m2': { en: 'QPA (m²)', vi: 'QPA (m²)' },
  'lt.matmoq.moq_m2': { en: 'Materials MOQ (m²)', vi: 'MOQ Vật tư (m²)' },
  'lt.matmoq.clear_pcs': { en: 'Clear Materials MOQ (pcs)', vi: 'MOQ Vật tư (pcs)' },
  'lt.matmoq.select_all': { en: 'Select all for Remark', vi: 'Chọn tất cả cho Ghi chú' },
  'lt.matmoq.select_row': { en: 'Include in Remark:', vi: 'Đưa vào Ghi chú:' },
  // REMARK checkbox-driven auto-sync
  'lt.remark.auto_placeholder': {
    en: 'Auto from checked materials — or type to override',
    vi: 'Tự động từ vật tư đã chọn — hoặc nhập tay để ghi đè',
  },
  'lt.remark.auto_caption': { en: 'Auto · from checked rows', vi: 'Tự động · từ dòng đã tick' },
  'lt.remark.manual_caption': { en: 'Manual override', vi: 'Nhập tay (ghi đè)' },
  'lt.remark.auto_tip': {
    en: 'Auto-synced from the checked Materials MOQ rows',
    vi: 'Tự đồng bộ từ các dòng Materials MOQ đã tick',
  },
  'lt.remark.manual_tip': {
    en: 'Manual override — checkboxes no longer change this. ↻ to re-enable auto.',
    vi: 'Nhập tay (ghi đè) — checkbox không còn tác động. ↻ để bật lại tự động.',
  },
  'lt.remark.reset': {
    en: 'Reset to auto (from checkboxes)',
    vi: 'Đặt lại về tự động (từ checkbox)',
  },
};

/**
 * Lookup with fallback chain: locale → en → key.
 * Replaces {placeholders} with values from the `vars` object.
 */
/**
 * v1.3 P3.3 — per-domain string registration extension point.
 *
 * Domains that own their UI surface (`costing`, `library`, ...) call
 * `registerStrings()` from their `i18n.js` module at app boot to merge
 * their translation slice into the global STRINGS dict. The big
 * monolithic block above is the "v1.2 baseline" — new keys SHOULD be
 * added in domain modules (see client/src/i18n/domains/*.js), not
 * inline here. The boot order is enforced by main.jsx imports.
 *
 * Re-registering an existing key OVERWRITES it (later wins). Domains
 * MUST scope their keys with a domain prefix (`costing.*`, `sales.*`,
 * etc.) to avoid stepping on each other.
 */
export function registerStrings(slice) {
  if (!slice || typeof slice !== 'object') return;
  for (const [k, v] of Object.entries(slice)) {
    STRINGS[k] = v;
  }
}

export function translate(key, locale, vars) {
  const row = STRINGS[key];
  let raw;
  if (!row) {
    raw = key; // Missing key — return the key itself so devs spot it.
  } else if (row[locale] != null) {
    raw = row[locale];
  } else {
    raw = row.en != null ? row.en : key;
  }
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}

export const SUPPORTED_LOCALES = ['en', 'vi'];
export const DEFAULT_LOCALE = 'en';
