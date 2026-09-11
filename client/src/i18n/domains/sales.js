/**
 * Sales domain i18n (v1.3 H2).
 *
 * Owns: Quote History column headers, RFQ Tracker actions + columns.
 * Sample tracking (`sample.*`) sits in quality.js since CCL Vietnam
 * scopes Sample QC under Quality, not Sales (matches the SAP-QM
 * convention).
 *
 * Industry acronyms (RFQ, MOQ, EAU, GM%, VA%, UL, IFS) intentionally
 * stay in EN per the strings.js convention — operators say them in
 * English regardless of locale.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // ─── Tracker vocabulary shared by RFQ Tracker + Sample Tracking ─────────
  // Added 2026-09-11 (wave 2). The two screens are near-twins — same kanban,
  // same stage/result filters, same attachment and checklist panels — so 44
  // of their strings are literally identical. One key each, used twice.
  //
  // GLOSSARY, continuing wave 1's rule: acronyms operators say in English
  // stay in English — RFQ, EAU, SLA, CS, NPI, IFS, KPI, OK/NG/PARTIAL.
  // Kanban and Pipeline also stay: they are named view paradigms with no
  // short Vietnamese equivalent, and they sit beside "Danh sách" in the same
  // toggle, where a long translation would wrap. Checklist stays for the same
  // reason — it is the word used on the floor.
  'track.view_mode': { en: 'View mode', vi: 'Kiểu xem' },
  'track.kanban': { en: 'Kanban', vi: 'Kanban' },
  'track.pipeline': { en: 'Pipeline', vi: 'Pipeline' },
  'track.all_stages': { en: 'All Stages', vi: 'Mọi công đoạn' },
  'track.all_results': { en: 'All Results', vi: 'Mọi kết quả' },
  'track.filter_stage': { en: 'Filter stage', vi: 'Lọc công đoạn' },
  'track.filter_result': { en: 'Filter result', vi: 'Lọc kết quả' },
  'track.no_items': { en: 'No items', vi: 'Không có mục nào' },
  'track.no_saved_views': { en: 'No saved views', vi: 'Chưa có bộ lọc đã lưu' },
  'track.identity': { en: 'Identity', vi: 'Định danh' },
  'track.attachments': { en: 'Attachments', vi: 'Tệp đính kèm' },
  'track.checklist': { en: 'Checklist', vi: 'Checklist' },
  'track.add_task': { en: '+ Add task', vi: '+ Thêm việc' },
  'track.mark_required': {
    en: 'Mark as required to advance',
    vi: 'Đánh dấu bắt buộc để sang bước sau',
  },
  'track.blocked_reason': { en: 'Blocked reason', vi: 'Lý do tắc' },
  'track.document_flow': { en: 'Document Flow', vi: 'Luồng chứng từ' },
  'track.field_legend': { en: 'Field Legend / Chú giải trường', vi: 'Chú giải trường' },
  'track.move_back': { en: 'Move back', vi: 'Lùi bước' },
  'track.next': { en: 'Next →', vi: 'Bước sau →' },
  'track.sla_days': { en: 'SLA (days)', vi: 'SLA (ngày)' },
  'track.uploaded_by': { en: 'Uploaded by', vi: 'Người tải lên' },
  'track.uploading': { en: 'Uploading…', vi: 'Đang tải lên…' },
  'track.no_events': { en: 'No events recorded yet.', vi: 'Chưa ghi nhận sự kiện nào.' },
  'track.trend_6m': { en: '6-month trend', vi: 'Xu hướng 6 tháng' },
  'track.rfq': { en: 'RFQ', vi: 'RFQ' },

  // ─── RFQ Tracker only ───────────────────────────────────────────────────
  'rfqt.rfq_no': { en: 'RFQ No.', vi: 'Số RFQ' },
  'rfqt.rfq_detail': { en: 'RFQ detail', vi: 'Chi tiết RFQ' },
  'rfqt.rfq_kpis': { en: 'RFQ KPIs', vi: 'KPI RFQ' },
  'rfqt.this_rfq': { en: 'This RFQ', vi: 'RFQ này' },
  'rfqt.all_owners': { en: 'All Owners', vi: 'Mọi người phụ trách' },
  'rfqt.filter_owner': { en: 'Filter owner', vi: 'Lọc người phụ trách' },
  'rfqt.customer_order': { en: 'Customer Order', vi: 'Đơn hàng khách' },
  'rfqt.deadline': { en: 'Deadline', vi: 'Hạn chót' },
  'rfqt.over_deadline': { en: 'Over deadline', vi: 'Quá hạn' },
  'rfqt.age': { en: 'Age', vi: 'Tuổi' },
  'rfqt.value': { en: 'Value', vi: 'Giá trị' },
  'rfqt.eau': { en: 'EAU', vi: 'EAU' },
  'rfqt.print_type': { en: 'Print Type', vi: 'Kiểu in' },
  'rfqt.print_specs': { en: 'Print Specs', vi: 'Thông số in' },
  'rfqt.sample_request': { en: 'Sample Request', vi: 'Yêu cầu mẫu' },
  'rfqt.pricing_worksheet': { en: 'Pricing Worksheet', vi: 'Bảng tính giá' },
  'rfqt.sync_pricing': { en: 'Sync → Pricing Worksheet', vi: 'Đồng bộ → Bảng tính giá' },
  'rfqt.open_pricing_tip': {
    en: 'Open Pricing Worksheet with these fields prefilled',
    vi: 'Mở Bảng tính giá với các trường đã điền sẵn',
  },
  'rfqt.open_quote_history': { en: 'Open Quote History', vi: 'Mở Lịch sử báo giá' },
  'rfqt.open_ext': { en: 'Open ↗', vi: 'Mở ↗' },
  'rfqt.no_attachments': { en: 'No attachments yet.', vi: 'Chưa có tệp đính kèm.' },
  'rfqt.no_match': {
    en: 'No RFQ records match the filters',
    vi: 'Không có RFQ nào khớp bộ lọc',
  },

  // Quote History column headers
  'qh.date': { en: 'DATE', vi: 'NGÀY' },
  'qh.rfq_number': { en: 'RFQ NO.', vi: 'SỐ RFQ' },
  'qh.option': { en: 'OPTION', vi: 'TÙY CHỌN' },
  'qh.ul': { en: 'UL', vi: 'UL' },
  'qh.owner': { en: 'OWNER', vi: 'CHỦ' },
  // Sprint S-INBOX-COLS (2026-06-17) — Pending Approvals "who submitted
  // this for review" column. Renamed from "Submitted by" per Henry's
  // hardware-verify (closer to operator vocabulary: the person who
  // quoted the part is the same person who submits it for sales
  // approval in the CCL workflow).
  'qh.quoted_by': { en: 'QUOTED BY', vi: 'NGƯỜI BÁO GIÁ' },
  // Sprint S-SALE-OWNER-COL (2026-06-16) — Sale Owner column in Quote
  // History; source = state.sale_owner from RFQ & MOQ info sub-tab.
  'qh.sale_owner': { en: 'SALE OWNER', vi: 'NV BÁN HÀNG' },
  'qh.direct_cu': { en: 'DIRECT CU', vi: 'KH TRỰC TIẾP' },
  'qh.end_cu': { en: 'END CU', vi: 'KH CUỐI' },
  'qh.project': { en: 'PROJECT', vi: 'DỰ ÁN' },
  'qh.ifs_code': { en: 'IFS CODE', vi: 'MÃ IFS' },
  'qh.direct_cu_pn': { en: 'DIRECT CU PN', vi: 'PN KH TRỰC TIẾP' },
  'qh.end_cu_pn': { en: 'END CU PN', vi: 'PN KH CUỐI' },
  'qh.size': { en: 'SIZE', vi: 'KÍCH THƯỚC' },
  'qh.materials': { en: 'MATERIALS', vi: 'VẬT LIỆU' },
  'qh.trade_mode': { en: 'TRADE MODE', vi: 'PHƯƠNG THỨC' },
  'qh.design': { en: 'DESIGN', vi: 'THIẾT KẾ' },
  'qh.moq': { en: 'MOQ', vi: 'MOQ' },
  'qh.sell_price': { en: 'PRICE USD', vi: 'GIÁ USD' },
  'qh.price_vnd': { en: 'PRICE VND', vi: 'GIÁ VND' },
  'qh.target': { en: 'TARGET', vi: 'MỤC TIÊU' },
  'qh.va_pct': { en: 'VA%', vi: 'VA%' },
  'qh.contr_pct': { en: 'CONTR.%', vi: 'ĐÓNG GÓP%' },
  'qh.gm_pct': { en: 'GM%', vi: 'GM%' },
  'qh.status': { en: 'STATUS', vi: 'TRẠNG THÁI' },
  'qh.quote_progress': { en: 'QUOTE PROGRESS', vi: 'TIẾN TRÌNH BÁO GIÁ' },
  'qh.layout': { en: 'LAYOUT', vi: 'BỐ CỤC' },

  // RFQ Tracker actions + columns
  'rfq.mark_win': { en: 'Mark WIN', vi: 'Đánh dấu THẮNG' },
  'rfq.mark_loss': { en: 'Mark LOSS', vi: 'Đánh dấu THUA' },
  'rfq.mark_negotiating': { en: 'Mark NEGOTIATING', vi: 'Đánh dấu ĐÀM PHÁN' },
  'rfq.col.customer': { en: 'Customer', vi: 'Khách hàng' },
  'rfq.col.product': { en: 'Product', vi: 'Sản phẩm' },
  'rfq.col.stage': { en: 'Stage', vi: 'Giai đoạn' },
  'rfq.col.result': { en: 'Result', vi: 'Kết quả' },
  'rfq.search_placeholder': {
    en: 'Search RFQ, customer, product...',
    vi: 'Tìm RFQ, khách hàng, sản phẩm...',
  },

  // ─── Quote Export UI (Sprint S-EXPORT-UI 2026-05-19) ───
  // User-facing surface for the MVP-1/1.5/2 server export pipeline.
  // Trigger: download icon in Quote History row → modal → POST /api/quotes/:id/export.
  'qexp.button.label': { en: 'Export', vi: 'Xuất' },
  'qexp.button.tooltip': { en: 'Export to xlsx', vi: 'Xuất ra xlsx' },
  'qexp.modal.title': { en: 'Export Quote', vi: 'Xuất báo giá' },
  'qexp.field.variant.label': { en: 'Variant', vi: 'Phiên bản' },
  'qexp.field.variant.customer': { en: 'Customer copy', vi: 'Cho khách hàng' },
  'qexp.field.variant.internal': { en: 'Internal copy', vi: 'Nội bộ' },
  'qexp.field.format.label': { en: 'Format', vi: 'Định dạng' },
  'qexp.field.format.xlsx': { en: 'Excel (.xlsx)', vi: 'Excel (.xlsx)' },
  'qexp.field.format.csv': { en: 'CSV (.zip)', vi: 'CSV (.zip)' },
  'qexp.field.lang.label': { en: 'Language', vi: 'Ngôn ngữ' },
  'qexp.field.lang.en': { en: 'English', vi: 'Tiếng Anh' },
  'qexp.field.lang.vi': { en: 'Vietnamese', vi: 'Tiếng Việt' },
  'qexp.field.lang.bilingual': { en: 'EN + VI', vi: 'Song ngữ' },
  'qexp.field.tiers.label': { en: 'Tiers', vi: 'Bậc MOQ' },
  'qexp.field.tiers.all': { en: 'All tiers ({n}) — single zip', vi: 'Tất cả ({n}) bậc — gói zip' },
  'qexp.field.tiers.single': { en: 'MOQ {n} · {eau} pcs', vi: 'MOQ {n} · {eau} cái' },
  'qexp.field.tiers.row': { en: 'MOQ {n}', vi: 'MOQ {n}' },
  'qexp.action.export': { en: 'Export', vi: 'Xuất' },
  'qexp.action.cancel': { en: 'Cancel', vi: 'Huỷ' },
  'qexp.progress.exporting': { en: 'Exporting…', vi: 'Đang xuất…' },
  'qexp.success.downloaded': { en: 'Downloaded {f}', vi: 'Đã tải {f}' },
  'qexp.error.legacy_no_rows': {
    en: 'This quote was saved before per-row tracking. Open in calculator + Save to refresh export data.',
    vi: 'Báo giá lưu trước khi có theo dõi từng dòng. Mở trong calculator + Lưu để cập nhật dữ liệu xuất.',
  },
  'qexp.error.no_snapshot': {
    en: 'Quote has no calculation snapshot. Re-save in calculator.',
    vi: 'Báo giá chưa có bản tính. Lưu lại trong calculator.',
  },
  'qexp.error.permission': {
    en: 'Permission denied for Quote History.',
    vi: 'Không có quyền với Lịch sử báo giá.',
  },
  'qexp.error.network': { en: 'Network error. Please retry.', vi: 'Lỗi mạng. Vui lòng thử lại.' },
  'qexp.error.generic': { en: 'Export failed: {detail}', vi: 'Xuất thất bại: {detail}' },

  // ─── Sprint S-I18N-COVER-2 (2026-06-19) — Phase B group B3c ──────
  // ScopedFilterBar is shared between Quote History + Pending
  // Approvals Inbox + Cost Breakdown sidebar; keys live here next to
  // the qh.* family so the whole sales-review surface ships VI parity
  // together. Pending Approvals header strings (`inbox.*`) also live
  // here — the inbox is a Sales-domain surface and gets resolved by
  // the same registry slice.

  // ── ScopedFilterBar (date picker + scoped text inputs + counter) ──
  'filter.date_range': { en: 'Date range', vi: 'Khoảng ngày' },
  'filter.from': { en: 'From', vi: 'Từ' },
  'filter.to': { en: 'To', vi: 'Đến' },
  'filter.today': { en: 'Today', vi: 'Hôm nay' },
  'filter.this_week': { en: 'This week', vi: 'Tuần này' },
  'filter.this_month': { en: 'This month', vi: 'Tháng này' },
  'filter.last_30_days': { en: 'Last 30 days', vi: '30 ngày qua' },
  'filter.clear': { en: 'Clear', vi: 'Xoá' },
  'filter.search_placeholder': { en: 'Search…', vi: 'Tìm kiếm…' },
  'filter.customer': { en: 'Customer', vi: 'Khách hàng' },
  'filter.part': { en: 'Part', vi: 'Linh kiện' },
  'filter.sale': { en: 'Sale', vi: 'Bán hàng' },
  'filter.clear_all': { en: '↻ Clear all', vi: '↻ Xoá hết' },
  'filter.clear_all_title': { en: 'Clear all filters', vi: 'Xoá hết bộ lọc' },
  'filter.shown_of': { en: '{n} of {m} shown', vi: '{n} / {m} hiển thị' },
  'filter.clear_field_aria': { en: 'Clear {label}', vi: 'Xoá {label}' },
  'filter.clear_search_aria': { en: 'Clear search', vi: 'Xoá tìm kiếm' },
  'filter.clear_date_aria': { en: 'Clear date range', vi: 'Xoá khoảng ngày' },

  // ── Pending Approvals Inbox header + empty states ──
  'inbox.title': { en: 'Pending Approvals', vi: 'Chờ duyệt' },
  'inbox.in_my_queue': { en: '{n} in my queue', vi: '{n} trong hàng đợi' },
  'inbox.my_queue': { en: 'My queue', vi: 'Hàng đợi của tôi' },
  'inbox.all_pending': { en: 'All pending', vi: 'Tất cả chờ duyệt' },
  'inbox.refresh': { en: '↻ Refresh', vi: '↻ Làm mới' },
  'inbox.refresh_title': { en: 'Refresh', vi: 'Làm mới' },
  'inbox.search_placeholder': {
    en: 'Search RFQ, customer, project, materials…',
    vi: 'Tìm RFQ, khách hàng, dự án, vật liệu…',
  },
  'inbox.empty.no_match.title': {
    en: 'No matches for current filters',
    vi: 'Không khớp với bộ lọc hiện tại',
  },
  'inbox.empty.no_match.hint': {
    en: 'Try clearing a filter chip or the global search box above.',
    vi: 'Thử xoá một chip bộ lọc hoặc ô tìm kiếm tổng phía trên.',
  },
  'inbox.empty.caught_up.title': { en: 'All caught up', vi: 'Đã xong hết' },
  'inbox.empty.caught_up.hint': {
    en: 'No quotes are waiting on your action right now. Check back later, or switch to "All pending" if you are an admin.',
    vi: 'Hiện không có báo giá nào chờ bạn xử lý. Quay lại sau, hoặc chuyển sang "Tất cả chờ duyệt" nếu bạn là admin.',
  },
  'inbox.empty.no_review.title': {
    en: 'No quotes in review',
    vi: 'Không có báo giá đang xét duyệt',
  },
  'inbox.empty.no_review.hint': {
    en: 'No quotes are currently in Sales or Finance review.',
    vi: 'Hiện không có báo giá nào đang trong vòng xét duyệt Bán hàng hoặc Tài chính.',
  },
});
