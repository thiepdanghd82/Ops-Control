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
  // v1.3 K1: 34 chat.* keys MOVED to client/src/i18n/domains/basis.js.

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

  // ─── Hardware Devices + Connection Mode ───
  // v1.3 L3: 90 hw.* + mode.* keys MOVED to client/src/i18n/domains/mes.js.

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
