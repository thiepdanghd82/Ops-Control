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
  // ─── Chat (Phase 10A-10F) ───
  'chat.open':              { en: 'Open chat',  vi: 'Mở chat' },
  'chat.close':             { en: 'Close chat', vi: 'Đóng chat' },
  'chat.header_rooms':      { en: 'Messages',   vi: 'Tin nhắn' },
  'chat.header_mentions':   { en: 'Mentions',   vi: 'Lượt nhắc' },
  'chat.back_to_rooms':     { en: 'Back to rooms', vi: 'Quay lại danh sách' },
  'chat.mentions_button':   { en: 'Your @mentions', vi: 'Lượt nhắc đến bạn' },
  'chat.search_placeholder':{ en: 'Search messages…', vi: 'Tìm trong tin nhắn…' },
  'chat.search_searching':  { en: 'Searching…',     vi: 'Đang tìm…' },
  'chat.search_no_match':   { en: 'No matches',     vi: 'Không có kết quả' },
  'chat.rooms_empty': {
    en: 'No rooms yet. Open a DM from a teammate to start chatting.',
    vi: 'Chưa có phòng nào. Mở DM với đồng nghiệp để bắt đầu trò chuyện.',
  },
  'chat.mentions_empty': {
    en: 'No mentions yet. You\'ll see a badge here when someone @mentions you.',
    vi: 'Chưa có lượt nhắc nào. Bạn sẽ thấy thông báo ở đây khi có người @nhắc đến.',
  },
  'chat.messages_empty':    { en: 'No messages yet. Say hi 👋', vi: 'Chưa có tin nhắn. Chào một câu 👋' },
  'chat.loading':           { en: 'Loading…', vi: 'Đang tải…' },
  'chat.loading_older':     { en: 'Loading older…', vi: 'Đang tải tin nhắn cũ…' },
  'chat.conversation_start':{ en: '— beginning of conversation —', vi: '— đầu cuộc trò chuyện —' },
  'chat.compose_placeholder':{ en: 'Type a message, Enter to send', vi: 'Nhập tin nhắn, nhấn Enter để gửi' },
  'chat.send':              { en: 'Send', vi: 'Gửi' },
  'chat.sending':           { en: '…',   vi: '…' },
  'chat.edit':              { en: 'Edit', vi: 'Sửa' },
  'chat.delete':            { en: 'Delete', vi: 'Xóa' },
  'chat.edit_save':         { en: 'Save', vi: 'Lưu' },
  'chat.edit_cancel':       { en: 'Cancel', vi: 'Hủy' },
  'chat.edited_mark':       { en: ' · edited', vi: ' · đã sửa' },
  'chat.deleted_body':      { en: '(message deleted)', vi: '(tin nhắn đã xóa)' },
  'chat.delete_confirm': {
    en: 'Delete this message? This cannot be undone.',
    vi: 'Xóa tin nhắn này? Không thể hoàn tác.',
  },
  'chat.recall':            { en: 'Unsend', vi: 'Thu hồi' },
  'chat.recall_confirm': {
    en: 'Unsend this message? The recipient will see it was recalled.',
    vi: 'Thu hồi tin nhắn này? Người nhận sẽ thấy tin đã bị thu hồi.',
  },
  'chat.delete_forever':    { en: 'Delete permanently', vi: 'Xóa hoàn toàn' },
  'chat.purge_confirm': {
    en: 'Permanently delete this message? It will be removed from everyone\'s view and leaves no trace.',
    vi: 'Xóa vĩnh viễn tin nhắn này? Tin sẽ biến mất khỏi mọi người và không để lại dấu vết.',
  },
  'chat.more_actions':      { en: 'More actions', vi: 'Thêm hành động' },
  'chat.emoji_picker':      { en: 'Emoji', vi: 'Emoji' },
  'chat.discuss':           { en: '💬 Discuss', vi: '💬 Thảo luận' },
  'chat.discuss_title':     { en: 'Discuss this quote in chat', vi: 'Thảo luận quote này trong chat' },
  'chat.unavailable':       { en: 'Chat unavailable: {msg}', vi: 'Chat không khả dụng: {msg}' },

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
  'dashboard.range.month': { en: 'Month', vi: 'Tháng' },
  'dashboard.range.year': { en: 'Year', vi: 'Năm' },
  'dashboard.range.full_year_on': { en: 'Full year', vi: 'Cả năm' },
  'dashboard.range.full_year_off': { en: 'Use year', vi: 'Theo năm' },
  'dashboard.range.full_year_tip': { en: 'Toggle between selected month and the full year', vi: 'Chuyển giữa tháng đã chọn và cả năm' },
  'dashboard.panel.fixed_12m_hint': { en: 'always last 12 months', vi: 'luôn 12 tháng gần nhất' },

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
  'settings.item.mode':     { en: 'Connection Mode',  vi: 'Chế độ kết nối' },

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

  'common.lang_toggle_aria': { en: 'Switch language', vi: 'Đổi ngôn ngữ' },

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
});
