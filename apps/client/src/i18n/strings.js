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
 *   - Proper nouns (IBM Plex, Quoted Module product name) → English
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
  // Generic UI words shared across screens. Added 2026-09-11 for the tracking
  // wave — RFQ Tracker, Sample Tracking and Quote History all render the same
  // handful of nouns, so they live here rather than three times over.
  'common.close': { en: 'Close', vi: 'Đóng' },
  'common.add': { en: 'Add', vi: 'Thêm' },
  'common.size': { en: 'Size', vi: 'Kích thước' },
  'common.notes': { en: 'Notes', vi: 'Ghi chú' },
  'common.status': { en: 'Status', vi: 'Trạng thái' },
  'common.detail': { en: 'Detail', vi: 'Chi tiết' },
  'common.done': { en: 'Done', vi: 'Xong' },
  'common.clear': { en: 'Clear filters', vi: 'Xoá lọc' },
  'common.type': { en: 'Type', vi: 'Loại' },
  'common.actions': { en: 'Actions', vi: 'Thao tác' },
  'common.delete': { en: 'Delete', vi: 'Xóa' },
  'common.refresh': { en: 'Refresh', vi: 'Làm mới' },
  'common.retry': { en: 'Retry', vi: 'Thử lại' },
  'common.dismiss': { en: 'Dismiss', vi: 'Đóng' },
  'common.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'common.saving': { en: 'Saving…', vi: 'Đang lưu…' },
  // ─── Clear Data password step-up (ConfirmClearModal) ───
  'clear_confirm.title': { en: 'Clear data — confirm', vi: 'Xoá dữ liệu — xác nhận' },
  'clear_confirm.body': {
    en: 'This permanently clears all {rows} rows of {dataset}. The current file is backed up first, but this cannot be undone from the app. Enter your account password to confirm.',
    vi: 'Thao tác này xoá vĩnh viễn toàn bộ {rows} dòng của {dataset}. File hiện tại được sao lưu trước, nhưng không thể hoàn tác trong ứng dụng. Nhập mật khẩu tài khoản để xác nhận.',
  },
  'clear_confirm.body_no_count': {
    en: 'This permanently clears all of {dataset}. The current file is backed up first, but this cannot be undone from the app. Enter your account password to confirm.',
    vi: 'Thao tác này xoá vĩnh viễn toàn bộ {dataset}. File hiện tại được sao lưu trước, nhưng không thể hoàn tác trong ứng dụng. Nhập mật khẩu tài khoản để xác nhận.',
  },
  'clear_confirm.pwd_label': { en: 'Account password', vi: 'Mật khẩu tài khoản' },
  'clear_confirm.err_pwd': {
    en: 'Incorrect account password.',
    vi: 'Mật khẩu tài khoản không đúng.',
  },
  'clear_confirm.err_generic': {
    en: 'Clear failed. Please try again.',
    vi: 'Xoá thất bại. Vui lòng thử lại.',
  },
  'clear_confirm.confirm_btn': { en: 'Clear data', vi: 'Xoá dữ liệu' },
  'common.active': { en: 'Active', vi: 'Đang dùng' },
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
  'nav.section.reports': { en: 'REPORTS', vi: 'BÁO CÁO' },
  'nav.section.libraries': { en: 'LIBRARIES', vi: 'DỮ LIỆU CHUẨN' },
  'nav.section.system': { en: 'SYSTEM', vi: 'HỆ THỐNG' },
  'nav.tab.standard': { en: 'Pricing (Std)', vi: 'Bảng tính giá (TC)' },
  'nav.tab.complex': { en: 'Pricing (Cpx)', vi: 'Bảng tính giá (PT)' },
  'nav.tab.material_cost': { en: 'Material Cost', vi: 'Giá Vật tư' },
  'nav.tab.inks_calc': { en: 'Inks Calculator', vi: 'Tính Mực in' },
  'nav.tab.cost_breakdown': { en: 'Cost Breakdown', vi: 'Cơ cấu Chi phí' },
  'nav.tab.quote_history': { en: 'Quote History', vi: 'Lịch sử Báo giá' },
  'nav.tab.npi_parts_list': { en: 'NPI Parts List', vi: 'Danh sách NPI Parts' },
  'nav.tab.pending_approvals': { en: 'Pending Approvals', vi: 'Chờ Phê duyệt' },
  'nav.tab.dashboard': { en: 'Dashboard', vi: 'Bảng điều khiển' },
  'nav.tab.quote_analysis': { en: 'Quote Analysis', vi: 'Phân tích Báo giá' },
  'nav.tab.rate_table': { en: 'Rate Table', vi: 'Bảng Định mức' },
  'nav.tab.ddl': { en: 'Drop-Down Lists', vi: 'Danh sách lựa chọn' },
  'nav.tab.finance_data': { en: 'Cost refer', vi: 'Cost refer' },
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
  'nav.sidebar.show': { en: 'Show the sidebar', vi: 'Hiện thanh bên' },
  'nav.sidebar.pin': { en: 'Pin the sidebar open', vi: 'Ghim thanh bên luôn hiện' },
  'nav.sidebar.unpin': { en: 'Auto-hide the sidebar', vi: 'Tự ẩn thanh bên' },
  'nav.footer.me_tag': { en: '(me)', vi: '(tôi)' },
  'nav.footer.active_now': { en: 'Active now', vi: 'Đang hoạt động' },

  // ─── NPI Parts List (Sprint S-NPI-PARTS, v1.6 Option C read-only viewer) ───
  'npi_parts.title': { en: 'NPI Parts List', vi: 'Danh sách NPI Parts' },
  'npi_parts.row_count': {
    en: '{shown} of {total} rows',
    vi: '{shown} / {total} dòng',
  },
  'npi_parts.data_notice': {
    en: 'Master reference list. Import to replace the set; export CSV/XLSX round-trips losslessly.',
    vi: 'Danh sách tham chiếu gốc. Import để thay thế; export CSV/XLSX round-trip không mất dữ liệu.',
  },
  'npi_parts.import': { en: 'Import…', vi: 'Nhập…' },
  'npi_parts.import_hint': {
    en: 'Import NPI Parts from CSV or XLSX (preview + Export/Template inside the wizard)',
    vi: 'Nhập NPI Parts từ CSV hoặc XLSX (xem trước + Export/Template trong wizard)',
  },
  'npi_parts.clear': { en: 'Clear Data', vi: 'Xoá dữ liệu' },
  'npi_parts.clear_hint': {
    en: 'Clear all NPI Parts data (the current file is backed up first)',
    vi: 'Xoá toàn bộ dữ liệu NPI Parts (file hiện tại được sao lưu trước)',
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
  // Sort + filter (display-only)
  // Showcard field groups
  // Column headers (EN = verbatim "RFQ Master" labels; acronyms stay EN in vi)

  // ─── Home Page (Sprint S-HOME 2026-05-03) ───
  'home.morning': { en: 'Good morning', vi: 'Chào buổi sáng' },
  'home.afternoon': { en: 'Good afternoon', vi: 'Chào buổi chiều' },
  'home.evening': { en: 'Good evening', vi: 'Chào buổi tối' },
  'home.go_to_home': { en: 'Go to Home', vi: 'Về trang chủ' },
  'home.kpi.my_approvals': { en: 'My Approvals', vi: 'Đang chờ tôi duyệt' },
  'home.section.modules': { en: 'Modules', vi: 'Phân hệ' },
  'home.section.quick_actions': { en: 'Quick Actions', vi: 'Thao tác nhanh' },
  'home.qa.new_quote': { en: 'New Quote', vi: 'Báo giá mới' },
  'home.qa.approvals': { en: 'Approvals', vi: 'Duyệt' },
  'home.qa.help': { en: 'Help', vi: 'Hướng dẫn' },

  // ─── Modal maximize/restore (opt-in on shared Modal) ───
  'modal.maximize': { en: 'Maximize', vi: 'Phóng to' },
  'modal.restore': { en: 'Restore', vi: 'Thu nhỏ' },

  // ─── Window manager (in-app MDI, feature-flagged) ───
  // ── TOTP enrollment (mandatory security onboarding — the one screen
  // where an untranslated string becomes a support call) ──
  'totp.enroll.title': { en: 'Set up 2-Step Verification', vi: 'Thiết lập xác thực 2 bước' },
  'totp.enroll.account': { en: 'Account', vi: 'Tài khoản' },
  'totp.enroll.scan': {
    en: 'Scan with your authenticator app',
    vi: 'Quét bằng ứng dụng xác thực',
  },
  'totp.enroll.manual_hint': {
    en: "Paste this into the authenticator's manual-entry field",
    vi: 'Dán vào ô nhập thủ công của ứng dụng xác thực',
  },
  'totp.enroll.copy_uri': {
    en: 'Or copy the otpauth URI (for password managers)',
    vi: 'Hoặc sao chép URI otpauth (cho trình quản lý mật khẩu)',
  },
  'totp.enroll.copy': { en: 'Copy', vi: 'Sao chép' },
  'totp.enroll.qr_alt': {
    en: 'QR code for TOTP enrollment',
    vi: 'Mã QR để ghi danh TOTP',
  },
  'totp.enroll.copied': { en: '✓ Copied', vi: '✓ Đã chép' },
  'totp.enroll.code_label': {
    en: '6-digit code from your authenticator',
    vi: 'Mã 6 chữ số từ ứng dụng xác thực',
  },
  'totp.enroll.back': { en: 'Back to login', vi: 'Quay lại đăng nhập' },
  'totp.enroll.activate': { en: 'Activate 2FA', vi: 'Kích hoạt 2FA' },
  'totp.enroll.activating': { en: 'Activating…', vi: 'Đang kích hoạt…' },
  'totp.enroll.backup_note': {
    en: 'Save this secret in your password manager as a backup — if you lose your authenticator device, IT can re-enroll you but your existing codes will stop working.',
    vi: 'Lưu mã bí mật này vào trình quản lý mật khẩu để dự phòng — nếu mất thiết bị xác thực, bộ phận IT có thể ghi danh lại cho bạn nhưng các mã hiện tại sẽ ngừng hoạt động.',
  },
  'window.windows': { en: 'Windows', vi: 'Cửa sổ' },
  'window.close_all': { en: 'Close all', vi: 'Đóng tất cả' },
  'window.minimize': { en: 'Minimize', vi: 'Thu nhỏ' },
  'window.maximize': { en: 'Maximize', vi: 'Phóng to' },
  'window.restore': { en: 'Restore', vi: 'Khôi phục' },
  'window.close': { en: 'Close', vi: 'Đóng' },
  'window.taskbar': { en: 'Open windows', vi: 'Cửa sổ đang mở' },
  'window.empty': {
    en: 'Click a sidebar tab to open a window',
    vi: 'Nhấn một mục ở thanh bên để mở cửa sổ',
  },

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
  'picker.columns': { en: 'Columns', vi: 'Cột' },
  'picker.columns_title': { en: 'Show or hide columns', vi: 'Ẩn/hiện cột' },
  'picker.columns_all': { en: 'Show all', vi: 'Hiện tất cả' },
  'picker.reset_widths': { en: 'Reset column widths', vi: 'Đặt lại độ rộng cột' },
  'picker.col.date': { en: 'Date', vi: 'Ngày' },
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
