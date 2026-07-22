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
  'nav.tab.rfq_tracking': { en: 'RFQ Tracking', vi: 'Danh sách RFQ' },
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
  'nav.tab.help': { en: 'Help', vi: 'Hướng dẫn' },
  'nav.tab.home': { en: 'Home', vi: 'Trang chủ' },
  'nav.team_online_title': { en: 'Team Online', vi: 'Đội ngũ đang online' },
  'nav.team_online_count': { en: '{n} online', vi: '{n} đang online' },
  'nav.badge_pending_tooltip': { en: '{n} awaiting your action', vi: '{n} đang chờ bạn xử lý' },
  // Sprint S-SYSCTRL — SYS-only cue: this item is globally hidden for others.
  'nav.hidden_for_others': {
    en: 'Hidden for other users (System Control)',
    vi: 'Đang ẩn với người dùng khác (Điều khiển Hệ thống)',
  },
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

  // ─── RFQ Tracking (spreadsheet master list; distinct from rfq-tracker) ───
  'rfq_tracking.title': { en: 'RFQ Tracking', vi: 'Danh sách RFQ' },
  'rfq_tracking.row_count': { en: '{shown} of {total} rows', vi: '{shown} / {total} dòng' },
  'rfq_tracking.search_placeholder': {
    en: 'Search RFQ / customer / part…',
    vi: 'Tìm RFQ / khách hàng / part…',
  },
  'rfq_tracking.add_row': { en: 'Add Row', vi: 'Thêm dòng' },
  'rfq_tracking.save': { en: 'Save', vi: 'Lưu' },
  'rfq_tracking.saving': { en: 'Saving…', vi: 'Đang lưu…' },
  'rfq_tracking.import': { en: 'Import xlsx', vi: 'Nhập xlsx' },
  'rfq_tracking.import_done': {
    en: 'Imported {rows} rows → {total} total',
    vi: 'Đã nhập {rows} dòng → {total} tổng',
  },
  'rfq_tracking.prev': { en: 'Prev', vi: 'Trước' },
  'rfq_tracking.next': { en: 'Next', vi: 'Sau' },
  'rfq_tracking.page_x_of_y': { en: 'Page {x} of {y}', vi: 'Trang {x}/{y}' },
  'rfq_tracking.expand_hint': {
    en: 'Double-click to open the full editor',
    vi: 'Nhấp đúp để mở trình chỉnh sửa đầy đủ',
  },
  'rfq_tracking.delete': { en: 'Delete', vi: 'Xóa' },
  'rfq_tracking.delete_confirm': { en: 'Delete this RFQ row?', vi: 'Xóa dòng RFQ này?' },
  'rfq_tracking.close': { en: 'Close', vi: 'Đóng' },
  'rfq_tracking.save_changes': { en: 'Save Changes', vi: 'Lưu thay đổi' },
  'rfq_tracking.other': { en: 'Other…', vi: 'Khác…' },
  'rfq_tracking.other_placeholder': { en: 'Type a value…', vi: 'Nhập giá trị…' },
  'rfq_tracking.choose_from_list': { en: 'Choose from list', vi: 'Chọn từ danh sách' },
  'rfq_tracking.reason_required': {
    en: 'Sale Stage “Rejected/Cancel” requires a Notes/Reason — fill it before saving.',
    vi: 'Sale Stage “Rejected/Cancel” bắt buộc điền Notes/Reason trước khi lưu.',
  },
  'rfq_tracking.reason_required_toast': {
    en: 'Cannot save — {n} Rejected/Cancel row(s) need a Notes/Reason.',
    vi: 'Không thể lưu — {n} dòng Rejected/Cancel cần điền Notes/Reason.',
  },
  'rfq_tracking.showcard_title': { en: 'RFQ {rfq} · {qtn}', vi: 'RFQ {rfq} · {qtn}' },
  'rfq_tracking.empty_title': { en: 'No RFQs yet', vi: 'Chưa có RFQ nào' },
  'rfq_tracking.empty_hint': {
    en: 'Import the RFQ Master xlsx to get started.',
    vi: 'Nhập file RFQ Master (xlsx) để bắt đầu.',
  },
  // Sort + filter (display-only)
  'rfq_tracking.filters': { en: 'Filters', vi: 'Bộ lọc' },
  'rfq_tracking.clear_filters': { en: 'Clear filters', vi: 'Xóa bộ lọc' },
  'rfq_tracking.sort_hint': {
    en: 'Sort: click to cycle ↑ / ↓ / off',
    vi: 'Sắp xếp: nhấp để đổi ↑ / ↓ / tắt',
  },
  'rfq_tracking.no_match': {
    en: 'No rows match the current filters.',
    vi: 'Không có dòng nào khớp bộ lọc.',
  },
  'rfq_tracking.filter.contains': { en: 'contains…', vi: 'chứa…' },
  'rfq_tracking.filter.min': { en: 'min', vi: 'min' },
  'rfq_tracking.filter.max': { en: 'max', vi: 'max' },
  'rfq_tracking.filter.min_pct': { en: 'min %', vi: 'min %' },
  'rfq_tracking.filter.max_pct': { en: 'max %', vi: 'max %' },
  'rfq_tracking.filter.all': { en: 'All', vi: 'Tất cả' },
  'rfq_tracking.filter.n_sel': { en: '{n} selected', vi: 'đã chọn {n}' },
  'rfq_tracking.filter.no_values': { en: '(no values)', vi: '(không có giá trị)' },
  'rfq_tracking.filter.clear_col': { en: 'Clear', vi: 'Xóa' },
  // Showcard field groups
  'rfq_tracking.group.identity': { en: 'Identity', vi: 'Định danh' },
  'rfq_tracking.group.materials': { en: 'Materials & Process', vi: 'Vật tư & Công đoạn' },
  'rfq_tracking.group.dates': { en: 'Dates & Stage', vi: 'Ngày & Giai đoạn' },
  'rfq_tracking.group.pricing': { en: 'Pricing', vi: 'Giá' },
  'rfq_tracking.group.sales': { en: 'Sales', vi: 'Bán hàng' },
  // Column headers (EN = verbatim "RFQ Master" labels; acronyms stay EN in vi)
  'rfq_tracking.col.rfq_no': { en: 'RFQ No', vi: 'Số RFQ' },
  'rfq_tracking.col.qtn': { en: 'Qtn #', vi: 'Lần BG' },
  'rfq_tracking.col.customer': { en: 'Customer', vi: 'Khách hàng' },
  'rfq_tracking.col.end_customer': { en: 'End Customer/Project', vi: 'KH cuối/Dự án' },
  'rfq_tracking.col.part_no': { en: 'Part Number', vi: 'Mã hàng' },
  'rfq_tracking.col.description': { en: 'Description', vi: 'Mô tả' },
  'rfq_tracking.col.main_material': { en: 'Main Material', vi: 'Vật liệu chính' },
  'rfq_tracking.col.design_process': { en: 'Design Process', vi: 'Công đoạn' },
  'rfq_tracking.col.print_type': { en: 'Print (LP/Flexo)', vi: 'In (LP/Flexo)' },
  'rfq_tracking.col.silkscreen': { en: 'SilkScreen', vi: 'In lụa' },
  'rfq_tracking.col.moq': { en: 'MOQ', vi: 'MOQ' },
  'rfq_tracking.col.rfq_date': { en: 'RFQ Date', vi: 'Ngày RFQ' },
  'rfq_tracking.col.target_date': { en: 'Target Date', vi: 'Ngày mục tiêu' },
  'rfq_tracking.col.actual_quote_date': { en: 'Actual Quote Date', vi: 'Ngày báo giá' },
  'rfq_tracking.col.days_in_process': { en: 'Days in Process', vi: 'Số ngày xử lý' },
  'rfq_tracking.col.month': { en: 'Month', vi: 'Tháng' },
  'rfq_tracking.col.npi_stage': { en: 'NPI Stage', vi: 'Giai đoạn NPI' },
  'rfq_tracking.col.npi_pic': { en: 'NPI PIC', vi: 'Phụ trách NPI' },
  'rfq_tracking.col.control_flag': { en: 'Control Flag', vi: 'Cờ kiểm soát' },
  'rfq_tracking.col.ccl_price': { en: 'CCL Price ($)', vi: 'Giá CCL ($)' },
  'rfq_tracking.col.target_price': { en: 'Target Price ($)', vi: 'Giá mục tiêu ($)' },
  'rfq_tracking.col.va': { en: 'VA %', vi: 'VA %' },
  'rfq_tracking.col.contr': { en: 'Contr %', vi: 'Đóng góp %' },
  'rfq_tracking.col.gm': { en: 'GM %', vi: 'GM %' },
  'rfq_tracking.col.eau': { en: 'EAU / Qty', vi: 'EAU / SL' },
  'rfq_tracking.col.est_revenue': { en: 'Est. Revenue ($)', vi: 'Doanh thu ước tính ($)' },
  'rfq_tracking.col.sales_pic': { en: 'Sales PIC', vi: 'Phụ trách bán hàng' },
  'rfq_tracking.col.sale_stage': { en: 'Sale Stage', vi: 'Giai đoạn bán' },
  'rfq_tracking.col.notes': { en: 'Notes / Reason', vi: 'Ghi chú / Lý do' },

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
  'lt.po.auto_caption': {
    en: 'Auto · Σ PROD TIME ÷ 8',
    vi: 'Tự động · Σ PROD TIME ÷ 8',
  },
  'lt.po.manual_caption': { en: 'Manual override', vi: 'Nhập tay (ghi đè)' },
  'lt.po.auto_tip': {
    en: 'Auto-derived from total production time (Σ PROD TIME hours ÷ 8-hour day, rounded up). Type to override.',
    vi: 'Tự suy ra từ tổng thời gian sản xuất (Σ PROD TIME giờ ÷ ngày 8 giờ, làm tròn lên). Gõ để ghi đè.',
  },
  'lt.po.manual_tip': {
    en: 'Manual override active — click ↻ to revert to the auto value.',
    vi: 'Đang ghi đè thủ công — bấm ↻ để quay lại giá trị tự động.',
  },
  'lt.po.auto_placeholder': { en: 'No processes', vi: 'Chưa có công đoạn' },
  'lt.po.reset': { en: 'Reset to auto', vi: 'Đặt lại về tự động' },
  // Read-only Materials MOQ table (synced from Materials section + NPI library)
  'lt.matmoq.title': { en: 'Materials MOQ', vi: 'MOQ Vật tư' },
  'lt.tol.label': { en: 'Product tolerance (± mm)', vi: 'Dung sai sản phẩm (± mm)' },
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
  'lt.matmoq.fuzzy_tip': {
    en: '≈ Matched despite spacing/dash difference — clean the code or the library entry',
    vi: '≈ Khớp dù lệch khoảng trắng/gạch — nên chuẩn hoá mã hoặc dòng thư viện',
  },
  'lt.matmoq.ambiguous_tip': {
    en: 'Ambiguous — the code matches more than one library entry; left unresolved',
    vi: 'Không rõ ràng — mã khớp nhiều dòng thư viện; để trống',
  },
  'lt.matmoq.unresolved_tip': {
    en: 'No library match — check the IFS code or add it to NPI / IFS Materials',
    vi: 'Không khớp thư viện — kiểm tra mã IFS hoặc thêm vào NPI / IFS Materials',
  },
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
