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
  'nav.tab.settings': { en: 'Settings', vi: 'Cài đặt' },
  'nav.tab.metrics':  { en: 'Admin metrics',  vi: 'Admin metrics' },
  'nav.tab.audit_log':{ en: 'Audit log', vi: 'Nhật ký audit' },
  'nav.tab.help':     { en: 'Help',     vi: 'Hướng dẫn' },
  'nav.team_online_title': { en: 'Team Online', vi: 'Team đang online' },
  'nav.team_online_count': { en: '{n} online', vi: '{n} đang online' },
  'nav.badge_pending_tooltip': { en: '{n} awaiting your action', vi: '{n} đang chờ bạn xử lý' },

  // ─── Dashboard ───
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
  'dashboard.panel.volume_12m': { en: 'Quote Volume (last 12 months)', vi: 'Số lượng Báo giá (12 tháng)' },
  'dashboard.panel.margin_trend_12m': { en: 'Avg Margin Trend (last 12 months)', vi: 'Xu hướng GM (12 tháng)' },
  'dashboard.panel.top_customers': { en: 'Top Customers (by quote count)', vi: 'Top Khách hàng (theo số báo giá)' },
  'dashboard.col.customer': { en: 'Customer', vi: 'Khách hàng' },
  'dashboard.col.quotes': { en: 'Quotes', vi: 'Báo giá' },
  'dashboard.col.revenue': { en: 'Revenue (USD)', vi: 'Doanh thu (USD)' },
  'dashboard.col.won_lost': { en: 'Won / Lost', vi: 'Thắng / Thua' },
  'dashboard.status.draft': { en: 'Draft', vi: 'Nháp' },
  'dashboard.status.pending_sales': { en: 'Pending Sales', vi: 'Chờ Sales' },
  'dashboard.status.pending_finance': { en: 'Pending Finance', vi: 'Chờ Tài chính' },
  'dashboard.status.approved': { en: 'Approved', vi: 'Đã duyệt' },
  'dashboard.status.rejected': { en: 'Rejected', vi: 'Đã từ chối' },
  'dashboard.err.title': { en: 'Dashboard unavailable', vi: 'Không thể tải Dashboard' },
  'dashboard.empty.no_customer': { en: 'No customer data', vi: 'Chưa có dữ liệu khách hàng' },
  'dashboard.empty.no_volume': { en: 'No quote activity yet', vi: 'Chưa có báo giá nào' },
  'dashboard.empty.no_margin': { en: 'No margin data yet', vi: 'Chưa có dữ liệu lợi nhuận' },

  // ─── Settings → Appearance ───
  'settings.section.user': { en: 'User', vi: 'Tài khoản' },
  'settings.section.system': { en: 'System', vi: 'Hệ thống' },
  'settings.section.maintenance': { en: 'Maintenance', vi: 'Bảo trì' },
  'settings.item.profile': { en: 'My Profile', vi: 'Hồ sơ của tôi' },
  'settings.item.mypwd': { en: 'My Password', vi: 'Mật khẩu của tôi' },
  'settings.item.appearance': { en: 'Appearance', vi: 'Giao diện' },
  'settings.item.account': { en: 'Account Control', vi: 'Quản lý Tài khoản' },
  'settings.item.backup': { en: 'Backup / Restore', vi: 'Sao lưu / Khôi phục' },
  'settings.item.syslog': { en: 'System Logs', vi: 'Nhật ký Hệ thống' },
  'appearance.title': { en: 'Appearance', vi: 'Giao diện' },
  'appearance.hint': {
    en: 'Choose how Ops Control looks. The choice is saved in this browser only.',
    vi: 'Chọn giao diện của Ops Control. Lựa chọn chỉ lưu trong trình duyệt này.',
  },
  'appearance.system': { en: 'Match system', vi: 'Theo hệ điều hành' },
  'appearance.system_hint': { en: 'Follow your OS preference (currently: {active})', vi: 'Theo lựa chọn của hệ điều hành (hiện tại: {active})' },
  'appearance.light': { en: 'Light', vi: 'Sáng' },
  'appearance.light_hint': { en: 'Always light theme', vi: 'Luôn dùng giao diện sáng' },
  'appearance.dark': { en: 'Dark', vi: 'Tối' },
  'appearance.dark_hint': { en: 'Always dark theme (easier on the eyes for long sessions)', vi: 'Luôn dùng giao diện tối (dịu mắt cho các phiên làm việc dài)' },
  'appearance.language': { en: 'Language', vi: 'Ngôn ngữ' },
  'appearance.language_hint': {
    en: 'Interface language. Industry terms (BOM, RFQ, MOQ) stay in English by convention.',
    vi: 'Ngôn ngữ giao diện. Các thuật ngữ ngành (BOM, RFQ, MOQ) vẫn giữ tiếng Anh theo quy ước.',
  },
  'appearance.lang.en': { en: 'English', vi: 'Tiếng Anh' },
  'appearance.lang.vi': { en: 'Tiếng Việt', vi: 'Tiếng Việt' },

  // ─── Library picker (Phase 10M right-click on material/ink rows) ───
  'picker.menu_title':     { en: 'Search from library', vi: 'Tìm từ thư viện' },
  'picker.lib.npi':        { en: 'NPI Material',        vi: 'NPI Material' },
  'picker.lib.sourcing':   { en: 'Sourcing DB',         vi: 'Sourcing DB' },
  'picker.lib.raw':        { en: 'Raw Materials (IFS)', vi: 'Raw Materials (IFS)' },
  'picker.close':          { en: 'Close',               vi: 'Đóng' },
  'picker.back':           { en: 'Back to library list', vi: 'Quay lại danh sách thư viện' },
  'picker.search_placeholder': { en: 'Search by code, description, supplier…', vi: 'Tìm theo mã, mô tả, nhà cung cấp…' },
  'picker.result_count_suffix': { en: 'results',        vi: 'kết quả' },
  'picker.col.code':       { en: 'Code',                vi: 'Mã' },
  'picker.col.desc':       { en: 'Description',         vi: 'Mô tả' },
  'picker.col.supplier':   { en: 'Supplier',            vi: 'Nhà cung cấp' },
  'picker.col.price':      { en: 'Price',               vi: 'Giá' },
  'picker.empty':          { en: 'No matching materials found in this library', vi: 'Không tìm thấy vật liệu phù hợp' },
  'picker.double_click_hint': { en: 'Double-click to select', vi: 'Nhấn đúp để chọn' },
  'picker.footer_hint':    { en: 'Right-click a row in your calc to reopen this picker. Double-click a result to auto-fill code, IFS, description, and price.', vi: 'Chuột phải vào dòng trong calc để mở lại. Nhấn đúp vào kết quả để tự điền mã, IFS, mô tả và giá.' },

  // ─── App bootstrap (post-login data preload) ───
  'bootstrap.title':    { en: 'Loading your workspace…', vi: 'Đang tải dữ liệu…' },
  'bootstrap.subtitle': {
    en: 'Fetching the latest rates, materials, and chat data so everything is ready when you start.',
    vi: 'Đang tải tỷ giá, vật tư và dữ liệu chat mới nhất để sẵn sàng khi bạn bắt đầu.',
  },
  'bootstrap.task.library':       { en: 'Cost library (rates · DDL · materials · finance · inks)', vi: 'Thư viện giá (rate · DDL · vật tư · tài chính · mực)' },
  'bootstrap.task.approvals':     { en: 'Approvals status', vi: 'Trạng thái duyệt' },
  'bootstrap.task.chat_rooms':    { en: 'Chat rooms',        vi: 'Phòng chat' },
  'bootstrap.task.chat_users':    { en: 'User directory',    vi: 'Danh bạ người dùng' },
  'bootstrap.task.chat_mentions': { en: 'Mentions inbox',    vi: 'Hộp lượt nhắc' },

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
    en: 'No mentions yet. You\'ll see a badge here when someone @mentions you.',
    vi: 'Chưa có lượt nhắc nào. Bạn sẽ thấy thông báo ở đây khi có người @nhắc đến.',
  },
  'chat.messages_empty': { en: 'No messages yet. Say hi 👋', vi: 'Chưa có tin nhắn. Chào một câu 👋' },
  'chat.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'chat.loading_older': { en: 'Loading older…', vi: 'Đang tải tin nhắn cũ…' },
  'chat.conversation_start': { en: '— beginning of conversation —', vi: '— đầu cuộc trò chuyện —' },
  'chat.compose_placeholder': { en: 'Type a message, Enter to send', vi: 'Nhập tin nhắn, nhấn Enter để gửi' },
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
    en: 'Permanently delete this message? It will be removed from everyone\'s view and leaves no trace.',
    vi: 'Xóa vĩnh viễn tin nhắn này? Tin sẽ biến mất khỏi mọi người và không để lại dấu vết.',
  },
  'chat.more_actions': { en: 'More actions', vi: 'Thêm hành động' },
  'chat.emoji_picker': { en: 'Emoji', vi: 'Emoji' },
  'chat.discuss': { en: '💬 Discuss', vi: '💬 Thảo luận' },
  'chat.discuss_title': { en: 'Discuss this quote in chat', vi: 'Thảo luận quote này trong chat' },
  'chat.unavailable': { en: 'Chat unavailable: {msg}', vi: 'Chat không khả dụng: {msg}' },

  // ─── Pricing (Std/Cpx) cost-breakdown column headers ───
  // v1.3 G2: 19 `pricing.*` keys MOVED to client/src/i18n/domains/costing.js.
  // Boot order: main.jsx side-effect-imports the costing module which
  // calls registerStrings() to put them back into this dict.

  // ─── Sales domain (qh.*, rfq.*) ───
  // v1.3 H2: 33 keys MOVED to client/src/i18n/domains/sales.js.
  // Boot order: main.jsx side-effect-imports the sales module which
  // calls registerStrings() to put them back into this dict.

  // ─── Material Library + Print Area + Inks search placeholders ───
  'material_lib.search_placeholder': {
    en: 'Search by material name, type, supplier…',
    vi: 'Tìm theo tên vật liệu, loại, nhà cung cấp…',
  },
  'printarea.search_placeholder': {
    en: 'Search by SKU or product name…',
    vi: 'Tìm theo SKU hoặc tên sản phẩm…',
  },
  'printarea.optional': { en: 'Optional', vi: 'Tuỳ chọn' },
  'inks.mesh_code':     { en: 'Mesh Code',   vi: 'Mã lưới' },
  'inks.anilox_code':   { en: 'Anilox Code', vi: 'Mã Anilox' },

  // ─── Planning module tab titles ───
  'planning.work_orders':        { en: 'Work Orders',       vi: 'Lệnh sản xuất' },
  'planning.order_entry':        { en: 'Order Entry',       vi: 'Nhập đơn hàng' },
  'planning.material_check':     { en: 'Material Check',    vi: 'Kiểm tra vật tư' },
  'planning.bom_explosion':      { en: 'BOM Explosion',     vi: 'Phân rã BOM' },
  'planning.capacity_planning':  { en: 'Capacity Planning', vi: 'Hoạch định công suất' },
  'planning.wip_tracker':        { en: 'WIP Tracker',       vi: 'Theo dõi WIP' },

  // ─── Settings menu labels (v1.1 + v1.2 desktop tabs) ───
  'settings.item.hardware': { en: 'Hardware Devices', vi: 'Thiết bị phần cứng' },
  'settings.item.mode':     { en: 'Connection Mode',  vi: 'Chế độ kết nối' },

  // ─── Common (small additions for hardware / mode) ───
  'common.lang_toggle_aria': { en: 'Switch language', vi: 'Đổi ngôn ngữ' },

  // ─── Settings → Hardware Devices (v1.1) ───
  'hw.title':        { en: 'Hardware Devices', vi: 'Thiết bị phần cứng' },
  'hw.subtitle':     {
    en: 'Per-machine configuration. Saved locally — not synced to the server.',
    vi: 'Cấu hình per-máy. Lưu cục bộ, không đồng bộ về server.',
  },
  'hw.saved_at':     { en: ' · Saved {time}', vi: ' · Đã lưu {time}' },
  'hw.banner.p1':    {
    en: 'This tab is only available in the <b>Ops Control Desktop App</b>. In a regular browser, raw USB / Serial / TCP devices cannot be accessed due to browser sandbox limits.',
    vi: 'Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>. Trong trình duyệt thường, các thiết bị USB/Serial/TCP raw không truy cập được do giới hạn của browser sandbox.',
  },
  'hw.banner.p2':    {
    en: 'Please install the desktop build to use Zebra/TSC label printers, electronic scales, and barcode scanners (raw HID mode).',
    vi: 'Vui lòng tải bản desktop để dùng máy in nhãn Zebra/TSC, cân điện tử, máy quét barcode (mode HID raw).',
  },

  // Label printer card
  'hw.lp.title':       { en: '🖨 Label Printer (Zebra / TSC) — TCP:9100', vi: '🖨 Máy in nhãn (Zebra / TSC) — TCP:9100' },
  'hw.lp.host':        { en: 'Printer IP', vi: 'IP máy in' },
  'hw.lp.port':        { en: 'Port', vi: 'Port' },
  'hw.lp.pinging':     { en: 'Pinging…', vi: 'Đang ping…' },
  'hw.lp.ping':        { en: 'Ping connection', vi: 'Ping kết nối' },
  'hw.lp.send_test':   { en: 'Send test label', vi: 'Gửi nhãn test' },
  'hw.lp.test_sent':   { en: 'Test label sent — check the printer.', vi: 'Đã gửi nhãn test — kiểm tra máy in.' },
  'hw.lp.test_err':    { en: 'Send-label error: {msg}', vi: 'Lỗi gửi nhãn: {msg}' },
  'hw.lp.ok_latency':  { en: '✓ Connection OK — latency {ms} ms', vi: '✓ Kết nối OK — latency {ms} ms' },
  'hw.lp.err':         { en: '✗ Error: {err}', vi: '✗ Lỗi: {err}' },

  // Scale card
  'hw.sc.title':       { en: '⚖️ Electronic Scale — RS232 / USB-Serial', vi: '⚖️ Cân điện tử — RS232 / USB-Serial' },
  'hw.sc.com_port':    { en: 'COM Port / Device', vi: 'COM Port / Device' },
  'hw.sc.choose_port': { en: '— Choose port —', vi: '— Chọn cổng —' },
  'hw.sc.baud':        { en: 'Baud rate', vi: 'Baud rate' },
  'hw.sc.scan_ports':  { en: '↻ Scan ports', vi: '↻ Quét cổng' },
  'hw.sc.connect':     { en: 'Connect + Read realtime', vi: 'Kết nối + Đọc realtime' },
  'hw.sc.disconnect':  { en: 'Disconnect', vi: 'Ngắt' },
  'hw.sc.weight':      { en: '✓ Weight: ', vi: '✓ Trọng lượng: ' },
  'hw.sc.open_err':    { en: 'Scale open error: {msg}', vi: 'Lỗi mở cân: {msg}' },

  // Scanner card
  'hw.sn.title':         { en: '📷 Barcode Scanner — USB-HID / Keyboard Wedge', vi: '📷 Máy quét barcode — USB-HID / Keyboard Wedge' },
  'hw.sn.wedge_label':   {
    en: 'Use <b>Keyboard Wedge mode</b> (default — scanner types directly into the active field)',
    vi: 'Dùng <b>Keyboard Wedge mode</b> (mặc định — scanner gõ thẳng vào field active)',
  },
  'hw.sn.hid_device':    { en: 'HID device', vi: 'Thiết bị HID' },
  'hw.sn.choose':        { en: '— Choose —', vi: '— Chọn —' },
  'hw.sn.scan':          { en: '↻ Scan', vi: '↻ Quét' },
  'hw.sn.start_listen':  { en: 'Start listening', vi: 'Bắt đầu lắng nghe' },
  'hw.sn.stop':          { en: 'Stop', vi: 'Dừng' },
  'hw.sn.scanned':       { en: '✓ Scanned: ', vi: '✓ Quét: ' },
  'hw.sn.no_hid':        { en: 'No HID device selected', vi: 'Chưa chọn thiết bị HID' },
  'hw.sn.open_err':      { en: 'Scanner open error: {msg}', vi: 'Lỗi mở scanner: {msg}' },

  // Office printer card
  'hw.op.title':         { en: '🖨 Office Printer (A4/A3)', vi: '🖨 Máy in văn phòng (A4/A3)' },
  'hw.op.default':       { en: 'Default printer', vi: 'Máy in mặc định' },
  'hw.op.system':        { en: '— System default —', vi: '— Hệ thống —' },
  'hw.op.paper':         { en: 'Paper size', vi: 'Khổ giấy' },
  'hw.op.hint':          {
    en: 'If left unset, the app uses the OS default printer when printing PDF reports.',
    vi: 'Nếu không chọn, app sẽ dùng máy in mặc định của OS khi in PDF báo cáo.',
  },

  // ─── Settings → Connection Mode (v1.2) ───
  'mode.title':       { en: 'Connection Mode', vi: 'Chế độ kết nối' },
  'mode.banner.p1':   {
    en: 'This tab is only available in the <b>Ops Control Desktop App</b>. The web build always calls the current server (equivalent to <code>thin</code> mode).',
    vi: 'Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>. Bản web mặc định gọi server hiện tại (tương đương mode <code>thin</code>).',
  },
  'mode.loading':     { en: 'Loading configuration…', vi: 'Đang tải cấu hình…' },
  'mode.current':     { en: 'Current mode: ', vi: 'Chế độ hiện tại: ' },
  'mode.port':        { en: 'Embedded server port: ', vi: 'Embedded server port: ' },
  'mode.build':       { en: 'Build: ', vi: 'Bản cài: ' },

  // Mode cards
  'mode.embedded.title':    { en: 'Embedded', vi: 'Embedded' },
  'mode.embedded.subtitle': { en: 'In-process server · Single-user', vi: 'Server in-process · Single-user' },
  'mode.embedded.desc':     {
    en: 'Express runs inside the app, data lives in local userData. Suited for single-machine users, demos, or work-from-home. Does NOT sync with other machines.',
    vi: 'Express chạy trong app, dữ liệu local trong userData. Phù hợp cho user single-machine, demo, làm tại nhà. KHÔNG đồng bộ với máy khác.',
  },
  'mode.embedded.pro1':     { en: '100% offline', vi: 'Offline 100%' },
  'mode.embedded.pro2':     { en: 'No network needed', vi: 'Không cần network' },
  'mode.embedded.pro3':     { en: 'Zero setup', vi: 'Setup zero' },
  'mode.embedded.con1':     { en: 'Each machine has its own data', vi: 'Mỗi máy data riêng' },
  'mode.embedded.con2':     { en: 'No quote sharing', vi: 'Không share quote' },

  'mode.thin.title':    { en: 'Thin', vi: 'Thin' },
  'mode.thin.subtitle': { en: 'Remote server · Multi-user (recommended)', vi: 'Remote server · Multi-user (khuyên dùng)' },
  'mode.thin.desc':     {
    en: 'All API calls hit the central server. All 50 machines share the same database. Equivalent to SAP GUI thin client / IFS Aurena Web Client.',
    vi: 'Mọi API call đi về server tập trung. Tất cả 50 máy share cùng database. Tương đương SAP GUI thin client / IFS Aurena Web Client.',
  },
  'mode.thin.pro1':     { en: 'Single source of truth', vi: '1 source of truth' },
  'mode.thin.pro2':     { en: 'Real-time sync', vi: 'Real-time sync' },
  'mode.thin.pro3':     { en: 'Centralised backup', vi: 'Backup tập trung' },
  'mode.thin.con1':     { en: 'Requires LAN', vi: 'Cần network LAN' },
  'mode.thin.con2':     { en: 'Server crash → app stops', vi: 'Server crash → app dừng' },

  'mode.smart.title':    { en: 'Smart', vi: 'Smart' },
  'mode.smart.subtitle': { en: 'Hybrid · offline-capable', vi: 'Hybrid offline-capable' },
  'mode.smart.desc':     {
    en: 'Cache master data locally, queue writes offline + auto-sync when online. Equivalent to IFS Cloud Aurena offline mode. Live sync state shown in the TopBar badge (top-right).',
    vi: 'Cache master data local, write queue offline + auto-sync khi có mạng. Tương đương IFS Cloud Aurena offline mode. Trạng thái sync hiện ở badge TopBar góc phải.',
  },
  'mode.smart.pro1':     { en: 'Offline → Online auto-sync', vi: 'Offline → Online tự sync' },
  'mode.smart.pro2':     { en: 'Fast reads (local cache)', vi: 'Read nhanh (cache local)' },
  'mode.smart.pro3':     { en: 'Keeps working when network drops', vi: 'Mất mạng vẫn làm việc' },
  'mode.smart.con1':     { en: 'Conflict resolution: last-write-wins', vi: 'Conflict resolution: last-write-wins' },
  'mode.smart.con2':     { en: 'Per-endpoint cache wiring is incremental', vi: 'Per-endpoint cache wiring incremental' },

  'mode.pros':            { en: 'Pros', vi: 'Ưu điểm' },
  'mode.cons':            { en: 'Trade-off', vi: 'Đánh đổi' },
  'mode.active_tag':      { en: 'ACTIVE', vi: 'ĐANG DÙNG' },
  'mode.url_label':       { en: 'Remote server URL', vi: 'URL server remote' },
  'mode.apply':           { en: 'Apply', vi: 'Áp dụng' },
  'mode.applying':        { en: 'Saving…', vi: 'Đang lưu…' },
  'mode.applied':         { en: 'Applied', vi: 'Đã áp dụng' },
  'mode.cancel':          { en: 'Cancel', vi: 'Hủy' },
  'mode.saved_restart':   { en: '✅ Config saved. Restart the app to apply the new mode.', vi: '✅ Đã lưu config. Cần khởi động lại app để apply mode mới.' },
  'mode.restart_now':     { en: '↻ Restart app now', vi: '↻ Khởi động lại app ngay' },
  'mode.err':             { en: 'Error: {msg}', vi: 'Lỗi: {msg}' },
  'mode.note': {
    en: '<b>Smart mode is active:</b> sync engine pings the server every 15 s, pulls master data every 5 minutes, pushes the outbox when online. Live state in the top-right badge of TopBar (click to force sync). Local cache lives in <code>cache.db</code> inside userData. Per-tab UIs read from cache when calling <code>smartCache.cacheFirstList()</code> (incremental wiring).',
    vi: '<b>Smart mode đang chạy:</b> sync engine ping server mỗi 15s, pull master data mỗi 5 phút, push outbox khi có mạng. Trạng thái live ở badge góc phải TopBar (click để force sync ngay). Cache local nằm tại <code>cache.db</code> trong userData. Per-tab UI đọc từ cache khi gọi qua <code>smartCache.cacheFirstList()</code> (incremental wiring).',
  },

  // Server URLs (embedded mode info block)
  'mode.urls.title':      { en: '🔗 Server URL for client machines', vi: '🔗 URL server cho máy nhân viên (Client)' },
  'mode.urls.hint':       {
    en: 'Hand ONE of the URLs below to whoever installs the Client. Prefer Ethernet IPs.',
    vi: 'Đưa MỘT trong các URL dưới đây cho người cài Client. Ưu tiên IP Ethernet.',
  },
  'mode.urls.refresh':    { en: '↻ Refresh', vi: '↻ Refresh' },
  'mode.urls.refresh_tt': { en: 'Refresh — re-read the current IP list', vi: 'Refresh — đọc lại danh sách IP hiện tại' },
  'mode.urls.copy':       { en: 'Copy', vi: 'Copy' },
  'mode.urls.warn_intro': {
    en: '⚠ <b>IPs change with the LAN.</b> Each time the host machine moves networks (e.g. home Wi-Fi ↔ office Wi-Fi, or a router swap), the IPs above WILL change → old URLs on client machines will stop connecting. Risk-reduction:',
    vi: '⚠ <b>IP thay đổi theo mạng LAN.</b> Mỗi lần máy chủ chuyển mạng (vd Wi-Fi nhà ↔ Wi-Fi văn phòng, hoặc đổi router), IP ở trên SẼ đổi → URL cũ trên máy nhân viên không kết nối được nữa. Cách giảm rủi ro:',
  },
  'mode.urls.warn_li1':   {
    en: 'Recommended: configure a <b>static IP</b> or <b>DHCP reservation</b> for the host on the router (survives power loss).',
    vi: 'Khuyến nghị: cấu hình <b>static IP</b> hoặc <b>DHCP reservation</b> cho máy chủ trên router (không đổi dù mất điện).',
  },
  'mode.urls.warn_li2':   {
    en: 'If the network changes, reopen this tab → check the new IP → click Copy → send to users so they can update Client.',
    vi: 'Nếu đổi mạng, mở lại tab này → kiểm tra IP mới → bấm Copy → gửi cho người dùng để update Client.',
  },
  'mode.urls.warn_li3':   {
    en: 'After every IP change, client machines must open Settings → ⇄ Connection Mode → edit the URL → Save & restart.',
    vi: 'Mỗi lần đổi IP, máy nhân viên phải vào Settings → ⇄ Chế độ kết nối → sửa URL → Save & restart.',
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
