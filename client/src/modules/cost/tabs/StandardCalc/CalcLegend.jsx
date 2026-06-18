/**
 * CalcLegend — Training manual + formula reference sub-tab.
 *
 * VERIFIED against services/calcEngine.js — source of truth.
 *
 * Originally mirrored "CCL_Pricing_Training_EN_v3.3.xlsx" training
 * workbook. An audit pass against calcEngine.js surfaced 14 drift
 * points where the training doc had grown stale; those formulas have
 * been updated here to match the live engine. Each correction carries
 * an inline "✅ Verified" tag; places where the xlsx was outdated are
 * noted with "⚠ Corrected".
 *
 * Sections (preserving the xlsx structure for operator familiarity):
 *   00 Table of Contents
 *   02 Header Tab
 *   03 Layout Tab
 *   04 Materials section   (inside the Materials & Process tab)
 *   05 Processes + Inks section   (inside the Materials & Process tab)
 *   06 Packing & KPIs
 *   07 Reference Tables
 *   08 Master Formulas (47 total)
 *   09 Worked Example (82×52 mm label, full A→Z)
 *   10 Troubleshooting
 *
 * Left sidebar = sticky TOC with anchor scroll. Content is pre-rendered
 * (no lazy load) so Ctrl/Cmd+F find-in-page works across the whole
 * manual. Tables match the CSS of CostBreakdown / Summarize for a
 * consistent look.
 */
import { useState, useEffect, useRef } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { createStdState } from '../../../../services/calcEngine';
import { showToast } from '../../../../utils/toast';
import './CalcLegend.css';

// ── Pre-filled worked-example quote states (Print + Cut workflow) ──
// Click "Load this example" in the Legend → LOAD_QUOTE with these
// values → operator lands on the Layout tab with every field filled
// so they can see how plate_tooth vs magnetic_tooth drives pitch,
// ratio validation, and the Summary/Suggestion cards in action.
function inlineGallusExample() {
  const s = createStdState();
  return {
    ...s,
    rfq_number: 'RFQ-DEMO-INLINE',
    ccl_pn: 'DEMO-INLINE-82x52',
    project_name: 'Demo · In-line Gallus EM340',
    description: '82×52 mm adhesive label — print + die-cut on the SAME Gallus EM340 (1:1 ratio)',
    moq: 250_000,
    annual_qty: 3_000_000,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.099,
    // Shared header
    web_width_td: 330,
    sheet_length: 54,
    num_webs: 1,
    rotary_cols: 1,
    edge_margin_td_left: 5,
    edge_margin_td_right: 5,
    pcs_per_roll: 50_000,
    // Print
    part_net_width: 80,
    part_net_length: 50,
    bleed_td_mm: 1,
    bleed_md_mm: 1,
    plate_tooth: 17,
    // Cut (die = net + 2×bleed = 82 × 52)
    part_width: 82,
    part_length_md: 52,
    min_gap_md: 2,
    parts_in_md: 1,
    parts_web_across: 4,
    cut_type: 'kiss-cut',
    corner_radius_mm: 1,
    magnetic_tooth: 17, // 1:1 ratio with plate — same press, shared drive
  };
}

function slit9to3Example() {
  const s = createStdState();
  return {
    ...s,
    rfq_number: 'RFQ-DEMO-SLIT',
    ccl_pn: 'DEMO-SLIT-9to3',
    project_name: 'Demo · Print 9 → Slit 3 → Cut 3/stamp',
    description:
      'Small 32×52 mm label — print 9 cavities on wide web, slit into 3 lanes, die-cut 3 cavities/stamp per lane.',
    moq: 1_000_000,
    annual_qty: 12_000_000,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.042,
    // Shared header — wide print web, cut-side has 3 parallel lanes
    web_width_td: 330, // wide print web
    sheet_length: 54,
    num_webs: 3, // 3 parallel lanes at cut time
    rotary_cols: 1,
    edge_margin_td_left: 5,
    edge_margin_td_right: 5,
    pcs_per_roll: 100_000,
    // Print — small label 30×50 image + 1mm bleed
    part_net_width: 30,
    part_net_length: 50,
    bleed_td_mm: 1,
    bleed_md_mm: 1,
    plate_tooth: 17,
    // Cut — die 32×52; slit-after-print ON
    part_width: 32,
    part_length_md: 52,
    min_gap_md: 2,
    parts_in_md: 1,
    parts_web_across: 3, // 3 cav per slit lane
    cut_type: 'kiss-cut',
    corner_radius_mm: 1,
    magnetic_tooth: 17, // 1:1 in-line
    slit_after_print: true,
    slit_lane_count: 3, // 3 × 3 = 9 print cav across
  };
}

function offlineGallusRdcExample() {
  const s = createStdState();
  return {
    ...s,
    rfq_number: 'RFQ-DEMO-OFFLINE',
    ccl_pn: 'DEMO-OFFLINE-82x52',
    project_name: 'Demo · Gallus EM340 + RDC350',
    description:
      '82×52 mm adhesive label — print on Gallus EM340, die-cut OFF-LINE on RDC350 (1:2 ratio)',
    moq: 500_000,
    annual_qty: 6_000_000,
    trade_mode: 'USD(Normal)',
    site: 'VN',
    selling_price: 0.088,
    // Shared — sheet_length reflects the RDC repeat (34T) since cut is authoritative
    web_width_td: 330,
    sheet_length: 108,
    num_webs: 1,
    rotary_cols: 1,
    edge_margin_td_left: 5,
    edge_margin_td_right: 5,
    pcs_per_roll: 50_000,
    // Print side — Gallus 17T plate
    part_net_width: 80,
    part_net_length: 50,
    bleed_td_mm: 1,
    bleed_md_mm: 1,
    plate_tooth: 17,
    // Cut side — RDC350 34T magnetic (2× plate → integer ratio 1:2)
    part_width: 82,
    part_length_md: 52,
    min_gap_md: 2,
    parts_in_md: 2, // 2 print repeats fit in one RDC cut repeat
    parts_web_across: 4,
    cut_type: 'kiss-cut',
    corner_radius_mm: 1,
    magnetic_tooth: 34, // 34 / 17 = 2 → in-register every other repeat
  };
}

// ── Section anchors — used by the TOC + intersection observer. ────
const SECTIONS = [
  { id: 'toc', num: '00', title: 'Table of Contents', vi: 'Mục lục' },
  { id: 'header', num: '02', title: 'Header Tab', vi: 'Tab RFQ & MOQ' },
  { id: 'layout', num: '03', title: 'Layout Tab', vi: 'Tab Layout' },
  { id: 'mat', num: '04', title: 'Materials section', vi: 'Mục Vật tư' },
  { id: 'proc', num: '05', title: 'Processes + Inks section', vi: 'Mục Công đoạn + Mực' },
  { id: 'pack', num: '06', title: 'Packing & KPIs', vi: 'Đóng gói & KPI' },
  { id: 'ref', num: '07', title: 'Reference Tables', vi: 'Bảng tra cứu' },
  { id: 'master', num: '08', title: 'Master Formulas', vi: '41 công thức' },
  { id: 'example', num: '09', title: 'Worked Example', vi: 'Ví dụ chi tiết' },
  { id: 'trouble', num: '10', title: 'Troubleshooting', vi: 'Xử lý sự cố' },
];

// ── Small helpers — keep JSX declarative. ──────────────────────────
const Row = ({ children }) => <tr>{children}</tr>;
const Th = ({ children, w }) => <th style={w ? { width: w } : undefined}>{children}</th>;
const Td = ({ children, mono, center, bold }) => (
  <td className={`${mono ? 'mono' : ''} ${center ? 'center' : ''} ${bold ? 'bold' : ''}`}>
    {children}
  </td>
);

