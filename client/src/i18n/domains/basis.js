/**
 * Basis domain i18n (v1.3 K1 + M3).
 *
 * SAP-BC analogue. Owns: in-app chat (Phase 10A-10F), bootstrap
 * task progress, settings panels, appearance / theme picker, the
 * Enterprise Dashboard tab.
 *
 * Currently shipping (~75 keys):
 *   chat.*       — 34 (Phase 10A-10F messaging)
 *   dashboard.*  — 26 (Enterprise Dashboard KPIs + panels + status)
 *   settings.*   — 11 (sidebar items, hardware/mode entry-points)
 *   appearance.* — 12 (theme + language picker)
 *   bootstrap.*  — 7  (post-login data preload progress)
 *   common.*     — 1  (lang_toggle_aria)
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // ─── Settings area (wave 5, 2026-09-14) ─────────────────────────────────
  // User accounts, permission groups, backup schedule, audit log, diagnostics.
  // basis.js is the SAP-BC analogue and already owns settings.* + appearance.*,
  // so the rest of the Settings surface joins it here rather than starting a
  // new domain for one screen.
  //
  // Role codes stay English — SYS, COST, USER, VIEW, ADMIN are what the
  // permission matrix stores and what operators say. So do CCCD (the Vietnamese
  // ID document, already Vietnamese), 2FA, QR, CSV, XLSX, JSON.
  'set.user_accounts': { en: 'User Accounts', vi: 'Tài khoản người dùng' },
  'set.create_user': { en: 'Create New User', vi: 'Tạo người dùng mới' },
  'set.delete_user': { en: 'Delete user', vi: 'Xoá người dùng' },
  'set.edit_profile': { en: 'Edit profile', vi: 'Sửa hồ sơ' },
  'set.login_username': { en: 'Login username', vi: 'Tên đăng nhập' },
  'set.username_req': { en: 'Username ★', vi: 'Tên đăng nhập ★' },
  'set.password_req': { en: 'Password ★', vi: 'Mật khẩu ★' },
  'set.current_password': { en: 'Current Password', vi: 'Mật khẩu hiện tại' },
  'set.new_password': { en: 'New Password', vi: 'Mật khẩu mới' },
  'set.confirm_new_password': { en: 'Confirm New Password', vi: 'Xác nhận mật khẩu mới' },
  'set.min_6_chars': { en: 'Min 6 characters', vi: 'Tối thiểu 6 ký tự' },
  'set.min_6_short': { en: 'Min 6 chars', vi: 'Tối thiểu 6 ký tự' },
  'set.required_star': { en: 'Required fields marked with ★', vi: 'Trường bắt buộc đánh dấu ★' },
  'set.full_name_vn': { en: 'Full Name (VN)', vi: 'Họ tên (VN)' },
  'set.english_name': { en: 'English Name', vi: 'Tên tiếng Anh' },
  'set.cccd': { en: 'CCCD / Employee ID', vi: 'CCCD / Mã nhân viên' },
  'set.id_no': { en: 'ID No.', vi: 'Số CCCD' },
  'set.email': { en: 'Email', vi: 'Email' },
  'set.phone': { en: 'Phone', vi: 'Điện thoại' },
  'set.role': { en: 'Role', vi: 'Vai trò' },
  'set.permissions': { en: 'Permissions', vi: 'Quyền' },
  'set.permission_groups': { en: 'Permission Groups', vi: 'Nhóm quyền' },
  'set.permission_matrix': { en: 'Permission Matrix', vi: 'Ma trận quyền' },
  'set.module_access_by_role': { en: 'Module access by role', vi: 'Quyền module theo vai trò' },
  'set.can_delete_quotes': { en: 'Can Delete Quotes', vi: 'Được xoá báo giá' },
  'set.can_delete_quotes_q': { en: 'Can Delete Quotes?', vi: 'Được xoá báo giá?' },
  'set.for_npi_owner': { en: 'For NPI Owner', vi: 'Cho NPI Owner' },
  'set.sales_approval': { en: 'Sales manager approval', vi: 'Duyệt bởi quản lý Sales' },
  'set.finance_approval': { en: 'Finance director approval', vi: 'Duyệt bởi giám đốc Tài chính' },
  'set.approval_chain': {
    en: 'Approval chain (Cost→Sales→Finance) — who can sign off at each gate',
    vi: 'Chuỗi duyệt (Cost→Sales→Finance) — ai ký ở từng chốt',
  },
  'set.dept_hint': {
    en: 'Department (Sprint S2 — informational + default group assignment)',
    vi: 'Phòng ban (Sprint S2 — thông tin + gán nhóm mặc định)',
  },
  'set.perm_group_hint': {
    en: 'Permission Group — controls tab visibility and read/edit mode',
    vi: 'Nhóm quyền — quyết định tab nào hiện và chế độ đọc/sửa',
  },
  'set.gen_temp_password': {
    en: 'Generate temp password & provisioning card',
    vi: 'Tạo mật khẩu tạm & thẻ khởi tạo',
  },
  'set.setup_2fa': { en: 'Setup 2FA', vi: 'Cài đặt 2FA' },
  'set.sessions': { en: 'Sessions', vi: 'Phiên đăng nhập' },
  'set.session_duration': { en: 'Session token duration', vi: 'Thời hạn token phiên' },
  'set.no_users_online': { en: 'No users online', vi: 'Không có ai đang trực tuyến' },
  'set.revoke': { en: 'Revoke', vi: 'Thu hồi' },
  'set.since': { en: 'Since', vi: 'Từ' },
  'set.loading_users': { en: 'Loading users...', vi: 'Đang tải người dùng...' },

  'set.backup_restore': { en: 'Backup / Restore', vi: 'Sao lưu / Khôi phục' },
  'set.data_backups': { en: 'Data Backups', vi: 'Sao lưu dữ liệu' },
  'set.code_backups': { en: 'Code Backups', vi: 'Sao lưu mã nguồn' },
  'set.create_data_backup': { en: 'Create Data Backup', vi: 'Tạo bản sao dữ liệu' },
  'set.create_code_backup': { en: 'Create Code Backup', vi: 'Tạo bản sao mã nguồn' },
  'set.no_backups_yet': { en: 'No backups yet', vi: 'Chưa có bản sao lưu' },
  'set.loading_backups': { en: 'Loading backups...', vi: 'Đang tải danh sách sao lưu...' },
  'set.reload_backup_list': { en: 'Reload backup list', vi: 'Tải lại danh sách sao lưu' },
  'set.enable_nightly': { en: 'Enable nightly backup', vi: 'Bật sao lưu hằng đêm' },
  'set.scheduled_backup': { en: 'Scheduled backup', vi: 'Sao lưu định kỳ' },
  'set.run_at_hour': { en: 'Run at hour', vi: 'Chạy lúc giờ' },
  'set.retention_days': { en: 'Retention (days)', vi: 'Giữ lại (ngày)' },
  'set.last_run': { en: 'Last run:', vi: 'Chạy lần cuối:' },
  'set.last_error': { en: 'Last error:', vi: 'Lỗi gần nhất:' },
  'set.never_run': { en: 'Never run on this server', vi: 'Chưa từng chạy trên server này' },
  'set.loading_schedule': { en: 'Loading schedule…', vi: 'Đang tải lịch…' },
  'set.upload_backup': {
    en: 'Upload a backup from another machine (USB / off-site copy)',
    vi: 'Tải lên bản sao từ máy khác (USB / bản off-site)',
  },
  'set.backup_folder_hint': {
    en: 'Folder where backups are stored on the server',
    vi: 'Thư mục chứa bản sao lưu trên server',
  },
  'set.backup_path_hint': {
    en: 'Path used by both Import (source) and Backup (destination). Click to edit.',
    vi: 'Đường dẫn dùng cho cả Import (nguồn) và Backup (đích). Bấm để sửa.',
  },
  'set.backup_hour_hint': {
    en: 'Server local time. 02:00 is the default — pick low-activity hours.',
    vi: 'Giờ máy chủ. Mặc định 02:00 — chọn giờ ít người dùng.',
  },
  'set.backup_cycle_hint': {
    en: 'Server runs the backup cycle once per day at the chosen hour.',
    vi: 'Server chạy chu kỳ sao lưu mỗi ngày một lần vào giờ đã chọn.',
  },
  'set.retention_hint': {
    en: 'Snapshots older than this are pruned after each run (min 10 most-recent always kept).',
    vi: 'Bản cũ hơn mức này bị dọn sau mỗi lần chạy (luôn giữ tối thiểu 10 bản mới nhất).',
  },
  'set.trigger_now': {
    en: 'Trigger one backup cycle right now (independent of schedule)',
    vi: 'Chạy ngay một chu kỳ sao lưu (không phụ thuộc lịch)',
  },
  'set.reset_default_path': { en: 'Reset to default path', vi: 'Về đường dẫn mặc định' },
  'set.copy_path': { en: 'Copy path', vi: 'Chép đường dẫn' },
  'set.wipe_dataset': {
    en: 'Wipe dataset (server auto-backs up)',
    vi: 'Xoá sạch bộ dữ liệu (server tự sao lưu trước)',
  },

  'set.audit_log': { en: 'Audit Log', vi: 'Nhật ký kiểm toán' },
  'set.audit_needs_sys': {
    en: 'Audit log requires sys role.',
    vi: 'Nhật ký kiểm toán cần quyền sys.',
  },
  'set.no_audit_entries': { en: 'No matching audit entries.', vi: 'Không có bản ghi khớp.' },
  'set.event_contains': { en: 'Event contains', vi: 'Sự kiện chứa' },
  'set.user_exact': { en: 'User (exact)', vi: 'Người dùng (chính xác)' },
  'set.download_json': { en: 'Download as JSON', vi: 'Tải về dạng JSON' },
  'set.system_logs': { en: 'System Logs', vi: 'Nhật ký hệ thống' },
  'set.data_import': { en: 'Data Import', vi: 'Nhập dữ liệu' },
  'set.import_csv_xlsx': { en: 'Import CSV / XLSX', vi: 'Nhập CSV / XLSX' },
  'set.ifs_data_status': { en: 'IFS Data Status', vi: 'Trạng thái dữ liệu IFS' },
  'set.connection': { en: 'Connection', vi: 'Kết nối' },
  'set.language_pref': { en: 'Language preference', vi: 'Ngôn ngữ hiển thị' },
  'set.theme_pref': { en: 'Theme preference', vi: 'Giao diện hiển thị' },
  'set.loading_sysinfo': { en: 'Loading system info...', vi: 'Đang tải thông tin hệ thống...' },
  'set.client_ver_hint': {
    en: "Operator's client version — green: matches server, amber: stale, grey: no audit in 7 days",
    vi: 'Phiên bản client của operator — xanh: khớp server, cam: cũ, xám: chưa có audit trong 7 ngày',
  },
  'set.platform_tagline': {
    en: 'CCL Design Vietnam — Integrated Cost & Planning Platform',
    vi: 'CCL Design Vietnam — Nền tảng Chi phí & Kế hoạch tích hợp',
  },

  // Table headers are upper-case in the UI; the Vietnamese follows suit so a
  // translated row does not read as a sentence in a header band.
  'set.h_actions': { en: 'ACTIONS', vi: 'THAO TÁC' },
  'set.h_approval': { en: 'APPROVAL', vi: 'DUYỆT' },
  'set.h_change': { en: 'CHANGE', vi: 'ĐỔI' },
  'set.h_client_ver': { en: 'CLIENT VER', vi: 'PHIÊN BẢN CLIENT' },
  'set.h_del': { en: 'DEL?', vi: 'XOÁ?' },
  'set.h_dept': { en: 'DEPT.', vi: 'PHÒNG' },
  'set.h_email': { en: 'EMAIL', vi: 'EMAIL' },
  'set.h_expires': { en: 'EXPIRES', vi: 'HẾT HẠN' },
  'set.h_full_name': { en: 'FULL NAME (VN)', vi: 'HỌ TÊN (VN)' },
  'set.h_id_no': { en: 'ID NO.', vi: 'SỐ CCCD' },
  'set.h_module': { en: 'MODULE / FUNCTION', vi: 'MODULE / CHỨC NĂNG' },
  'set.h_perm_group': { en: 'PERM. GROUP', vi: 'NHÓM QUYỀN' },
  'set.h_phone': { en: 'PHONE', vi: 'ĐIỆN THOẠI' },
  'set.h_pwd_c': { en: 'PWD C', vi: 'ĐỔI MK' },
  'set.h_role': { en: 'ROLE', vi: 'VAI TRÒ' },
  'set.h_token': { en: 'TOKEN', vi: 'TOKEN' },
  'set.h_user': { en: 'USER', vi: 'NGƯỜI DÙNG' },
  'set.h_username_display': { en: 'USERNAME / DISPLAY', vi: 'TÊN ĐĂNG NHẬP / HIỂN THỊ' },

  // Role codes stay; only the description after the dash is translated.
  'set.role_sys': { en: 'SYS — Super Admin', vi: 'SYS — Quản trị tối cao' },
  'set.role_admin': { en: 'ADMIN — Dept Manager', vi: 'ADMIN — Quản lý phòng' },
  'set.role_cost': { en: 'COST — Cost Engineer', vi: 'COST — Kỹ sư chi phí' },
  'set.role_user': { en: 'USER — Standard', vi: 'USER — Thường' },
  'set.role_view': { en: 'VIEW — Read Only', vi: 'VIEW — Chỉ đọc' },

  'set.settings': { en: 'Settings', vi: 'Cài đặt' },
  'set.users': { en: 'Users', vi: 'Người dùng' },
  'set.user': { en: 'User', vi: 'Người dùng' },
  'set.admin': { en: 'Admin', vi: 'Quản trị' },
  'set.own': { en: 'Own', vi: 'Của mình' },
  'set.yes': { en: 'Yes', vi: 'Có' },
  'set.date': { en: 'Date', vi: 'Ngày' },
  'set.event': { en: 'Event', vi: 'Sự kiện' },
  'set.limit': { en: 'Limit', vi: 'Giới hạn' },
  'set.filename': { en: 'Filename', vi: 'Tên tệp' },
  'set.timestamp': { en: 'Timestamp', vi: 'Thời điểm' },
  'set.discard': { en: 'Discard', vi: 'Bỏ' },
  'set.note_label': { en: 'Note:', vi: 'Lưu ý:' },
  'set.ph_event': { en: 'e.g. LOGIN / APPROVE', vi: 'ví dụ LOGIN / APPROVE' },
  'set.ph_email': { en: 'email@company.com', vi: 'email@congty.com' },
  'set.ph_username': { en: 'username', vi: 'tên đăng nhập' },

  // ─── Permission Groups editor (wave 5) ──────────────────────────────────
  'pg.tab_id': { en: 'Tab ID', vi: 'Mã tab' },
  'pg.id_slug': { en: 'ID (slug)', vi: 'ID (slug)' },
  'pg.label': { en: 'Label', vi: 'Nhãn' },
  'pg.default_dept': { en: 'Default Department', vi: 'Phòng ban mặc định' },
  'pg.default_dept_short': { en: 'Default Dept.', vi: 'Phòng mặc định' },
  'pg.tab_access_mode': { en: 'Tab × Access Mode', vi: 'Tab × Chế độ truy cập' },
  'pg.coverage': { en: 'Coverage', vi: 'Độ phủ' },
  'pg.user_coverage': { en: 'User coverage:', vi: 'Độ phủ người dùng:' },
  'pg.bulk': { en: 'Bulk:', vi: 'Hàng loạt:' },
  'pg.all_edit': { en: 'All Edit', vi: 'Tất cả Sửa' },
  'pg.all_read': { en: 'All Read', vi: 'Tất cả Đọc' },
  'pg.all_hidden': { en: 'All Hidden', vi: 'Tất cả Ẩn' },
  'pg.clear_default': { en: 'Clear (default)', vi: 'Xoá (mặc định)' },
  'pg.clear_slash_default': { en: 'Clear / default', vi: 'Xoá / mặc định' },
  'pg.unset_hint': {
    en: 'Unset (falls back to default = edit)',
    vi: 'Chưa đặt (rơi về mặc định = sửa)',
  },
  'pg.system_protected': { en: 'System — protected', vi: 'Hệ thống — được bảo vệ' },
  'pg.duplicate': { en: 'Duplicate', vi: 'Nhân bản' },
  'pg.loading': { en: 'Loading permission groups…', vi: 'Đang tải nhóm quyền…' },

  // ─── About / Diagnostics (wave 5) ───────────────────────────────────────
  'about.version': { en: 'Version', vi: 'Phiên bản' },
  'about.runtime': { en: 'Runtime', vi: 'Môi trường chạy' },
  'about.license': { en: 'License', vi: 'Bản quyền' },
  'about.diagnostics': { en: 'Diagnostics', vi: 'Chẩn đoán' },
  'about.bug_report': { en: 'Bug report', vi: 'Báo lỗi' },
  'about.diagnostics_hint': {
    en: 'Run quick health checks. Useful when reporting bugs to vendor.',
    vi: 'Chạy kiểm tra nhanh. Hữu ích khi báo lỗi cho nhà cung cấp.',
  },

  // ─── Chat (Phase 10A-10F) ───
  'chat.open': { en: 'Open chat', vi: 'Mở chat' },
  'chat.close': { en: 'Close chat', vi: 'Đóng chat' },
  'chat.header_rooms': { en: 'Messages', vi: 'Tin nhắn' },
  'chat.header_mentions': { en: 'Mentions', vi: 'Lượt nhắc' },
  'chat.back_to_rooms': { en: 'Back to rooms', vi: 'Quay lại danh sách' },
  'chat.mentions_button': { en: 'Your @mentions', vi: 'Lượt nhắc đến bạn' },
  'chat.search_placeholder': { en: 'Search messages…', vi: 'Tìm trong tin nhắn…' },
  'chat.search_searching': { en: 'Searching…', vi: 'Đang tìm…' },
  'chat.search_no_match': { en: 'No matches', vi: 'Không có kết quả' },
  'chat.rooms_empty': {
    en: 'No rooms yet. Open a DM from a teammate to start chatting.',
    vi: 'Chưa có phòng nào. Mở DM với đồng nghiệp để bắt đầu trò chuyện.',
  },
  'chat.mentions_empty': {
    en: "No mentions yet. You'll see a badge here when someone @mentions you.",
    vi: 'Chưa có lượt nhắc nào. Bạn sẽ thấy thông báo ở đây khi có người @nhắc đến.',
  },
  'chat.messages_empty': {
    en: 'No messages yet. Say hi 👋',
    vi: 'Chưa có tin nhắn. Chào một câu 👋',
  },
  'chat.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'chat.loading_older': { en: 'Loading older…', vi: 'Đang tải tin nhắn cũ…' },
  'chat.conversation_start': { en: '— beginning of conversation —', vi: '— đầu cuộc trò chuyện —' },
  'chat.compose_placeholder': {
    en: 'Type a message, Enter to send',
    vi: 'Nhập tin nhắn, nhấn Enter để gửi',
  },
  'chat.send': { en: 'Send', vi: 'Gửi' },
  'chat.sending': { en: '…', vi: '…' },
  'chat.edit': { en: 'Edit', vi: 'Sửa' },
  'chat.delete': { en: 'Delete', vi: 'Xóa' },
  'chat.edit_save': { en: 'Save', vi: 'Lưu' },
  'chat.edit_cancel': { en: 'Cancel', vi: 'Hủy' },
  'chat.edited_mark': { en: ' · edited', vi: ' · đã sửa' },
  'chat.deleted_body': { en: '(message deleted)', vi: '(tin nhắn đã xóa)' },
  'chat.delete_confirm': {
    en: 'Delete this message? This cannot be undone.',
    vi: 'Xóa tin nhắn này? Không thể hoàn tác.',
  },
  'chat.recall': { en: 'Unsend', vi: 'Thu hồi' },
  'chat.recall_confirm': {
    en: 'Unsend this message? The recipient will see it was recalled.',
    vi: 'Thu hồi tin nhắn này? Người nhận sẽ thấy tin đã bị thu hồi.',
  },
  'chat.delete_forever': { en: 'Delete permanently', vi: 'Xóa hoàn toàn' },
  'chat.purge_confirm': {
    en: "Permanently delete this message? It will be removed from everyone's view and leaves no trace.",
    vi: 'Xóa vĩnh viễn tin nhắn này? Tin sẽ biến mất khỏi mọi người và không để lại dấu vết.',
  },
  'chat.more_actions': { en: 'More actions', vi: 'Thêm hành động' },
  'chat.emoji_picker': { en: 'Emoji', vi: 'Emoji' },
  'chat.discuss': { en: '💬 Discuss', vi: '💬 Thảo luận' },
  'chat.discuss_title': { en: 'Discuss this quote in chat', vi: 'Thảo luận quote này trong chat' },
  'chat.unavailable': { en: 'Chat unavailable: {msg}', vi: 'Chat không khả dụng: {msg}' },

  // ─── Dashboard (Enterprise Dashboard tab) ───
  'dashboard.title': { en: 'Enterprise Dashboard', vi: 'Bảng điều khiển Doanh nghiệp' },
  'dashboard.generated_at': { en: 'Generated {ts}', vi: 'Tạo lúc {ts}' },
  'dashboard.kpi.total_quotes': { en: 'Total Quotes', vi: 'Tổng số Báo giá' },
  'dashboard.kpi.win_rate': { en: 'Win Rate', vi: 'Tỷ lệ Thắng' },
  'dashboard.kpi.avg_gm': { en: 'Avg Gross Margin', vi: 'GM trung bình' },
  'dashboard.kpi.pending': { en: 'Pending Approvals', vi: 'Chờ phê duyệt' },
  'dashboard.kpi.won_lost': { en: '{won} won / {lost} lost', vi: '{won} thắng / {lost} thua' },
  'dashboard.kpi.draft_count': { en: 'Draft: {n}', vi: 'Nháp: {n}' },
  'dashboard.panel.approval_funnel': { en: 'Approval Funnel', vi: 'Luồng Phê duyệt' },
  'dashboard.panel.gm_distribution': { en: 'Gross Margin Distribution', vi: 'Phân bố GM' },
  'dashboard.panel.volume_12m': {
    en: 'Quote Volume (last 12 months)',
    vi: 'Số lượng Báo giá (12 tháng)',
  },
  'dashboard.panel.margin_trend_12m': {
    en: 'Avg Margin Trend (last 12 months)',
    vi: 'Xu hướng GM (12 tháng)',
  },
  'dashboard.panel.top_customers': {
    en: 'Top Customers (by quote count)',
    vi: 'Top Khách hàng (theo số báo giá)',
  },
  'dashboard.col.customer': { en: 'Customer', vi: 'Khách hàng' },
  'dashboard.col.quotes': { en: 'Quotes', vi: 'Báo giá' },
  'dashboard.col.revenue': { en: 'Revenue (USD)', vi: 'Doanh thu (USD)' },
  'dashboard.col.won_lost': { en: 'Won / Lost', vi: 'Thắng / Thua' },
  'dashboard.status.draft': { en: 'Draft', vi: 'Nháp' },
  'dashboard.status.quote_to_sale': { en: 'Quote to sale', vi: 'Đã gửi Sales' },
  'dashboard.status.price_approved': { en: 'Price Approved', vi: 'Đã duyệt giá' },
  'dashboard.status.cancelled': { en: 'Cancelled', vi: 'Đã huỷ' },
  'dashboard.status.rejected': { en: 'Rejected', vi: 'Đã từ chối' },
  'dashboard.err.title': { en: 'Dashboard unavailable', vi: 'Không thể tải Dashboard' },
  'dashboard.empty.no_customer': { en: 'No customer data', vi: 'Chưa có dữ liệu khách hàng' },
  'dashboard.empty.no_volume': { en: 'No quote activity yet', vi: 'Chưa có báo giá nào' },
  'dashboard.empty.no_margin': { en: 'No margin data yet', vi: 'Chưa có dữ liệu lợi nhuận' },

  // ─── Settings + Appearance ───
  'settings.section.user': { en: 'User', vi: 'Tài khoản' },
  'settings.section.system': { en: 'System', vi: 'Hệ thống' },
  'settings.section.maintenance': { en: 'Maintenance', vi: 'Bảo trì' },
  'settings.item.profile': { en: 'My Profile', vi: 'Hồ sơ của tôi' },
  'settings.item.mypwd': { en: 'My Password', vi: 'Mật khẩu của tôi' },
  'settings.item.appearance': { en: 'Appearance', vi: 'Giao diện' },
  'settings.item.account': { en: 'Account Control', vi: 'Quản lý Tài khoản' },
  'settings.item.backup': { en: 'Backup / Restore', vi: 'Sao lưu / Khôi phục' },
  'settings.item.syslog': { en: 'System Logs', vi: 'Nhật ký Hệ thống' },
  'settings.item.hardware': { en: 'Hardware Devices', vi: 'Thiết bị phần cứng' },
  'settings.item.mode': { en: 'Connection Mode', vi: 'Chế độ kết nối' },
  'settings.item.about': { en: 'About / Diagnostics', vi: 'Giới thiệu / Chẩn đoán' },

  // ─── Sprint S-SYSCTRL — SYS-only System Control (global sidebar lean mode) ───
  'settings.item.system_control': { en: 'System Control', vi: 'Điều khiển Hệ thống' },
  'system_control.title': { en: 'System Control', vi: 'Điều khiển Hệ thống' },
  'system_control.note': {
    en: 'Globally show or hide main sidebar sections and tabs for ALL users (lean mode — hide features operators do not need). This only HIDES — it never grants access. SYS only; changes apply to all users on their next load. SYS always sees hidden items, marked with a dot.',
    vi: 'Ẩn/hiện toàn cục các mục và tab trên thanh bên cho MỌI người dùng (chế độ gọn — ẩn tính năng operator không cần). Chỉ ẩn, KHÔNG bao giờ cấp thêm quyền. Chỉ SYS; thay đổi áp dụng cho mọi người ở lần tải kế tiếp. SYS luôn thấy mục đã ẩn, có chấm đánh dấu.',
  },
  'system_control.forbidden': {
    en: 'System Control is restricted to SYS (Super Admin) accounts.',
    vi: 'Điều khiển Hệ thống chỉ dành cho tài khoản SYS (Super Admin).',
  },
  'system_control.visible': { en: 'Visible', vi: 'Hiện' },
  'system_control.hidden': { en: 'Hidden', vi: 'Ẩn' },
  'system_control.show_all': { en: 'Show all', vi: 'Hiện tất cả' },
  'system_control.save': { en: 'Save', vi: 'Lưu' },
  'system_control.saving': { en: 'Saving…', vi: 'Đang lưu…' },
  'system_control.saved': {
    en: 'Saved — applies on next load',
    vi: 'Đã lưu — áp dụng ở lần tải kế tiếp',
  },
  'system_control.save_failed': { en: 'Save failed', vi: 'Lưu thất bại' },
  'system_control.master_hint': {
    en: 'Hide/show this whole section',
    vi: 'Ẩn/hiện cả mục này',
  },
  'system_control.section_hidden_hint': {
    en: 'The whole section is hidden',
    vi: 'Cả mục đang bị ẩn',
  },

  // Backup → Restore picker (dated backup list modal)
  'settings.backup.restore_btn': { en: 'Restore', vi: 'Khôi phục' },
  'settings.backup.restore_btn_title': {
    en: 'Restore data from a backup (pick by date)',
    vi: 'Khôi phục dữ liệu từ một bản backup (chọn theo ngày)',
  },
  'settings.backup.restore_modal_title': {
    en: 'Restore from backup',
    vi: 'Khôi phục từ bản backup',
  },
  'settings.backup.restore_empty': { en: 'No backups found', vi: 'Chưa có bản backup' },
  'settings.backup.restore_col_date': { en: 'Date', vi: 'Ngày' },
  'settings.backup.restore_col_size': { en: 'Size', vi: 'Dung lượng' },
  'settings.backup.restore_col_file': { en: 'File', vi: 'Tệp' },
  'settings.backup.restore_col_act': { en: 'Action', vi: 'Thao tác' },
  'settings.backup.restore_row_btn': { en: 'Restore', vi: 'Khôi phục' },
  'settings.backup.restore_close': { en: 'Close', vi: 'Đóng' },
  'settings.backup.restore_hint': {
    en: 'To recover deleted data, pick a Manual or Scheduled backup dated BEFORE the deletion. "Pre-restore" snapshots are auto undo-points taken before each restore — not general backups.',
    vi: 'Để khôi phục dữ liệu đã xoá, chọn bản Thủ công hoặc Định kỳ có NGÀY TRƯỚC khi xoá. Bản "Trước restore" là điểm hoàn-tác tự động tạo trước mỗi lần khôi phục — không phải bản backup thường.',
  },
  'settings.backup.kind_manual': { en: 'Manual', vi: 'Thủ công' },
  'settings.backup.kind_auto': { en: 'Scheduled', vi: 'Định kỳ' },
  'settings.backup.kind_pre_restore': { en: 'Pre-restore', vi: 'Trước restore' },
  'settings.backup.kind_pre_restore_hint': {
    en: 'Auto undo-point saved right before a restore — dated at the restore, not a general backup.',
    vi: 'Điểm hoàn-tác tự động lưu ngay trước một lần khôi phục — ngày là lúc restore, không phải bản backup thường.',
  },

  // My Profile form labels (Sprint S-I18N-COVER 2026-06-11) — operator-
  // visible form previously hardcoded English.
  'settings.profile.upload_hint': {
    en: 'Click on photo to upload',
    vi: 'Bấm vào ảnh để tải lên',
  },
  'settings.profile.full_name_vn': { en: 'Full Name (Vietnamese)', vi: 'Họ và tên (Tiếng Việt)' },
  'settings.profile.english_name': { en: 'English Name', vi: 'Tên tiếng Anh' },
  'settings.profile.email': { en: 'Email', vi: 'Email' },
  'settings.profile.phone': { en: 'Phone', vi: 'Điện thoại' },
  'settings.profile.username': { en: 'Username', vi: 'Tên đăng nhập' },
  'settings.profile.id_no': { en: 'ID No.', vi: 'Mã số' },
  'settings.profile.save_btn': { en: 'Save Profile', vi: 'Lưu hồ sơ' },
  'settings.profile.about_title': { en: 'About', vi: 'Giới thiệu' },

  // Sprint S-2FA-RESET — SYS-only per-user 2FA reset (lost-phone recovery).
  'settings.reset2fa.btn_title': { en: 'Reset 2FA', vi: 'Reset 2FA' },
  'settings.reset2fa.modal_title': { en: 'Reset 2FA', vi: 'Reset 2FA' },
  'settings.reset2fa.modal_body': {
    en: 'Reset 2FA for "{user}"? Their current authenticator stops working and they must scan a new QR at the next login. Their password is unchanged.',
    vi: 'Reset 2FA cho "{user}"? Authenticator hiện tại sẽ ngừng hoạt động và họ phải quét QR mới ở lần đăng nhập kế tiếp. Mật khẩu không đổi.',
  },
  'settings.reset2fa.pwd_label': {
    en: 'Your password (confirm it is you)',
    vi: 'Mật khẩu của bạn (xác nhận chính chủ)',
  },
  'settings.reset2fa.confirm_btn': { en: 'Reset 2FA', vi: 'Reset 2FA' },
  'settings.reset2fa.toast_ok': {
    en: '2FA reset for {user}. They scan a new QR at next login.',
    vi: 'Đã reset 2FA cho {user}. Họ sẽ quét QR mới ở lần đăng nhập kế tiếp.',
  },
  'settings.reset2fa.err_pwd': { en: 'Current password incorrect.', vi: 'Mật khẩu không đúng.' },
  'settings.reset2fa.err_forbidden': {
    en: 'Only SYS accounts can reset another user’s 2FA.',
    vi: 'Chỉ tài khoản SYS mới được reset 2FA của người khác.',
  },
  'settings.reset2fa.err_notfound': { en: 'User not found.', vi: 'Không tìm thấy user.' },

  'appearance.title': { en: 'Appearance', vi: 'Giao diện' },
  'appearance.hint': {
    en: 'Choose how Ops Control looks. The choice is saved in this browser only.',
    vi: 'Chọn giao diện của Ops Control. Lựa chọn chỉ lưu trong trình duyệt này.',
  },
  'appearance.system': { en: 'Match system', vi: 'Theo hệ điều hành' },
  'appearance.system_hint': {
    en: 'Follow your OS preference (currently: {active})',
    vi: 'Theo lựa chọn của hệ điều hành (hiện tại: {active})',
  },
  'appearance.light': { en: 'Light', vi: 'Sáng' },
  'appearance.light_hint': { en: 'Always light theme', vi: 'Luôn dùng giao diện sáng' },
  'appearance.dark': { en: 'Dark', vi: 'Tối' },
  'appearance.dark_hint': {
    en: 'Always dark theme (easier on the eyes for long sessions)',
    vi: 'Luôn dùng giao diện tối (dịu mắt cho các phiên làm việc dài)',
  },
  'appearance.language': { en: 'Language', vi: 'Ngôn ngữ' },
  'appearance.language_hint': {
    en: 'Interface language. Industry terms (BOM, RFQ, MOQ) stay in English by convention.',
    vi: 'Ngôn ngữ giao diện. Các thuật ngữ ngành (BOM, RFQ, MOQ) vẫn giữ tiếng Anh theo quy ước.',
  },
  'appearance.lang.en': { en: 'English', vi: 'Tiếng Anh' },
  'appearance.lang.vi': { en: 'Tiếng Việt', vi: 'Tiếng Việt' },

  'common.lang_toggle_aria': { en: 'Switch language', vi: 'Đổi ngôn ngữ' },

  // ─── App bootstrap (post-login data preload) ───
  'bootstrap.title': { en: 'Loading your workspace…', vi: 'Đang tải dữ liệu…' },
  'bootstrap.subtitle': {
    en: 'Fetching the latest rates, materials, and chat data so everything is ready when you start.',
    vi: 'Đang tải tỷ giá, vật tư và dữ liệu chat mới nhất để sẵn sàng khi bạn bắt đầu.',
  },
  'bootstrap.task.library': {
    en: 'Cost library (rates · DDL · materials · finance · inks)',
    vi: 'Thư viện giá (rate · DDL · vật tư · tài chính · mực)',
  },
  'bootstrap.task.approvals': { en: 'Approvals status', vi: 'Trạng thái duyệt' },
  'bootstrap.task.chat_rooms': { en: 'Chat rooms', vi: 'Phòng chat' },
  'bootstrap.task.chat_users': { en: 'User directory', vi: 'Danh bạ người dùng' },
  'bootstrap.task.chat_mentions': { en: 'Mentions inbox', vi: 'Hộp lượt nhắc' },
});
