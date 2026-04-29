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
  // Pricing breakdown columns
  'pricing.tier':         { en: 'Tier',         vi: 'Bậc' },
  'pricing.moq':          { en: 'MOQ',          vi: 'MOQ' },
  'pricing.eau':          { en: 'EAU',          vi: 'EAU' },
  'pricing.sell_price':   { en: 'Sell Price',   vi: 'Giá bán' },
  'pricing.target':       { en: 'Target',       vi: 'Mục tiêu' },
  'pricing.material':     { en: 'Material',     vi: 'Vật liệu' },
  'pricing.ink':          { en: 'Ink',          vi: 'Mực' },
  'pricing.process':      { en: 'Process',      vi: 'Công đoạn' },
  'pricing.pack_ship':    { en: 'Pack & Ship',  vi: 'Đóng gói & VC' },
  'pricing.subtotal':     { en: 'Subtotal',     vi: 'Tổng phụ' },
  'pricing.va_pct':       { en: 'VA%',          vi: 'VA%' },
  'pricing.contr_pct':    { en: 'Contr%',       vi: 'Đóng góp%' },
  'pricing.gm_pct':       { en: 'GM%',          vi: 'GM%' },
  'pricing.selling_unit': { en: 'Selling /unit (USD)', vi: 'Giá bán /sản phẩm (USD)' },

  // Summary box (compact-form labels for narrow columns)
  'pricing.material_short': { en: 'Mat',       vi: 'VL' },
  'pricing.ink_short':      { en: 'Ink',       vi: 'Mực' },
  'pricing.process_short':  { en: 'Proc',      vi: 'CĐ' },
  'pricing.packing_ship':   { en: 'Pack+Ship', vi: 'Đóng gói+VC' },

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
  'inks.mesh_code':     { en: 'Mesh Code',   vi: 'Mã lưới' },
  'inks.anilox_code':   { en: 'Anilox Code', vi: 'Mã Anilox' },
});
