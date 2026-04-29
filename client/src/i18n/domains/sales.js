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
  // Quote History column headers
  'qh.date':           { en: 'DATE',           vi: 'NGÀY' },
  'qh.rfq_number':     { en: 'RFQ NO.',        vi: 'SỐ RFQ' },
  'qh.ver':            { en: 'VER',            vi: 'PHIÊN BẢN' },
  'qh.ul':             { en: 'UL',             vi: 'UL' },
  'qh.owner':          { en: 'OWNER',          vi: 'CHỦ' },
  'qh.direct_cu':      { en: 'DIRECT CU',      vi: 'KH TRỰC TIẾP' },
  'qh.end_cu':         { en: 'END CU',         vi: 'KH CUỐI' },
  'qh.project':        { en: 'PROJECT',        vi: 'DỰ ÁN' },
  'qh.ifs_code':       { en: 'IFS CODE',       vi: 'MÃ IFS' },
  'qh.direct_cu_pn':   { en: 'DIRECT CU PN',   vi: 'PN KH TRỰC TIẾP' },
  'qh.end_cu_pn':      { en: 'END CU PN',      vi: 'PN KH CUỐI' },
  'qh.size':           { en: 'SIZE',           vi: 'KÍCH THƯỚC' },
  'qh.materials':      { en: 'MATERIALS',      vi: 'VẬT LIỆU' },
  'qh.trade_mode':     { en: 'TRADE MODE',     vi: 'PHƯƠNG THỨC' },
  'qh.design':         { en: 'DESIGN',         vi: 'THIẾT KẾ' },
  'qh.moq':            { en: 'MOQ',            vi: 'MOQ' },
  'qh.sell_price':     { en: 'PRICE USD',      vi: 'GIÁ USD' },
  'qh.price_vnd':      { en: 'PRICE VND',      vi: 'GIÁ VND' },
  'qh.target':         { en: 'TARGET',         vi: 'MỤC TIÊU' },
  'qh.va_pct':         { en: 'VA%',            vi: 'VA%' },
  'qh.contr_pct':      { en: 'CONTR.%',        vi: 'ĐÓNG GÓP%' },
  'qh.gm_pct':         { en: 'GM%',            vi: 'GM%' },
  'qh.status':         { en: 'STATUS',         vi: 'TRẠNG THÁI' },
  'qh.approve_reject': { en: 'APPROVE / REJECT', vi: 'DUYỆT / TỪ CHỐI' },
  'qh.layout':         { en: 'LAYOUT',         vi: 'BỐ CỤC' },

  // RFQ Tracker actions + columns
  'rfq.mark_win':           { en: 'Mark WIN',         vi: 'Đánh dấu THẮNG' },
  'rfq.mark_loss':          { en: 'Mark LOSS',        vi: 'Đánh dấu THUA' },
  'rfq.mark_negotiating':   { en: 'Mark NEGOTIATING', vi: 'Đánh dấu ĐÀM PHÁN' },
  'rfq.col.customer':       { en: 'Customer',         vi: 'Khách hàng' },
  'rfq.col.product':        { en: 'Product',          vi: 'Sản phẩm' },
  'rfq.col.stage':          { en: 'Stage',            vi: 'Giai đoạn' },
  'rfq.col.result':         { en: 'Result',           vi: 'Kết quả' },
  'rfq.search_placeholder': {
    en: 'Search RFQ, customer, product...',
    vi: 'Tìm RFQ, khách hàng, sản phẩm...',
  },
});