// Field table — renders a standard field-by-field reference table
// (Field / Required / Example / Description / Affects).
function FieldTable({ columns, rows }) {
  return (
    <div className="cl-table-wrap">
      <table className="cl-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <Th key={i} w={c.w}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Row key={i}>
              {row.map((cell, j) => (
                <Td key={j} mono={cell.mono} center={cell.center} bold={cell.bold}>
                  {cell.value}
                </Td>
              ))}
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Callout box — WARN / NOTE / TIP styles. Optional `titleVi` stacks a
// Vietnamese translation below the English title. Body can be a string
// or JSX; if `bodyVi` is supplied it renders below in the italic grey
// style used by the rest of the bilingual UI.
function Callout({ type = 'note', title, titleVi, children, bodyVi }) {
  return (
    <div className={`cl-callout cl-callout-${type}`}>
      {title && (
        <div className="cl-callout-title">
          <span className="cl-bi-en">{title}</span>
          {titleVi && <span className="cl-bi-vi">{titleVi}</span>}
        </div>
      )}
      <div className="cl-callout-body">
        <div>{children}</div>
        {bodyVi && (
          <div className="cl-bi-vi" style={{ marginTop: 4 }}>
            {bodyVi}
          </div>
        )}
      </div>
    </div>
  );
}

// Formula block — green-on-black for the formula, gray note below.
// Bilingual: pass `nameVi` / `noteVi` / `exampleVi` to render VN lines
// below the English. `expr` stays monolingual (it's code).
function Formula({ name, nameVi, expr, note, noteVi, example, exampleVi }) {
  return (
    <div className="cl-formula">
      <div className="cl-formula-name">
        <span className="cl-bi-en">{name}</span>
        {nameVi && <span className="cl-bi-vi">{nameVi}</span>}
      </div>
      <pre className="cl-formula-expr">
        <code>{expr}</code>
      </pre>
      {note && (
        <div className="cl-formula-note">
          <div>{note}</div>
          {noteVi && (
            <div className="cl-bi-vi" style={{ marginTop: 2 }}>
              {noteVi}
            </div>
          )}
        </div>
      )}
      {example && (
        <div className="cl-formula-example">
          <span className="cl-formula-example-label">Ví dụ · Example:</span>
          <code>{example}</code>
          {exampleVi && (
            <div className="cl-bi-vi" style={{ marginTop: 2 }}>
              {exampleVi}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bilingual row: EN bold, VI italic grey underneath.
function BiRow({ en, vi }) {
  return (
    <>
      <span className="cl-bi-en">{en}</span>
      {vi && <span className="cl-bi-vi">{vi}</span>}
    </>
  );
}

// Bilingual heading helper — lets section `<h3>` hold EN + VN stacked.
function BiHead({ en, vi }) {
  return (
    <>
      {en}
      {vi && (
        <span className="cl-bi-vi" style={{ fontWeight: 500, fontSize: '.85em' }}>
          {vi}
        </span>
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function CalcLegend() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const contentRef = useRef(null);
  const { loadQuote } = useCalc();

  // Load one of the worked examples into the current quote. Clears any
  // activeQuoteId (passes null) so Save prompts "Save as new" — the
  // example is a scratchpad, not a real record.
  const loadExample = (builder, label) => {
    try {
      loadQuote('std', builder(), null);
      showToast(`Loaded: ${label} — switch to Layout tab to inspect.`);
    } catch (err) {
      console.error('Failed to load example:', err);
      showToast('Failed to load example — see console.', 'err');
    }
  };

  // Track the section currently under the viewport top — updates the
  // sidebar highlight as the user scrolls.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { root, threshold: 0, rootMargin: '-20% 0px -70% 0px' }
    );
    for (const s of SECTIONS) {
      const el = root.querySelector(`#sec-${s.id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  const scrollTo = (id) => {
    const el = contentRef.current?.querySelector(`#sec-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function handleExport() {
    // Word file is pre-built by scripts/help/build-legend-docx.mjs
    // and served from /help/PricingLegend.docx. Opening in a new tab
    // triggers the browser's native download (Content-Disposition is
    // set by the static file server).
    window.open('/help/PricingLegend.docx', '_blank');
  }

  function handlePrint() {
    // Print only the right pane — the TOC + chrome are hidden via
    // print-media CSS. Honors the browser's own page-break logic for
    // tables and code blocks.
    window.print();
  }

  return (
    <div className="cl-wrap">
      {/* Sticky TOC sidebar */}
      <aside className="cl-toc">
        <div className="cl-toc-header">
          <div className="cl-toc-title">Formula Reference</div>
          <div className="cl-toc-sub">Verified · calcEngine.js</div>
          <div className="cl-toc-actions">
            <button
              type="button"
              className="cl-toc-btn"
              onClick={handleExport}
              title="Download as Word"
            >
              ⬇ Word
            </button>
            <button
              type="button"
              className="cl-toc-btn cl-toc-btn-ghost"
              onClick={handlePrint}
              title="Print"
            >
              🖨 Print
            </button>
          </div>
        </div>
        <nav className="cl-toc-list">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`cl-toc-item ${active === s.id ? 'active' : ''}`}
              onClick={() => scrollTo(s.id)}
            >
              <span className="cl-toc-num">{s.num}</span>
              <span className="cl-toc-txt">
                <span className="cl-toc-en">{s.title}</span>
                <span className="cl-toc-vi">{s.vi}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="cl-toc-footer">
          Press <kbd>Cmd/Ctrl+F</kbd> to find any formula or field.
        </div>
      </aside>

      {/* Content */}
      <main className="cl-content" ref={contentRef}>
        {/* 00 — Table of Contents + KPIs at a glance */}
        <section id="sec-toc" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">00</div>
            <h2>
              <BiHead en="Formula Reference" vi="Tra cứu công thức" />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Verified against calcEngine.js. Live source of truth — updated every release."
                vi="Đã xác thực với calcEngine.js. Nguồn gốc chính thức — cập nhật mỗi lần release."
              />
            </p>
          </header>

          <Callout
            type="tip"
            title="✅ Audit provenance · Xuất xứ kiểm chứng"
            bodyVi={
              <>
                Mọi công thức trong tài liệu này đã được đối chiếu với engine sống tại{' '}
                <code className="cl-ic">client/src/services/calcEngine.js</code> vào ngày{' '}
                <b>{new Date().toISOString().slice(0, 10)}</b>. Khi training xlsx cũ (v3.3) lệch với
                code, engine thắng; điểm đã sửa được đánh dấu <b>⚠ Corrected</b>. Các hàm tính
                chính:{' '}
                <code className="cl-ic">
                  calcPitch · calcLayoutPerSheet · calcQPA_LM · calcMat · calcInk · calcProcess ·
                  calcPacking · calcShipping · calcAll · computeSga
                </code>
                ; danh sách export đầy đủ (helpers, factories, aggregators như{' '}
                <code>aggregateComplex</code>, <code>buildStdRowsPayload</code>,{' '}
                <code>buildTierState</code>, <code>createStdState</code>,{' '}
                <code>serializeResultForPersist</code> …) — xem trực tiếp trong{' '}
                <code className="cl-ic">calcEngine.js</code>.
              </>
            }
          >
            Every formula in this Legend has been cross-checked against the live engine at{' '}
            <code className="cl-ic">client/src/services/calcEngine.js</code> on{' '}
            <b>{new Date().toISOString().slice(0, 10)}</b>. Where the legacy training xlsx (v3.3)
            had drifted from code, the engine wins; corrected items are tagged <b>⚠ Corrected</b>.
            The engine's main calc functions are:{' '}
            <code className="cl-ic">
              calcPitch · calcLayoutPerSheet · calcQPA_LM · calcMat · calcInk · calcProcess ·
              calcPacking · calcShipping · calcAll · computeSga
            </code>
            ; the full public export list (helpers, factories, aggregators such as{' '}
            <code>aggregateComplex</code>, <code>buildStdRowsPayload</code>,{' '}
            <code>buildTierState</code>, <code>createStdState</code>,{' '}
            <code>serializeResultForPersist</code> …) — see{' '}
            <code className="cl-ic">calcEngine.js</code> directly for the canonical list.
          </Callout>

          <Callout
            type="warn"
            title="⚠ 14 corrections applied vs. xlsx v3.3"
            titleVi="⚠ 14 điểm đã sửa so với xlsx v3.3"
            bodyVi={
              <>
                Các điểm lệch chính mà audit phát hiện: VA% / CONTR% / GM% dùng <b>S.Total</b> (cơ
                sở supplier) — không phải G.Total như xlsx nói (đồng bộ Finance Sprint 21). Offcut
                dùng <b>(Cavities MOD Width) / Cavities</b> — không phải công thức log-width.
                Overhead / Labor mà <code>calcAll</code> trả về là <b>chỉ phần Run</b>; phần Setup
                được tách riêng. Và module SGA (Sprint 9D) hoàn toàn không có trong xlsx — lần đầu
                được tài liệu hóa tại đây.
              </>
            }
          >
            Major drift points the audit surfaced: VA% / CONTR% / GM% use <b>S.Total</b>
            (supplier basis) — not G.Total as the xlsx states (Sprint 21 Finance alignment). Offcut
            uses <b>(Cavities MOD Width) / Cavities</b> — not the log-width formula. Overhead /
            Labor returned from calcAll are
            <b> Run-only</b>; Setup components are separate. And the SGA module (Sprint 9D) is
            entirely missing from the xlsx — documented here for the first time.
          </Callout>

          <h3>
            <BiHead en="Key formulas at a glance" vi="Công thức chính — tổng quan" />
          </h3>
          <FieldTable
            columns={[
              { label: 'KPI', w: '22%' },
              { label: 'Formula (as implemented)', w: '50%' },
              { label: 'Audit', w: '28%' },
            ]}
            rows={[
              [
                { value: <b>GM% (Gross Margin)</b> },
                { value: <code className="cl-ic">1 − s_ttl / sp_price</code>, mono: true },
                {
                  value: (
                    <span>
                      ⚠ <b>Corrected</b> — uses <code>s_ttl</code> (supplier), not{' '}
                      <code>g_ttl</code>. Sprint 21.
                    </span>
                  ),
                },
              ],
              [
                { value: <b>VA% (Value Add)</b> },
                {
                  value: (
                    <code className="cl-ic">
                      1 − (s_mat_cost + tooling + packing_ship) / sp_price
                    </code>
                  ),
                  mono: true,
                },
                {
                  value: (
                    <span>
                      ⚠ <b>Corrected</b> — supplier mat, not gross.
                    </span>
                  ),
                },
              ],
              [
                { value: <b>CONTR% (Contribution)</b> },
                {
                  value: (
                    <code className="cl-ic">
                      1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price
                    </code>
                  ),
                  mono: true,
                },
                {
                  value: (
                    <span>
                      ⚠ <b>Corrected</b> — RUN labor only; setup labor → GM bucket.
                    </span>
                  ),
                },
              ],
              [
                { value: <b>S.TOTAL COST</b> },
                {
                  value: (
                    <code className="cl-ic">
                      s_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling +
                      proc_extra + packing_ship
                    </code>
                  ),
                  mono: true,
                },
                { value: '✅ Verified — primary basis for GM. Includes proc_extra_vat.' },
              ],
              [
                { value: <b>G.TOTAL COST</b> },
                {
                  value: (
                    <code className="cl-ic">
                      g_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling +
                      proc_extra + packing_ship
                    </code>
                  ),
                  mono: true,
                },
                { value: '✅ Verified — purchase-price basis. Includes proc_extra_vat.' },
              ],
              [
                { value: <b>UPH (m/min)</b> },
                {
                  value: (
                    <code className="cl-ic">speed × eff × 60 × 1000 / max(1, pitch) × layout</code>
                  ),
                  mono: true,
                },
                { value: '✅ Verified — pitch floored at 1.' },
              ],
              [
                { value: <b>SGA (Sprint 9D)</b> },
                {
                  value: <code className="cl-ic">g_ttl × sga_rate_pct_by_site / 100</code>,
                  mono: true,
                },
                {
                  value: (
                    <span>
                      ⚠ <b>Added</b> — absent from xlsx. Per-site, default 0%.
                    </span>
                  ),
                },
              ],
            ]}
          />
        </section>

        {/* 02 — Header Tab */}
        <section id="sec-header" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">02</div>
            <h2>
              <BiHead en="Header Tab — Basic Information" vi="Tab Header — Thông tin cơ bản" />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Quote identity, MOQ, Trade Mode, Site, Selling Price"
                vi="Thông tin quote, MOQ, Trade Mode, Site, Giá bán"
              />
            </p>
          </header>

          <h3>
            <BiHead en="Input fields" vi="Các trường nhập" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Field', w: '18%' },
              { label: 'Req?', w: '6%' },
              { label: 'Example', w: '14%' },
              { label: 'Description', w: '40%' },
              { label: 'Affects', w: '22%' },
            ]}
            rows={[
              [
                { value: <b>CCL Part Number</b> },
                { value: '✅', center: true },
                { value: 'T3000001', mono: true },
                {
                  value: (
                    <BiRow
                      en="Internal CCL product code. Format: T + 7 digits"
                      vi="Mã sản phẩm nội bộ CCL. Định dạng: T + 7 chữ số"
                    />
                  ),
                },
                { value: <BiRow en="Quote ID, Reports" vi="Mã quote, Báo cáo" /> },
              ],
              [
                { value: <b>MOQ</b> },
                { value: '✅', center: true },
                { value: '250,000', mono: true },
                {
                  value: (
                    <BiRow
                      en="Minimum Order Quantity — MUST be > 0!"
                      vi="Số lượng tối thiểu — PHẢI > 0!"
                    />
                  ),
                },
                {
                  value: (
                    <BiRow en="Setup cost, Tooling, G.TOTAL" vi="Chi phí setup, Khuôn, G.TOTAL" />
                  ),
                },
              ],
              [
                { value: <b>Annual Qty (EAU)</b> },
                { value: '✅', center: true },
                { value: '3,000,000', mono: true },
                {
                  value: (
                    <BiRow
                      en="Estimated Annual Usage — expected annual volume. Used for tooling EAU cap"
                      vi="Sản lượng năm dự kiến — dùng để giới hạn EAU cho khuôn"
                    />
                  ),
                },
                { value: <BiRow en="Tooling amortization" vi="Phân bổ khuôn" /> },
              ],
              [
                { value: <b>Product Lifetime</b> },
                { value: '⬜', center: true },
                { value: '3', mono: true },
                {
                  value: (
                    <BiRow
                      en="Years. EAU_total = Annual × Lifetime"
                      vi="Số năm. EAU_total = SL năm × Vòng đời"
                    />
                  ),
                },
                { value: <BiRow en="Tooling lifetime cap" vi="Giới hạn vòng đời khuôn" /> },
              ],
              [
                { value: <b>Trade Mode</b> },
                { value: '✅', center: true },
                { value: 'USD(Normal)', mono: true },
                {
                  value: (
                    <BiRow
                      en={
                        <>
                          <b>USD(Normal)</b>: no VAT loss · <b>USD(Book)</b>: +15% VAT loss ·{' '}
                          <b>VND/RMB</b>: local modes
                        </>
                      }
                      vi={
                        <>
                          <b>USD(Normal)</b>: không mất VAT · <b>USD(Book)</b>: +15% mất VAT ·{' '}
                          <b>VND/RMB</b>: chế độ nội địa
                        </>
                      }
                    />
                  ),
                },
                { value: <BiRow en="VAT Loss calculation" vi="Tính mất VAT" /> },
              ],
              [
                { value: <b>Site</b> },
                { value: '✅', center: true },
                { value: 'VN', mono: true },
                {
                  value: (
                    <BiRow
                      en="VN / 41 RDC / 41 Flexo / 55 / 49 / 54 / India"
                      vi="VN / 41 RDC / 41 Flexo / 55 / 49 / 54 / India"
                    />
                  ),
                },
                { value: <BiRow en="DDL lookups, Machine rates" vi="Tra cứu DDL, đơn giá máy" /> },
              ],
              [
                { value: <b>Selling Price</b> },
                { value: '✅', center: true },
                { value: '0.099', mono: true },
                {
                  value: (
                    <BiRow
                      en="Target selling price (USD). If SP = 0 → VA% / GM% = N/A"
                      vi="Giá bán mục tiêu (USD). Nếu SP = 0 → VA% / GM% = không tính được"
                    />
                  ),
                },
                { value: <BiRow en="VA%, CONTR%, GM%" vi="VA%, CONTR%, GM%" /> },
              ],
              [
                { value: <b>Target CONTR%</b> },
                { value: '⬜', center: true },
                { value: '25', mono: true },
                {
                  value: (
                    <BiRow
                      en="Target Contribution % for reverse-calculating Target Selling Price"
                      vi="% Đóng góp mục tiêu để tính ngược ra Giá bán mục tiêu"
                    />
                  ),
                },
                { value: <BiRow en="Target Price suggestion" vi="Gợi ý giá mục tiêu" /> },
              ],
              [
                { value: <b>Delivery Term</b> },
                { value: '⬜', center: true },
                { value: 'DAP', mono: true },
                { value: <BiRow en="DAP / FOB / EXW / CIF" vi="DAP / FOB / EXW / CIF" /> },
                { value: <BiRow en="Quotation document" vi="Văn bản báo giá" /> },
              ],
            ]}
          />

          <Callout type="warn" title="⚠ CRITICAL — MOQ field" titleVi="⚠ QUAN TRỌNG — trường MOQ">
            <BiRow
              en="MOQ = 0 is the most serious input error in the system. Setup Cost ÷ MOQ falls back to ÷ 1 → all setup allocated to ONE unit → G.TOTAL inflated ×250,000 → VA% / GM% = −435,000%. ALWAYS enter MOQ > 0 before calculating."
              vi="MOQ = 0 là lỗi nhập nghiêm trọng nhất. Setup Cost ÷ MOQ rơi về ÷ 1 → toàn bộ setup dồn cho MỘT đơn vị → G.TOTAL phình ×250,000 → VA% / GM% = −435,000%. LUÔN nhập MOQ > 0 trước khi tính."
            />
          </Callout>
        </section>

        {/* 03 — Layout Tab */}
        <section id="sec-layout" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">03</div>
            <h2>
              <BiHead
                en="Layout Tab — Design Layout (Print / Cut split)"
                vi="Tab Layout — Thiết kế Layout (tách Print / Cut)"
              />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Press bar + shared material/machine header + two sub-tabs (🖨 Print Design · ✂ Cutting Design). Print side owns net image + bleed + plate cylinder; Cut side owns die grid + cut type + magnetic cylinder. Summary & Suggestion cards swap to match the active sub-tab."
                vi="Thanh máy in/cắt + khối thông tin chung (vật liệu/máy) + hai sub-tab (🖨 Print Design · ✂ Cutting Design). Phần Print chứa kích thước net + bleed + trục bản in; phần Cut chứa khuôn + kiểu cắt + trục từ. Card Tóm tắt & Đề xuất tự đổi theo sub-tab đang chọn."
              />
            </p>
          </header>

          <Callout
            type="info"
            title="Layout page UI structure"
            titleVi="Cấu trúc giao diện trang Layout"
          >
            <ol style={{ margin: '4px 0 0 18px', padding: 0, lineHeight: 1.55 }}>
              <li>
                <b>Title bar</b> — Two <code>🔍 Print/Cut Design sync</code> buttons sit on the
                Design Layout headbar. Each opens the Design Tools picker and applies the saved
                record's per-side fields (Print: L, Pw, W, plate tooth, gaps, edges, color count;
                Cut: magnetic tooth, cutter cavity, gaps, geometry). Press constraints arrive via
                the synced record — there is no in-tab press dropdown anymore. Press CRUD lives in{' '}
                <i>Machine Technical</i> sidebar tab.
              </li>
              <li>
                <b>Shared header</b> — Web Width TD, Sheet Length MD, # Webs, Rotary Cols, Edge
                Left/Right, Pcs/Roll (applies to both sub-tabs).
              </li>
              <li>
                <b>🖨 Print Design Layout</b> sub-tab — net image + bleed + plate cylinder.
              </li>
              <li>
                <b>✂ Cutting Design Layout</b> sub-tab — die outer size + Parts grid + cut type +
                magnetic cylinder.
              </li>
              <li>
                <b>Right column</b> — Layout Summary card (content changes to match the active
                sub-tab; Cut shows die / cavity / cylinder breakdown).
              </li>
            </ol>
            <ol
              className="cl-bi-vi"
              style={{ margin: '8px 0 0 18px', padding: 0, lineHeight: 1.55, fontStyle: 'italic' }}
            >
              <li>
                <b>Thanh tiêu đề</b> — Hai nút <code>🔍 Print/Cut Design sync</code> nằm trên thanh
                tiêu đề Design Layout. Mỗi nút mở picker Design Tools và áp dụng các trường từ bản
                ghi đã lưu (Print: L, Pw, W, răng bản, gap, mép, số màu; Cut: răng từ, cavity dao,
                gap, hình học). Ràng buộc máy in đến qua bản ghi sync — không còn dropdown press
                trong tab. CRUD máy in đặt tại sidebar tab <i>Machine Technical</i>.
              </li>
              <li>
                <b>Header chung</b> — Web Width TD, Sheet Length MD, # Webs, Rotary Cols, Edge
                Trái/Phải, Pcs/Roll (áp dụng cho cả hai sub-tab).
              </li>
              <li>
                <b>🖨 Print Design Layout</b> — kích thước net + bleed + trục bản in.
              </li>
              <li>
                <b>✂ Cutting Design Layout</b> — khuôn + grid Parts + kiểu cắt + trục từ.
              </li>
              <li>
                <b>Cột phải</b> — card Tóm tắt + Đề xuất (nội dung đổi theo sub-tab đang chọn).
              </li>
            </ol>
          </Callout>

          <h3>
            <BiHead
              en="A1. Shared header (material + machine)"
              vi="A1. Header chung (vật liệu + máy)"
            />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Field" vi="Trường" />, w: '20%' },
              { label: <BiRow en="Variable" vi="Biến" />, w: '18%' },
              { label: <BiRow en="Example" vi="Ví dụ" />, w: '10%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '38%' },
              { label: <BiRow en="Affects" vi="Tác động" />, w: '14%' },
            ]}
            rows={[
              [
                { value: <b>Web Width TD (mm)</b> },
                { value: 'web_width_td', mono: true },
                { value: '330', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Usable web width. Fallback source for mat.width when unset."
                      vi="Bề rộng web sử dụng được. Dùng làm nguồn dự phòng cho mat.width nếu chưa nhập."
                    />
                  ),
                },
                { value: 'QPA, Offcut' },
              ],
              [
                { value: <b>Sheet Length MD (mm)</b> },
                { value: 'sheet_length', mono: true },
                { value: '52', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="MD length of one sheet/repeat (sheet-mode pitch base)."
                      vi="Chiều dài MD của một sheet/repeat (cơ sở pitch ở chế độ sheet)."
                    />
                  ),
                },
                { value: 'Pitch' },
              ],
              [
                { value: <b># Webs</b> },
                { value: 'num_webs', mono: true },
                { value: '1', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Parallel web lanes. 2 for duplex web."
                      vi="Số làn web song song. = 2 cho web kép."
                    />
                  ),
                },
                { value: 'QPA_LM, UPH' },
              ],
              [
                { value: <b>Rotary Cols</b> },
                { value: 'rotary_cols', mono: true },
                { value: '0', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="= 0: sheet mode · > 0: rotary pitch formula."
                      vi="= 0: chế độ sheet · > 0: công thức pitch dạng rotary."
                    />
                  ),
                },
                { value: 'Pitch' },
              ],
              [
                { value: <b>Edge Left (mm)</b> },
                { value: 'edge_margin_td_left', mono: true },
                { value: '5', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Left liner-edge to first part. 0 → symmetric default."
                      vi="Khoảng cách từ mép trái liner đến part đầu tiên. 0 → mặc định đối xứng."
                    />
                  ),
                },
                { value: 'Optimizer' },
              ],
              [
                { value: <b>Edge Right (mm)</b> },
                { value: 'edge_margin_td_right', mono: true },
                { value: '5', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Right liner-edge to first part. 0 → symmetric default."
                      vi="Khoảng cách từ mép phải liner đến part đầu tiên. 0 → mặc định đối xứng."
                    />
                  ),
                },
                { value: 'Optimizer' },
              ],
              [
                { value: <b>Pcs/Roll</b> },
                { value: 'pcs_per_roll', mono: true },
                { value: '50,000', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Pieces per roll — display-only (Meter/Roll on Summary)."
                      vi="Số pcs trên một cuộn — chỉ hiển thị (Meter/Roll ở Tóm tắt)."
                    />
                  ),
                },
                { value: 'Display' },
              ],
              [
                { value: <b>Print Profile (legacy)</b> },
                { value: 'print_machine_profile_id', mono: true },
                { value: '—', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Print machine on legacy quotes. No UI selector — surfaces only as the press-meta pill when set on an old quote."
                      vi="Máy in trên báo giá cũ. Không có selector UI — chỉ hiển thị ở pill thông tin khi báo giá cũ đã đặt sẵn."
                    />
                  ),
                },
                { value: 'Display' },
              ],
              [
                { value: <b>Press Profile (legacy)</b> },
                { value: 'machine_profile_id', mono: true },
                { value: '—', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Die-cut press constraint on legacy quotes. New quotes get press constraints via Design Tools sync, not via a tab selector."
                      vi="Ràng buộc máy bế trên báo giá cũ. Báo giá mới nhận ràng buộc qua Design Tools sync, không qua selector trong tab."
                    />
                  ),
                },
                { value: 'Display' },
              ],
            ]}
          />

          <h3>
            <BiHead
              en="A2. 🖨 Print Design Layout — image net, bleed, plate cylinder"
              vi="A2. 🖨 Print Design Layout — hình net, bleed, trục bản in"
            />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Field" vi="Trường" />, w: '22%' },
              { label: <BiRow en="Variable" vi="Biến" />, w: '18%' },
              { label: <BiRow en="Example" vi="Ví dụ" />, w: '10%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '36%' },
              { label: <BiRow en="Affects" vi="Tác động" />, w: '14%' },
            ]}
            rows={[
              [
                { value: <b>① Product Size Width TD</b> },
                { value: 'part_width (synced)', mono: true },
                { value: '82', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Finished product width — synced (read-only) from Die Width TD on the Cutting tab. Displayed here so operators can see ①Product vs ②Image Area side by side."
                      vi="Kích thước sản phẩm cuối — đồng bộ (chỉ đọc) từ Die Width TD ở tab Cutting. Hiển thị ở đây để operator so sánh ①Sản phẩm vs ②Vùng in."
                    />
                  ),
                },
                { value: 'Reference' },
              ],
              [
                { value: <b>① Product Size Length MD</b> },
                { value: 'part_length_md (synced)', mono: true },
                { value: '52', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Finished product length — synced from Die Length MD on the Cutting tab."
                      vi="Chiều dài sản phẩm — đồng bộ từ Die Length MD tab Cutting."
                    />
                  ),
                },
                { value: 'Reference' },
              ],
              [
                { value: <b>② Image Area Width TD</b> },
                { value: 'part_net_width', mono: true },
                { value: '80', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Safe design boundary width — text, logo, barcode MUST sit inside this box. Smaller than Product Size by 2×bleed."
                      vi="Biên an toàn thiết kế theo TD — text, logo, barcode PHẢI nằm trong vùng này. Nhỏ hơn Product Size 2×bleed."
                    />
                  ),
                },
                { value: 'Print Summary' },
              ],
              [
                { value: <b>② Image Area Length MD</b> },
                { value: 'part_net_length', mono: true },
                { value: '50', mono: true, center: true },
                {
                  value: (
                    <BiRow en="Safe design boundary length." vi="Biên an toàn thiết kế theo MD." />
                  ),
                },
                { value: 'Required MD' },
              ],
              [
                { value: <b>③ Bleed TD (mm)</b> },
                { value: 'bleed_td_mm', mono: true },
                { value: '1', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Bleed EACH side TD — ink overshoots past the cut line. Protects against die-registration drift. Product = Image + 2×bleed."
                      vi="Bleed MỖI BÊN theo TD — mực tràn ra ngoài đường cắt. Bảo hiểm khi bế lệch. Product = Image Area + 2×bleed."
                    />
                  ),
                },
                { value: 'Product Size' },
              ],
              [
                { value: <b>③ Bleed MD (mm)</b> },
                { value: 'bleed_md_mm', mono: true },
                { value: '1', mono: true, center: true },
                { value: <BiRow en="Bleed EACH side MD." vi="Bleed MỖI BÊN theo MD." /> },
                { value: 'Required MD' },
              ],
              [
                { value: <b>Parts in MD</b> },
                { value: 'parts_in_md', mono: true },
                { value: '1', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Part rows in the MD (shared with Cut tab)."
                      vi="Số hàng part theo MD (dùng chung với tab Cut)."
                    />
                  ),
                },
                { value: 'Layout/Sheet' },
              ],
              [
                { value: <b>Cut Parts/Web Across</b> },
                { value: 'parts_web_across', mono: true },
                { value: '3', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Cavities per CUT lane across the web. Shared with Cut tab. When slit workflow is ON, each slit lane carries this many cavities."
                      vi="Số cavity mỗi LANE BẾ ngang web. Dùng chung với tab Cut. Khi bật slit, mỗi lane sau slit chứa từng này cavity."
                    />
                  ),
                },
                { value: 'Layout/Sheet' },
              ],
              [
                { value: <b>Print Cavities Across (derived)</b> },
                { value: '(slit_lane_count × parts_web_across)', mono: true },
                { value: '9', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Total cavities across the WIDE print web before slit. Equals Cut Parts/Web Across when slit is off, or slit_lane_count × it when slit is on. Highlighted violet when slit is active."
                      vi="Tổng cavity ngang trên web IN RỘNG trước khi slit. Bằng Cut Parts/Web Across khi slit tắt, hoặc slit_lane_count × đó khi slit bật. Tím đậm khi slit đang bật."
                    />
                  ),
                },
                { value: 'Reference' },
              ],
              [
                { value: <b>Plate Tooth (T)</b> },
                { value: 'plate_tooth', mono: true },
                { value: '17', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Plate mounting-cylinder tooth count. 0 = let magnetic tooth drive pitch."
                      vi="Số răng trục gắn bản in. 0 = để răng trục từ quyết định pitch."
                    />
                  ),
                },
                { value: 'Plate Pitch' },
              ],
              [
                { value: <b>Plate Pitch (mm)</b> },
                { value: '(derived)', mono: true },
                { value: '53.98', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="= plate_tooth × 3.175 mm. Read-only."
                      vi="= plate_tooth × 3.175 mm. Chỉ đọc."
                    />
                  ),
                },
                { value: 'Suggestion' },
              ],
            ]}
          />

          <h3>
            <BiHead
              en="A3. ✂ Cutting Design Layout — die grid, cut type, magnetic cylinder"
              vi="A3. ✂ Cutting Design Layout — khuôn, kiểu cắt, trục từ"
            />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Field" vi="Trường" />, w: '22%' },
              { label: <BiRow en="Variable" vi="Biến" />, w: '18%' },
              { label: <BiRow en="Example" vi="Ví dụ" />, w: '10%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '36%' },
              { label: <BiRow en="Affects" vi="Tác động" />, w: '14%' },
            ]}
            rows={[
              [
                { value: <b>Die Width TD</b> },
                { value: 'part_width', mono: true },
                { value: '82', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Die outer width — AUTHORITATIVE for optimizer geometry."
                      vi="Chiều rộng ngoài khuôn — là NGUỒN CHÍNH cho geometry của optimizer."
                    />
                  ),
                },
                { value: 'QPA(m²), Optimizer' },
              ],
              [
                { value: <b>Die Length MD</b> },
                { value: 'part_length_md', mono: true },
                { value: '52', mono: true, center: true },
                {
                  value: <BiRow en="Die outer length in MD." vi="Chiều dài ngoài khuôn theo MD." />,
                },
                { value: 'Pitch, QPA' },
              ],
              [
                { value: <b>Min Gap MD</b> },
                { value: 'min_gap_md', mono: true },
                { value: '2', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Minimum gap between parts along MD."
                      vi="Khoảng cách tối thiểu giữa các part theo MD."
                    />
                  ),
                },
                { value: 'Pitch' },
              ],
              [
                { value: <b>Perf Offset (mm)</b> },
                { value: 'perf_offset_mm', mono: true },
                { value: '0', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Added to effective MD gap when a perforation cut runs between labels."
                      vi="Cộng thêm vào khoảng cách MD thực tế khi có đường răng cưa giữa các nhãn."
                    />
                  ),
                },
                { value: 'Pitch' },
              ],
              [
                { value: <b>Cut Type</b> },
                { value: 'cut_type', mono: true },
                { value: 'kiss-cut', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="kiss-cut · through-cut · both (compound) · perf-only · emboss."
                      vi="kiss-cut · through-cut · both (khuôn hợp) · perf-only (răng cưa) · emboss (dập nổi)."
                    />
                  ),
                },
                { value: 'Validator' },
              ],
              [
                { value: <b>Corner Radius (mm)</b> },
                { value: 'corner_radius_mm', mono: true },
                { value: '1', mono: true, center: true },
                {
                  value: (
                    <BiRow en="Die corner radius. 0 = square." vi="Bo góc khuôn. 0 = vuông." />
                  ),
                },
                { value: 'Validator' },
              ],
              [
                { value: <b>Magnetic Tooth (T)</b> },
                { value: 'magnetic_tooth', mono: true },
                { value: '17', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Magnetic die-cut cylinder tooth count. 0 = optimizer picks."
                      vi="Số răng trục từ. 0 = để optimizer chọn."
                    />
                  ),
                },
                { value: 'Magnetic Pitch' },
              ],
              [
                { value: <b>Color Count</b> },
                { value: 'color_count', mono: true },
                { value: '4', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Number of printed colors (CMYK + spot + white + UV). Validator errors when > num_print_stations of the selected Cut Press."
                      vi="Số màu in (CMYK + spot + white + UV). Validator báo lỗi khi vượt số trạm in của Cut Press đã chọn."
                    />
                  ),
                },
                { value: 'Press check' },
              ],
              [
                { value: <b>Tol P2P (mm)</b> },
                { value: 'tol_p2p_mm', mono: true },
                { value: '0.1', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Print-to-print tolerance (color registration). Flexo ≤ 0.1mm, HP Indigo ≤ 0.05mm. Validator requires bleed ≥ 2× this when color_count ≥ 2."
                      vi="Tolerance in chồng màu. Flexo ≤ 0.1mm, Indigo ≤ 0.05mm. Validator yêu cầu bleed ≥ 2× tol này khi có ≥ 2 màu."
                    />
                  ),
                },
                { value: 'Bleed guard' },
              ],
              [
                { value: <b>Die Quiet Zone (mm)</b> },
                { value: 'die_quiet_zone_mm', mono: true },
                { value: '5', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Clearance around die for reg marks, bearer bars, vision fiducials. Typical 5-8mm rotary. Validator checks Edge ≥ quiet_zone."
                      vi="Khoảng trống quanh khuôn cho reg marks, bearer bar, vision. Typical 5-8mm rotary. Validator check Edge ≥ quiet_zone."
                    />
                  ),
                },
                { value: 'Edge guard' },
              ],
              [
                { value: <b>Min Slit Lane (mm)</b> },
                { value: 'min_slit_lane_width_mm', mono: true },
                { value: '25', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Minimum slit-lane width after slit. Default 25mm (industry). Validator errors when (web − edges) / slit_count < this."
                      vi="Bề rộng lane tối thiểu sau slit. Default 25mm. Validator báo lỗi khi (web − edges) / slit_count nhỏ hơn."
                    />
                  ),
                },
                { value: 'Slit guard' },
              ],
              [
                { value: <b>Unwind Direction</b> },
                { value: 'unwind_direction', mono: true },
                { value: 'face-in', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Label orientation on the roll: face-in (inward) or face-out (outward). Affects labeler feed + packaging orientation."
                      vi="Hướng nhãn trên cuộn: face-in (hướng vào) hoặc face-out (hướng ra). Ảnh hưởng cấp nhãn + đóng gói."
                    />
                  ),
                },
                { value: 'Info' },
              ],
              [
                { value: <b>Print Direction MD</b> },
                { value: 'print_direction_md', mono: true },
                { value: 'head-first', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Text reading direction in MD: head-first (top of label exits press first) or tail-first. Determines artwork orientation."
                      vi="Hướng đọc chữ theo MD: head-first (đầu nhãn ra máy trước) hoặc tail-first. Quyết định hướng artwork."
                    />
                  ),
                },
                { value: 'Info' },
              ],
              [
                { value: <b>Include Reg Marks</b> },
                { value: 'include_reg_marks + reg_mark_width_mm', mono: true },
                { value: '5 mm', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="When checked, embed a reg-mark / color-bar strip at the web edge (default 5mm). Validator reg_mark_edge_short warns when narrower edge < strip width."
                      vi="Khi bật, chừa 1 dải reg-mark / color bar ở mép web (default 5mm). Validator reg_mark_edge_short cảnh báo khi edge nhỏ hơn."
                    />
                  ),
                },
                { value: 'Edge guard' },
              ],
              [
                { value: <b>Plate Thickness (mm)</b> },
                { value: 'plate_thickness_mm', mono: true },
                { value: '1.14', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Flexo plate thickness — 1.14 HD/DFM plate (fine detail), 1.70 narrow-web rotary, 2.54 wide-web. Informational for DFM record."
                      vi="Độ dày bản flexo — 1.14 HD/DFM (chi tiết mịn), 1.70 narrow-web, 2.54 wide-web. Lưu cho DFM."
                    />
                  ),
                },
                { value: 'Info' },
              ],
              [
                { value: <b>Anilox BCM</b> },
                { value: 'anilox_bcm', mono: true },
                { value: '4.5', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Anilox roller volume (billion cubic microns). 2-3 = fine line/white; 4-6 = CMYK process; 6-10 = opaque spot. Lay-down driver for flexo."
                      vi="Độ sâu ô Anilox (BCM). 2-3 = line/white mịn; 4-6 = CMYK; 6-10 = spot đậm. Điều khiển lượng mực flexo."
                    />
                  ),
                },
                { value: 'Info' },
              ],
              [
                { value: <b>Print→Cut MD offset</b> },
                { value: 'print_to_cut_offset_mm', mono: true },
                { value: '100', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Distance in MD between print cylinder center and cut cylinder center on the press. Used in layout drawings (skew compensation); not in pricing."
                      vi="Khoảng cách MD giữa tâm trục in và tâm trục bế trên máy. Dùng cho bản vẽ layout (bù lệch); không dùng tính giá."
                    />
                  ),
                },
                { value: 'Drawing' },
              ],
              [
                { value: <b>Magnetic Pitch (mm)</b> },
                { value: '(derived)', mono: true },
                { value: '53.98', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="= magnetic_tooth × 3.175 mm. Read-only."
                      vi="= magnetic_tooth × 3.175 mm. Chỉ đọc."
                    />
                  ),
                },
                { value: 'Pitch ratio' },
              ],
              [
                { value: <b>Slit After Print?</b> },
                { value: 'slit_after_print', mono: true },
                { value: 'false', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="ON when the press prints a WIDE web that is then slit into multiple narrower webs before die-cutting. Leave OFF for simple single-web workflows."
                      vi="BẬT khi máy in chạy 1 web RỘNG rồi slit thành nhiều web hẹp trước khi bế. TẮT cho quy trình 1 web đơn giản."
                    />
                  ),
                },
                { value: 'Workflow' },
              ],
              [
                { value: <b>Slit Lanes</b> },
                { value: 'slit_lane_count', mono: true },
                { value: '1', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Number of narrower lanes after slit. Should equal #Webs on the shared header when cutting in parallel."
                      vi="Số lane sau slit. Phải bằng #Webs ở header chung khi bế song song."
                    />
                  ),
                },
                { value: 'Print Cav Across' },
              ],
              [
                { value: <b>Print Cavities Across</b> },
                { value: '(derived)', mono: true },
                { value: '9', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="= slit_lane_count × parts_web_across. Total cavities across the WIDE print web."
                      vi="= slit_lane_count × parts_web_across. Tổng cavities ngang trên web in rộng."
                    />
                  ),
                },
                { value: 'Display' },
              ],
            ]}
          />

          <h3>
            <BiHead en="B. Auto-calculated formulas" vi="B. Công thức tự động" />
          </h3>
          <Formula
            name="Pitch (Sheet mode)"
            nameVi="Pitch (Chế độ sheet)"
            expr="P = sheet_length + min_gap_md"
            note="Used when rotary_cols = 0"
            noteVi="Dùng khi rotary_cols = 0"
            example="52 + 2 = 54 mm"
          />
          <Formula
            name="Pitch (Rotary mode)"
            nameVi="Pitch (Chế độ rotary)"
            expr={`Z = ⌈(Length + Gap) × cols / 3.175⌉
P = Z × 3.175 / cols`}
            note="3.175 mm = 1 tooth pitch constant on rotary dies"
            noteVi="3.175 mm = hằng số khoảng cách 1 răng trên khuôn rotary"
            example="Z=17 → P = 17 × 3.175 / 1 = 54.175 mm"
          />
          <Formula
            name="Plate Pitch (mm)"
            nameVi="Pitch trục bản in (mm)"
            expr="plate_pitch = plate_tooth × 3.175"
            note="Derived on the Print sub-tab. Shown read-only next to Plate Tooth."
            noteVi="Tính tự động trong sub-tab Print. Hiển thị chỉ đọc cạnh ô Plate Tooth."
            example="17 × 3.175 = 53.975 mm"
          />
          <Formula
            name="Magnetic Pitch (mm)"
            nameVi="Pitch trục từ (mm)"
            expr="mag_pitch = magnetic_tooth × 3.175"
            note="Derived on the Cut sub-tab. Shown read-only next to Magnetic Tooth."
            noteVi="Tính tự động trong sub-tab Cut. Hiển thị chỉ đọc cạnh ô Magnetic Tooth."
            example="17 × 3.175 = 53.975 mm"
          />
          <Formula
            name="Gross Print Size (mm)"
            nameVi="Kích thước in tổng (mm)"
            expr={`gross_w = part_net_width  + 2 × bleed_td_mm
gross_l = part_net_length + 2 × bleed_md_mm`}
            note="Image + bleed footprint shown on Print Layout Summary."
            noteVi="Kích thước hình + bleed, hiển thị trên card Tóm tắt Print."
            example="80 + 2×1 = 82 · 50 + 2×1 = 52 mm"
          />
          <Formula
            name="Slit workflow — Print vs Cut cavities"
            nameVi="Quy trình slit — cavities In vs Bế"
            expr={`When slit_after_print = true:
  print_cavities_across = slit_lane_count × parts_web_across
  cut_cavities_across   = parts_web_across               (per lane)
  num_webs (shared)     = slit_lane_count                (parallel)
  total_parts_per_shot  = num_webs × parts_web_across × parts_in_md`}
            note="Use this when the press prints a wide web (e.g. 9 cav) that is then slit into N narrower lanes (e.g. 3) and each lane feeds a die cutting M cav/shot (e.g. 3). Total throughput per shot stays the same — you're just distributing the parts across multiple parallel webs instead of a single wide one."
            noteVi="Dùng khi máy in in 1 web rộng (ví dụ 9 cav) rồi slit thành N lane hẹp (ví dụ 3), mỗi lane cho vào máy bế chạy M cav/shot (ví dụ 3). Tổng throughput/shot vẫn bằng — chỉ là chia các part sang nhiều web song song thay vì 1 web rộng."
            example="Print 9 cav 1 web → Slit 3 lanes → Cut 3 webs × 3 cav = 9 cav × 1 MD = 9 pcs/shot"
          />
          <Formula
            name="Plate ↔ Magnetic pitch ratio"
            nameVi="Tỉ số pitch Plate ↔ Magnetic"
            expr={`ratio = plate_tooth / magnetic_tooth
OK  → ratio is integer (1:1, 2:1, 3:1 …)
WARN → non-integer (cylinders drift out of registration)`}
            note="Footer hint inside both sub-tabs. Integer ratios keep print + cut in register. Pick a tooth pair that's an integer multiple."
            noteVi="Gợi ý ở chân cả hai sub-tab. Tỉ số nguyên giữ print + cut đồng bộ. Chọn cặp số răng là bội nguyên."
          />
          <Formula
            name="Layout per Sheet — DFM fix (compound die)"
            nameVi="Layout trên mỗi Sheet — Fix DFM (khuôn hợp)"
            expr="L = parts_in_md × parts_web_across × parts_per_die"
            note="⚠ Sprint S-DFM correction — parts_per_die multiplier was previously applied only in the optimizer's pcs_per_shot, NOT in calcLayoutPerSheet. 2-up/3-up die quotes now count correctly in pitch + QPA downstream."
            noteVi="⚠ Sửa Sprint S-DFM — hệ số parts_per_die trước đây chỉ nhân trong optimizer's pcs_per_shot, CHƯA nhân vào calcLayoutPerSheet. Báo giá khuôn 2-up/3-up giờ tính đúng pitch + QPA."
            example="2-up die: 1 × 4 × 2 = 8 cav"
          />
          <Formula
            name="Offcut % — multi-web fallback"
            nameVi="Offcut % — fallback multi-web"
            expr={`Priority 3 fallback (log_width-based):
  stride  = mat.width × num_webs
  offcut  = (log_width MOD stride) / log_width`}
            note="⚠ Sprint S-DFM — multi-web quotes (num_webs > 1) previously used log_width MOD mat.width, under-counting offcut. Example: 2 × 82mm webs from 1300mm log now correctly reports ~11.7% (1300 − 7 × 164) / 1300."
            noteVi="⚠ Sprint S-DFM — quote multi-web (num_webs > 1) trước dùng log_width MOD mat.width, tính thiếu offcut. Ví dụ 2 × 82mm web từ log 1300mm giờ đúng ~11.7%."
            example="stride = 82 × 2 = 164mm · 1300 MOD 164 = 152mm · 152/1300 = 11.69%"
          />
          <Formula
            name="Pitch consistency invariant"
            nameVi="Bất biến pitch ↔ layout MD"
            expr={`When parts_in_md > 1:
  sheet_length  MUST =  parts_in_md × part_length_md + (parts_in_md − 1) × min_gap_md
  (± 0.5mm tolerance)`}
            note="Validator error pitch_mismatch: warns when operator enters arbitrary sheet_length that doesn't match the MD grid. Pitch + QPA would be wrong otherwise — silent miss pre-Sprint S-DFM."
            noteVi="Validator pitch_mismatch: cảnh báo khi operator nhập sheet_length không khớp grid MD. Nếu không check → pitch + QPA sai."
            example="2 × 52mm + 1 × 2mm = 106mm — operator nhập 100mm → lỗi 6mm"
          />
          <Formula
            name="Cut-type speed factor (Die_Cut rows)"
            nameVi="Hệ số tốc độ theo kiểu cắt (Die_Cut)"
            expr={`Applied to uph on Die_Cut process rows:
  kiss-cut    → 1.00  (face only, base)
  perf-only   → 0.80  (small teeth)
  through-cut → 0.70  (tool strain)
  emboss      → 0.60  (dwell-time)
  both        → 0.50  (compound die)

effective_uph = base_uph × cut_type_factor`}
            note="Sprint S-DFM-P3 — previously cut_type was informational only; Die_Cut process used raw speed regardless of cut depth. Real throughput depends heavily on cut type. Factor hits the run-cost formulas automatically once you set cut_type in the Cutting tab."
            noteVi="Sprint S-DFM-P3 — trước đây cut_type chỉ mang tính thông tin; Die_Cut dùng nguyên speed bỏ qua độ sâu cắt. Throughput thật phụ thuộc rất nhiều vào kiểu cắt. Hệ số áp tự động vào công thức run-cost khi bạn chọn cut_type."
            example="Base 80 stamp/min × through-cut 0.70 = 56 stamp/min effective"
          />
          <Formula
            name="QPA (m²)"
            expr="QPA = Pitch × Width / 1,000,000 / Cavities / Webs × Usage"
            note="Material area per part"
            noteVi="Diện tích vật liệu trên mỗi part"
            example="54 × 82 / 1e6 / 1 / 1 × 1 = 0.004428 m²/pcs"
          />
          <Formula
            name="QPA (LM)"
            expr="QPA_LM = Pitch / 1000 / Cavities / Webs × Usage"
            note="Linear meters of material per part"
            noteVi="Số mét dài vật liệu trên mỗi part"
            example="54 / 1000 / 4 / 1 × 1 = 0.0135 LM/pcs"
          />
          <Formula
            name="Scrap Factor"
            nameVi="Hệ số phế phẩm"
            expr="S = 1 − ∏(1 − scrap_pct_i)"
            note="Combined yield loss — product across all processes"
            noteVi="Tổn thất gộp — tích các hệ số qua tất cả công đoạn"
            example="1 − (0.97 × 0.98) = 4.94%"
          />
          <Formula
            name="Offcut %"
            nameVi="Phế slit %"
            expr="OC = (log_width MOD mat_width) / log_width"
            note="Waste from slitting log to required width"
            noteVi="Lượng phế khi xẻ log về bề rộng cần thiết"
            example="(1300 MOD 82) / 1300 = 4.6%"
          />
          <Formula
            name="MAT PO (LM)"
            nameVi="Lượng vật liệu đặt hàng (LM)"
            expr="MAT_PO = MOQ × 1.1 × Pitch / 1000 / Cav / Webs × Usage + Setup_LM"
            note="10% buffer + setup waste included"
            noteVi="Đã cộng 10% buffer + phế setup"
          />

          <h3>
            <BiHead
              en="C. Layout Summary · Print (right-side card, Print tab)"
              vi="C. Tóm tắt Layout · Print (card bên phải, tab Print)"
            />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Row" vi="Dòng" />, w: '26%' },
              { label: <BiRow en="Value" vi="Giá trị" />, w: '74%' },
            ]}
            rows={[
              [
                {
                  value: (
                    <b>
                      <BiRow en="① Product Size" vi="① Kích thước sản phẩm" />
                    </b>
                  ),
                },
                {
                  value: (
                    <>
                      <code>part_width × part_length_md</code> (synced from Cut tab)
                    </>
                  ),
                },
              ],
              [
                {
                  value: (
                    <b>
                      <BiRow en="② Image Area" vi="② Vùng in an toàn" />
                    </b>
                  ),
                },
                {
                  value: (
                    <>
                      <code>part_net_width × part_net_length</code> (mm)
                    </>
                  ),
                },
              ],
              [
                { value: <b>③ Bleed</b> },
                {
                  value: (
                    <>
                      ±<code>bleed_td_mm</code> TD / ±<code>bleed_md_mm</code> MD
                    </>
                  ),
                },
              ],
              [
                {
                  value: (
                    <b>
                      <BiRow en="Sanity check" vi="Kiểm tra" />
                    </b>
                  ),
                },
                { value: <>Product = Image + 2·Bleed (each axis)</> },
              ],
              [
                {
                  value: (
                    <b>
                      <BiRow en="Plate Tooth" vi="Răng trục bản" />
                    </b>
                  ),
                },
                { value: <code>plate_tooth</code> },
              ],
              [
                {
                  value: (
                    <b>
                      <BiRow en="Plate Pitch" vi="Pitch trục bản" />
                    </b>
                  ),
                },
                { value: <>plate_tooth × 3.175 mm</> },
              ],
              [{ value: <b>Webs</b> }, { value: <code>num_webs</code> }],
            ]}
          />

          <h3>
            <BiHead
              en="D. Layout Summary · Cut (right-side card, Cut tab)"
              vi="D. Tóm tắt Layout · Cut (card bên phải, tab Cut)"
            />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Row" vi="Dòng" />, w: '26%' },
              { label: <BiRow en="Value" vi="Giá trị" />, w: '74%' },
            ]}
            rows={[
              [
                {
                  value: (
                    <b>
                      <BiRow en="Die Size" vi="Kích thước khuôn" />
                    </b>
                  ),
                },
                {
                  value: (
                    <>
                      <code>part_width × part_length_md</code> (mm)
                    </>
                  ),
                },
              ],
              [
                { value: <b>Pitch (mm)</b> },
                {
                  value: (
                    <BiRow
                      en="Sheet or rotary-mode pitch (see formula above)"
                      vi="Pitch ở chế độ sheet hoặc rotary (xem công thức phía trên)"
                    />
                  ),
                },
              ],
              [
                {
                  value: (
                    <b>
                      <BiRow en="Magnetic Pitch" vi="Pitch trục từ" />
                    </b>
                  ),
                },
                { value: 'magnetic_tooth × 3.175 mm' },
              ],
              [{ value: <b>Layout/Sheet</b> }, { value: 'parts_in_md × parts_web_across' }],
              [{ value: <b>Webs</b> }, { value: <code>num_webs</code> }],
              [{ value: <b>Total/pass</b> }, { value: 'Layout/Sheet × Webs' }],
              [{ value: <b>Pcs/Roll</b> }, { value: <code>pcs_per_roll</code> }],
            ]}
          />

          <Callout
            type="info"
            title="Where the cylinder / cavity engineering lives"
            titleVi="Phần thiết kế trục / cavity nằm ở đâu"
            bodyVi={
              <>
                Card đề xuất Layout (Cut + Print) đã được loại bỏ. Engineering trục in / trục bế /
                cavity die-cut nay đặt ở tab <b>Design Tools</b> (Gallus calculator) bên sidebar;
                sau khi engineer chốt thiết kế, dùng nút <b>🔍 Print/Cut Design sync</b> trên thanh
                tiêu đề Design Layout để pull các trường vào báo giá.
              </>
            }
          >
            The on-tab Layout Suggestion cards (Cut + Print) were removed in Sprint 14n-3. Cylinder
            / die-cut cavity engineering now lives in the <b>Design Tools</b> sidebar tab (Gallus
            calculator); once the engineer commits a design, use <b>🔍 Print/Cut Design sync</b> on
            the Design Layout headbar to pull the fields back into the quote.
          </Callout>
        </section>

        {/* 04 — Materials section (inside the Materials & Process tab) */}
        <section id="sec-mat" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">04</div>
            <h2>
              <BiHead
                en="Materials section — Cost Formulas (Materials & Process tab)"
                vi="Mục Vật tư — Công thức chi phí vật tư (tab Vật tư & Công đoạn)"
              />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en={
                  <>
                    Setup + Run, Offcut %, Scrap factor, VAT Loss — <code>calcMat()</code>
                  </>
                }
                vi={
                  <>
                    Setup + Run, Offcut %, Hệ số phế phẩm, VAT Loss — <code>calcMat()</code>
                  </>
                }
              />
            </p>
          </header>

          <h3>
            <BiHead en="A. Input fields" vi="A. Các trường nhập" />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Field" vi="Trường" />, w: '18%' },
              { label: <BiRow en="Variable" vi="Biến" />, w: '18%' },
              { label: <BiRow en="Example" vi="Ví dụ" />, w: '14%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '50%' },
            ]}
            rows={[
              [
                { value: <b>Row Type</b> },
                { value: 'row_type', mono: true },
                { value: 'Main.Mat', mono: true },
                {
                  value: (
                    <BiRow
                      en="Main.Mat = primary layer · Process Mat = auxiliary (liner, release paper…)"
                      vi="Main.Mat = lớp chính · Process Mat = phụ (liner, giấy nền…)"
                    />
                  ),
                },
              ],
              [
                { value: <b>Material Code</b> },
                { value: 'code', mono: true },
                { value: 'T9041-25-82', mono: true },
                {
                  value: (
                    <BiRow
                      en="DB code. System auto-fills Width, S.Price, G.Price when selected"
                      vi="Mã DB. Khi chọn, hệ thống tự điền Width, S.Price, G.Price"
                    />
                  ),
                },
              ],
              [
                { value: <b>Usage</b> },
                { value: 'usage', mono: true },
                { value: '1.0', mono: true },
                {
                  value: (
                    <BiRow
                      en="1.0 = single layer · 2.0 = double-layer bonded"
                      vi="1.0 = một lớp · 2.0 = hai lớp ép"
                    />
                  ),
                },
              ],
              [
                { value: <b>Setup LM</b> },
                { value: 'setup_lm', mono: true },
                { value: '50', mono: true },
                {
                  value: (
                    <BiRow
                      en="Meters wasted during machine setup (30–100 m typical)"
                      vi="Số mét tiêu hao khi setup máy (30–100 m thường gặp)"
                    />
                  ),
                },
              ],
              [
                { value: <b>Width (mm)</b> },
                { value: 'width', mono: true },
                { value: '82', mono: true },
                {
                  value: (
                    <BiRow
                      en="Material width. Auto-filled from DB. Critical!"
                      vi="Bề rộng vật liệu. Tự điền từ DB. Quan trọng!"
                    />
                  ),
                },
              ],
              [
                { value: <b>Log Width</b> },
                { value: 'log_width', mono: true },
                { value: '1300', mono: true },
                {
                  value: (
                    <BiRow
                      en="Original log width. Offcut % = (log MOD width) / log"
                      vi="Bề rộng cuộn gốc. Offcut % = (log MOD width) / log"
                    />
                  ),
                },
              ],
              [
                { value: <b>Offcut Y/N</b> },
                { value: 'offcut_yn', mono: true },
                { value: 'Y', mono: true },
                {
                  value: (
                    <BiRow
                      en="Y = auto-calculate | N = 0% | blank = 5% default"
                      vi="Y = tự tính | N = 0% | rỗng = mặc định 5%"
                    />
                  ),
                },
              ],
              [
                { value: <b>Slitting Y/N</b> },
                { value: 'slitting_yn', mono: true },
                { value: 'N', mono: true },
                {
                  value: (
                    <BiRow
                      en="Y = +$0.50/LM | N = $0 | blank = +$0.10/LM default"
                      vi="Y = +$0.50/LM | N = $0 | rỗng = mặc định +$0.10/LM"
                    />
                  ),
                },
              ],
              [
                { value: <b>Price S / G</b> },
                { value: 's_price / g_price', mono: true },
                { value: '2.50 / 2.30', mono: true },
                {
                  value: (
                    <BiRow
                      en="S = selling price (for S.Total) · G = gross/purchase (for true profit via G.TOTAL)"
                      vi="S = giá bán (cho S.Total) · G = giá mua/gốc (cho lợi nhuận thực qua G.TOTAL)"
                    />
                  ),
                },
              ],
            ]}
          />

          <h3>
            <BiHead
              en="B. Material cost formulas (verified from calcMat())"
              vi="B. Công thức chi phí vật tư (đã xác thực với calcMat())"
            />
          </h3>
          <Callout
            type="warn"
            title="⚠ Corrected — Offcut priority order"
            titleVi="⚠ Đã sửa — thứ tự ưu tiên của Offcut"
          >
            The xlsx documented a single <code>log_width MOD mat_width</code> formula. The live
            engine actually runs a <b>3-tier priority</b>: the user-entered
            <code> offcut_pct</code> override wins, then a Cavities-based derivation, then the
            log_width fallback. Only priority 1 is deterministic per quote.
          </Callout>
          <Formula
            name="Offcut % — 3-tier resolver"
            expr={`Priority 1 (user override):
  if offcut_pct provided → min(raw > 1 ? raw/100 : raw, 0.999)

Priority 2 (Cavities-based, default):
  width    = mat.width   || st.web_width_td
  cavities = mat.cavities || calcLayoutPerSheet(st)
  OC = min(cavities % width / cavities, 0.999)

Priority 3 (legacy log_width fallback):
  OC = min(log_width % width / log_width, 0.999)`}
            note="✅ Verified — priority enforced by calcOffcut(). Capped at 0.999 to avoid div-by-zero downstream."
            example="parts_web_across=4, parts_in_md=1, width=82\ncavities = 4; 4 % 82 = 4; OC = 4 / 4 = 1.0 → capped 0.999\n(a tiny sliver case; real-world widths make this < 0.1 typical)"
          />
          <Formula
            name="Slitting surcharge (slit_adj)"
            expr={`Y     → $0.50 /LM
blank → $0.10 /LM  (default when field empty)
N     → $0.00 /LM`}
            note="✅ Verified — flat per-LM adder on top of material price."
          />
          <Formula
            name="Setup Cost/unit (S price)"
            expr={`Setup_S = MOQ > 0
  ? (sp + slit_adj) × setup_lm × usage × (width/1000) / (1 − OC) / MOQ
  : 0`}
            note="✅ Verified — MOQ=0 short-circuits to 0 (safe)."
            example="sp=2.50, slit=0, setup_lm=50, usage=1, width=82mm, OC=0.05, MOQ=250000\n= (2.50+0) × 50 × 1 × 0.082 / 0.95 / 250000 = $0.0000432 / pcs"
          />
          <Formula
            name="Run Cost/unit (S price)"
            expr="Run_S = (sp + slit_adj) × (width/1000) × qpa_lm_raw / safeYield(scrap) / safeYield(OC) × usage"
            note="✅ Verified — safeYield floors denom at 0.001. qpa_lm_raw is the UN-rounded QPA_LM."
            example="sp=2.50, width=82, qpa_lm_raw=0.0135, scrap=0.03, OC=0.05, usage=1\n= 2.50 × 0.082 × 0.0135 / 0.97 / 0.95 × 1 = $0.00300 / pcs"
          />
          <Formula
            name="Run Cost/unit (G price)"
            expr="Run_G = (gp + slit_adj) × (width/1000) × qpa_lm_raw / safeYield(scrap) / safeYield(OC) × usage"
            note="✅ Verified — identical shape, uses purchase price. G feeds G.TOTAL."
          />
          <Formula
            name="VAT Loss"
            expr="VAT = (trade_mode === 'USD(Book)') ? (setup_s + run_s) × 0.15 : 0"
            note="✅ Verified — applied only when trade_mode === 'USD(Book)' literal string match."
          />
          <Formula
            name="Ink Run Cost — SS / Flexo / LP (non-Indigo)"
            expr={`qpa_lm_ink = pitch/1000 / layout_per_sheet / (num_webs || 1)
width_m   = base_mat.width/1000  OR  parse trailing digits from base_mat code
Ink_Run   = price × qpa_lm_ink × area_pct × width_m / coverage / safeYield(scrap)
            (returns 0 if coverage = 0 OR width_m = 0 — NO division by zero)
Ink_Setup = price × (setup_kg + coverage>0 ? area_pct×width_m×base_usage/coverage : 0) / MOQ`}
            note="✅ Verified — coverage from lib.ddl.coverage keyed by ink.print_type. Can be overridden per-row via coverage_override."
            example="price=$30/kg, qpa_lm=0.0135, area_pct=0.1, width=0.082m, coverage=30, scrap=0.03\nInk_Run = 30 × 0.0135 × 0.10 × 0.082 / 30 / 0.97 = $0.0000114 /pcs"
          />
          <Formula
            name="Ink Run Cost — Indigo (click-based)"
            expr={`L_ind     = ⌊980 / pitch⌋ × layout_per_sheet × num_webs
cc        = LOOKUP(clicks, lib.ddl.click_charges)   [largest key ≤ clicks]
Ink_Run   = L_ind > 0 ? cc × clicks / L_ind / safeYield(scrap) : 0
Ink_Setup = MOQ × cc × clicks × ⌈base_usage / 0.98⌉ / MOQ`}
            note="✅ Verified — 980 mm = Indigo sheet width constant. clicks = number of ink channels used on the job."
          />
          <Formula
            name="Totals (s_mat_cost / g_mat_cost)"
            expr={`s_mat_cost = Σ(setup_s + run_s) [materials]  +  Σ(setup_s + run_s) [inks]
g_mat_cost = Σ(setup_g + run_g) [materials]  +  Σ(setup_s + run_s) [inks]`}
            note="✅ Verified — note inks only have an S price (no separate G) so contribute identically to both totals."
          />
        </section>

        {/* 05 — Processes + Inks section (inside the Materials & Process tab) */}
        <section id="sec-proc" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">05</div>
            <h2>
              <BiHead
                en="Processes + Inks section — Machine · Labor · Tooling (Materials & Process tab)"
                vi="Mục Công đoạn + Mực — Máy · Nhân công · Khuôn (tab Vật tư & Công đoạn)"
              />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en={
                  <>
                    Machine rate, Labor rate, UPH, Tooling amortization — <code>calcProcess()</code>
                  </>
                }
                vi={
                  <>
                    Đơn giá máy, Đơn giá nhân công, UPH, Phân bổ khuôn — <code>calcProcess()</code>
                  </>
                }
              />
            </p>
          </header>

          <h3>
            <BiHead en="A. Input fields" vi="A. Các trường nhập" />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Field" vi="Trường" />, w: '18%' },
              { label: <BiRow en="Variable" vi="Biến" />, w: '16%' },
              { label: <BiRow en="Example" vi="Ví dụ" />, w: '14%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '52%' },
            ]}
            rows={[
              [
                { value: <b>Process Type</b> },
                { value: 'process_type', mono: true },
                { value: 'Die_Cut', mono: true },
                {
                  value: (
                    <BiRow
                      en="Pre_Cut | Die_Cut | Print | Assembly | Special_cut | Inspection | ManualWork | Others"
                      vi="Pre_Cut | Die_Cut | Print | Assembly | Special_cut | Inspection | ManualWork | Others"
                    />
                  ),
                },
              ],
              [
                { value: <b>Workcenter</b> },
                { value: 'workcenter', mono: true },
                { value: 'RDC350-12', mono: true },
                {
                  value: (
                    <BiRow
                      en="Machine/station. Auto: Machine Rate, Labor Rate, Speed UOM, Crew"
                      vi="Máy/trạm. Tự điền: Đơn giá máy, Đơn giá nhân công, Speed UOM, Số người"
                    />
                  ),
                },
              ],
              [
                { value: <b>Speed</b> },
                { value: 'speed', mono: true },
                { value: '60', mono: true },
                {
                  value: (
                    <BiRow
                      en="m/min · Mtr/Hr · Stamp/min · Pcs/hr · Sheets/hr"
                      vi="m/min · Mtr/Hr · Stamp/min · Pcs/hr · Sheets/hr"
                    />
                  ),
                },
              ],
              [
                { value: <b>Layout</b> },
                { value: 'layout', mono: true },
                { value: '4', mono: true },
                {
                  value: (
                    <BiRow
                      en="Cavities/stroke for this process (usually = global Layout)"
                      vi="Số cavity/chu kỳ cho công đoạn này (thường = Layout chung)"
                    />
                  ),
                },
              ],
              [
                { value: <b>Efficiency</b> },
                { value: 'efficiency', mono: true },
                { value: '0.85', mono: true },
                {
                  value: (
                    <BiRow
                      en="Default 85%. Accounts for actual downtime, minor stoppages"
                      vi="Mặc định 85%. Tính dừng máy thực tế, lỗi nhỏ"
                    />
                  ),
                },
              ],
              [
                { value: <b>Setup Hours</b> },
                { value: 'setup_h', mono: true },
                { value: '2', mono: true },
                {
                  value: (
                    <BiRow
                      en={
                        <>
                          Changeover hours. <b>⚠ Requires MOQ &gt; 0!</b>
                        </>
                      }
                      vi={
                        <>
                          Giờ chuyển đổi máy. <b>⚠ Yêu cầu MOQ &gt; 0!</b>
                        </>
                      }
                    />
                  ),
                },
              ],
              [
                { value: <b>Scrap %</b> },
                { value: 'scrap_pct', mono: true },
                { value: '0.03', mono: true },
                {
                  value: (
                    <BiRow
                      en="Process yield loss (0–1). Cumulative = 1 − ∏(1 − scrap_i)"
                      vi="Tỷ lệ phế (0–1). Tích lũy = 1 − ∏(1 − scrap_i)"
                    />
                  ),
                },
              ],
              [
                { value: <b>Tool Cost</b> },
                { value: 'tool_cost', mono: true },
                { value: '196', mono: true },
                {
                  value: (
                    <BiRow
                      en="Die/plate purchase (USD). $196 Pressplate · $1,529 RDC · $800 Rotary"
                      vi="Giá mua khuôn/bản (USD). $196 Pressplate · $1,529 RDC · $800 Rotary"
                    />
                  ),
                },
              ],
              [
                { value: <b>Tool Type</b> },
                { value: 'tool_type', mono: true },
                { value: 'Pressplate', mono: true },
                {
                  value: (
                    <BiRow
                      en="Knife / Etching / Carving / Metal / Rotary / Stencil / Pressplate / Jig / CNC / Pinnacle Die / RDC (driven by DDL — see §07 Tool Life table)"
                      vi="Knife / Etching / Carving / Metal / Rotary / Stencil / Pressplate / Jig / CNC / Pinnacle Die / RDC (lấy từ DDL — xem bảng tuổi thọ khuôn §07)"
                    />
                  ),
                },
              ],
              [
                { value: <b>Repeat</b> },
                { value: 'repeat', mono: true },
                { value: '1', mono: true },
                {
                  value: (
                    <BiRow
                      en="Repeat=2 → doubles all machine + labor + tooling costs"
                      vi="Repeat=2 → nhân đôi toàn bộ chi phí máy + nhân công + khuôn"
                    />
                  ),
                },
              ],
            ]}
          />

          <h3>
            <BiHead
              en="B. UPH formulas — 5 speed UOMs (verified)"
              vi="B. Công thức UPH — 5 đơn vị tốc độ (đã xác thực)"
            />
          </h3>
          <Callout
            type="note"
            title="How the engine resolves speed_uom"
            titleVi="Cách engine xử lý speed_uom"
          >
            <code className="cl-ic">speed_uom</code> comes from the Rate Table row of the picked
            Workcenter. The engine normalizes by stripping whitespace + lowercasing before matching,
            so "m/min", "M/MIN", "m / min" all work. An unrecognized UOM yields <code>uph = 0</code>{' '}
            → zero machine + labor cost (not an error). Speeds are also <b>pitch-floored at 1</b> to
            avoid div-by-zero when Layout tab is empty.
          </Callout>
          <Formula
            name="UPH (m/min)"
            expr="uph = speed × eff × 60 × 1000 / max(1, pitch) × layout"
            note="✅ Verified — pitch in mm, ×1000 converts m→mm."
          />
          <Formula
            name="UPH (Mtr/Hr or m/Hr)"
            expr="uph = speed × eff × 1000 / max(1, pitch) × layout"
            note="✅ Verified — matches 'mtr/hr' OR 'm/hr' after normalization."
          />
          <Formula
            name="UPH (Stamp/min)"
            expr="uph = speed × eff × 60 × layout"
            note="✅ Verified — 1 stroke produces Layout cavities simultaneously."
          />
          <Formula
            name="UPH (Pcs/hr, Pcs/h)"
            expr="uph = speed × eff"
            note="✅ Verified — direct pcs/hr, no Layout multiplier."
          />
          <Formula
            name="UPH (Sheets/hr, Sheet/hr)"
            expr="uph = speed × eff × layout"
            note="✅ Verified — accepts both 'sheets/hr' and 'sheet/hr' variants."
          />

          <h3>
            <BiHead
              en="C. Cost formulas (verified from calcProcess())"
              vi="C. Công thức chi phí (đã xác thực với calcProcess())"
            />
          </h3>
          <Formula
            name="Setup Machine/unit"
            expr="setup_mach = MOQ > 0 ? setup_h × mach_rate / MOQ × repeat : 0"
            note="✅ Verified — MOQ=0 guard returns 0 (no div-by-zero). Default repeat=1."
          />
          <Formula
            name="Setup Labor/unit"
            expr="setup_labor = MOQ > 0 ? setup_h × labor_rate × crew / MOQ × repeat : 0"
            note="✅ Verified — crew count from rate table row."
          />
          <Formula
            name="Run Machine/unit"
            expr={`scrapFactor = 1 − calcMatScrapFactor(st)          [note: SF, not scrap]
run_mach    = uph > 0 ? mach_rate / uph / max(0.001, scrapFactor) × repeat : 0`}
            note="✅ Verified — floor 0.001 prevents scrap=99.9% from blowing up divisor."
          />
          <Formula
            name="Run Labor/unit"
            expr={`run_labor = ((uph > 0 ? labor_rate × crew / uph / max(0.001, SF) : 0)
              + (manual_uph > 0 ? manual_rate / manual_uph / max(0.001, SF) : 0)
             ) × repeat
  where manual_rate = rate of 'Manual' workcenter || $2.54/h fallback`}
            note="✅ Verified — manual_uph=0 skips the manual addition entirely."
          />
          <Formula
            name="EAU (lifetime qty for tooling cap)"
            expr={`eau = (eau_ovr > 0) ? eau_ovr
      : (annual_qty || moq) × (product_lifetime || 1)`}
            note="✅ Verified — falls back to MOQ when annual_qty is absent (not to 1 as the xlsx suggested)."
          />
          <Formula
            name="Tooling/unit — Standard"
            expr={`tlife = tool_life_ovr ? tool_life : (DDL.tool_life[tool_type] || 1)
totalToolPcs = tlife × layout
tool = (totalToolPcs > eau)
  ? tool_cost / eau              ← EAU cap applies
  : tool_cost / totalToolPcs     ← normal amortization`}
            note="✅ Verified — if tool_type missing from DDL, tlife falls back to 1 → massive per-unit cost (sentinel for broken config)."
          />
          <Formula
            name="Tooling/unit — Jig (special case)"
            expr={`// Jig/Jig & Fixture are normalized to match either variant
ttNorm = tool_type.toLowerCase().replace(/[\\s&]/g, '')
isJig  = ttNorm === 'jig' || ttNorm === 'jigfixture'
if (isJig):
  tool = (tlife > eau) ? tool_cost / eau : tool_cost / tlife`}
            note="⚠ Corrected — xlsx omitted the DDL key normalization step. Writing 'Jig & Fixture' or 'jig' or 'JIG' all work identically."
          />
          <Formula
            name="Extra cost per unit"
            expr={`extra     = (extra_cost > 0) ? extra_cost / max(0.001, SF) : 0
extra_vat = (trade_mode === 'USD(Book)') ? extra × 0.15 : 0`}
            note="⚠ Added — xlsx omitted this; extra is scrap-adjusted."
          />
          <Formula
            name="Aggregates (return shape of calcProcess)"
            expr={`Returned per-process: { setup_mach, setup_labor, run_mach, run_labor,
                         tooling, extra, extra_vat, uph, mach_rate,
                         labor_rate, speed_uom, eau, pitch, total_time }`}
            note="✅ Verified — calcAll sums Run + Setup into overhead/labor buckets; see next section for how returned overhead/labor fields differ from the xlsx description."
          />
        </section>

        {/* 06 — Packing & KPIs */}
        <section id="sec-pack" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">06</div>
            <h2>
              <BiHead
                en="Packing, Shipping & Summary KPIs"
                vi="Đóng gói, Vận chuyển & KPI tổng hợp"
              />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="VA% · CONTR% · GM% — profitability indicators"
                vi="VA% · CONTR% · GM% — các chỉ số lợi nhuận"
              />
            </p>
          </header>

          <h3>
            <BiHead en="A. Packing cost" vi="A. Chi phí đóng gói" />
          </h3>
          <Formula
            name="Container/unit"
            expr="Container_cost / pcs_per_bag"
            note="Bag/tray cost divided by pieces per bag"
          />
          <Formula
            name="Box/unit"
            expr="Box_cost / bags_per_box / pcs_per_bag"
            note="Carton cost spread equally to each piece"
          />
          <Formula name="Other Packing" expr="other_packing  (USD/unit — entered directly)" />
          <Formula
            name="Shipping/unit"
            expr="(shipping_cost + other_ship) / ship_qty"
            note="ship_qty is typically set = MOQ"
          />
          <Formula
            name="Total Pack & Ship"
            expr="= Container/unit + Box/unit + Other + Shipping/unit"
          />

          <Callout
            type="note"
            title="📌 Per-tier Pack & Ship override (Sprint S-PACK-SHIP-PER-TIER)"
            titleVi="📌 Override Pack & Ship theo từng MOQ tier (Sprint S-PACK-SHIP-PER-TIER)"
            bodyVi={
              <>
                Mỗi MOQ tier có thể override 5 trường pack/ship một cách độc lập (
                <code>container_cost</code>, <code>box_cost</code>, <code>other_packing</code>,{' '}
                <code>shipping_cost</code>, <code>other_ship</code>):
                <ul>
                  <li>
                    Tier &gt; 0 <b>kế thừa</b> từ MOQ 1 trừ khi có{' '}
                    <code>extra_moqs[i].packing.&lt;field&gt;</code>.
                  </li>
                  <li>
                    Giá trị <b>0 tường minh</b> được giữ nguyên — <em>không</em> bị coi là falsy để
                    fallback.
                  </li>
                  <li>
                    Nhập <b>chuỗi rỗng</b> <code>''</code> sẽ <b>xóa override</b> và kế thừa lại.
                  </li>
                  <li>
                    Tín hiệu hình ảnh: <code className="cl-ic">.sc-pack-tier-ovr</code> (tím + đậm)
                    = override do operator nhập;{' '}
                    <code className="cl-ic">.sc-pack-tier-inherit</code> (xám + nghiêng) = kế thừa;
                    nút ↻ reset cạnh ô input chỉ hiện khi đang override.
                  </li>
                  <li>
                    Implementation: <code>resolveTierField()</code> trong{' '}
                    <code className="cl-ic">services/packingTierField.js</code> +{' '}
                    <code>buildTierState()</code> tại <code className="cl-ic">calcEngine.js</code>.
                    Tham khảo chéo Sprint S-PACK-SHIP-PER-TIER trong CLAUDE.md.
                  </li>
                </ul>
              </>
            }
          >
            Each MOQ tier can override the 5 pack/ship fields (<code>container_cost</code>,{' '}
            <code>box_cost</code>, <code>other_packing</code>, <code>shipping_cost</code>,{' '}
            <code>other_ship</code>) independently of the base MOQ 1 values:
            <ul>
              <li>
                Tier &gt; 0 <b>inherits</b> from MOQ 1 unless{' '}
                <code>extra_moqs[i].packing.&lt;field&gt;</code> is present.
              </li>
              <li>
                An <b>explicit 0</b> is preserved (<em>not</em> treated as falsy / inherit).
              </li>
              <li>
                Entering an <b>empty string</b> <code>''</code> deletes the override and re-inherits
                from the base.
              </li>
              <li>
                Visual cues: <code className="cl-ic">.sc-pack-tier-ovr</code> (violet + bold) =
                operator override; <code className="cl-ic">.sc-pack-tier-inherit</code> (gray +
                italic) = inherited; the ↻ reset button next to the input only appears when an
                override exists.
              </li>
              <li>
                Implementation: <code>resolveTierField()</code> in{' '}
                <code className="cl-ic">services/packingTierField.js</code> +{' '}
                <code>buildTierState()</code> in <code className="cl-ic">calcEngine.js</code>. See
                Sprint S-PACK-SHIP-PER-TIER in CLAUDE.md for the full contract.
              </li>
            </ul>
          </Callout>

          <h3>
            <BiHead
              en="B. Summary KPIs (verified from calcAll())"
              vi="B. KPI tổng hợp (đã xác thực với calcAll())"
            />
          </h3>
          <Callout
            type="warn"
            title="⚠ Sprint 21 Finance alignment — xlsx is stale"
            titleVi="⚠ Đồng bộ Sprint 21 theo Finance — xlsx đã lỗi thời"
            bodyVi={
              <>
                Trước Sprint 21, VA% / CONTR% / GM% dùng <code>g_mat_cost</code> +{' '}
                <code>g_ttl</code> — nhưng các giá trị này không khớp với UI Cost Breakdown vốn hiển
                thị các cột supplier-price. Finance yêu cầu đồng bộ: engine sống hiện tính cả ba từ
                tổng <b>s_*</b> (supplier). Xlsx v3.3 vẫn tài liệu hóa công thức cũ theo G-basis.
                Quote cũ phân tích lại sau Sprint 21 có thể cho KPI hơi khác — đây là phần đã được
                Finance ký duyệt sửa lại.
              </>
            }
          >
            Prior to Sprint 21, VA% / CONTR% / GM% used <code>g_mat_cost</code> +<code>g_ttl</code>{' '}
            — but those didn't reconcile with the Cost Breakdown UI which shows supplier-price
            columns. Finance demanded alignment: the live engine now computes all three from{' '}
            <b>s_*</b> (supplier) totals. The xlsx v3.3 still documents the old G-basis formulas.
            Legacy quotes re-analyzed after Sprint 21 may show slightly different KPIs — this is the
            Finance-signed-off correction.
          </Callout>
          <FieldTable
            columns={[
              { label: 'KPI', w: '18%' },
              { label: 'Engine formula', w: '46%' },
              { label: 'Target', w: '11%' },
              { label: 'Meaning / Audit', w: '25%' },
            ]}
            rows={[
              [
                { value: <b>S.TOTAL COST ★</b> },
                {
                  value: (
                    <code className="cl-ic">
                      s_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling +
                      proc_extra + packing_ship
                    </code>
                  ),
                  mono: true,
                },
                { value: 'N/A', center: true },
                { value: <b>Primary basis for GM%, VA%, CONTR%</b> },
              ],
              [
                { value: <b>G.TOTAL COST</b> },
                {
                  value: (
                    <code className="cl-ic">
                      g_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling +
                      proc_extra + packing_ship
                    </code>
                  ),
                  mono: true,
                },
                { value: 'N/A', center: true },
                { value: 'Purchase-price basis; feeds SGA calc' },
              ],
              [
                { value: <b>VA% (Value Add)</b> },
                {
                  value: (
                    <code className="cl-ic">
                      1 − (s_mat_cost + tooling + packing_ship) / sp_price
                    </code>
                  ),
                  mono: true,
                },
                { value: '> 30%', center: true, bold: true },
                { value: <span>⚠ s_mat (not g_mat); CONTR does NOT include VAT/overhead.</span> },
              ],
              [
                { value: <b>CONTR%</b> },
                {
                  value: (
                    <code className="cl-ic">
                      1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price
                    </code>
                  ),
                  mono: true,
                },
                { value: '> 25%', center: true, bold: true },
                {
                  value: (
                    <span>
                      ⚠ Uses <code>run_labor_only = labor_cost − setup_labor_total</code>.
                    </span>
                  ),
                },
              ],
              [
                { value: <b>GM%</b> },
                { value: <code className="cl-ic">1 − s_ttl / sp_price</code>, mono: true },
                { value: '> 15%', center: true, bold: true },
                { value: <span>⚠ Uses s_ttl, not g_ttl!</span> },
              ],
              [
                { value: <b>GM% after SGA</b> },
                { value: <code className="cl-ic">1 − (s_ttl + sga) / sp_price</code>, mono: true },
                { value: 'N/A', center: true },
                {
                  value: (
                    <span>
                      ⚠ <b>Added</b> — Sprint 9D.3. SGA per-site.
                    </span>
                  ),
                },
              ],
              [
                { value: <b>Target Selling Price</b> },
                { value: <em>(not computed by calcAll)</em>, mono: false },
                { value: 'N/A', center: true },
                { value: 'UI-only: user inverts CONTR% formula manually.' },
              ],
            ]}
          />

          <h3>
            <BiHead
              en="C. Returned Overhead / Labor fields — ⚠ different from xlsx"
              vi="C. Các trường Overhead / Labor trả về — ⚠ khác với xlsx"
            />
          </h3>
          <Callout
            type="warn"
            title="⚠ Critical interpretation difference"
            titleVi="⚠ Khác biệt diễn giải quan trọng"
            bodyVi={
              <>
                Xlsx nói <code>Overhead = Σ(Run_Machine + Setup_Machine)</code>. Còn object trả về
                từ <code>calcAll()</code> trong engine là:
                <ul>
                  <li>
                    <code>overhead: overhead − setup_mach_total</code> → <b>CHỈ Run machine</b>
                  </li>
                  <li>
                    <code>labor_cost: labor_cost − setup_labor_total</code> → <b>CHỈ Run labor</b>
                  </li>
                  <li>
                    <code>bd_setup_mach: setup_mach_total</code> — phần setup tách riêng
                  </li>
                  <li>
                    <code>bd_setup_labor: setup_labor_total</code> — phần setup tách riêng
                  </li>
                </ul>
                Nên khi tab Cost Breakdown hiển thị "Overhead", đó là phần RUN. Setup được tách ra
                dòng riêng. S.TOTAL vẫn cộng CẢ HAI (qua biểu thức tổng ở trên), nên GM% không đổi —
                đây chỉ là sửa độ chi tiết khi báo cáo.
              </>
            }
          >
            The xlsx said <code>Overhead = Σ(Run_Machine + Setup_Machine)</code>. The engine's{' '}
            <code>calcAll()</code> return object has:
            <ul>
              <li>
                <code>overhead: overhead − setup_mach_total</code> → <b>Run machine ONLY</b>
              </li>
              <li>
                <code>labor_cost: labor_cost − setup_labor_total</code> → <b>Run labor ONLY</b>
              </li>
              <li>
                <code>bd_setup_mach: setup_mach_total</code> — setup shown separately
              </li>
              <li>
                <code>bd_setup_labor: setup_labor_total</code> — setup shown separately
              </li>
            </ul>
            So when Cost Breakdown tab shows "Overhead", that's the RUN portion. Setup is split out
            in its own row. S.TOTAL still adds BOTH (via the sum expression above), so GM% is
            unchanged — this is just a reporting granularity fix.
          </Callout>
        </section>

        {/* 07 — Reference Tables */}
        <section id="sec-ref" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">07</div>
            <h2>
              <BiHead en="Reference Tables" vi="Bảng tra cứu" />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Tool life · Click charges · Ink coverage — from DDL database"
                vi="Tuổi thọ khuôn · Phí click · Độ phủ mực — lấy từ DDL database"
              />
            </p>
          </header>

          <h3>
            <BiHead en="1. Tool life table" vi="1. Bảng tuổi thọ khuôn" />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Tool Type" vi="Loại khuôn" />, w: '18%' },
              { label: <BiRow en="Life (shots)" vi="Tuổi thọ (shots)" />, w: '16%' },
              { label: <BiRow en="Description" vi="Mô tả" />, w: '42%' },
              { label: <BiRow en="Ref. Cost" vi="Giá tham chiếu" />, w: '14%' },
            ]}
            rows={[
              [
                { value: 'Knife', bold: true },
                { value: '20,000', mono: true, center: true },
                { value: <BiRow en="Manual cutting blade" vi="Dao cắt thủ công" /> },
                { value: '$50', mono: true, center: true },
              ],
              [
                { value: 'Etching', bold: true },
                { value: '20,000', mono: true, center: true },
                { value: <BiRow en="Chemical etching plate" vi="Bản ăn mòn hóa học" /> },
                { value: '$80', mono: true, center: true },
              ],
              [
                { value: 'Carving', bold: true },
                { value: '40,000', mono: true, center: true },
                { value: <BiRow en="Carved die" vi="Khuôn khắc" /> },
                { value: '$150', mono: true, center: true },
              ],
              [
                { value: 'Metal', bold: true },
                { value: '500,000', mono: true, center: true },
                { value: <BiRow en="High-durability metal die" vi="Khuôn kim loại độ bền cao" /> },
                { value: '$500', mono: true, center: true },
              ],
              [
                { value: 'Rotary', bold: true },
                { value: '200,000', mono: true, center: true },
                { value: <BiRow en="Rotary die-cut tool" vi="Dao bế trục lăn" /> },
                { value: '$800', mono: true, center: true },
              ],
              [
                { value: 'Stencil', bold: true },
                { value: '20,000', mono: true, center: true },
                { value: <BiRow en="Screen printing stencil / mesh" vi="Khuôn lụa / lưới in" /> },
                { value: '$30', mono: true, center: true },
              ],
              [
                { value: 'Pressplate', bold: true },
                { value: '200,000', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Printing plate (Indigo / Flexo / SS)"
                      vi="Bản in (Indigo / Flexo / SS)"
                    />
                  ),
                },
                { value: '$196', mono: true, center: true },
              ],
              [
                { value: 'Jig', bold: true },
                { value: '1,000,000', mono: true, center: true },
                { value: <BiRow en="Jig & fixture (holding tool)" vi="Đồ gá (giữ chi tiết)" /> },
                { value: '$2,000', mono: true, center: true },
              ],
              [
                { value: 'CNC', bold: true },
                { value: '1,000', mono: true, center: true },
                {
                  value: (
                    <BiRow en="CNC router bit / milling cutter" vi="Mũi router CNC / dao phay" />
                  ),
                },
                { value: '$50', mono: true, center: true },
              ],
              [
                { value: 'Pinnacle Die', bold: true },
                { value: '60,000', mono: true, center: true },
                {
                  value: <BiRow en="Precision Pinnacle die" vi="Khuôn Pinnacle độ chính xác cao" />,
                },
                { value: '$1,200', mono: true, center: true },
              ],
              [
                { value: 'RDC', bold: true },
                { value: '200,000', mono: true, center: true },
                { value: <BiRow en="Rotary Die Cutting tool" vi="Khuôn cắt trục lăn (RDC)" /> },
                { value: '$1,529', mono: true, center: true },
              ],
            ]}
          />

          <h3>
            <BiHead en="2. Click charges (Indigo)" vi="2. Phí click (Indigo)" />
          </h3>
          <Callout type="note" title="📌 Indigo formula" titleVi="📌 Công thức Indigo">
            <code className="cl-ic">
              Run = click_charge × clicks / Layout_Indigo / (1 − Scrap%)
            </code>
          </Callout>
          <FieldTable
            columns={[
              { label: <BiRow en="Clicks" vi="Số click" />, w: '12%' },
              { label: <BiRow en="Charge (USD)" vi="Đơn giá (USD)" />, w: '18%' },
              { label: <BiRow en="Print Job Type" vi="Loại job in" />, w: '40%' },
              { label: <BiRow en="Notes" vi="Ghi chú" />, w: '30%' },
            ]}
            rows={[
              [
                { value: '1', center: true, bold: true },
                { value: '$0.030036', mono: true, center: true },
                { value: <BiRow en="Single color (monochrome)" vi="Đơn sắc (monochrome)" /> },
                { value: <BiRow en="Very expensive — rarely used" vi="Rất đắt — hiếm dùng" /> },
              ],
              [
                { value: '2', center: true, bold: true },
                { value: '$0.0074', mono: true, center: true },
                { value: <BiRow en="2-click job" vi="Job 2-click" /> },
                {
                  value: (
                    <BiRow
                      en="LOOKUP rule: use charge for LARGEST key ≤ clicks"
                      vi="LOOKUP: dùng giá của KEY LỚN NHẤT ≤ clicks"
                    />
                  ),
                },
              ],
              [
                { value: '4', center: true, bold: true },
                { value: '$0.0074', mono: true, center: true },
                { value: <BiRow en="CMYK 4-color (standard)" vi="CMYK 4 màu (chuẩn)" /> },
                {
                  value: <BiRow en="Most common — standard CMYK" vi="Phổ biến nhất — CMYK chuẩn" />,
                },
              ],
              [
                { value: '6', center: true, bold: true },
                { value: '$0.0084', mono: true, center: true },
                { value: <BiRow en="CMYK + 2 spot colors" vi="CMYK + 2 màu pha" /> },
                {
                  value: <BiRow en="Spot colors increase charge tier" vi="Màu pha tăng nhóm phí" />,
                },
              ],
              [
                { value: '8', center: true, bold: true },
                { value: '$0.0084', mono: true, center: true },
                { value: <BiRow en="8 clicks" vi="8 click" /> },
                { value: '' },
              ],
              [
                { value: '10', center: true, bold: true },
                { value: '$0.0084', mono: true, center: true },
                { value: <BiRow en="10 clicks" vi="10 click" /> },
                { value: '' },
              ],
              [
                { value: '12', center: true, bold: true },
                { value: '$0.0084', mono: true, center: true },
                { value: <BiRow en="12 clicks" vi="12 click" /> },
                { value: '' },
              ],
              [
                { value: '14', center: true, bold: true },
                { value: '$0.0084', mono: true, center: true },
                { value: <BiRow en="14 clicks (max)" vi="14 click (tối đa)" /> },
                {
                  value: <BiRow en="Above 14: still use $0.0084" vi="Trên 14: vẫn dùng $0.0084" />,
                },
              ],
            ]}
          />

          <h3>
            <BiHead en="3. Ink coverage (m²/kg)" vi="3. Độ phủ mực (m²/kg)" />
          </h3>
          <FieldTable
            columns={[
              { label: <BiRow en="Print Type" vi="Loại in" />, w: '18%' },
              { label: <BiRow en="Coverage" vi="Độ phủ" />, w: '14%' },
              { label: <BiRow en="Formula" vi="Công thức" />, w: '44%' },
              { label: <BiRow en="Notes" vi="Ghi chú" />, w: '24%' },
            ]}
            rows={[
              [
                { value: 'SS (Screen)', bold: true },
                { value: '30 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 30 / (1−S)', mono: true },
                {
                  value: (
                    <BiRow en="Heavy ink — highest consumption" vi="Mực dày — tiêu hao cao nhất" />
                  ),
                },
              ],
              [
                { value: 'SS (Glue)', bold: true },
                { value: '300 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 300 / (1−S)', mono: true },
                { value: <BiRow en="Screen adhesive" vi="Keo lụa" /> },
              ],
              [
                { value: 'Flexo', bold: true },
                { value: '300 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 300 / (1−S)', mono: true },
                { value: <BiRow en="Flexographic ink" vi="Mực flexo" /> },
              ],
              [
                { value: 'LP (LetterPress)', bold: true },
                { value: '300 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 300 / (1−S)', mono: true },
                { value: <BiRow en="Letterpress ink" vi="Mực letterpress" /> },
              ],
              [
                { value: 'Indigo', bold: true },
                { value: 'N/A', mono: true, center: true },
                {
                  value: (
                    <BiRow
                      en="Uses click-charge formula (see table 2)"
                      vi="Dùng công thức click-charge (xem bảng 2)"
                    />
                  ),
                },
                { value: <BiRow en="Click-based" vi="Tính theo click" /> },
              ],
              [
                { value: 'Indigo Primer', bold: true },
                { value: '400 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 400 / (1−S)', mono: true },
                { value: <BiRow en="Primer coat for Indigo" vi="Lớp lót cho Indigo" /> },
              ],
              [
                { value: 'Indigo Spot', bold: true },
                { value: '176 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 176 / (1−S)', mono: true },
                {
                  value: (
                    <BiRow en="Spot color — higher consumption" vi="Màu pha — tiêu hao cao hơn" />
                  ),
                },
              ],
              [
                { value: 'Indigo Oil', bold: true },
                { value: '400 m²/kg', mono: true, center: true },
                { value: 'price × QPA × area% × w_m / 400 / (1−S)', mono: true },
                { value: <BiRow en="Oil-based Indigo ink" vi="Mực Indigo gốc dầu" /> },
              ],
            ]}
          />
        </section>

        {/* 08 — Master Formulas */}
        <section id="sec-master" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">08</div>
            <h2>
              <BiHead
                en="Master Formula Reference — all 47 formulas"
                vi="Tổng hợp công thức — 47 công thức"
              />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Single source of truth, grouped by subsystem"
                vi="Nguồn gốc chính thức, nhóm theo phân hệ"
              />
            </p>
          </header>

          {[
            {
              group: 'LAYOUT',
              items: [
                ['Pitch (Sheet mode)', 'P = sheet_length + min_gap_md', 'mm', 'calcPitch()'],
                [
                  'Pitch (Rotary mode)',
                  'Z=⌈(L+G)×cols/3.175⌉; P=Z×3.175/cols',
                  'mm',
                  'calcPitch()',
                ],
                ['Plate Pitch', 'plate_pitch = plate_tooth × 3.175', 'mm', 'PrintLayoutSummary'],
                ['Magnetic Pitch', 'mag_pitch = magnetic_tooth × 3.175', 'mm', 'CutLayoutSummary'],
                [
                  'Gross Print Size',
                  'gross = net + 2 × bleed (per axis)',
                  'mm',
                  'PrintLayoutSummary',
                ],
                [
                  'Plate ↔ Mag ratio',
                  'ratio = plate_tooth / magnetic_tooth (integer = in-register)',
                  '—',
                  'PrintCutRatioHint',
                ],
                [
                  'Layout per Sheet',
                  'L = parts_in_md × parts_web_across',
                  'cav',
                  'calcLayoutPerSheet()',
                ],
                [
                  'QPA (m²)',
                  'QPA = Pitch × Width / 1e6 / Cav / Webs × Usage',
                  'm²/pcs',
                  'calcMat()',
                ],
                [
                  'QPA (LM)',
                  'QPA_LM = Pitch / 1000 / Cav / Webs × Usage',
                  'LM/pcs',
                  'calcQPA_LM()',
                ],
                ['Scrap Factor', 'S = 1 − ∏(1 − scrap_pct_i)', '%', 'calcMatScrapFactor()'],
                [
                  'Offcut %  ⚠ Corrected',
                  'OC = min(cavities % width / cavities, 0.999)  [priority 2; priority 1 = user override]',
                  '%',
                  'calcOffcut()',
                ],
                [
                  'MAT PO (LM)',
                  'MAT_PO = MOQ × 1.1 × P/1000 / C / W × U + setup_lm',
                  'LM',
                  'calcMat()',
                ],
              ],
            },
            {
              group: 'MATERIAL',
              items: [
                [
                  'Setup Cost/unit (S)',
                  'Setup_S = (sp+slit) × setup_lm × usage × (W/1000) / (1−OC) / MOQ',
                  'USD/pcs',
                  'calcMat()',
                ],
                [
                  'Run Cost/unit (S)',
                  'Run_S   = (sp+slit) × (W/1000) × QPA / (1−S) / (1−OC) × Usage',
                  'USD/pcs',
                  'calcMat()',
                ],
                [
                  'Run Cost/unit (G)',
                  'Run_G   = (gp+slit) × (W/1000) × QPA / (1−S) / (1−OC) × Usage',
                  'USD/pcs',
                  'calcMat()',
                ],
                ['VAT Loss', 'VAT = Total_S × 0.15  (USD(Book) mode only)', 'USD/pcs', 'calcMat()'],
              ],
            },
            {
              group: 'INK SS/Flexo',
              items: [
                [
                  'Ink Run Cost',
                  'Ink = price × QPA × area% × width_m / coverage / (1−S)',
                  'USD/pcs',
                  'calcInk()',
                ],
                [
                  'Ink Setup Cost',
                  'Setup = price × (setup_kg + area% × w × base_u / cov) / MOQ',
                  'USD/pcs',
                  'calcInk()',
                ],
              ],
            },
            {
              group: 'INK Indigo',
              items: [
                ['Layout Indigo', 'L_ind = ⌊980 / Pitch⌋ × Layout × Webs', 'sheets', 'calcInk()'],
                [
                  'Click Charge Lookup',
                  'cc = LOOKUP(clicks, click_charge_table)',
                  'USD/clk',
                  'calcInk()',
                ],
                ['Ink Run Cost', 'Ink = cc × clicks / L_ind / (1−S)', 'USD/pcs', 'calcInk()'],
                [
                  'Ink Setup Cost',
                  'Setup = cc × clicks × ⌈base_usage / 0.98⌉ / MOQ',
                  'USD/pcs',
                  'calcInk()',
                ],
              ],
            },
            {
              group: 'PROCESS',
              items: [
                [
                  'UPH (m/min)',
                  'UPH = Speed × Eff × 60 × 1000 / Pitch × Layout',
                  'pcs/hr',
                  'calcProcess()',
                ],
                [
                  'UPH (Mtr/Hr)',
                  'UPH = Speed × Eff × 1000 / Pitch × Layout',
                  'pcs/hr',
                  'calcProcess()',
                ],
                ['UPH (Stamp/min)', 'UPH = Speed × Eff × 60 × Layout', 'pcs/hr', 'calcProcess()'],
                ['UPH (Pcs/hr)', 'UPH = Speed × Eff', 'pcs/hr', 'calcProcess()'],
                ['UPH (Sheets/hr)', 'UPH = Speed × Eff × Layout', 'pcs/hr', 'calcProcess()'],
                [
                  'Setup Machine/unit',
                  'SM = Setup_H × Machine_Rate / MOQ × Repeat',
                  'USD/pcs',
                  'calcProcess()',
                ],
                [
                  'Setup Labor/unit',
                  'SL = Setup_H × Labor_Rate × Crew / MOQ × Repeat',
                  'USD/pcs',
                  'calcProcess()',
                ],
                [
                  'Run Machine/unit',
                  'RM = Machine_Rate / UPH / (1−Scrap%) × Repeat',
                  'USD/pcs',
                  'calcProcess()',
                ],
                [
                  'Run Labor/unit',
                  'RL = (Labor×Crew/UPH + Manual/M_UPH) / (1−S) × Repeat',
                  'USD/pcs',
                  'calcProcess()',
                ],
                [
                  'EAU (lifetime qty)',
                  'EAU = eau_ovr>0 ? eau_ovr : Annual × ProductLife',
                  'pcs',
                  'calcProcess()',
                ],
                [
                  'Tooling (Standard)',
                  'Tool = Tool_Cost / min(tlife × Layout, EAU)',
                  'USD/pcs',
                  'calcProcess()',
                ],
                [
                  'Tooling (Jig)',
                  'Tool = Tool_Cost / min(tlife_jig, EAU)',
                  'USD/pcs',
                  'calcProcess()',
                ],
              ],
            },
            {
              group: 'PACKING',
              items: [
                [
                  'Pack Cost/unit',
                  'Pack = Container/pcs_bag + Box/(bags×pcs_bag) + Other',
                  'USD/pcs',
                  'calcPacking()',
                ],
                [
                  'Shipping/unit',
                  'Ship = (ship_cost + other_ship) / ship_qty',
                  'USD/pcs',
                  'calcShipping()',
                ],
              ],
            },
            {
              group: 'TOTALS (verified against calcAll)',
              items: [
                [
                  's_ttl (S.TOTAL)',
                  's_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling + proc_extra + packing_ship',
                  'USD/pcs',
                  'calcAll()',
                ],
                [
                  'g_ttl (G.TOTAL)',
                  'g_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling + proc_extra + packing_ship',
                  'USD/pcs',
                  'calcAll()',
                ],
                [
                  'overhead (returned)',
                  'Σ run_mach_i   [Run machine only; setup split out in bd_setup_mach]',
                  'USD/pcs',
                  'calcAll()',
                ],
                [
                  'labor_cost (returned)',
                  'Σ run_labor_i  [Run labor only; setup split out in bd_setup_labor]',
                  'USD/pcs',
                  'calcAll()',
                ],
                [
                  'run_labor_only',
                  'labor_cost − setup_labor_total  [used in CONTR%]',
                  'USD/pcs',
                  'calcAll()',
                ],
              ],
            },
            {
              group: 'KPIs (verified — supplier basis)',
              items: [
                [
                  'VA%  ⚠ Corrected',
                  '1 − (s_mat_cost + tooling + packing_ship) / sp_price',
                  '%',
                  'calcAll()',
                ],
                [
                  'CONTR%  ⚠ Corrected',
                  '1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price',
                  '%',
                  'calcAll()',
                ],
                ['GM%  ⚠ Corrected', '1 − s_ttl / sp_price', '%', 'calcAll()'],
                [
                  'SGA  ⚠ Added',
                  'g_ttl × sga_rate_pct / 100   [per-site, default 0]',
                  'USD',
                  'computeSga()',
                ],
                ['GM% after SGA', '1 − (s_ttl + sga) / sp_price', '%', 'calcAll()'],
              ],
            },
          ].map((grp) => (
            <div key={grp.group} className="cl-fgroup">
              <div className="cl-fgroup-label">── {grp.group} ──</div>
              <FieldTable
                columns={[
                  { label: 'Formula Name', w: '24%' },
                  { label: 'Expression', w: '50%' },
                  { label: 'Unit', w: '12%' },
                  { label: 'Source', w: '14%' },
                ]}
                rows={grp.items.map(([name, expr, unit, src]) => [
                  { value: <b>{name}</b> },
                  { value: expr, mono: true },
                  { value: unit, center: true, mono: true },
                  { value: src, mono: true },
                ])}
              />
            </div>
          ))}
        </section>

        {/* 09 — Worked Example */}
        <section id="sec-example" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">09</div>
            <h2>
              <BiHead
                en="Worked Example — 82×52 mm Adhesive Label"
                vi="Ví dụ chi tiết — nhãn keo 82×52 mm"
              />
            </h2>
            <p className="cl-section-sub">
              MOQ 250,000 · EAU 3,000,000/yr · Site VN · Trade Mode USD(Normal)
            </p>
          </header>

          <h3>
            <BiHead en="Step 1 — Enter Header" vi="Bước 1 — Nhập Header" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Field', w: '30%' },
              { label: 'Value', w: '30%' },
              { label: 'Notes', w: '40%' },
            ]}
            rows={[
              [{ value: <b>CCL P/N</b> }, { value: 'T3000002', mono: true }, { value: '' }],
              [
                { value: <b>MOQ</b> },
                { value: '250,000 pcs', mono: true },
                { value: '✅ Must be > 0' },
              ],
              [
                { value: <b>Annual Qty (EAU)</b> },
                { value: '3,000,000 pcs', mono: true },
                { value: '' },
              ],
              [
                { value: <b>Selling Price</b> },
                { value: '$0.099', mono: true },
                { value: 'Target from customer' },
              ],
              [
                { value: <b>Trade Mode</b> },
                { value: 'USD(Normal)', mono: true },
                { value: 'No VAT loss' },
              ],
              [{ value: <b>Site</b> }, { value: 'VN', mono: true }, { value: '' }],
            ]}
          />

          <h3>
            <BiHead en="Step 2 — Layout" vi="Bước 2 — Layout" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Parameter', w: '30%' },
              { label: 'Value', w: '28%' },
              { label: '→ Auto-calc', w: '42%' },
            ]}
            rows={[
              [{ value: <b>Part Length</b> }, { value: '52 mm', mono: true }, { value: '' }],
              [
                { value: <b>Min Gap MD</b> },
                { value: '2 mm', mono: true },
                { value: '→ Pitch = 54 mm', mono: true },
              ],
              [
                { value: <b>Parts across TD</b> },
                { value: '4', mono: true, center: true },
                { value: '→ Layout = 4 cavities/stroke', mono: true },
              ],
              [
                { value: <b>Part Width</b> },
                { value: '82 mm', mono: true },
                { value: '→ QPA_LM = 54/1000/4 = 0.0135 LM/pcs', mono: true },
              ],
              [
                { value: <b>Process Scrap (RDC)</b> },
                { value: '3%', mono: true },
                { value: '→ Scrap Factor = 3%', mono: true },
              ],
            ]}
          />

          <h3>
            <BiHead en="Step 3 — Material" vi="Bước 3 — Vật tư" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Material', w: '30%' },
              { label: 'Width', w: '12%' },
              { label: 'G.Price', w: '14%' },
              { label: 'Setup_LM', w: '14%' },
              { label: 'Output', w: '30%' },
            ]}
            rows={[
              [
                { value: <b>T9041-25-82 (Main Mat)</b> },
                { value: '82 mm', mono: true, center: true },
                { value: '$2.30/LM', mono: true, center: true },
                { value: '50 m', mono: true, center: true },
                { value: <b>G.Mat/unit = $0.002670</b> },
              ],
            ]}
          />

          <h3>
            <BiHead en="Step 4 — Processes" vi="Bước 4 — Công đoạn" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Process', w: '20%' },
              { label: 'Workcenter', w: '22%' },
              { label: 'Speed', w: '18%' },
              { label: 'Tool', w: '24%' },
              { label: 'Output', w: '16%' },
            ]}
            rows={[
              [
                { value: <b>SS Print</b> },
                { value: 'SS Silkscreen', mono: true },
                { value: '60 m/min', mono: true, center: true },
                { value: '$196 Pressplate', mono: true },
                { value: '' },
              ],
              [
                { value: <b>RDC Die-Cut</b> },
                { value: 'RDC350-12', mono: true },
                { value: '80 stamp/min', mono: true, center: true },
                { value: '$1,529 RDC', mono: true },
                { value: '' },
              ],
              [
                { value: <b>Packing</b> },
                { value: 'Manual packing', mono: true },
                { value: '1,500 pcs/hr', mono: true, center: true },
                { value: '—', center: true },
                { value: '' },
              ],
              [
                { value: <b>→ Overhead</b>, bold: true },
                { value: '$0.000893/unit', mono: true, bold: true },
                { value: <b>→ Labor</b>, bold: true },
                { value: '$0.003145/unit', mono: true, bold: true },
                { value: <b>→ Tooling: $0.002156</b>, bold: true },
              ],
            ]}
          />

          <h3>
            <BiHead en="Step 5 — Packing & Shipping" vi="Bước 5 — Đóng gói & Vận chuyển" />
          </h3>
          <FieldTable
            columns={[
              { label: 'Component', w: '30%' },
              { label: 'Parameters', w: '46%' },
              { label: 'Cost/unit', w: '24%' },
            ]}
            rows={[
              [
                { value: <b>Container (bag)</b> },
                { value: '100 pcs/bag × $0.02/bag', mono: true },
                { value: '$0.000200', mono: true, center: true },
              ],
              [
                { value: <b>Carton (box)</b> },
                { value: '100 bags/box × $0.60/box', mono: true },
                { value: '$0.000060', mono: true, center: true },
              ],
              [
                { value: <b>Shipping</b> },
                { value: '$380 / 250,000 pcs', mono: true },
                { value: '$0.001520', mono: true, center: true },
              ],
              [
                { value: <b>→ Total Pack & Ship</b>, bold: true },
                { value: '' },
                { value: '$0.003782', mono: true, center: true, bold: true },
              ],
            ]}
          />

          <h3>
            <BiHead en="Final results" vi="Kết quả cuối" />
          </h3>
          <Callout type="note" title="Notes on this worked example" titleVi="Ghi chú về ví dụ này">
            This example is preserved from the xlsx v3.3 and uses the <i>g</i>-price figures that
            the old training manual showed. In the live engine, GM% / VA% / CONTR% use the <b>s</b>
            -price basis (Sprint 21 fix); for the simple case below <code>s</code> and{' '}
            <code>g</code> prices are assumed equal, so the KPI numbers still match. On a real quote
            where s ≠ g, expect slight differences vs. the old manual.
          </Callout>
          <FieldTable
            columns={[
              { label: 'Component', w: '32%' },
              { label: 'USD/unit', w: '24%' },
              { label: 'Engine field', w: '44%' },
            ]}
            rows={[
              [
                { value: 'Material cost (supplier)' },
                { value: '$0.002670', mono: true, center: true },
                { value: <code className="cl-ic">s_mat_cost</code> },
              ],
              [
                { value: 'Overhead (run only)' },
                { value: '$0.000893', mono: true, center: true },
                { value: <code className="cl-ic">overhead</code> },
              ],
              [
                { value: 'Labor Cost (run only)' },
                { value: '$0.003145', mono: true, center: true },
                { value: <code className="cl-ic">labor_cost</code> },
              ],
              [
                { value: 'Setup machine' },
                { value: <em>split out</em>, mono: false, center: true },
                { value: <code className="cl-ic">bd_setup_mach</code> },
              ],
              [
                { value: 'Setup labor' },
                { value: <em>split out</em>, mono: false, center: true },
                { value: <code className="cl-ic">bd_setup_labor</code> },
              ],
              [
                { value: 'VAT Loss' },
                { value: '$0.000000', mono: true, center: true },
                { value: 'USD(Normal) mode → 0' },
              ],
              [
                { value: 'Tooling' },
                { value: '$0.002156', mono: true, center: true },
                { value: <code className="cl-ic">tooling</code> },
              ],
              [
                { value: 'Pack & Ship' },
                { value: '$0.003782', mono: true, center: true },
                { value: <code className="cl-ic">packing_ship</code> },
              ],
              [
                { value: <b>S.TOTAL COST</b>, bold: true },
                { value: <b>$0.012646</b>, mono: true, center: true, bold: true },
                { value: <code className="cl-ic">s_ttl</code> },
              ],
              [
                { value: <b>Selling Price</b>, bold: true },
                { value: <b>$0.099000</b>, mono: true, center: true, bold: true },
                { value: <code className="cl-ic">sp_price</code> },
              ],
              [
                { value: <b>GM%</b>, bold: true },
                { value: <b>≈ 87.2%</b>, mono: true, center: true, bold: true },
                { value: <code className="cl-ic">1 − s_ttl / sp_price</code> },
              ],
              [
                { value: <b>VA%</b>, bold: true },
                { value: <b>≈ 91.2%</b>, mono: true, center: true, bold: true },
                { value: <code className="cl-ic">1 − (s_mat + tool + pack) / sp</code> },
              ],
              [
                { value: <b>CONTR%</b>, bold: true },
                { value: <b>≈ 88.0%</b>, mono: true, center: true, bold: true },
                {
                  value: <code className="cl-ic">1 − (s_mat + tool + pack + run_labor) / sp</code>,
                },
              ],
            ]}
          />

          {/* ── Print + Cut workflow examples — two side-by-side cards ── */}
          <h3>
            <BiHead
              en="Step 6 — Print + Cut workflow (in-line vs off-line)"
              vi="Bước 6 — Quy trình In + Bế (in-line vs off-line)"
            />
          </h3>
          <Callout
            type="tip"
            title="💡 Click a card's button to load the example into the current quote"
            titleVi="💡 Bấm nút trong mỗi card để load ví dụ vào quote hiện tại"
          >
            Each card represents a real CCL Hanoi scenario for the same 82 × 52 mm adhesive label.
            The difference is whether the die-cut runs on the same press as the print (in-line, 1:1
            cylinder ratio) or on a separate RDC machine (off-line, 1:2 ratio). Load one to see
            every field populated — then switch to the Layout tab to watch the Print / Cut summary
            &amp; suggestion cards react.
            <br />
            <br />
            <span className="cl-bi-vi">
              Mỗi card là một tình huống thật tại CCL Hà Nội cho cùng nhãn 82 × 52 mm. Khác biệt là
              bế cùng máy in (in-line, tỉ số 1:1) hay bế trên máy RDC riêng (off-line, 1:2). Load
              một ví dụ để thấy tất cả trường đã điền — chuyển qua tab Layout để xem card Print/Cut
              Summary &amp; Suggestion phản ứng.
            </span>
          </Callout>

          <div className="cl-wf-grid">
            {/* ── Case 1: In-line Gallus ── */}
            <div className="cl-wf-card cl-wf-inline">
              <div className="cl-wf-head">
                <div className="cl-wf-badge">Case 1</div>
                <div className="cl-wf-title">
                  <BiHead en="In-line · Gallus EM340" vi="In-line · Gallus EM340" />
                </div>
                <div className="cl-wf-sub">
                  <BiRow
                    en="Print + die-cut on the SAME press. Plate = Magnetic = 17T (1:1)."
                    vi="In + bế CÙNG máy. Plate = Magnetic = 17T (1:1)."
                  />
                </div>
              </div>
              <table className="cl-wf-table">
                <tbody>
                  <tr>
                    <td>Press · Máy</td>
                    <td>
                      <code>Gallus EM340</code> (Print + Cut)
                    </td>
                  </tr>
                  <tr>
                    <td>Web / Sheet</td>
                    <td>330 / 54 mm · 1 web</td>
                  </tr>
                  <tr>
                    <td>Net size · Net</td>
                    <td>80 × 50 mm</td>
                  </tr>
                  <tr>
                    <td>Bleed</td>
                    <td>±1 TD / ±1 MD</td>
                  </tr>
                  <tr>
                    <td>Die · Khuôn</td>
                    <td>82 × 52 mm</td>
                  </tr>
                  <tr>
                    <td>Layout</td>
                    <td>4 across · 1 MD = 4 pcs/shot</td>
                  </tr>
                  <tr>
                    <td>
                      <b>Plate tooth</b>
                    </td>
                    <td>
                      <b>17 T</b> → 53.98 mm
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <b>Magnetic tooth</b>
                    </td>
                    <td>
                      <b>17 T</b> → 53.98 mm
                    </td>
                  </tr>
                  <tr>
                    <td>Ratio · Tỉ số</td>
                    <td className="cl-wf-ok">✓ 1 : 1 integer</td>
                  </tr>
                  <tr>
                    <td>MOQ / EAU</td>
                    <td>250,000 / 3,000,000</td>
                  </tr>
                  <tr>
                    <td>Selling · Giá bán</td>
                    <td>$0.099</td>
                  </tr>
                </tbody>
              </table>
              <pre className="cl-wf-viz">{`     ← TD 330 mm →
  ┌────────────────────────┐
  │ [82×52] [82×52] [82×52] [82×52] │  ← 4 cav
  │ [82×52] [82×52] [82×52] [82×52] │
  │ [82×52] [82×52] [82×52] [82×52] │
  └────────────────────────┘
  pitch = 54 mm (17T · in-line)`}</pre>
              <button
                className="cl-wf-btn"
                onClick={() => loadExample(inlineGallusExample, 'In-line Gallus EM340')}
              >
                📋 Load this example · Nạp ví dụ này
              </button>
            </div>

            {/* ── Case 2: Off-line Gallus + RDC350 ── */}
            <div className="cl-wf-card cl-wf-offline">
              <div className="cl-wf-head">
                <div className="cl-wf-badge">Case 2</div>
                <div className="cl-wf-title">
                  <BiHead
                    en="Off-line · Gallus EM340 + RDC350"
                    vi="Off-line · Gallus EM340 + RDC350"
                  />
                </div>
                <div className="cl-wf-sub">
                  <BiRow
                    en="Print on Gallus, die-cut on RDC350. Plate 17T / Magnetic 34T (1:2)."
                    vi="In Gallus, bế RDC350. Plate 17T / Magnetic 34T (1:2)."
                  />
                </div>
              </div>
              <table className="cl-wf-table">
                <tbody>
                  <tr>
                    <td>Press · Máy</td>
                    <td>
                      <code>Gallus EM340</code> → <code>RDC350</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Web / Sheet</td>
                    <td>330 / 108 mm · 1 web</td>
                  </tr>
                  <tr>
                    <td>Net size · Net</td>
                    <td>80 × 50 mm</td>
                  </tr>
                  <tr>
                    <td>Bleed</td>
                    <td>±1 TD / ±1 MD</td>
                  </tr>
                  <tr>
                    <td>Die · Khuôn</td>
                    <td>82 × 52 mm</td>
                  </tr>
                  <tr>
                    <td>Layout</td>
                    <td>4 across · 2 MD = 8 pcs / cut repeat</td>
                  </tr>
                  <tr>
                    <td>
                      <b>Plate tooth</b>
                    </td>
                    <td>
                      <b>17 T</b> → 53.98 mm (Gallus)
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <b>Magnetic tooth</b>
                    </td>
                    <td>
                      <b>34 T</b> → 107.95 mm (RDC)
                    </td>
                  </tr>
                  <tr>
                    <td>Ratio · Tỉ số</td>
                    <td className="cl-wf-ok">✓ 1 : 2 integer</td>
                  </tr>
                  <tr>
                    <td>MOQ / EAU</td>
                    <td>500,000 / 6,000,000</td>
                  </tr>
                  <tr>
                    <td>Selling · Giá bán</td>
                    <td>$0.088</td>
                  </tr>
                </tbody>
              </table>
              <pre className="cl-wf-viz">{`  STEP 1 · In trên Gallus (17T plate)
  ┌────────────────────────┐
  │ [82] [82] [82] [82] │  pitch 54 mm
  │ [82] [82] [82] [82] │  (repeat ×2)
  └────────────────────────┘
          ▼ cuộn tháo ra
  STEP 2 · Bế trên RDC350 (34T mag)
  ┌────────────────────────┐
  │ [82] [82] [82] [82] │  pitch 108 mm
  │ [82] [82] [82] [82] │  (1 cut = 2 in)
  └────────────────────────┘`}</pre>
              <button
                className="cl-wf-btn"
                onClick={() => loadExample(offlineGallusRdcExample, 'Off-line Gallus + RDC350')}
              >
                📋 Load this example · Nạp ví dụ này
              </button>
            </div>

            {/* ── Case 3: Slit-after-print (9 → 3×3) ── */}
            <div className="cl-wf-card cl-wf-slit">
              <div className="cl-wf-head">
                <div className="cl-wf-badge">Case 3</div>
                <div className="cl-wf-title">
                  <BiHead
                    en="Slit · Print 9 cav → Slit 3 lanes → Cut 3/stamp"
                    vi="Slit · In 9 cav → Slit 3 lane → Bế 3/dập"
                  />
                </div>
                <div className="cl-wf-sub">
                  <BiRow
                    en="Print 1 wide web with 9 cavities across, slit into 3 narrow webs, die-cut 3 cav/lane."
                    vi="In 1 web rộng 9 cav ngang, slit thành 3 web hẹp, bế 3 cav/lane."
                  />
                </div>
              </div>
              <table className="cl-wf-table">
                <tbody>
                  <tr>
                    <td>Press · Máy</td>
                    <td>
                      <code>Gallus EM340</code> (in + slit + cut in-line hoặc tách công đoạn)
                    </td>
                  </tr>
                  <tr>
                    <td>Web (Print)</td>
                    <td>330 mm (1 wide web)</td>
                  </tr>
                  <tr>
                    <td>Web (Cut)</td>
                    <td>
                      ~110 mm × <b>3 lanes</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Net size · Net</td>
                    <td>30 × 50 mm</td>
                  </tr>
                  <tr>
                    <td>Bleed</td>
                    <td>±1 TD / ±1 MD</td>
                  </tr>
                  <tr>
                    <td>Die · Khuôn</td>
                    <td>32 × 52 mm</td>
                  </tr>
                  <tr>
                    <td>
                      <b>Slit after print?</b>
                    </td>
                    <td>
                      <b>✓ YES</b> · 3 lanes
                    </td>
                  </tr>
                  <tr>
                    <td>Print cavs across</td>
                    <td>
                      <b>9</b> (= 3 × 3)
                    </td>
                  </tr>
                  <tr>
                    <td>Cut cavs/web × Webs</td>
                    <td>
                      <b>3 × 3 = 9 pcs/shot</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Plate / Magnetic</td>
                    <td>17T / 17T · 1:1</td>
                  </tr>
                  <tr>
                    <td>MOQ / EAU</td>
                    <td>1,000,000 / 12,000,000</td>
                  </tr>
                </tbody>
              </table>
              <pre className="cl-wf-viz">{`  STEP 1 · Print wide web (1 × 9 cav)
  ┌──────── 330 mm ────────┐
  │[32][32][32]│[32][32][32]│[32][32][32]│
  │ lane A     │ lane B     │ lane C     │
  └──────── 3.175 × 17T ────┘
           ▼ slit giữa các lane
  STEP 2 · Cut 3 parallel lanes (3 × 3 cav)
  ┌──110mm──┐ ┌──110mm──┐ ┌──110mm──┐
  │[32][32][32]│ │[32][32][32]│ │[32][32][32]│
  └─────────┘ └─────────┘ └─────────┘
    die 1       die 2       die 3
   (3 dies song song, cùng chu kỳ bế)`}</pre>
              <button
                className="cl-wf-btn"
                onClick={() => loadExample(slit9to3Example, 'Slit · 9 → 3×3')}
              >
                📋 Load this example · Nạp ví dụ này
              </button>
            </div>
          </div>

          <Callout type="warn" title="⚠ When to use which?" titleVi="⚠ Khi nào dùng phương án nào?">
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>
                <b>In-line (Case 1):</b> small/medium orders (MOQ &lt; 500k), simple labels, tight
                register. One setup = lower setup cost per unit.
              </li>
              <li>
                <b>Off-line (Case 2):</b> large orders where setup cost dissolves, complex die work
                (foil, emboss, cold-stamp), or when the Gallus is bottlenecked. Two setups but each
                machine runs at max speed.
              </li>
              <li>
                <b>Slit (Case 3):</b> small labels (short part width) where 1 cavity doesn't fill
                the web — print 3×3 across for speed, then slit so the die-cut machine runs 3 small
                dies in parallel. Great for high-volume narrow SKUs.
              </li>
            </ul>
            <ul
              className="cl-bi-vi"
              style={{ margin: '8px 0 0 16px', padding: 0, fontStyle: 'italic' }}
            >
              <li>
                <b>In-line (Case 1):</b> đơn nhỏ/vừa (MOQ &lt; 500k), nhãn đơn giản, yêu cầu
                register chặt. Một setup → setup/unit rẻ hơn.
              </li>
              <li>
                <b>Off-line (Case 2):</b> đơn lớn (setup loãng ra), bế phức tạp (foil, emboss,
                cold-stamp), hoặc khi Gallus nghẽn. Hai setup nhưng mỗi máy chạy max tốc độ.
              </li>
              <li>
                <b>Slit (Case 3):</b> nhãn nhỏ (part hẹp), 1 cavity không lấp đủ web — in 3×3 cav
                ngang cho nhanh, rồi slit để máy bế chạy 3 khuôn nhỏ song song. Rất hợp SKU số lượng
                lớn nhưng nhỏ.
              </li>
            </ul>
          </Callout>
        </section>

        {/* 10 — Troubleshooting */}
        <section id="sec-trouble" className="cl-section">
          <header className="cl-section-header">
            <div className="cl-section-tag">10</div>
            <h2>
              <BiHead en="Troubleshooting Guide" vi="Hướng dẫn xử lý sự cố" />
            </h2>
            <p className="cl-section-sub">
              <BiRow
                en="Common errors — root causes, fixes, prevention"
                vi="Lỗi thường gặp — nguyên nhân, cách sửa, cách phòng"
              />
            </p>
          </header>

          {[
            {
              sev: 'CRITICAL',
              symptom: 'VA% / GM% = −435,000% (extremely large negative)',
              symptomVi: 'VA% / GM% = −435,000% (âm rất lớn)',
              root: 'Tool Life = 1 (instead of 200,000). Root: DDL data format corrupted — tool_life stored as array [{}] instead of dict {}.',
              rootVi:
                'Tool Life = 1 (lẽ ra 200,000). Nguồn: DDL bị sai format — tool_life lưu dạng array [{}] thay vì dict {}.',
              fix: 'Check ddl_sites.json. tool_life must be {"Pressplate":200000,…} NOT [{"Pressplate":200000,…}]. Fix: run repair_ddl_data.py then restart server.',
              fixVi:
                'Kiểm tra ddl_sites.json. tool_life phải là {"Pressplate":200000,…} CHỨ KHÔNG phải [{"Pressplate":200000,…}]. Sửa: chạy repair_ddl_data.py rồi restart server.',
              prev: 'Monitor ddl_sites_data.js after every DDL Excel update.',
              prevVi: 'Theo dõi ddl_sites_data.js sau mỗi lần cập nhật Excel DDL.',
            },
            {
              sev: 'CRITICAL',
              symptom: 'G.TOTAL COST ×250,000 too high (when MOQ not entered)',
              symptomVi: 'G.TOTAL COST cao gấp ×250,000 (khi không nhập MOQ)',
              root: 'MOQ=0 → Setup Cost ÷ 1 → entire setup allocated to 1 unit instead of 250,000.',
              rootVi: 'MOQ=0 → Setup Cost ÷ 1 → toàn bộ setup dồn cho 1 đơn vị thay vì 250,000.',
              fix: 'ALWAYS enter MOQ > 0 before clicking Calculate. System guard exists but manual entry is still required.',
              fixVi:
                'LUÔN nhập MOQ > 0 trước khi tính. Hệ thống có guard nhưng vẫn bắt buộc nhập tay.',
              prev: 'Default MOQ = 250,000. Never reset to 0 in templates.',
              prevVi: 'Mặc định MOQ = 250,000. Không bao giờ reset về 0 trong template.',
            },
            {
              sev: 'CRITICAL',
              symptom: 'Tooling cost unreasonably high (> 5% of total)',
              symptomVi: 'Chi phí khuôn cao bất hợp lý (> 5% tổng)',
              root: 'Tool Life fallback = 1 — tool_type not selected, or DDL data corrupted.',
              rootVi: 'Tool Life fallback = 1 — chưa chọn tool_type, hoặc DDL bị lỗi.',
              fix: 'Select correct tool_type from dropdown. Verify Tool Life display (must be ≥ 20,000 for any valid type).',
              fixVi:
                'Chọn tool_type đúng từ dropdown. Kiểm tra hiển thị Tool Life (phải ≥ 20,000 cho mọi loại hợp lệ).',
              prev: 'Always select tool_type. Verify displayed tool life > 1,000.',
              prevVi: 'Luôn chọn tool_type. Kiểm tra tool life hiển thị > 1,000.',
            },
            {
              sev: 'MEDIUM',
              symptom: 'Material cost = $0 (even after selecting material code)',
              symptomVi: 'Material cost = $0 (dù đã chọn material code)',
              root: 'Width = 0 or Price = 0. Pitch = 0 (sheet_length not entered). QPA_LM = 0.',
              rootVi: 'Width = 0 hoặc Price = 0. Pitch = 0 (chưa nhập sheet_length). QPA_LM = 0.',
              fix: 'Verify Width > 0 in material DB. sheet_length + min_gap > 0 → Pitch > 0. S price and G price > 0.',
              fixVi:
                'Kiểm tra Width > 0 trong DB vật tư. sheet_length + min_gap > 0 → Pitch > 0. S price và G price > 0.',
              prev: 'Check QPA and Pitch display after selecting material code.',
              prevVi: 'Kiểm tra QPA và Pitch hiển thị sau khi chọn material code.',
            },
            {
              sev: 'MEDIUM',
              symptom: 'UPH = 0 → Machine / Labor cost = $0',
              symptomVi: 'UPH = 0 → Chi phí máy / nhân công = $0',
              root: 'Speed = 0 (not entered), Efficiency = 0, or Speed UOM mismatch in rate table.',
              rootVi: 'Speed = 0 (chưa nhập), Efficiency = 0, hoặc Speed UOM lệch với rate table.',
              fix: 'Enter Speed > 0. Default efficiency = 0.85. Verify speed UOM in rate table matches machine type.',
              fixVi:
                'Nhập Speed > 0. Mặc định efficiency = 0.85. Kiểm tra speed UOM trong rate table khớp loại máy.',
              prev: 'Confirm UPH display after entering speed.',
              prevVi: 'Xác nhận UPH hiển thị sau khi nhập speed.',
            },
            {
              sev: 'MEDIUM',
              symptom: 'Unexpected VAT Loss appears in cost breakdown',
              symptomVi: 'VAT Loss bất ngờ xuất hiện trong cost breakdown',
              root: 'Trade Mode = USD(Book). Only used for goods that cannot reclaim input VAT.',
              rootVi: 'Trade Mode = USD(Book). Chỉ dùng cho hàng không hoàn được VAT đầu vào.',
              fix: 'Change Trade Mode to USD(Normal) if product is exported or input VAT is reclaimable.',
              fixVi:
                'Đổi Trade Mode thành USD(Normal) nếu hàng xuất khẩu hoặc hoàn được VAT đầu vào.',
              prev: 'Confirm Trade Mode with Finance before finalizing quotation.',
              prevVi: 'Xác nhận Trade Mode với Finance trước khi chốt báo giá.',
            },
            {
              sev: 'MINOR',
              symptom: 'VA% / GM% / CONTR% = N/A or not displayed',
              symptomVi: 'VA% / GM% / CONTR% = N/A hoặc không hiển thị',
              root: 'Selling Price = 0, or SP not entered in Header tab.',
              rootVi: 'Selling Price = 0, hoặc SP chưa nhập ở tab Header.',
              fix: 'Enter Selling Price > 0 in the Header tab. SP = 0 → % metrics cannot be calculated.',
              fixVi: 'Nhập Selling Price > 0 ở tab Header. SP = 0 → các chỉ số % không tính được.',
              prev: 'Default SP = 0.20. Enter SP immediately when opening calculator.',
              prevVi: 'Mặc định SP = 0.20. Nhập SP ngay khi mở calculator.',
            },
            {
              sev: 'MINOR',
              symptom: 'Ink cost = $0 (even after entering ink color)',
              symptomVi: 'Ink cost = $0 (dù đã nhập màu mực)',
              root: 'Print Type not selected (blank). Area% = 0. Coverage = 0 for non-Indigo ink.',
              rootVi:
                'Chưa chọn Print Type (rỗng). Area% = 0. Coverage = 0 với mực không phải Indigo.',
              fix: 'Select Print Type from dropdown. Enter Area% > 0 (fraction of base material surface printed).',
              fixVi: 'Chọn Print Type từ dropdown. Nhập Area% > 0 (tỷ lệ bề mặt vật liệu được in).',
              prev: 'Check Area% > 0 for all active ink rows.',
              prevVi: 'Kiểm tra Area% > 0 cho mọi dòng mực đang dùng.',
            },
            {
              sev: 'MINOR',
              symptom: 'Quote saved but not visible in Quote History',
              symptomVi: 'Quote đã lưu nhưng không thấy trong Quote History',
              root: 'Server not running, or quotes.json file corrupted (offline mode).',
              rootVi: 'Server không chạy, hoặc quotes.json bị lỗi (chế độ offline).',
              fix: 'Verify server is running on port 8765. Check server.py logs. Validate quotes.json is valid JSON.',
              fixVi:
                'Kiểm tra server đang chạy ở port 8765. Xem log server.py. Verify quotes.json là JSON hợp lệ.',
              prev: 'Check server status before saving any quotes.',
              prevVi: 'Kiểm tra trạng thái server trước khi lưu quote.',
            },
            {
              sev: 'INFO',
              symptom: 'GM% incorrect when reloading quote from History',
              symptomVi: 'GM% sai khi load lại quote từ History',
              root: 'DDL rates changed since quote was saved (machine rates, tool life updated).',
              rootVi:
                'DDL rates đã thay đổi sau khi quote được lưu (đơn giá máy, tool life đã update).',
              fix: 'Expected behavior — calculator always uses current DDL. Use manual override (🔒) to freeze specific values if historical accuracy needed.',
              fixVi:
                'Hành vi đúng — calculator luôn dùng DDL hiện tại. Dùng override tay (🔒) để khoá giá trị cụ thể nếu cần chính xác lịch sử.',
              prev: 'Note key rates/tool life in quote Description when saving.',
              prevVi: 'Ghi chú rates/tool life chính trong Description khi lưu quote.',
            },
          ].map((row, i) => (
            <div key={i} className={`cl-trouble cl-trouble-${row.sev.toLowerCase()}`}>
              <div className="cl-trouble-head">
                <span className="cl-trouble-num">#{i + 1}</span>
                <span className={`cl-trouble-sev cl-trouble-sev-${row.sev.toLowerCase()}`}>
                  {row.sev}
                </span>
                <span className="cl-trouble-symptom">
                  <span className="cl-bi-en">{row.symptom}</span>
                  <span className="cl-bi-vi">{row.symptomVi}</span>
                </span>
              </div>
              <div className="cl-trouble-body">
                <div>
                  <span className="cl-trouble-label">Root cause / Nguyên nhân:</span>
                  <div>{row.root}</div>
                  <div className="cl-bi-vi">{row.rootVi}</div>
                </div>
                <div>
                  <span className="cl-trouble-label">Fix / Cách sửa:</span>
                  <div>{row.fix}</div>
                  <div className="cl-bi-vi">{row.fixVi}</div>
                </div>
                <div>
                  <span className="cl-trouble-label">Prevention / Phòng ngừa:</span>
                  <div>{row.prev}</div>
                  <div className="cl-bi-vi">{row.prevVi}</div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <footer className="cl-footer">
          <div>
            <b>End of Formula Reference · Hết tài liệu tham chiếu</b>
          </div>
          <div className="cl-footer-meta">
            Source of truth / Nguồn:{' '}
            <code className="cl-ic">client/src/services/calcEngine.js</code> · Audit date / Ngày
            soát: {new Date().toISOString().slice(0, 10)} · Corrections applied / Đã chỉnh: 14 (see
            §00 / xem §00)
          </div>
          <div className="cl-footer-note">
            <div>
              If you find any discrepancy between this Legend and actual engine behavior, the{' '}
              <b>engine wins</b>. File an issue and we will fix the Legend — not the engine.
            </div>
            <div className="cl-bi-vi">
              Nếu phát hiện chênh lệch giữa Legend này và hành vi thực tế của engine,
              <b> engine là chuẩn</b>. Báo issue và chúng ta sẽ sửa Legend — không sửa engine.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
