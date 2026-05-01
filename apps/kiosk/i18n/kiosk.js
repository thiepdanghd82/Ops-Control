// Kiosk i18n — Sprint MES-2.6b. EN+VI parity asserted at module load.
// Active language read from localStorage 'opskiosk.lang.v1' (default 'en').
const en = {
  'kiosk.dispatch.title': 'Dispatch',
  'kiosk.dispatch.empty': 'No operations dispatched. Pull to refresh.',
  'kiosk.dispatch.refresh': 'Refresh',
  'kiosk.dispatch.row_qty': 'Qty',
  'kiosk.dispatch.row_due': 'Due',
  'kiosk.op.start': 'Start',
  'kiosk.op.begin_run': 'Begin run',
  'kiosk.op.pause': 'Pause',
  'kiosk.op.resume': 'Resume',
  'kiosk.op.complete': 'Complete',
  'kiosk.op.complete_confirm': 'Confirm complete',
  'kiosk.op.scan_prompt': 'Scan or enter barcode',
  'kiosk.op.scan_send': 'Send scan',
  'kiosk.op.qty_done': 'Quantity done',
  'kiosk.op.scrap_count': 'Scrap',
  'kiosk.op.notes_opt': 'Notes (optional)',
  'kiosk.op.awaiting_accept': 'Awaiting planner acceptance',
  'kiosk.op.back': 'Back',
  'kiosk.reason.title': 'Why pause?',
  'kiosk.reason.cancel': 'Cancel',
  'kiosk.conn.online': 'Online',
  'kiosk.conn.queued': '{n} pending',
  'kiosk.conn.failed': '{n} failed',
  'kiosk.conn.retry_all': 'Retry all',
  'kiosk.conn.offline': 'Offline',
};
const vi = {
  'kiosk.dispatch.title': 'Phân công',
  'kiosk.dispatch.empty': 'Chưa có công đoạn. Kéo xuống để làm mới.',
  'kiosk.dispatch.refresh': 'Làm mới',
  'kiosk.dispatch.row_qty': 'SL',
  'kiosk.dispatch.row_due': 'Hạn',
  'kiosk.op.start': 'Bắt đầu',
  'kiosk.op.begin_run': 'Chạy máy',
  'kiosk.op.pause': 'Tạm dừng',
  'kiosk.op.resume': 'Tiếp tục',
  'kiosk.op.complete': 'Hoàn thành',
  'kiosk.op.complete_confirm': 'Xác nhận hoàn thành',
  'kiosk.op.scan_prompt': 'Quét hoặc nhập mã vạch',
  'kiosk.op.scan_send': 'Gửi mã',
  'kiosk.op.qty_done': 'Số lượng đạt',
  'kiosk.op.scrap_count': 'Phế phẩm',
  'kiosk.op.notes_opt': 'Ghi chú (tuỳ chọn)',
  'kiosk.op.awaiting_accept': 'Chờ Planner duyệt',
  'kiosk.op.back': 'Quay lại',
  'kiosk.reason.title': 'Lý do tạm dừng?',
  'kiosk.reason.cancel': 'Huỷ',
  'kiosk.conn.online': 'Trực tuyến',
  'kiosk.conn.queued': '{n} đang chờ',
  'kiosk.conn.failed': '{n} lỗi',
  'kiosk.conn.retry_all': 'Thử lại',
  'kiosk.conn.offline': 'Mất kết nối',
};

// Self-assert EN/VI parity at module load — fails fast if a translation
// is missing instead of rendering raw keys to operators.
const enKeys = Object.keys(en).sort();
const viKeys = Object.keys(vi).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(viKeys)) {
  const missingVi = enKeys.filter((k) => !(k in vi));
  const missingEn = viKeys.filter((k) => !(k in en));
  throw new Error(
    `[kiosk i18n] EN/VI parity broken — missing vi: ${missingVi.join(',')} | missing en: ${missingEn.join(',')}`
  );
}

const LANG_KEY = 'opskiosk.lang.v1';
export function getLang() {
  try {
    return localStorage.getItem(LANG_KEY) || 'en';
  } catch {
    return 'en';
  }
}
export function t(key, vars) {
  const table = getLang() === 'vi' ? vi : en;
  let s = table[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
export const STRINGS = { en, vi };
