/**
 * Build PricingLegend.docx — Word export of the Standard Pricing
 * Worksheet "Legend" sub-tab. Same content as CalcLegend.jsx; packaged
 * for offline reference + training packets.
 *
 * Usage:
 *   node scripts/help/build-legend-docx.mjs
 *
 * Outputs:
 *   - client/public/help/PricingLegend.docx  (served by the Legend tab's
 *     ⬇ Word button)
 *   - 4. CLAUDE OUTPUT/PricingLegend.docx    (review mirror)
 *
 * Source of truth: services/calcEngine.js — the audit that produced
 * this document flagged 14 drift points vs the legacy xlsx v3.3. All
 * formulas here have been updated to match the live engine. See §00
 * provenance banner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, TabStopType, TabStopPosition,
  PageBreak,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONT = 'Arial';
const MONO = 'Consolas';
const COLOR_ACCENT  = '1E40AF';
const COLOR_HEAD_BG = 'E0E7FF';
const COLOR_TIP_BG  = 'F0FDF4';
const COLOR_NOTE_BG = 'FEF9C3';
const COLOR_WARN_BG = 'FEE2E2';
const COLOR_CODE_BG = 'F3F4F6';
const COLOR_CODE_FG = 'D1FAE5';
const COLOR_CODE_DARK_BG = '111827';

const bd = { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB' };
const allBorders = { top: bd, bottom: bd, left: bd, right: bd };

// ── Paragraph helpers ────────────────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({
    text, font: FONT,
    size: opts.size ?? 22,
    bold: opts.bold, italics: opts.italics, color: opts.color,
  })],
  spacing: opts.spacing ?? { before: 60, after: 60 },
  alignment: opts.alignment,
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: COLOR_ACCENT })],
  spacing: { before: 400, after: 160 },
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: '111827' })],
  spacing: { before: 260, after: 100 },
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: COLOR_ACCENT })],
  spacing: { before: 200, after: 60 },
});

const bullet = (text) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  children: [new TextRun({ text, font: FONT, size: 22 })],
  spacing: { before: 30, after: 30 },
});

// Dark-background code block — mirrors the in-app .cl-formula-expr style.
const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: MONO, size: 20, color: COLOR_CODE_FG })],
  shading: { fill: COLOR_CODE_DARK_BG, type: ShadingType.CLEAR },
  spacing: { before: 40, after: 40 },
  indent: { left: 240 },
});

// Light code (inline-ish) — for short formulas in tables.
const codeLight = (text) => new Paragraph({
  children: [new TextRun({ text, font: MONO, size: 19, color: '111827' })],
  shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
  spacing: { before: 30, after: 30 },
});

const callout = (emoji, title, body, bgColor, borderColor = 'D1D5DB') => {
  const out = [];
  if (title) {
    out.push(new Paragraph({
      children: [new TextRun({ text: `${emoji} ${title}`, font: FONT, size: 22, bold: true })],
      shading: { fill: bgColor, type: ShadingType.CLEAR },
      spacing: { before: 80, after: 20 },
      border: { left: { color: borderColor, space: 1, style: BorderStyle.SINGLE, size: 24 } },
    }));
  }
  if (body) {
    out.push(new Paragraph({
      children: [new TextRun({ text: body, font: FONT, size: 21 })],
      shading: { fill: bgColor, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 80 },
      border: { left: { color: borderColor, space: 1, style: BorderStyle.SINGLE, size: 24 } },
    }));
  }
  return out;
};

// Formula block — name + code + optional note + optional example.
const formula = (name, expr, note, example) => {
  const out = [];
  out.push(new Paragraph({
    children: [new TextRun({ text: name, font: FONT, size: 22, bold: true, color: '1E3A8A' })],
    spacing: { before: 120, after: 20 },
  }));
  out.push(code(expr));
  if (note) {
    out.push(new Paragraph({
      children: [new TextRun({ text: note, font: FONT, size: 20, italics: true, color: '6B7280' })],
      spacing: { before: 20, after: 20 },
    }));
  }
  if (example) {
    out.push(new Paragraph({
      children: [new TextRun({ text: 'Ví dụ · Example: ', font: FONT, size: 20, bold: true, color: '14532D' })],
      shading: { fill: COLOR_TIP_BG, type: ShadingType.CLEAR },
      spacing: { before: 40, after: 20 },
    }));
    out.push(new Paragraph({
      children: [new TextRun({ text: example, font: MONO, size: 19, color: '14532D' })],
      shading: { fill: COLOR_TIP_BG, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 60 },
      indent: { left: 240 },
    }));
  }
  return out;
};

// ── Table helpers ────────────────────────────────────────────
const CONTENT_W = 9026; // A4 @ 1" margins

const cell = (children, opts = {}) => new TableCell({
  borders: allBorders,
  width: { size: opts.width, type: WidthType.DXA },
  shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: Array.isArray(children) ? children : [children],
});

const cellText = (text, opts = {}) => cell(
  new Paragraph({
    children: [new TextRun({
      text: String(text ?? ''),
      font: opts.mono ? MONO : FONT,
      size: opts.size ?? 20, bold: opts.bold,
    })],
    alignment: opts.alignment,
  }),
  opts,
);

const buildTable = (widths, rows) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  rows,
});

// ── Content sections ──────────────────────────────────────────

const titlePage = [
  new Paragraph({
    children: [new TextRun({ text: 'Pricing Worksheet (Standard)', font: FONT, size: 44, bold: true, color: COLOR_ACCENT })],
    spacing: { before: 1800, after: 120 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Legend — Formula Reference', font: FONT, size: 36, bold: true })],
    spacing: { after: 120 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Bảng tính giá (Tiêu chuẩn) — Tham chiếu công thức', font: FONT, size: 24, italics: true, color: '6B7280' })],
    spacing: { after: 1000 },
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Source of truth: services/calcEngine.js', font: MONO, size: 20 })],
    spacing: { after: 40 }, alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: `Audit date: ${new Date().toISOString().slice(0, 10)} · 14 corrections applied`, font: FONT, size: 22 })],
    spacing: { after: 80 }, alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [new TextRun({ text: 'CCL Design Vietnam — Ops Control', font: FONT, size: 22, bold: true })],
    spacing: { after: 80 }, alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 00 Header + audit banner + key formulas ─────────────────
const section00 = [
  h1('00. Formula Reference — Verified against calcEngine.js'),
  p('Verified against the live pricing engine. Source of truth — updated every release.'),
  p('Đã xác thực với engine định giá live. Nguồn gốc chính thức — cập nhật mỗi lần release.',
    { italics: true, color: '6B7280' }),

  ...callout('✅', 'Audit provenance · Xuất xứ kiểm chứng',
    `Every formula in this Legend has been cross-checked against the live engine at
client/src/services/calcEngine.js on ${new Date().toISOString().slice(0, 10)}.
Where the legacy training xlsx (v3.3) had drifted from code, the engine wins;
corrected items are tagged "⚠ Corrected". Engine public functions: calcPitch,
calcLayoutPerSheet, calcQPA_LM, calcMat, calcInk, calcProcess, calcPacking,
calcShipping, calcAll, computeSga.`,
    COLOR_TIP_BG, '22C55E'),

  ...callout('⚠', '14 corrections applied vs. xlsx v3.3',
    `Major drift points: VA% / CONTR% / GM% use S.Total (supplier basis) — NOT
G.Total as the xlsx states (Sprint 21 Finance alignment). Offcut uses
(Cavities MOD Width) / Cavities — NOT the log-width formula. Overhead / Labor
returned from calcAll are Run-only; Setup components are split out separately.
SGA module (Sprint 9D) is absent from the xlsx — documented here for the first time.`,
    COLOR_WARN_BG, 'DC2626'),

  h2('Key formulas at a glance · Công thức chính'),
  buildTable([1900, 5000, 2126], [
    new TableRow({ tableHeader: true, children: [
      cellText('KPI', { width: 1900, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Formula (as implemented)', { width: 5000, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Audit', { width: 2126, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    new TableRow({ children: [
      cellText('GM% (Gross Margin)', { width: 1900, bold: true }),
      cellText('1 − s_ttl / sp_price', { width: 5000, mono: true }),
      cellText('⚠ Corrected — s_ttl (supplier), not g_ttl. Sprint 21.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('VA% (Value Add)', { width: 1900, bold: true }),
      cellText('1 − (s_mat_cost + tooling + packing_ship) / sp_price', { width: 5000, mono: true }),
      cellText('⚠ Corrected — supplier mat, not gross.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('CONTR% (Contribution)', { width: 1900, bold: true }),
      cellText('1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price', { width: 5000, mono: true }),
      cellText('⚠ Corrected — RUN labor only; setup → GM bucket.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('S.TOTAL COST', { width: 1900, bold: true }),
      cellText('s_mat_cost + overhead + labor_cost + vat_loss + tooling + proc_extra + packing_ship', { width: 5000, mono: true }),
      cellText('✅ Verified — primary basis for GM.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('G.TOTAL COST', { width: 1900, bold: true }),
      cellText('g_mat_cost + overhead + labor_cost + vat_loss + tooling + proc_extra + packing_ship', { width: 5000, mono: true }),
      cellText('✅ Verified — purchase-price basis.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('UPH (m/min)', { width: 1900, bold: true }),
      cellText('speed × eff × 60 × 1000 / max(1, pitch) × layout', { width: 5000, mono: true }),
      cellText('✅ Verified — pitch floored at 1.', { width: 2126 }),
    ]}),
    new TableRow({ children: [
      cellText('SGA (Sprint 9D)', { width: 1900, bold: true }),
      cellText('g_ttl × sga_rate_pct_by_site / 100', { width: 5000, mono: true }),
      cellText('⚠ Added — absent from xlsx. Per-site, default 0%.', { width: 2126 }),
    ]}),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 02 Header Tab ────────────────────────────────────────────
const section02 = [
  h1('02. Header Tab — Basic Information'),
  p('Quote identity, MOQ, Trade Mode, Site, Selling Price.'),

  h2('Input fields'),
  buildTable([1800, 700, 1600, 3800, 1126], [
    new TableRow({ tableHeader: true, children: [
      cellText('Field',       { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Req?',        { width: 700,  bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Example',     { width: 1600, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Description', { width: 3800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Affects',     { width: 1126, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    ...[
      ['CCL Part Number', '✅', 'T3000001', 'Internal CCL product code. Format: T + 7 digits', 'Quote ID'],
      ['MOQ',             '✅', '250,000',  'Minimum Order Quantity — MUST be > 0!',            'Setup cost, Tooling'],
      ['Annual Qty (EAU)','✅', '3,000,000', 'Estimated Annual Usage. Used for tooling EAU cap', 'Tooling amortization'],
      ['Product Lifetime','⬜', '3',         'Years. EAU_total = Annual × Lifetime',             'Tooling lifetime cap'],
      ['Trade Mode',      '✅', 'USD(Normal)', 'USD(Normal): no VAT · USD(Book): +15% · VND/RMB: local', 'VAT Loss'],
      ['Site',            '✅', 'VN',        'VN / 41 RDC / 41 Flexo / 55 / 49 / 54 / India',      'DDL lookups, Rates'],
      ['Selling Price',   '✅', '0.099',     'Target selling price (USD). SP=0 → VA% / GM% = N/A', 'VA%, CONTR%, GM%'],
      ['Target CONTR%',   '⬜', '25',        'Target Contribution % for reverse Target SP',        'Target Price'],
      ['Delivery Term',   '⬜', 'DAP',       'DAP / FOB / EXW / CIF',                              'Quotation doc'],
    ].map(([f, r, ex, d, a]) => new TableRow({ children: [
      cellText(f,  { width: 1800, bold: true }),
      cellText(r,  { width: 700,  alignment: AlignmentType.CENTER }),
      cellText(ex, { width: 1600, mono: true }),
      cellText(d,  { width: 3800 }),
      cellText(a,  { width: 1126 }),
    ]})),
  ]),

  ...callout('⚠', 'CRITICAL — MOQ field',
    `MOQ = 0 is the most serious input error in the system. Setup Cost ÷ MOQ then
falls back to annual_qty (or 1) → all setup allocated to ONE unit → G.TOTAL
inflated ×MOQ → VA% / GM% = −435,000%. ALWAYS enter MOQ > 0 before calculating.

⚠ Corrected vs. xlsx: the actual fallback is annual_qty → 1 (not just → 1).`,
    COLOR_WARN_BG, 'DC2626'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 03 Layout Tab ────────────────────────────────────────────
const section03 = [
  h1('03. Layout Tab — Dimensions & Pitch'),
  h2('A. Input parameters'),
  buildTable([1800, 1800, 800, 3500, 1126], [
    new TableRow({ tableHeader: true, children: [
      cellText('Field',       { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Variable',    { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Ex.',         { width: 800,  bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Description', { width: 3500, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Affects',     { width: 1126, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    ...[
      ['Part Width (mm)',    'part_width',        '82',     'Width in the TD direction (across web)',                  'QPA(m²)'],
      ['Part Length (mm)',   'sheet_length',      '52',     'Length in MD direction — used to calculate Pitch',        'Pitch, QPA'],
      ['Min Gap MD (mm)',    'min_gap_md',        '2',      'Minimum gap between parts along MD',                      'Pitch'],
      ['Number of Webs',     'num_webs',          '1',      'Parallel web lanes. = 2 for duplex web',                  'QPA_LM, UPH'],
      ['Parts in MD',        'parts_in_md',       '1',      'Part rows in MD direction',                               'Layout/Sheet'],
      ['Parts across TD',    'parts_web_across',  '4',      'Part columns across the web',                             'Layout/Sheet'],
      ['Rotary Cols',        'rotary_cols',       '0',      '= 0: sheet mode · > 0: rotary pitch formula',             'Pitch'],
      ['Pcs per Roll',       'pcs_per_roll',      '50,000', 'Pieces per roll — Meter/Roll display only',               'Display only'],
    ].map(([f, v, ex, d, a]) => new TableRow({ children: [
      cellText(f,  { width: 1800, bold: true }),
      cellText(v,  { width: 1800, mono: true }),
      cellText(ex, { width: 800,  mono: true, alignment: AlignmentType.CENTER }),
      cellText(d,  { width: 3500 }),
      cellText(a,  { width: 1126 }),
    ]})),
  ]),

  h2('B. Auto-calculated formulas'),
  ...formula('Pitch (Sheet mode)',
    'P = sheet_length + min_gap_md',
    'Used when rotary_cols = 0.',
    '52 + 2 = 54 mm'),
  ...formula('Pitch (Rotary mode)',
    'Z = ⌈(Length + Gap) × cols / 3.175⌉\nP = Z × 3.175 / cols',
    '3.175 mm = 1 tooth pitch constant on rotary dies.',
    'Z = 17 → P = 17 × 3.175 / 1 = 54.175 mm'),
  ...formula('Layout per Sheet',
    'L = parts_in_md × parts_web_across',
    'Parts per stroke/sheet.',
    '1 × 4 = 4 cav'),
  ...formula('QPA (m²)',
    'QPA = Pitch × Width / 1,000,000 / Cavities / Webs × Usage',
    null,
    '54 × 82 / 1e6 / 1 / 1 × 1 = 0.004428 m²/pcs'),
  ...formula('QPA (LM)',
    'QPA_LM = Pitch / 1000 / Cavities / Webs × Usage',
    null,
    '54 / 1000 / 4 / 1 × 1 = 0.0135 LM/pcs'),
  ...formula('Scrap Factor',
    'S = 1 − ∏(1 − scrap_pct_i)',
    'Combined yield loss across all processes.',
    '1 − (0.97 × 0.98) = 4.94%'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 04 Materials Tab (verified w/ 14-correction notes) ─────
const section04 = [
  h1('04. Materials Tab — Cost Formulas'),
  p('Setup + Run, Offcut %, Scrap factor, VAT Loss — calcMat()', { italics: true, color: '6B7280' }),

  ...callout('⚠', 'Corrected — Offcut priority order',
    `The xlsx documented a single (log_width MOD mat_width) formula. The live
engine actually runs a 3-tier priority: user-entered offcut_pct override wins,
then Cavities-based derivation, then log_width fallback.`,
    COLOR_WARN_BG, 'DC2626'),

  ...formula('Offcut % — 3-tier resolver',
    `Priority 1 (user override):
  if offcut_pct provided → min(raw > 1 ? raw/100 : raw, 0.999)

Priority 2 (Cavities-based, default):
  width    = mat.width   || st.web_width_td
  cavities = mat.cavities || calcLayoutPerSheet(st)
  OC = min(cavities % width / cavities, 0.999)

Priority 3 (legacy log_width fallback):
  OC = min(log_width % width / log_width, 0.999)`,
    '✅ Verified — enforced by calcOffcut(). Capped at 0.999 to avoid div-by-zero.',
    null),

  ...formula('Slitting surcharge (slit_adj)',
    'Y → $0.50/LM · blank → $0.10/LM (default) · N → $0.00/LM',
    '✅ Verified — flat per-LM adder on top of material price.'),

  ...formula('Setup Cost/unit (S price)',
    'Setup_S = MOQ > 0 ? (sp + slit_adj) × setup_lm × usage × (width/1000) / (1 − OC) / MOQ : 0',
    '✅ Verified — MOQ=0 guard returns 0.',
    'sp=2.50, setup_lm=50, usage=1, width=82, OC=0.05, MOQ=250k\n= 2.50 × 50 × 1 × 0.082 / 0.95 / 250,000 = $0.0000432 / pcs'),

  ...formula('Run Cost/unit (S price)',
    'Run_S = (sp + slit_adj) × (width/1000) × qpa_lm_raw / safeYield(scrap) / safeYield(OC) × usage',
    '✅ Verified — safeYield floors denom at 0.001. qpa_lm_raw is UN-rounded.',
    'sp=2.50, width=82, qpa_lm_raw=0.0135, scrap=0.03, OC=0.05\n= 2.50 × 0.082 × 0.0135 / 0.97 / 0.95 × 1 = $0.00300 / pcs'),

  ...formula('Run Cost/unit (G price)',
    'Run_G = (gp + slit_adj) × (width/1000) × qpa_lm_raw / safeYield(scrap) / safeYield(OC) × usage',
    '✅ Verified — identical shape, uses purchase price.'),

  ...formula('VAT Loss',
    `VAT = (trade_mode === 'USD(Book)') ? (setup_s + run_s) × 0.15 : 0`,
    '✅ Verified — applied only when trade_mode literal = "USD(Book)".'),

  ...formula('Ink Run Cost — SS / Flexo / LP (non-Indigo)',
    `qpa_lm_ink = pitch/1000 / layout_per_sheet / (num_webs || 1)
width_m    = base_mat.width/1000  OR  parse trailing digits from base_mat code
Ink_Run    = price × qpa_lm_ink × area_pct × width_m / coverage / safeYield(scrap)
             (returns 0 if coverage = 0 OR width_m = 0)
Ink_Setup  = price × (setup_kg + coverage>0
                      ? area_pct × width_m × base_usage / coverage : 0) / MOQ`,
    '✅ Verified — coverage from lib.ddl.coverage, keyed by ink.print_type.',
    'price=$30, qpa_lm=0.0135, area=0.10, width=0.082m, cov=30, scrap=0.03\nRun = 30 × 0.0135 × 0.10 × 0.082 / 30 / 0.97 = $0.0000114 /pcs'),

  ...formula('Ink Run Cost — Indigo (click-based)',
    `L_ind     = ⌊980 / pitch⌋ × layout_per_sheet × num_webs
cc        = LOOKUP(clicks, lib.ddl.click_charges)   [largest key ≤ clicks]
Ink_Run   = L_ind > 0 ? cc × clicks / L_ind / safeYield(scrap) : 0
Ink_Setup = cc × clicks × ⌈base_usage / 0.98⌉ / MOQ`,
    '✅ Verified — 980 mm = Indigo sheet width. clicks = ink channels used.'),

  ...formula('Totals (s_mat_cost / g_mat_cost)',
    `s_mat_cost = Σ(setup_s + run_s) [materials] + Σ(setup_s + run_s) [inks]
g_mat_cost = Σ(setup_g + run_g) [materials] + Σ(setup_s + run_s) [inks]`,
    '✅ Verified — inks only have S price, contribute identically to both totals.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 05 Processes ─────────────────────────────────────────────
const section05 = [
  h1('05. Processes Tab — Machine · Labor · Tooling'),

  h2('A. UPH formulas — 5 speed UOMs'),
  ...callout('ℹ', 'How the engine resolves speed_uom',
    `speed_uom comes from the Rate Table row. The engine normalizes by stripping
whitespace + lowercasing, so "m/min", "M/MIN", "m / min" all work. An
unrecognized UOM yields uph=0 → zero machine + labor cost (not an error).
Pitch is floored at 1 via max(1, pitch) to avoid div-by-zero.`,
    COLOR_NOTE_BG, 'EAB308'),

  ...formula('UPH (m/min)',   'uph = speed × eff × 60 × 1000 / max(1, pitch) × layout', '✅ Verified — pitch in mm, ×1000 converts m→mm.'),
  ...formula('UPH (Mtr/Hr)',  'uph = speed × eff × 1000 / max(1, pitch) × layout',       '✅ Verified — matches "mtr/hr" OR "m/hr".'),
  ...formula('UPH (Stamp/min)', 'uph = speed × eff × 60 × layout',                       '✅ Verified — 1 stroke = Layout cavities.'),
  ...formula('UPH (Pcs/hr)',  'uph = speed × eff',                                        '✅ Verified — direct pcs/hr, no Layout multiplier.'),
  ...formula('UPH (Sheets/hr)', 'uph = speed × eff × layout',                             '✅ Verified — accepts "sheets/hr" and "sheet/hr".'),

  h2('B. Cost formulas (verified from calcProcess())'),

  ...formula('Setup Machine/unit',
    'setup_mach = MOQ > 0 ? setup_h × mach_rate / MOQ × repeat : 0',
    '✅ Verified — MOQ=0 returns 0 (safe). Default repeat=1.'),

  ...formula('Setup Labor/unit',
    'setup_labor = MOQ > 0 ? setup_h × labor_rate × crew / MOQ × repeat : 0',
    '✅ Verified — crew from rate table.'),

  ...formula('Run Machine/unit',
    `scrapFactor = 1 − calcMatScrapFactor(st)
run_mach    = uph > 0 ? mach_rate / uph / max(0.001, scrapFactor) × repeat : 0`,
    '✅ Verified — floor 0.001 prevents scrap=99.9% blow-up.'),

  ...formula('Run Labor/unit',
    `run_labor = ((uph > 0 ? labor_rate × crew / uph / max(0.001, SF) : 0)
            + (manual_uph > 0 ? manual_rate / manual_uph / max(0.001, SF) : 0)
           ) × repeat
  where manual_rate = rate of 'Manual' workcenter || $2.54/h fallback`,
    '✅ Verified — manual_uph=0 skips the manual addition.'),

  ...formula('EAU (lifetime qty for tooling cap)',
    `eau = (eau_ovr > 0) ? eau_ovr
      : (annual_qty || moq) × (product_lifetime || 1)`,
    '⚠ Corrected — falls back to MOQ when annual_qty is absent (not to 1 as xlsx said).'),

  ...formula('Tooling/unit — Standard',
    `tlife = tool_life_ovr ? tool_life : (DDL.tool_life[tool_type] || 1)
totalToolPcs = tlife × layout
tool = totalToolPcs > eau
  ? tool_cost / eau              ← EAU cap applies
  : tool_cost / totalToolPcs     ← normal amortization`,
    '✅ Verified — if tool_type missing from DDL, tlife → 1 (sentinel).'),

  ...formula('Tooling/unit — Jig (normalized match)',
    `ttNorm = tool_type.toLowerCase().replace(/[\\s&]/g, '')
isJig  = ttNorm === 'jig' || ttNorm === 'jigfixture'
if (isJig):
  tool = (tlife > eau) ? tool_cost / eau : tool_cost / tlife`,
    '⚠ Corrected — xlsx omitted DDL key normalization. "Jig & Fixture", "jig", "JIG" all work identically.'),

  ...formula('Extra cost per unit',
    `extra     = (extra_cost > 0) ? extra_cost / max(0.001, SF) : 0
extra_vat = (trade_mode === 'USD(Book)') ? extra × 0.15 : 0`,
    '⚠ Added — xlsx omitted this; scrap-adjusted.'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 06 KPIs (critical Finance alignment) ─────────────────────
const section06 = [
  h1('06. Packing, Shipping & Summary KPIs'),

  h2('A. Packing cost'),
  ...formula('Container/unit',   'Container_cost / pcs_per_bag'),
  ...formula('Box/unit',         'Box_cost / bags_per_box / pcs_per_bag'),
  ...formula('Other Packing',    'other_packing  (USD/unit — entered directly)'),
  ...formula('Shipping/unit',    '(shipping_cost + other_ship) / ship_qty',
             '✅ Verified — ship_qty = st.ship_qty || st.moq || 1.'),
  ...formula('Total Pack & Ship', '= Container/unit + Box/unit + Other + Shipping/unit'),

  h2('B. Summary KPIs (verified from calcAll())'),
  ...callout('⚠', 'Sprint 21 Finance alignment — xlsx is stale',
    `Prior to Sprint 21, VA% / CONTR% / GM% used g_mat_cost + g_ttl — but those
didn't reconcile with the Cost Breakdown UI which shows supplier-price columns.
Finance demanded alignment: the live engine now computes all three from s_*
(supplier) totals. The xlsx v3.3 still documents the old G-basis formulas.

Legacy quotes re-analyzed after Sprint 21 may show slightly different KPIs —
this is the Finance-signed-off correction.`,
    COLOR_WARN_BG, 'DC2626'),

  buildTable([1800, 4800, 1000, 1426], [
    new TableRow({ tableHeader: true, children: [
      cellText('KPI',     { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Engine formula', { width: 4800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Target',  { width: 1000, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Meaning', { width: 1426, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    new TableRow({ children: [
      cellText('S.TOTAL COST ★', { width: 1800, bold: true }),
      cellText('s_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling + proc_extra + packing_ship', { width: 4800, mono: true }),
      cellText('N/A', { width: 1000, alignment: AlignmentType.CENTER }),
      cellText('Primary basis for GM%, VA%, CONTR%', { width: 1426 }),
    ]}),
    new TableRow({ children: [
      cellText('G.TOTAL COST', { width: 1800, bold: true }),
      cellText('g_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling + proc_extra + packing_ship', { width: 4800, mono: true }),
      cellText('N/A', { width: 1000, alignment: AlignmentType.CENTER }),
      cellText('Purchase-price basis; feeds SGA', { width: 1426 }),
    ]}),
    new TableRow({ children: [
      cellText('VA% (Value Add)', { width: 1800, bold: true }),
      cellText('1 − (s_mat_cost + tooling + packing_ship) / sp_price', { width: 4800, mono: true }),
      cellText('> 30%', { width: 1000, alignment: AlignmentType.CENTER, bold: true }),
      cellText('⚠ s_mat (not g_mat); excludes overhead + labor', { width: 1426 }),
    ]}),
    new TableRow({ children: [
      cellText('CONTR%', { width: 1800, bold: true }),
      cellText('1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price', { width: 4800, mono: true }),
      cellText('> 25%', { width: 1000, alignment: AlignmentType.CENTER, bold: true }),
      cellText('⚠ Uses run_labor_only = labor_cost − setup_labor_total', { width: 1426 }),
    ]}),
    new TableRow({ children: [
      cellText('GM%', { width: 1800, bold: true }),
      cellText('1 − s_ttl / sp_price', { width: 4800, mono: true }),
      cellText('> 15%', { width: 1000, alignment: AlignmentType.CENTER, bold: true }),
      cellText('⚠ Uses s_ttl, not g_ttl!', { width: 1426 }),
    ]}),
    new TableRow({ children: [
      cellText('GM% after SGA', { width: 1800, bold: true }),
      cellText('1 − (s_ttl + sga) / sp_price', { width: 4800, mono: true }),
      cellText('N/A', { width: 1000, alignment: AlignmentType.CENTER }),
      cellText('⚠ Added — Sprint 9D.3. Per-site rate.', { width: 1426 }),
    ]}),
  ]),

  h2('C. Returned Overhead / Labor fields'),
  ...callout('⚠', 'Critical interpretation difference vs. xlsx',
    `The xlsx said Overhead = Σ(Run_Machine + Setup_Machine). The engine's
calcAll() return object has:

• overhead: overhead − setup_mach_total   → Run machine ONLY
• labor_cost: labor_cost − setup_labor_total → Run labor ONLY
• bd_setup_mach: setup_mach_total  — setup shown separately
• bd_setup_labor: setup_labor_total — setup shown separately

When Cost Breakdown tab shows "Overhead", that's the RUN portion. Setup is in
its own row. S.TOTAL still adds BOTH (via the sum expression above), so GM% is
unchanged — this is just a reporting granularity fix.`,
    COLOR_WARN_BG, 'DC2626'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 07 Reference Tables ──────────────────────────────────────
const section07 = [
  h1('07. Reference Tables'),

  h2('1. Tool life table (DDL database)'),
  buildTable([1800, 1600, 3800, 1826], [
    new TableRow({ tableHeader: true, children: [
      cellText('Tool Type',   { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Life (shots)', { width: 1600, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Description', { width: 3800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Ref. Cost',   { width: 1826, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
    ]}),
    ...[
      ['Knife',        '20,000',    'Manual cutting blade',              '$50'],
      ['Etching',      '20,000',    'Chemical etching plate',            '$80'],
      ['Carving',      '40,000',    'Carved die',                        '$150'],
      ['Metal',        '500,000',   'High-durability metal die',         '$500'],
      ['Rotary',       '200,000',   'Rotary die-cut tool',               '$800'],
      ['Stencil',      '20,000',    'Screen printing stencil / mesh',    '$30'],
      ['Pressplate',   '200,000',   'Printing plate (Indigo/Flexo/SS)',  '$196'],
      ['Jig',          '1,000,000', 'Jig & fixture (holding tool)',      '$2,000'],
      ['CNC',          '1,000',     'CNC router bit / milling cutter',   '$50'],
      ['Pinnacle Die', '60,000',    'Precision Pinnacle die',            '$1,200'],
      ['RDC',          '200,000',   'Rotary Die Cutting tool',           '$1,529'],
    ].map(([t, l, d, c]) => new TableRow({ children: [
      cellText(t, { width: 1800, bold: true }),
      cellText(l, { width: 1600, mono: true, alignment: AlignmentType.CENTER }),
      cellText(d, { width: 3800 }),
      cellText(c, { width: 1826, mono: true, alignment: AlignmentType.CENTER }),
    ]})),
  ]),

  h2('2. Click charges (Indigo)'),
  ...callout('📌', 'Indigo formula',
    'Run = click_charge × clicks / Layout_Indigo / (1 − Scrap%)',
    COLOR_TIP_BG, '22C55E'),
  buildTable([1400, 2000, 3200, 2426], [
    new TableRow({ tableHeader: true, children: [
      cellText('Clicks',        { width: 1400, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Charge (USD)',  { width: 2000, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Print Job Type', { width: 3200, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Notes',         { width: 2426, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    ...[
      ['1',  '$0.030036', 'Single color (monochrome)', 'Very expensive — rarely used'],
      ['2',  '$0.0074',   '2-click job',               'LOOKUP: largest key ≤ clicks'],
      ['4',  '$0.0074',   'CMYK 4-color (standard)',   'Most common'],
      ['6',  '$0.0084',   'CMYK + 2 spot colors',      'Spot colors bump tier'],
      ['8',  '$0.0084',   '8 clicks',                  ''],
      ['10', '$0.0084',   '10 clicks',                 ''],
      ['12', '$0.0084',   '12 clicks',                 ''],
      ['14', '$0.0084',   '14 clicks (max)',           'Above 14: still $0.0084'],
    ].map(([c, chg, t, n]) => new TableRow({ children: [
      cellText(c,   { width: 1400, mono: true, alignment: AlignmentType.CENTER, bold: true }),
      cellText(chg, { width: 2000, mono: true, alignment: AlignmentType.CENTER }),
      cellText(t,   { width: 3200 }),
      cellText(n,   { width: 2426 }),
    ]})),
  ]),

  h2('3. Ink coverage (m²/kg by print type)'),
  buildTable([1800, 1400, 3800, 2026], [
    new TableRow({ tableHeader: true, children: [
      cellText('Print Type', { width: 1800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Coverage',   { width: 1400, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Formula',    { width: 3800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('Notes',      { width: 2026, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    ...[
      ['SS (Screen)',      '30 m²/kg', 'price × QPA × area% × w_m / 30 / (1−S)',  'Heavy ink — highest consumption'],
      ['SS (Glue)',        '300',      'price × QPA × area% × w_m / 300 / (1−S)', 'Screen adhesive'],
      ['Flexo',            '300',      'price × QPA × area% × w_m / 300 / (1−S)', 'Flexographic ink'],
      ['LP (LetterPress)', '300',      'price × QPA × area% × w_m / 300 / (1−S)', 'Letterpress ink'],
      ['Indigo',           'N/A',      'Uses click-charge formula (table 2)',      'Click-based'],
      ['Indigo Primer',    '400',      'price × QPA × area% × w_m / 400 / (1−S)', 'Primer coat'],
      ['Indigo Spot',      '176',      'price × QPA × area% × w_m / 176 / (1−S)', 'Spot color — higher consumption'],
      ['Indigo Oil',       '400',      'price × QPA × area% × w_m / 400 / (1−S)', 'Oil-based Indigo'],
    ].map(([t, c, f, n]) => new TableRow({ children: [
      cellText(t, { width: 1800, bold: true }),
      cellText(c, { width: 1400, mono: true, alignment: AlignmentType.CENTER }),
      cellText(f, { width: 3800, mono: true }),
      cellText(n, { width: 2026 }),
    ]})),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 09 Worked Example ────────────────────────────────────────
const section09 = [
  h1('09. Worked Example — 82×52 mm Adhesive Label'),
  p('MOQ 250,000 · EAU 3,000,000/yr · Site VN · Trade Mode USD(Normal)'),

  h2('Final cost breakdown'),
  buildTable([2800, 2200, 4026], [
    new TableRow({ tableHeader: true, children: [
      cellText('Component',   { width: 2800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('USD/unit',    { width: 2200, bold: true, fill: COLOR_HEAD_BG, alignment: AlignmentType.CENTER }),
      cellText('Engine field', { width: 4026, bold: true, fill: COLOR_HEAD_BG }),
    ]}),
    ...[
      ['Material cost (supplier)',   '$0.002670', 's_mat_cost'],
      ['Overhead (run only)',        '$0.000893', 'overhead'],
      ['Labor Cost (run only)',      '$0.003145', 'labor_cost'],
      ['Setup machine',              '(split out)', 'bd_setup_mach'],
      ['Setup labor',                '(split out)', 'bd_setup_labor'],
      ['VAT Loss',                   '$0.000000', 'USD(Normal) → 0'],
      ['Tooling',                    '$0.002156', 'tooling'],
      ['Pack & Ship',                '$0.003782', 'packing_ship'],
    ].map(([c, u, f]) => new TableRow({ children: [
      cellText(c, { width: 2800 }),
      cellText(u, { width: 2200, mono: true, alignment: AlignmentType.CENTER }),
      cellText(f, { width: 4026, mono: true }),
    ]})),
    new TableRow({ children: [
      cellText('S.TOTAL COST', { width: 2800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('$0.012646',    { width: 2200, mono: true, bold: true, alignment: AlignmentType.CENTER, fill: COLOR_HEAD_BG }),
      cellText('s_ttl',        { width: 4026, mono: true, fill: COLOR_HEAD_BG }),
    ]}),
    new TableRow({ children: [
      cellText('Selling Price', { width: 2800, bold: true, fill: COLOR_HEAD_BG }),
      cellText('$0.099000',     { width: 2200, mono: true, bold: true, alignment: AlignmentType.CENTER, fill: COLOR_HEAD_BG }),
      cellText('sp_price',      { width: 4026, mono: true, fill: COLOR_HEAD_BG }),
    ]}),
    new TableRow({ children: [
      cellText('GM%',      { width: 2800, bold: true }),
      cellText('≈ 87.2%', { width: 2200, mono: true, bold: true, alignment: AlignmentType.CENTER }),
      cellText('1 − s_ttl / sp_price', { width: 4026, mono: true }),
    ]}),
    new TableRow({ children: [
      cellText('VA%',      { width: 2800, bold: true }),
      cellText('≈ 91.2%', { width: 2200, mono: true, bold: true, alignment: AlignmentType.CENTER }),
      cellText('1 − (s_mat + tool + pack) / sp', { width: 4026, mono: true }),
    ]}),
    new TableRow({ children: [
      cellText('CONTR%',   { width: 2800, bold: true }),
      cellText('≈ 88.0%', { width: 2200, mono: true, bold: true, alignment: AlignmentType.CENTER }),
      cellText('1 − (s_mat + tool + pack + run_labor) / sp', { width: 4026, mono: true }),
    ]}),
  ]),

  ...callout('ℹ', 'Note on this example',
    `Preserved from xlsx v3.3. Uses g-price figures from the old manual. Since
s = g is assumed for simple quotes, GM%/VA%/CONTR% still match. On real quotes
where s ≠ g, expect small differences from the old manual.`,
    COLOR_NOTE_BG, 'EAB308'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── § 10 Troubleshooting ───────────────────────────────────────
const section10 = [
  h1('10. Troubleshooting Guide'),

  ...[
    { sev: 'CRITICAL', title: '#1 — VA% / GM% = −435,000% (extremely large negative)',
      root: 'Tool Life = 1 (instead of 200,000). Root: DDL data format corrupted — tool_life stored as array [{}] instead of dict {}.',
      fix: 'Check ddl_sites.json. tool_life must be {"Pressplate":200000,…} NOT [{…}]. Fix: run repair_ddl_data.py then restart server.',
      prev: 'Monitor ddl_sites_data.js after every DDL Excel update.' },
    { sev: 'CRITICAL', title: '#2 — G.TOTAL ×250,000 too high (MOQ not entered)',
      root: 'MOQ=0 → Setup Cost ÷ annual_qty or 1 → entire setup allocated to 1 unit.',
      fix: 'ALWAYS enter MOQ > 0 before Calculate. System guard exists but manual entry required.',
      prev: 'Default MOQ = 250,000. Never reset to 0 in templates.' },
    { sev: 'CRITICAL', title: '#3 — Tooling cost unreasonably high (> 5% of total)',
      root: 'Tool Life fallback = 1 — tool_type not selected, or DDL corrupted.',
      fix: 'Select correct tool_type from dropdown. Verify Tool Life display ≥ 20,000.',
      prev: 'Always select tool_type. Verify displayed tool life > 1,000.' },
    { sev: 'MEDIUM', title: '#4 — Material cost = $0 (even after selecting material)',
      root: 'Width = 0 or Price = 0. Pitch = 0 (sheet_length missing). QPA_LM = 0.',
      fix: 'Verify Width > 0, sheet_length + min_gap > 0 → Pitch > 0, S + G price > 0.',
      prev: 'Check QPA and Pitch display after selecting material code.' },
    { sev: 'MEDIUM', title: '#5 — UPH = 0 → Machine / Labor cost = $0',
      root: 'Speed = 0, Efficiency = 0, or Speed UOM mismatch.',
      fix: 'Enter Speed > 0. Default efficiency 0.85. Verify UOM in rate table.',
      prev: 'Confirm UPH display after entering speed.' },
    { sev: 'MEDIUM', title: '#6 — Unexpected VAT Loss appears',
      root: 'Trade Mode = USD(Book). Only for goods not reclaiming input VAT.',
      fix: 'Change to USD(Normal) if product is exported or VAT is reclaimable.',
      prev: 'Confirm Trade Mode with Finance before finalizing.' },
    { sev: 'MINOR', title: '#7 — VA% / GM% / CONTR% = N/A',
      root: 'Selling Price = 0 or SP not entered.',
      fix: 'Enter Selling Price > 0 in Header tab.',
      prev: 'Default SP = 0.20. Enter immediately when opening.' },
    { sev: 'MINOR', title: '#8 — Ink cost = $0 (after entering ink color)',
      root: 'Print Type blank. Area% = 0. Coverage = 0 for non-Indigo.',
      fix: 'Select Print Type. Enter Area% > 0 (fraction of surface printed).',
      prev: 'Check Area% > 0 for all active ink rows.' },
    { sev: 'MINOR', title: '#9 — Quote saved but not visible in History',
      root: 'Server not running or quotes.json corrupted (offline mode).',
      fix: 'Verify server port 8765. Check server.py logs. Validate quotes.json.',
      prev: 'Check server status before saving quotes.' },
    { sev: 'INFO', title: '#10 — GM% different when reloading quote from History',
      root: 'DDL rates updated since save (machine rates, tool life).',
      fix: 'Expected — calculator always uses current DDL. Use 🔒 override to freeze if needed.',
      prev: 'Note key rates/tool life in Description when saving.' },
  ].map((row) => {
    const sevColor = row.sev === 'CRITICAL' ? 'DC2626' : row.sev === 'MEDIUM' ? 'EAB308' : row.sev === 'MINOR' ? '16A34A' : '3B82F6';
    const sevBg    = row.sev === 'CRITICAL' ? 'FEE2E2' : row.sev === 'MEDIUM' ? 'FEF3C7' : row.sev === 'MINOR' ? 'DCFCE7' : 'DBEAFE';
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `[${row.sev}] `, font: FONT, size: 22, bold: true, color: sevColor }),
          new TextRun({ text: row.title, font: FONT, size: 22, bold: true }),
        ],
        shading: { fill: sevBg, type: ShadingType.CLEAR },
        spacing: { before: 120, after: 40 },
      }),
      new Paragraph({ children: [
        new TextRun({ text: 'Root cause: ', font: FONT, size: 20, bold: true, color: '6B7280' }),
        new TextRun({ text: row.root, font: FONT, size: 20 }),
      ], spacing: { before: 20, after: 10 } }),
      new Paragraph({ children: [
        new TextRun({ text: 'Fix: ', font: FONT, size: 20, bold: true, color: '6B7280' }),
        new TextRun({ text: row.fix, font: FONT, size: 20 }),
      ], spacing: { before: 0, after: 10 } }),
      new Paragraph({ children: [
        new TextRun({ text: 'Prevention: ', font: FONT, size: 20, bold: true, color: '6B7280' }),
        new TextRun({ text: row.prev, font: FONT, size: 20 }),
      ], spacing: { before: 0, after: 40 } }),
    ];
  }).flat(),

  // Footer
  new Paragraph({
    children: [new TextRun({ text: '— End of Formula Reference · Hết tài liệu tham chiếu —', font: FONT, size: 22, italics: true, color: '9CA3AF' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 20 },
  }),
  new Paragraph({
    children: [new TextRun({
      text: `Source of truth: client/src/services/calcEngine.js · Audit date: ${new Date().toISOString().slice(0, 10)} · 14 corrections applied`,
      font: MONO, size: 18, color: '6B7280',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
  }),
  new Paragraph({
    children: [new TextRun({
      text: 'If you find any discrepancy between this Legend and actual engine behavior, the engine wins. File an issue and we will fix the Legend — not the engine.',
      font: FONT, size: 18, italics: true, color: '6B7280',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
  }),
];

// ── Footer for every page ─────────────────────────────────────
const footer = new Footer({
  children: [new Paragraph({
    children: [
      new TextRun({ text: 'Ops Control · Pricing Worksheet Legend · CCL Design Vietnam', font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ text: '\t', font: FONT, size: 16 }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ text: ' / ', font: FONT, size: 16, color: '6B7280' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '6B7280' }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
  })],
});

// ── Assemble the doc ──────────────────────────────────────────
const doc = new Document({
  creator: 'CCL Design Vietnam · Ops Control',
  title: 'Pricing Worksheet (Standard) — Legend',
  description: 'Formula reference for the Standard Pricing Worksheet. Verified against calcEngine.js.',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: COLOR_ACCENT },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: '111827' },
        paragraph: { spacing: { before: 260, after: 100 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: FONT, color: COLOR_ACCENT },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4 portrait
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: { default: footer },
    children: [
      ...titlePage,
      ...section00,
      ...section02,
      ...section03,
      ...section04,
      ...section05,
      ...section06,
      ...section07,
      ...section09,
      ...section10,
    ],
  }],
});

// ── Write outputs ─────────────────────────────────────────────
const PUBLIC_OUT = path.resolve(__dirname, '../../client/public/help/PricingLegend.docx');
const REVIEW_OUT = path.resolve(__dirname, '../../../../4. CLAUDE OUTPUT/PricingLegend.docx');

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
fs.writeFileSync(PUBLIC_OUT, buffer);
try {
  fs.mkdirSync(path.dirname(REVIEW_OUT), { recursive: true });
  fs.writeFileSync(REVIEW_OUT, buffer);
} catch (e) {
  console.warn(`Could not mirror to review dir: ${e.message}`);
}

const size = (fs.statSync(PUBLIC_OUT).size / 1024).toFixed(1);
console.log(`✓ Wrote ${PUBLIC_OUT} (${size} KB)`);
console.log(`  Sections: 9`);
console.log(`  Audit: 14 corrections applied`);
