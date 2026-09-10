/**
 * Costing domain i18n (v1.3 G2).
 *
 * Owns: pricing breakdown column headers + summary labels used by
 * Standard / Complex calculator and Quote History row totals.
 *
 * Key prefixes: `pricing.*`. Other costing-adjacent prefixes
 * (`qh.*`, `formal.*`) stay in their own domain modules — keep one
 * SAP module per file so ownership is clear.
 *
 * Industry acronyms (MOQ, EAU, GM%, VA%) intentionally stay in EN per
 * the convention documented at the top of strings.js — operators
 * speak them in English regardless of locale.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // Sprint S-PRICING-COMBINED-P1 (2026-06-17) — Combined sub-tab on
  // Pricing (Std) that stacks Materials / Inks / Processes in one
  // scrollable surface. Tab label + 3 section headings live here so
  // future Phase 2 (retire 3 originals) can flip references without
  // touching component code.
  // Sprint S-PRICING-COMBINED-P2 (2026-06-18) — Phase 2 renamed the
  // tab now that it's the sole pricing-phase surface (3 standalone
  // tabs retired). Key id stays 'pricing.tab.combined' so callers
  // (StandardCalc.jsx SUB_TABS labelKey) keep working without churn.
  'pricing.tab.combined': { en: 'Materials & Process', vi: 'Vật tư & Công đoạn' },
  'pricing.section.materials': { en: 'Materials', vi: 'Vật tư' },
  'pricing.section.inks': { en: 'Inks', vi: 'Mực in' },
  'pricing.section.processes': { en: 'Processes', vi: 'Công đoạn' },

  // Pricing breakdown columns
  'pricing.tier': { en: 'Tier', vi: 'Bậc' },
  'pricing.moq': { en: 'MOQ', vi: 'MOQ' },
  'pricing.eau': { en: 'EAU', vi: 'EAU' },
  'pricing.sell_price': { en: 'Sell Price', vi: 'Giá bán' },
  'pricing.target': { en: 'Target', vi: 'Mục tiêu' },
  'pricing.material': { en: 'Material', vi: 'Vật liệu' },
  'pricing.ink': { en: 'Ink', vi: 'Mực' },
  'pricing.process': { en: 'Process', vi: 'Công đoạn' },
  'pricing.pack_ship': { en: 'Pack & Ship', vi: 'Đóng gói & VC' },
  'pricing.subtotal': { en: 'Subtotal', vi: 'Tổng phụ' },
  'pricing.va_pct': { en: 'VA%', vi: 'VA%' },
  'pricing.contr_pct': { en: 'Contr%', vi: 'Đóng góp%' },
  'pricing.gm_pct': { en: 'GM%', vi: 'GM%' },
  'pricing.selling_unit': { en: 'Selling /unit (USD)', vi: 'Giá bán /sản phẩm (USD)' },
  // Cost Breakdown — Cost Structure what-if (display-only)
  'cb.cost_structure': { en: 'Cost Structure', vi: 'Cấu trúc chi phí' },
  'cb.bucket': { en: 'Cost bucket', vi: 'Khoản mục' },
  'cb.value': { en: 'Value', vi: 'Giá trị' },
  'cb.pct_sell': { en: '% Sell', vi: '% Bán' },
  'cb.pct_target': { en: '% Target', vi: '% Mục tiêu' },
  'cb.active': { en: 'Active', vi: 'Áp dụng' },
  'cb.reset': { en: 'Reset — re-check all buckets', vi: 'Đặt lại — bật lại tất cả' },
  'cb.grand_total': { en: 'GRAND TOTAL', vi: 'TỔNG CỘNG' },
  'cb.excluded': { en: 'Excluded', vi: 'Đã loại' },

  // Summary box (compact-form labels for narrow columns)
  'pricing.material_short': { en: 'Mat', vi: 'VL' },
  'pricing.ink_short': { en: 'Ink', vi: 'Mực' },
  'pricing.process_short': { en: 'Proc', vi: 'CĐ' },
  'pricing.packing_ship': { en: 'Pack+Ship', vi: 'Đóng gói+VC' },

  // Sprint S-PACK-SHIP-PER-TIER — banner shown at the top of the
  // Packing & Ship tab when active_moq_idx > 0, hinting that values
  // are inherited from MOQ1 unless the operator overrides them.
  // "MOQ1" is intentional verbatim (not interpolated qty) per Henry's
  // call — clearer than "MOQ 500" since the inheritance source IS
  // tier 0 regardless of its MOQ quantity.
  'pricing.pack_ship.inherit_hint': {
    en: 'Inherited from MOQ1 — edit to set a value specific to this MOQ',
    vi: 'Kế thừa từ MOQ1 — sửa để áp riêng cho MOQ này',
  },

  // ─── Material Library / Print Area / Inks (v1.3 M3) ───
  // Library-side material picker shares its search-placeholder string
  // here; the calc-side InkCalculator + PrintAreaCalc tabs use these
  // tiny labels too.
  'material_lib.search_placeholder': {
    en: 'Search by material name, type, supplier…',
    vi: 'Tìm theo tên vật liệu, loại, nhà cung cấp…',
  },
  'printarea.search_placeholder': {
    en: 'Search by SKU or product name…',
    vi: 'Tìm theo SKU hoặc tên sản phẩm…',
  },
  'printarea.optional': { en: 'Optional', vi: 'Tuỳ chọn' },
  'inks.mesh_code': { en: 'Mesh Code', vi: 'Mã lưới' },
  'inks.anilox_code': { en: 'Anilox Code', vi: 'Mã Anilox' },

  // ─── Alt-materials toggle (Sprint S-ALT-MAT, PR #A) ───
  // Two parallel material sets per quote (Main + Alternative); operator
  // picks one to drive cost via the radio toggle in Materials tab header.
  'pricing.materials.toggle.main': { en: 'Maint.Mat', vi: 'Maint.Mat' },
  'pricing.materials.toggle.alt': { en: 'Alternative.Mat', vi: 'Alternative.Mat' },
  'pricing.materials.alt.empty': {
    en: 'No alternative materials yet.',
    vi: 'Chưa có vật liệu thay thế.',
  },
  'pricing.materials.alt.copy_from_main': {
    en: 'Copy from Maint.Mat',
    vi: 'Sao chép từ Maint.Mat',
  },
  'pricing.materials.badge.row_count': { en: '{n}', vi: '{n}' },
  'pricing.materials.copy.tooltip': {
    en: 'Copy materials between Main ↔ Alternative',
    vi: 'Sao chép vật liệu giữa Main ↔ Alternative',
  },
  'pricing.materials.copy.main_to_alt': {
    en: 'Copy Maint.Mat → Alternative.Mat',
    vi: 'Sao chép Maint.Mat → Alternative.Mat',
  },
  'pricing.materials.copy.alt_to_main': {
    en: 'Copy Alternative.Mat → Maint.Mat',
    vi: 'Sao chép Alternative.Mat → Maint.Mat',
  },
  'pricing.materials.copy.confirm_title': {
    en: 'Overwrite materials?',
    vi: 'Ghi đè vật liệu?',
  },
  'pricing.materials.copy.confirm_body': {
    en: '{dest} currently has {count} row(s). Overwrite with {sourceCount} row(s) from {source}?',
    vi: '{dest} đang có {count} dòng. Ghi đè bằng {sourceCount} dòng từ {source}?',
  },
  'pricing.materials.copy.btn_overwrite': { en: 'Overwrite', vi: 'Ghi đè' },
  'pricing.materials.copy.btn_cancel': { en: 'Cancel', vi: 'Hủy' },

  // ─── PR #C — Quote History badge + tier override hint ───
  'pricing.materials.badge.main': { en: 'Main', vi: 'Main' },
  'pricing.materials.badge.alt': { en: 'Alt', vi: 'Alt' },
  'pricing.materials.badge.mixed': {
    en: 'Mixed ({altCount} alt / {mainCount} main)',
    vi: 'Trộn ({altCount} alt / {mainCount} main)',
  },
  'pricing.materials.badge.tooltip': {
    en: 'Which materials set drives this quote’s cost',
    vi: 'Bộ vật tư nào đang driver chi phí báo giá',
  },
  'pricing.materials.tier.alt_override_hint': {
    en: 'Per-tier Setup LM override applies to the ACTIVE material set (currently {set}). Switch the Maint.Mat / Alternative.Mat toggle to edit the other set.',
    vi: 'Setup LM ghi đè theo tier áp dụng vào bộ vật tư ĐANG ACTIVE ({set}). Chuyển toggle Maint.Mat / Alternative.Mat để edit bộ kia.',
  },

  // ─── Sprint S-MULTI-DRAW — FileUploadZone multi-drawing gallery ───
  'fuz.count': { en: '{n} files', vi: '{n} tệp' },
  'fuz.add': { en: 'Add drawing', vi: 'Thêm bản vẽ' },
  'fuz.remove': { en: 'Remove drawing', vi: 'Xoá bản vẽ' },
  'fuz.open_new': { en: 'Open in new window', vi: 'Mở ở cửa sổ mới' },
  'fuz.showing': { en: 'Showing', vi: 'Đang hiện' },
  'fuz.remove_confirm': { en: 'Remove "{name}"?', vi: 'Xoá "{name}"?' },
});
