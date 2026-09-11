/**
 * Quality domain i18n (v1.6, wave 2).
 *
 * SAP-QM analogue. Owns Sample Tracking, which CCL Vietnam scopes under
 * Quality rather than Sales — a convention sales.js has documented since v1.3
 * H2 ("sample tracking (`sample.*`) sits in quality.js") without the file
 * existing yet. It does now.
 *
 * Vocabulary this screen SHARES with RFQ Tracker lives in sales.js as
 * `track.*`, not here: the two screens are near-twins and duplicating 44 keys
 * so each domain owns its own copy would guarantee they drift apart.
 *
 * Industry acronyms stay in EN per the strings.js convention — CS, NPI, IFS,
 * KPI, and the sample verdicts OK / NG / PARTIAL, which operators write on the
 * physical sample tags in English.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  'sample.sample': { en: 'Sample', vi: 'Mẫu' },
  'sample.detail': { en: 'Sample detail', vi: 'Chi tiết mẫu' },
  'sample.kpis': { en: 'Sample KPIs', vi: 'KPI mẫu' },
  'sample.type': { en: 'Sample Type', vi: 'Loại mẫu' },
  'sample.product_type': { en: 'Product Type', vi: 'Loại sản phẩm' },
  'sample.no_match': {
    en: 'No sample records match the filters',
    vi: 'Không có mẫu nào khớp bộ lọc',
  },

  // People + ownership. CS and NPI are department names, kept as operators say
  // them; only the surrounding words are translated.
  'sample.cs_npi': { en: 'CS / NPI', vi: 'CS / NPI' },
  'sample.all_cs': { en: 'All CS', vi: 'Mọi CS' },
  'sample.all_npi': { en: 'All NPI', vi: 'Mọi NPI' },
  'sample.filter_cs': { en: 'Filter CS', vi: 'Lọc CS' },
  'sample.filter_npi': { en: 'Filter NPI', vi: 'Lọc NPI' },
  'sample.owner': { en: 'Owner', vi: 'Người phụ trách' },
  'sample.npi_owner_summary': { en: 'NPI OWNER SUMMARY', vi: 'TỔNG HỢP THEO NPI' },

  // Part + order identity. "Part No." keeps the IFS field name it mirrors, the
  // same call made for the inventory import canonicals.
  'sample.part_no': { en: 'Part No.', vi: 'Part No.' },
  'sample.parts': { en: 'Parts', vi: 'Chi tiết' },
  'sample.name': { en: 'Name', vi: 'Tên' },
  'sample.customer': { en: 'Customer', vi: 'Khách hàng' },
  'sample.production_order': { en: 'Production Order', vi: 'Lệnh sản xuất' },
  'sample.qty': { en: 'Qty', vi: 'SL' },
  'sample.specs': { en: 'Specs', vi: 'Thông số' },
  'sample.spec_released': { en: 'Spec Released', vi: 'Đã phát hành spec' },
  'sample.search_ph': {
    en: 'Search part, customer, CS, IFS...',
    vi: 'Tìm part, khách hàng, CS, IFS...',
  },

  // Stage + schedule.
  'sample.stage': { en: 'Stage', vi: 'Công đoạn' },
  'sample.due': { en: 'Due', vi: 'Hạn' },
  'sample.past_due': { en: 'Past due', vi: 'Quá hạn' },
  'sample.finished': { en: 'Finished', vi: 'Hoàn tất' },
  'sample.submit': { en: 'Submit', vi: 'Gửi' },

  // Verdicts. OK / NG / PARTIAL stay in EN — they are written on the physical
  // sample tag and read back from it, so translating the button would break the
  // match between screen and paper.
  'sample.mark_ok': { en: 'Mark OK', vi: 'Đánh OK' },
  'sample.mark_ng': { en: 'Mark NG', vi: 'Đánh NG' },
  'sample.mark_partial': { en: 'Mark PARTIAL', vi: 'Đánh PARTIAL' },
  'sample.ok_rate': { en: 'OK Rate', vi: 'Tỷ lệ OK' },
  'sample.ng_reason_code': { en: 'NG Reason Code', vi: 'Mã lý do NG' },
  'sample.reason': { en: 'Reason', vi: 'Lý do' },
});
