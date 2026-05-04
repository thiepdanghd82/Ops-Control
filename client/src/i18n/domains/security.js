/**
 * Security domain i18n (v1.3 P3.3).
 *
 * Owns: login lockout, TOTP, audit log, permission groups, session.
 * Imported by main.jsx at boot — `registerStrings()` merges into the
 * global STRINGS dict so existing useI18n() callers keep working.
 *
 * Key prefixes: `audit.*`, `totp.*`, `users.*`, `groups.*`. Anything
 * that lives under `nav.tab.audit_log` etc. stays in the platform-
 * level strings.js because the sidebar is a platform component.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // ─── Login + TOTP (login.* — was platform/auth in v1.3 layout) ───
  // 33 keys covering: form, totp, expired session, password-age bar,
  // forced-change-on-first-login banner.
  'login.app_title': { en: 'Operations Cost', vi: 'Quản lý Chi phí Sản xuất' },
  'login.subtitle': { en: 'Server version.', vi: 'Phiên bản máy chủ.' },
  'login.cta': { en: 'Sign in to continue', vi: 'Đăng nhập để tiếp tục' },
  'login.username': { en: 'Username', vi: 'Tên đăng nhập' },
  'login.username_placeholder': { en: 'Enter username', vi: 'Nhập tên đăng nhập' },
  'login.password': { en: 'Password', vi: 'Mật khẩu' },
  'login.password_placeholder': { en: 'Enter password', vi: 'Nhập mật khẩu' },
  'login.remember': { en: 'Remember me', vi: 'Ghi nhớ tôi' },
  'login.submit': { en: 'Sign in', vi: 'Đăng nhập' },
  'login.submitting': { en: 'Signing in…', vi: 'Đang đăng nhập…' },
  // Sprint S-P0-FIX-3 (OWASP ASVS V4.0 §6.2.4) — single unified message
  // for every credentials-failure path (unknown user / wrong password /
  // per-username lockout). Server-side audit log retains the rich detail.
  // The 3 legacy keys below cover the kiosk-PWA stale-cache window where
  // a 5-min-old client may receive the new server response while still
  // running the old code path that displayed the original messages.
  'login.error.invalid_credentials': {
    en: 'Invalid credentials',
    vi: 'Thông tin đăng nhập không hợp lệ',
  },
  'login.error.fallback': {
    en: 'Login failed',
    vi: 'Đăng nhập thất bại',
  },
  // Sprint S-P0-FIX-4 (a11y) — explicit heading key for the login form's
  // primary <h1>. Decoupled from `login.submit` (button text) so the two
  // can diverge later without coupling. Closes F-FOLLOW-UP-1.
  'login.heading.signin': {
    en: 'Sign in',
    vi: 'Đăng nhập',
  },
  'login.expired_title': { en: 'Session expired', vi: 'Phiên đã hết hạn' },
  'login.expired_hint': {
    en: 'Your session timed out. Re-enter your password — we kept the username.',
    vi: 'Phiên của bạn đã hết hạn. Nhập lại mật khẩu — chúng tôi giữ tên đăng nhập.',
  },
  'login.expired_keep_place': {
    en: "Your place in the app is preserved; you won't lose your current tab.",
    vi: 'Vị trí của bạn trong ứng dụng được giữ lại; bạn sẽ không mất tab hiện tại.',
  },
  'login.totp_title': { en: '2-Step Verification', vi: 'Xác thực 2 lớp' },
  'login.totp_hint_prefix': { en: 'Open', vi: 'Mở' },
  'login.totp_hint_suffix': {
    en: 'and enter the 6-digit code for account',
    vi: 'và nhập mã 6 chữ số cho tài khoản',
  },
  'login.totp_label': { en: 'Authenticator Code', vi: 'Mã xác thực' },
  'login.totp_submit': { en: 'Verify Code', vi: 'Xác minh' },
  'login.totp_submitting': { en: 'Verifying…', vi: 'Đang xác minh…' },
  'login.totp_back': { en: 'Back to login', vi: 'Quay lại đăng nhập' },
  'login.pwd_age_label': { en: 'Password age', vi: 'Thời hạn mật khẩu' },
  'login.change.toggle': { en: 'Change password', vi: 'Đổi mật khẩu' },
  'login.change.cancel': { en: 'Cancel password change', vi: 'Hủy đổi mật khẩu' },
  'login.change.new': { en: 'New password', vi: 'Mật khẩu mới' },
  'login.change.new_placeholder': { en: 'At least 6 characters', vi: 'Tối thiểu 6 ký tự' },
  'login.change.confirm': { en: 'Confirm new password', vi: 'Xác nhận mật khẩu mới' },
  'login.change.confirm_placeholder': { en: 'Type it again', vi: 'Nhập lại' },
  'login.change.submit': { en: 'Change & sign in', vi: 'Đổi mật khẩu & Đăng nhập' },
  'login.change.too_short': {
    en: 'New password must be at least 6 characters.',
    vi: 'Mật khẩu mới phải có ít nhất 6 ký tự.',
  },
  'login.change.mismatch': {
    en: "The confirmation doesn't match the new password.",
    vi: 'Xác nhận mật khẩu không khớp.',
  },
  'login.change.same': {
    en: 'New password must be different from the current one.',
    vi: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  },
  'login.must_change.title': { en: 'Set a new password', vi: 'Đặt mật khẩu mới' },
  'login.must_change.body': {
    en: 'Your administrator provisioned a temporary password for this account. Please choose a new password before continuing.',
    vi: 'Quản trị viên đã cấp mật khẩu tạm cho tài khoản này. Vui lòng đặt mật khẩu mới trước khi tiếp tục.',
  },

  // Audit log table
  'audit.title': { en: 'Audit log', vi: 'Nhật ký audit' },
  'audit.subtitle': {
    en: 'Append-only event stream. Newest first.',
    vi: 'Dòng sự kiện ghi-thêm. Mới nhất trước.',
  },
  'audit.col.time': { en: 'Time', vi: 'Thời gian' },
  'audit.col.action': { en: 'Action', vi: 'Hành động' },
  'audit.col.actor': { en: 'Actor', vi: 'Người thực hiện' },
  'audit.col.target': { en: 'Target', vi: 'Đối tượng' },
  'audit.col.result': { en: 'Result', vi: 'Kết quả' },
  'audit.col.ip': { en: 'IP', vi: 'IP' },
  'audit.col.details': { en: 'Details', vi: 'Chi tiết' },
  'audit.filter.event': { en: 'Event', vi: 'Sự kiện' },
  'audit.filter.user': { en: 'User', vi: 'Người dùng' },
  'audit.filter.from': { en: 'From (ISO ts)', vi: 'Từ (ISO ts)' },
  'audit.filter.to': { en: 'To (ISO ts)', vi: 'Đến (ISO ts)' },
  'audit.filter.limit': { en: 'Limit', vi: 'Giới hạn' },
  'audit.refresh': { en: 'Refresh', vi: 'Tải lại' },
  'audit.empty': {
    en: 'No audit events match the current filter.',
    vi: 'Không có sự kiện audit khớp bộ lọc hiện tại.',
  },

  // ─── Connection info (Phase A.2 admin dashboard) ───
  // Surfaces serverName / serverId / autodetected URL + QR for hand-off
  // to client machines. Admin-only via server-side requireRole gate.
  'conn_info.title': { en: 'Connection info', vi: 'Thông tin kết nối' },
  'conn_info.subtitle': {
    en: 'Hand this off to client machines for first-time setup.',
    vi: 'Cung cấp cho máy client để cấu hình lần đầu.',
  },
  'conn_info.server_name': { en: 'Server name', vi: 'Tên server' },
  'conn_info.server_id': { en: 'Server ID', vi: 'Mã server' },
  'conn_info.server_url': { en: 'Server URL', vi: 'Địa chỉ server' },
  'conn_info.multi_nic_hint': {
    en: 'Multiple network interfaces detected — pick the LAN-facing one:',
    vi: 'Phát hiện nhiều card mạng — chọn card LAN:',
  },
  'conn_info.export_opsconn': {
    en: 'Export .opsconn profile',
    vi: 'Xuất file .opsconn',
  },
  'conn_info.qr_caption': {
    en: 'Scan with mobile to copy the URL',
    vi: 'Quét bằng điện thoại để copy URL',
  },
  'conn_info.copy': { en: 'Copy', vi: 'Copy' },
  'conn_info.copied': { en: 'Copied', vi: 'Đã copy' },
  'conn_info.loading': { en: 'Loading…', vi: 'Đang tải…' },
});
