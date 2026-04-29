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
});
