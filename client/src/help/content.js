/**
 * Ops Control — Centralized Help Content
 *
 * Single source of truth for both the in-app Help tab and the
 * exported Word user guide. Each entry follows the same 10-field
 * template regardless of tab complexity — fields that don't apply
 * (e.g., formulas for a library tab) are left empty arrays.
 *
 * Language strategy:
 *   - `en` + `vi` for short fields (title, purpose).
 *   - Long-form fields (workflow, tips) are VI-primary since the
 *     primary audience is CCL Vietnam ops staff; EN summary is
 *     inlined at the top of each section when it helps.
 *
 * Adding a new tab:
 *   1. Add an entry keyed by the tab ID used in the Sidebar + router.
 *   2. Set `section` to match the sidebar group label.
 *   3. Fill in at minimum: title, purpose, workflow.
 *   4. (optional) Add a screenshot filename — place the PNG under
 *      `public/help/screenshots/<id>.png`.
 *   5. The Help tab index rebuilds from this file on next render.
 *
 * Screenshots convention:
 *   - Filename = tab id + optional suffix (e.g., 'print-area.png',
 *     'print-area-inspect.png').
 *   - Annotate callouts 1,2,3… in the image that match workflow steps.
 *   - 16:10 aspect, 1280×800 recommended; smaller is fine.
 */

// Helpers to keep entries terse. Prefer these over raw arrays so each
// callsite reads as a schema.
const bi = (en, vi) => ({ en, vi });

// Version metadata surfaced in the Help tab header and the Word cover.
// Bump `version` when adding a new feature worth highlighting; bump
// `lastUpdated` for every content edit (keeps the cover page honest).
// The Word export reads HELP_META directly; the in-app HelpTab could
// read it too to show a "Last updated" pill in the toolbar.
export const HELP_META = {
  version: 'Sprint 9 · IFS-style',
  lastUpdated: '2026-04-22',
  totalEntries: 48,
  screenshotCount: 16,
};

// ─────────────────────────────────────────────────────────────
// Domain glossary — searchable term dictionary (SAP convention)
// ─────────────────────────────────────────────────────────────
// Referenced by the Help tab's "Glossary" panel. Terms are sorted
// alphabetically in the UI. Add entries here as new domain concepts
// appear in any screen (Inks, Process, Planning, etc.).
export const GLOSSARY = [
  {
    term: 'Anilox',
    en: 'Engraved ceramic roll that meters ink onto the plate in flexographic printing. Characterised by LPI (Lines per Inch) and BCM (Billion Cubic Micrometres per square inch).',
    vi: 'Trục ceramic khắc kim loại cấp mực lên bản in flexo. Đặc trưng bởi LPI và BCM.',
  },
  {
    term: 'BCM',
    en: 'Billion Cubic Micrometres per square inch — the volume of ink an anilox cell holds. Higher BCM = more ink laid down per rev.',
    vi: 'Tỉ µm³/in² — thể tích mực mà cell anilox chứa. BCM cao = xuống nhiều mực hơn.',
  },
  {
    term: 'BOM',
    en: 'Bill of Materials — hierarchical list of components needed to produce one finished good.',
    vi: 'Định mức vật tư — danh mục phân cấp các linh kiện cần để sản xuất một thành phẩm.',
  },
  {
    term: 'CONTR%',
    en: 'Contribution margin. 1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price. Target ≥ 25%.',
    vi: 'Biên đóng góp. Mục tiêu ≥ 25%.',
  },
  {
    term: 'DDL',
    en: 'Drop-Down List — reference enum library (workcenters, tool types, UoMs, currencies…). Editable by Admin.',
    vi: 'Danh sách lựa chọn — thư viện enum tham chiếu.',
  },
  {
    term: 'EAU',
    en: 'Estimated Annual Usage — expected annual production volume per SKU. Used for tooling amortization cap.',
    vi: 'Ước lượng số lượng sử dụng hàng năm — dùng để cap phân bổ chi phí tooling.',
  },
  {
    term: 'G.TOTAL',
    en: 'Gross total cost using purchase (g) prices for materials. Feeds SGA. See also S.TOTAL.',
    vi: 'Tổng chi phí theo giá mua (g). Đầu vào SGA.',
  },
  {
    term: 'GM%',
    en: 'Gross Margin. 1 − s_ttl / sp_price. Target ≥ 15%.',
    vi: 'Biên lợi nhuận gộp. Mục tiêu ≥ 15%.',
  },
  {
    term: 'IML',
    en: 'In-Mould Label — label placed inside the injection mould and fused with the part during moulding.',
    vi: 'Nhãn trong khuôn — nhãn đặt vào khuôn và ép dính cùng sản phẩm khi đúc.',
  },
  {
    term: 'LM',
    en: 'Linear Metre — unit for web / roll material measured along the machine direction.',
    vi: 'Mét dài — đơn vị đo vật tư dạng web/cuộn theo chiều máy chạy.',
  },
  {
    term: 'MD / TD',
    en: 'Machine Direction (along the web) / Transverse Direction (across the web).',
    vi: 'Hướng máy (theo web) / Hướng ngang (ngang web).',
  },
  {
    term: 'MOQ',
    en: 'Minimum Order Quantity — smallest run the customer will commit to. Drives setup amortization.',
    vi: 'Số lượng đặt hàng tối thiểu — đơn vị nhỏ nhất khách cam kết. Ảnh hưởng phân bổ setup.',
  },
  {
    term: 'Offcut',
    en: 'Waste incurred when slitting a wide log to the required material width. Computed from (cavities MOD width) / cavities.',
    vi: 'Hao phí khi xẻ cuộn wide thành bề rộng yêu cầu. Tính từ (cavities MOD width) / cavities.',
  },
  {
    term: 'Pitch',
    en: 'Distance between successive parts along the machine direction. Drives UPH + QPA.',
    vi: 'Khoảng cách giữa các chi tiết liên tiếp theo hướng máy. Ảnh hưởng UPH + QPA.',
  },
  {
    term: 'QPA',
    en: 'Quantity Per Assembly / Part — material consumed per label, expressed as m² or LM.',
    vi: 'Số lượng mỗi nhãn — vật tư tiêu thụ cho mỗi nhãn, tính theo m² hoặc LM.',
  },
  {
    term: 'RDC',
    en: 'Rotary Die Cutting — continuous cylindrical die, 200k shots tool life typical.',
    vi: 'Máy cắt khuôn tròn liên tục — tuổi thọ khuôn 200k shots điển hình.',
  },
  {
    term: 'SGA',
    en: 'Selling, General & Administrative overhead. Per-site rate configured in Finance Data. Default 0%.',
    vi: 'Chi phí bán hàng, quản lý chung. Cấu hình theo site trong Finance Data. Mặc định 0%.',
  },
  {
    term: 'SKU',
    en: 'Stock Keeping Unit — unique product identifier. In Ops Control, the SKU is the primary key everywhere.',
    vi: 'Mã sản phẩm — định danh duy nhất. Trong Ops Control, SKU là khoá chính.',
  },
  {
    term: 'S.TOTAL',
    en: 'Supplier total cost using s-prices. Primary basis for GM% / VA% / CONTR% (Sprint 21 Finance alignment).',
    vi: 'Tổng chi phí theo giá s (supplier). Cơ sở chính cho GM% / VA% / CONTR%.',
  },
  {
    term: 'UPH',
    en: 'Units Per Hour — machine throughput. Formula varies by speed UOM (m/min, stamp/min, pcs/hr, sheets/hr, mtr/hr).',
    vi: 'Số đơn vị mỗi giờ — năng suất máy. Công thức tuỳ UOM tốc độ.',
  },
  {
    term: 'VA%',
    en: 'Value-Add ratio. 1 − (s_mat_cost + tooling + packing_ship) / sp_price. Target > 30%.',
    vi: 'Tỉ lệ giá trị gia tăng. Mục tiêu > 30%.',
  },
  {
    term: 'VAT(Book)',
    en: 'USD(Book) trade mode — domestic goods that cannot reclaim input VAT. Adds 15% VAT loss.',
    vi: 'Chế độ USD(Book) — hàng nội địa không hoàn VAT. Cộng thêm 15% VAT loss.',
  },
];

export const HELP_SECTIONS = [
  { key: 'HOME', label: bi('Home', 'Trang chủ') },
  { key: 'CALCULATORS', label: bi('Pricing Worksheet', 'Bảng tính giá') },
  { key: 'QUOTING', label: bi('Quoting', 'Báo giá') },
  { key: 'MANUFACTURING', label: bi('Manufacturing', 'Sản xuất') },
  { key: 'TRACKING', label: bi('Tracking', 'Theo dõi') },
  { key: 'REPORTS', label: bi('Reports', 'Báo cáo') },
  { key: 'LIBRARIES', label: bi('Libraries', 'Dữ liệu chuẩn') },
  { key: 'SYSTEM', label: bi('System', 'Hệ thống') },
  { key: 'PLANNING', label: bi('Planning', 'Kế hoạch') },
];

// Compact DSL for common building blocks.
// Bilingual helpers (bs/bt/bp) accept (en, vi) and return a bilingual
// object. The renderer will show EN on top + VI italic underneath.
// The legacy (tip/pit) helpers pass through a string — those entries
// render as-is and look VI-only, so new content should prefer the
// bs/bt/bp variants. (`step` was the third legacy helper but no entry
// uses it any more — removed.)
const field = (name, typeOrValues, desc) => ({ name, type: typeOrValues, desc });
// Bilingual helpers — every tips / pitfalls / step / requirement entry
// returns a { en, vi } object so the renderer can stack EN over VI.
// The legacy monolingual `tip` / `pit` / `step` helpers were removed in
// the 2026-04-25 EN/VI parity pass; new content should always use the
// bilingual variants below.
const bs = (en, vi) => ({ en, vi }); // bilingual step
const bt = (en, vi) => ({ en, vi }); // bilingual tip
const bp = (en, vi) => ({ en, vi }); // bilingual pitfall
const br = (en, vi) => ({ en, vi }); // bilingual requirement

// SAP-style schema extensions (Sprint 10 — Help redesign).
// SAP ERP help structure: Use → Integration → Prerequisites → Features
// → Procedure → Authorization → Constraints → Example → Result → See Also.
// These helpers mirror the field-type semantics so content authors don't
// have to remember the JSON shape.
const auth = (roleRequired, notes) => ({ roleRequired, notes });
const feat = (en, vi) => ({ en, vi }); // feature capability bullet
const con = (en, vi) => ({ en, vi }); // constraint / known limit
const biz = (en, vi) => ({ en, vi }); // business scenario paragraph
const res = (en, vi) => ({ en, vi }); // outcome / result statement
const ex = (scenario, steps, expected) => ({ scenario, steps, expected });

// IFS-style procedure block. Each procedure is ONE form panel / phase
// within a screen (e.g. "General", "Acquisition", "Cost"). Steps are
// concrete click-level instructions; `note` is an optional contextual
// paragraph rendered above the steps in italic.
//
// Usage:
//   procedures: [
//     proc('General', 'Khối Chung',
//       'The main product details — fill this first.',
//       [
//         'Click + button or press F3 to create new entry',
//         'Fill in SKU per Part Code rules (see Appendix A)',
//         ...
//       ],
//       // optional screenshot filename, same folder rules as tab-level screenshot
//       { screenshot: 'standard-general.png' },
//     ),
//   ]
const proc = (titleEn, titleVi, note, steps, opts = {}) => ({
  title: { en: titleEn, vi: titleVi },
  note: note ? (typeof note === 'string' ? { en: note, vi: note } : note) : null,
  steps,
  screenshot: opts.screenshot || null,
});

// Appendix table — columns + rows. Rendered as a bordered table in
// both the Help tab and the Word export. Inspired by IFS's
// "Appendix A - Part Code rules" pattern.
const appendix = (titleEn, titleVi, columns, rows) => ({
  title: { en: titleEn, vi: titleVi },
  columns, // [{ key, en, vi }]
  rows, // [{ [key]: value }]
});

export const HELP_CONTENT = {
  // ─────────────────────────────────────────────────────────────
  // HOME
  // ─────────────────────────────────────────────────────────────

  home: {
    id: 'home',
    section: 'HOME',
    title: bi('Home — your starting page', 'Home — trang khởi đầu'),
    function: bi(
      'Post-login dashboard with KPIs, due-soon list, module shortcuts',
      'Dashboard sau đăng nhập với KPI, danh sách đến hạn, shortcut module'
    ),
    path: 'Ops Cost > Home',
    purpose: bi(
      'The dashboard you see right after logging in. Shows your current workload at a glance + quick actions for common tasks. Layout responds fluidly to window size + sidebar collapse — works from a 13" laptop to a 4K / ultrawide monitor.',
      'Trang dashboard ngay sau khi đăng nhập. Hiển thị khối lượng công việc hiện tại + quick actions cho thao tác thường dùng. Bố cục co giãn theo kích thước cửa sổ và trạng thái sidebar — chạy mượt từ laptop 13" đến màn 4K / ultrawide.'
    ),
    whenToUse: bi(
      'Every login. Daily morning routine to scan workload + open the day plan. Click the "Ops Control" logo (top-left of the sidebar) anytime to return here from any other tab.',
      'Mỗi lần đăng nhập. Routine buổi sáng để quét khối lượng công việc + mở kế hoạch ngày. Click logo "Ops Control" (góc trên-trái sidebar) bất cứ lúc nào để quay về Home từ bất kỳ tab nào.'
    ),
    preRequisites: [],
    features: [
      feat(
        'Greeting + live clock + role chip — time-aware (morning / afternoon / evening), refreshes every minute.',
        'Lời chào + đồng hồ thời gian thực + nhãn role — đổi theo buổi (sáng / chiều / tối), refresh mỗi phút.'
      ),
      feat(
        '4 KPI tiles — Active Work Orders (open + assigned to you), Due Today (color-coded: red overdue, amber today), My Approvals (gated by permission), Open Orders (active customer orders in your scope). Click any tile to drill into its source list.',
        '4 ô KPI — Active Work Orders (đang mở + giao cho bạn), Due Today (màu hoá: đỏ quá hạn, vàng đến hạn hôm nay), My Approvals (theo quyền), Open Orders (đơn hàng khách đang chạy trong phạm vi). Click bất kỳ ô nào để drill xuống danh sách nguồn.'
      ),
      feat(
        "Today's Focus — top 6 due/overdue work orders sorted by due date. Click any row to open the WO detail.",
        "Today's Focus — top 6 work order đến/quá hạn sắp xếp theo ngày due. Click dòng bất kỳ để mở chi tiết WO."
      ),
      feat(
        'Modules grid (4 cards) — Pricing Worksheet (Std + Cpx, MOQ tiers, formal quotes), Manufacturing (Routing, Mfg Structures, IFS Inventory), Tracking (RFQ Tracker, Sample Tracking), Reports (Dashboard, Quote Analysis). Click any card to land on its first sub-tab.',
        'Lưới module (4 thẻ) — Pricing Worksheet (Std + Cpx, MOQ, báo giá chính thức), Manufacturing (Routing, Mfg Structures, IFS Inventory), Tracking (RFQ Tracker, Sample Tracking), Reports (Dashboard, Quote Analysis). Click thẻ nào sẽ vào sub-tab đầu tiên của module đó.'
      ),
      feat(
        'Quick Actions (6 buttons) — New Quote · New Order · RFQ Tracker · Approvals · IFS Inventory · Help. Permission-gated: hidden if your role lacks access.',
        'Quick Actions (6 nút) — New Quote · New Order · RFQ Tracker · Approvals · IFS Inventory · Help. Theo quyền: ẩn nếu role không có truy cập.'
      ),
      feat(
        'Sidebar logo → Home — click the "Ops Control" wordmark in the sidebar header to return to Home from any tab.',
        'Logo sidebar → Home — click chữ "Ops Control" ở phần đầu sidebar để quay về Home từ tab bất kỳ.'
      ),
      feat(
        'Auto-redirect after login — successful sign-in lands you on Home regardless of last-active-tab. Covers fresh logins + post-logout returns.',
        'Tự chuyển về Home sau đăng nhập — đăng nhập thành công đưa bạn về Home không phụ thuộc tab vừa mở. Áp dụng cho login mới + trở lại sau logout.'
      ),
    ],
    workflow: [
      bs(
        'Open the app → login screen → enter credentials + 2FA code if enrolled.',
        'Mở app → màn hình đăng nhập → nhập tài khoản + mã 2FA nếu đã enroll.'
      ),
      bs('Successful login lands on Home automatically.', 'Đăng nhập thành công sẽ tự về Home.'),
      bs(
        'Scan the 4 KPI tiles — focus on red / amber states first.',
        'Quét 4 ô KPI — ưu tiên các trạng thái đỏ / vàng trước.'
      ),
      bs(
        "Review Today's Focus — open any due / overdue WO that needs attention.",
        "Xem Today's Focus — mở các WO đến hạn / quá hạn cần xử lý."
      ),
      bs(
        'Use the Modules grid OR Quick Actions to jump into a workflow (e.g. New Quote).',
        'Dùng lưới Modules HOẶC Quick Actions để vào workflow (vd New Quote).'
      ),
      bs(
        'Click the "Ops Control" logo in the sidebar header anytime to return here.',
        'Click logo "Ops Control" ở đầu sidebar bất kỳ lúc nào để quay lại đây.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Page reload (Cmd+R / F5) preserves your last-active-tab if "Remember me" was checked at login. Without Remember me, reload returns you to Home.',
        'Reload (Cmd+R / F5) sẽ giữ tab đang mở nếu đăng nhập có tick "Remember me". Không tick thì reload đưa về Home.'
      ),
      bt(
        'KPI tiles refresh on every page navigation — they are always current when you return to Home, no manual refresh needed.',
        'Ô KPI refresh khi đổi trang — luôn cập nhật khi bạn quay lại Home, không cần refresh tay.'
      ),
      bt(
        'Quick Actions buttons honour your permission group — admins see all 6, viewonly users may see only Help. Talk to your admin if a button is missing.',
        'Nút Quick Actions theo permission group — admin thấy đủ 6 nút, viewonly có thể chỉ thấy Help. Hỏi admin nếu thiếu nút.'
      ),
    ],
    pitfalls: [
      bp(
        'KPI tiles read from your assignment scope — if your user account has no work orders / orders / approvals assigned, tiles show 0. That is correct, not a bug. Ask a planner to assign work to you.',
        'Ô KPI đọc theo phạm vi user — nếu tài khoản chưa được giao WO / Order / Approval, ô sẽ về 0. Đây là đúng, không phải lỗi. Nhờ planner phân công.'
      ),
      bp(
        'A blank "Today\'s Focus" section means no due / overdue WOs in your scope — also normal, not a bug. The section hides itself when empty.',
        'Khu "Today\'s Focus" trống nghĩa là không có WO đến / quá hạn trong phạm vi — cũng bình thường. Khu này tự ẩn khi rỗng.'
      ),
    ],
    relatedTabs: ['settings-profile', 'work-orders', 'rfq-tracker', 'standard'],
    screenshot: 'home.png',
  },

  // ─────────────────────────────────────────────────────────────
  // CALCULATORS
  // ─────────────────────────────────────────────────────────────

  standard: {
    id: 'standard',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet (Standard)', 'Bảng tính giá (Tiêu chuẩn)'),
    function: bi(
      'Compute unit cost and sell price for a single-part label job',
      'Tính đơn giá và giá bán cho job in nhãn một-phần'
    ),
    path: 'Ops Cost > Calculators > Pricing (Std)',
    authorization: auth(
      'Cost',
      'User role can view; Cost role required to Save + Submit for Approval. Approved quotes auto-advance to Formal Quotation.'
    ),
    businessScenario: biz(
      'Use this screen to produce a customer-facing price quote for a single-SKU label job in under five minutes. The worksheet aggregates four cost drivers (material, ink, labour, tooling), applies the facility-calibrated overhead and margin targets, and outputs a tier-indexed sell price that can be submitted for Finance approval.',
      'Dùng màn hình này để tạo báo giá cho khách hàng cho một job nhãn một-SKU trong dưới 5 phút. Bảng tính tổng hợp 4 yếu tố chi phí (vật tư, mực, nhân công, tooling), áp định mức overhead + margin của nhà máy, và xuất giá bán theo bậc có thể submit cho Tài chính duyệt.'
    ),
    features: [
      feat(
        'Multi-tier MOQ pricing (up to 5 tiers per quote).',
        'Báo giá theo nhiều bậc MOQ (tối đa 5 bậc/quote).'
      ),
      feat(
        'Live cost-waterfall: Material → Ink → Labour → Overhead → Margin → Sell.',
        'Waterfall chi phí real-time.'
      ),
      feat(
        'Automatic integration with Print Area Calculator for ink µL per color.',
        'Tự động import µL mực từ Print Area Calculator.'
      ),
      feat(
        'Work-center + Rate Table LOV auto-fills hourly rates + setup + run rates.',
        'LOV Work-center + Rate Table tự điền đơn giá/giờ.'
      ),
      feat(
        'Version-controlled save: re-saving the same SKU creates a new revision in Quote History.',
        'Save có kiểm soát phiên bản: lưu lại cùng SKU tạo revision mới.'
      ),
      feat(
        'Sub-tab order (P2 reorder): RFQ & MOQ Info → Layout → Materials & Process → Pack & Ship → Lead time → Cost Breakdown → Balancing → Summarize → Legend. The Materials & Process tab replaces the retired Layout-time Materials / Inks / Processes trio (Sprint S-PRICING-COMBINED-P2).',
        'Thứ tự sub-tab (P2 reorder): RFQ & MOQ Info → Layout → Vật tư & Công đoạn → Pack & Ship → Lead time → Cost Breakdown → Balancing → Summarize → Legend. Tab Vật tư & Công đoạn thay cho bộ 3 tab cũ Materials / Inks / Processes (Sprint S-PRICING-COMBINED-P2).'
      ),
    ],
    example: ex(
      bi(
        'A customer requests pricing for 250,000 adhesive labels at 82×52 mm, printed flexo 1-color on white paper with permanent acrylic adhesive. Target delivery: 4 weeks.',
        'Khách yêu cầu báo giá 250,000 nhãn dán 82×52 mm, in flexo 1 màu trên giấy trắng keo permanent acrylic. Giao hàng 4 tuần.'
      ),
      [
        bs(
          'Enter SKU "T3000001", qty 250,000, width 82, height 52.',
          'Nhập SKU "T3000001", qty 250,000, width 82, height 52.'
        ),
        bs(
          'In the Materials & Process sub-tab (stacked sections), choose Paper → White Semi-gloss → Permanent Acrylic in the Materials section; set Number of Inks = 1 + print type = Flexo in the Inks section; pick work-center "Flexo-AT-10" in the Processes section (Rate Table auto-fills hourly rate).',
          'Trong sub-tab Vật tư & Công đoạn (các section xếp chồng), chọn Paper → White Semi-gloss → Permanent Acrylic trong section Vật tư; đặt Số màu = 1 + loại in = Flexo trong section Mực; chọn work-center "Flexo-AT-10" trong section Công đoạn (Rate Table tự điền đơn giá/giờ).'
        ),
        bs(
          'Set target Margin % = 30 on the RFQ & MOQ Info header. Review the GM% / VA% / Contr% on the Summarize sub-tab.',
          'Đặt target Margin % = 30 ở header RFQ & MOQ Info. Xem GM% / VA% / Contr% trên sub-tab Summarize.'
        ),
        bs(
          'Choose Save → the quote is committed to Quote History with a new revision ID.',
          'Chọn Save → báo giá được lưu vào Quote History với mã revision mới.'
        ),
      ],
      bi(
        'The system computes a sell price of approximately $0.099 per label, a GM% of ~87%, and surfaces the quote in the Pending Approvals queue for Finance.',
        'Hệ thống tính giá bán ~$0.099/nhãn, GM% ~87%, và đẩy báo giá vào hàng chờ duyệt cho Tài chính.'
      )
    ),
    result: res(
      'A new quote revision is persisted in Quote History and moves to the Pending Approvals queue. The cost engineer can now trigger the Formal Quotation PDF once approved.',
      'Một revision báo giá mới được lưu trong Quote History và chuyển vào queue Pending Approvals. Cost engineer có thể tạo PDF Formal Quotation sau khi được duyệt.'
    ),
    purpose: bi(
      'Fast single-part estimator for the most common printing jobs — one artwork, one substrate, one finishing sequence. Produces unit cost + suggested sell price in under a minute.',
      'Ước tính nhanh cho job in phổ biến: một artwork, một vật liệu, một chuỗi gia công. Tính ra đơn giá + giá bán đề xuất trong dưới 1 phút.'
    ),
    whenToUse: bi(
      'Use when the customer asks "how much for X stickers of Y size" and the spec is already clear. For multi-layer labels or multi-level BOMs use Complex Calculator instead.',
      'Dùng khi khách hỏi "bao nhiêu tiền cho X chiếc tem Y×Z mm" và spec đã rõ. Với nhãn nhiều lớp hoặc BOM nhiều cấp dùng Máy tính Phức tạp.'
    ),
    preRequisites: [
      br(
        'Product dimensions (mm) + total quantity from the customer.',
        'Kích thước sản phẩm (mm) + số lượng tổng từ khách.'
      ),
      br(
        'Material code from Material Library OR a known unit cost.',
        'Mã vật tư từ Material Library HOẶC đơn giá đã biết.'
      ),
      br(
        'Print method + ink count; ideally ink volumes from Print Area Calculator.',
        'Công nghệ in + số màu; tốt nhất là có volume mực từ Print Area Calculator.'
      ),
    ],
    procedures: [
      proc(
        'Product panel',
        'Khối Sản phẩm',
        bi(
          'The left-most panel holds the job identity. Fill this FIRST — downstream calcs depend on quantity + dimensions.',
          'Panel bên trái nhất chứa thông tin job. Điền TRƯỚC — các tính toán sau phụ thuộc vào số lượng + kích thước.'
        ),
        [
          bs(
            'Click the SKU field and type the customer part number (unique per customer, max 32 chars).',
            'Click ô SKU và nhập mã sản phẩm khách hàng (duy nhất theo khách, tối đa 32 ký tự).'
          ),
          bs(
            'Fill in Product name — optional but shown on the formal quote PDF, keep it customer-facing.',
            'Điền Tên sản phẩm — không bắt buộc nhưng hiện trên PDF báo giá chính thức, dùng tên khách đọc được.'
          ),
          bs(
            'Enter Quantity (pcs) — the run size; drives per-unit amortization of setup and tooling.',
            'Nhập Số lượng (pcs) — kích thước lô; quyết định phân bổ setup và tooling theo từng đơn vị.'
          ),
          bs(
            'Enter Width and Height (mm) — the trim size of the finished product, before bleed.',
            'Nhập Chiều rộng và Chiều cao (mm) — kích thước trim của thành phẩm, trước khi cộng bleed.'
          ),
          bs(
            'Select Drawing scale if the artwork is not 1:1 (e.g. 2:1 for artwork drawn 2× real size).',
            'Chọn Drawing scale nếu artwork không phải 1:1 (vd 2:1 nếu artwork vẽ lớn gấp 2 lần kích thước thật).'
          ),
          bs(
            'Click Save within this panel to stash the SKU shell before moving on — prevents loss on browser refresh.',
            'Click Save trong panel này để lưu khung SKU trước khi sang bước kế — tránh mất khi refresh browser.'
          ),
        ]
      ),
      proc(
        'Material panel',
        'Khối Vật tư',
        bi(
          'Picks the substrate from Material Library. Library edits flow here immediately — no refresh needed.',
          'Chọn vật tư từ Material Library. Thay đổi ở library chảy về đây ngay lập tức — không cần refresh.'
        ),
        [
          bs(
            'Click Material field → LOV popup lists all active materials filtered by substrate type.',
            'Click ô Material → popup LOV liệt kê mọi vật tư đang hoạt động, lọc theo loại substrate.'
          ),
          bs(
            'Select the target material; unit cost + default Waste % auto-fill.',
            'Chọn vật tư mục tiêu; đơn giá + Waste % mặc định tự điền.'
          ),
          bs(
            'Override Waste % only if you know the press-specific value for this material; otherwise keep the library default.',
            'Ghi đè Waste % chỉ khi biết giá trị riêng của máy cho vật tư này; nếu không giữ mặc định.'
          ),
          bs(
            'Optional: toggle "Sheet-fed" if the material is cut from sheets rather than web (changes waste math).',
            'Tuỳ chọn: bật "Sheet-fed" nếu vật tư cắt từ tờ thay vì cuộn (thay đổi công thức waste).'
          ),
        ]
      ),
      proc(
        'Print method panel',
        'Khối Công nghệ in',
        bi(
          'Drives ink volume + labor cost curves. Default Flexo for most labels; switch for silkscreen / digital short runs.',
          'Ảnh hưởng đường cong ink volume + chi phí nhân công. Mặc định Flexo cho đa số nhãn; đổi cho silkscreen / digital lô nhỏ.'
        ),
        [
          bs(
            'Select Print Method (Letterpress / Flexo / Silkscreen / Offset / Digital).',
            'Chọn Công nghệ in (Letterpress / Flexo / Silkscreen / Offset / Digital).'
          ),
          bs(
            'Enter Number of inks — how many separate ink colors on the label.',
            'Nhập Số màu — tổng số màu mực khác nhau trên nhãn.'
          ),
          bs(
            'Click the ← Import button to pull µL/label per color from a saved Print Area Calculator job. Matching is by SKU; manual override still allowed.',
            'Click nút ← Import để lấy µL/nhãn từng màu từ job Print Area đã lưu. Match theo SKU; có thể ghi đè thủ công.'
          ),
          bs(
            "If no Print Area run exists, the defaults fall back to the method's industry-baseline µL (see Legend).",
            'Nếu chưa chạy Print Area, mặc định sẽ dùng µL chuẩn ngành của công nghệ đó (xem Legend).'
          ),
        ]
      ),
      proc(
        'Labor & overhead panel',
        'Khối Nhân công & Overhead',
        bi(
          'Rates pulled live from Rate Table. Operators rarely edit here — if numbers look wrong, fix the Rate Table source instead.',
          'Đơn giá lấy live từ Rate Table. Operator ít khi sửa ở đây — nếu số sai, sửa gốc trong Rate Table.'
        ),
        [
          bs(
            'Click Work center LOV → pick the press + any post-press operation.',
            'Click LOV Work center → chọn máy in + bất kỳ công đoạn post-press.'
          ),
          bs(
            'Setup hours and Run rate pre-populate from Routing Ops; override only for one-off non-standard jobs.',
            'Setup hours và Run rate tự điền từ Routing Ops; chỉ ghi đè cho job đặc biệt không chuẩn.'
          ),
          bs(
            'Verify the hourly rate shown matches the current Rate Table effective date.',
            'Xác nhận đơn giá/giờ hiển thị khớp với ngày hiệu lực hiện tại của Rate Table.'
          ),
        ]
      ),
      proc(
        'Margin & output panel',
        'Khối Biên lợi nhuận & kết quả',
        bi(
          'The right panel shows a live breakdown. No save needed here — just the decision on Margin %.',
          'Panel bên phải hiện breakdown real-time. Không cần save ở đây — chỉ là quyết định Margin %.'
        ),
        [
          bs(
            'Enter target Margin % — gross margin, not markup (40% margin ≠ 40% markup).',
            'Nhập Margin % mục tiêu — gross margin, không phải markup (40% margin ≠ 40% markup).'
          ),
          bs(
            'Review the waterfall: Material → Ink → Labor → Overhead → Margin → Sell.',
            'Xem waterfall: Material → Ink → Labor → Overhead → Margin → Sell.'
          ),
          bs(
            'Click Save to commit to Quote History (key = SKU; re-saving overwrites — use History for audit).',
            'Click Save để lưu vào Quote History (key = SKU; save lại sẽ ghi đè — dùng History để audit).'
          ),
          bs(
            'To compare margin scenarios non-destructively, save as a new quote (right-click Copy in Quote History) and tweak — there is no in-place What-if slider in the shipped UI.',
            'Để so sánh kịch bản margin không phá data, save thành quote mới (right-click Copy trên Quote History) rồi chỉnh — UI hiện không có slider What-if tại chỗ.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [
      field('SKU', 'string', 'Customer part number; used as the primary key everywhere.'),
      field('Quantity', 'number', 'Total units in the run. Drives per-unit cost amortization.'),
      field(
        'Waste %',
        'percent',
        'Press setup + running waste. Default from material spec; override if you know better.'
      ),
      field(
        'Margin %',
        'percent',
        'Target gross margin; drives sell price = cost / (1 − margin/100).'
      ),
      field(
        'Work center',
        'LOV',
        'From Routing Ops library; selecting one auto-loads setup time + run rate.'
      ),
      field(
        'Drawing scale',
        'enum',
        '1:1 / 2:1 / 4:1. Artwork-to-physical ratio; corrects mm² output.'
      ),
    ],
    formulas: [
      {
        name: 'Material cost/unit',
        expr: 'length × width × unit_price × (1 + waste%)',
        meaning: bi(
          'Raw material cost absorbed by one label, inflated by the press-waste factor.',
          'Chi phí vật tư thô cho một nhãn, cộng thêm hệ số hao phí của máy.'
        ),
        example:
          'length=30mm, width=20mm, unit_price=0.0005 USD/mm², waste=8%\n= 30 × 20 × 0.0005 × 1.08 = 0.324 USD / label',
        notes: 'Length and width include bleed if the material is sheet-fed.',
      },
      {
        name: 'Ink cost/unit',
        expr: 'Σ (µL_per_label × ink_unit_cost_per_mL × 0.001)',
        meaning: bi(
          "Sum of every ink's volume × its mL unit cost, converted from µL (1 mL = 1000 µL).",
          'Tổng tích của thể tích từng màu × đơn giá mL, đổi từ µL (1 mL = 1000 µL).'
        ),
        example:
          'Black 2 µL × 0.03 USD/mL + Red 0.4 µL × 0.08 USD/mL\n= (2 × 0.03 + 0.4 × 0.08) × 0.001 = 0.0000920 USD / label',
        notes: 'µL/label comes from Print Area Calculator when imported, else defaults.',
      },
      {
        name: 'Labor cost/unit',
        expr: 'Σ (setup_hours / qty + run_hours_per_unit) × hourly_rate',
        meaning: bi(
          'Setup amortized over the run + per-unit run time, all multiplied by the work-cell hourly rate.',
          'Setup phân bổ theo số lượng run + thời gian chạy mỗi đơn vị, nhân đơn giá/giờ của work-cell.'
        ),
        example:
          'Setup 2h for 10,000 units + run rate 500 uph → run_per_unit = 1/500 h\nRate 20 USD/h: (2/10000 + 1/500) × 20 = 0.044 USD / label',
        notes: 'Hourly rate from Rate Table (Labor category).',
      },
      {
        name: 'Sell price',
        expr: 'total_cost / (1 − margin%)',
        meaning: bi(
          'Gross-margin sell price. Different from markup: 30% margin = sell 1.43× cost; 30% markup = sell 1.30× cost.',
          'Giá bán theo margin. Khác với markup: margin 30% = bán 1.43× cost; markup 30% = bán 1.30× cost.'
        ),
        example: 'total_cost = 0.368, margin = 30%\n= 0.368 / (1 − 0.30) = 0.526 USD / label',
        notes: 'Use gross-margin formula, not markup. 30% margin ≠ 30% markup.',
      },
    ],
    appendices: [
      appendix(
        'Margin vs. Markup conversion',
        'Quy đổi Margin ↔ Markup',
        [
          { key: 'margin', en: 'Margin %', vi: 'Margin %' },
          { key: 'markup', en: 'Markup % (on cost)', vi: 'Markup % (trên cost)' },
          { key: 'formula', en: 'Sell / cost ratio', vi: 'Tỉ lệ Sell / cost' },
        ],
        [
          { margin: '20%', markup: '25%', formula: '1.25' },
          { margin: '30%', markup: '42.86%', formula: '1.43' },
          { margin: '40%', markup: '66.67%', formula: '1.67' },
          { margin: '50%', markup: '100%', formula: '2.00' },
        ]
      ),
    ],
    tips: [
      bt(
        'Hover any field label for an inline tooltip with the formula that uses it.',
        'Hover lên label của bất kỳ ô nào để xem tooltip giải thích công thức dùng nó.'
      ),
      bt(
        'Import ink µL from Print Area Calculator if you have the artwork — prevents under-costing of mixed-ink jobs.',
        'Import µL mực từ Print Area Calculator nếu có artwork — tránh tính thiếu cho job nhiều màu.'
      ),
      bt(
        'For repeat SKUs, open the previous version from Quote History and Save As → saves 2 minutes per quote.',
        'Với SKU lặp lại, mở phiên bản cũ từ Quote History và Save As → tiết kiệm 2 phút mỗi báo giá.'
      ),
    ],
    pitfalls: [
      bp(
        'Forgetting to update Waste % on a new material: default is conservative (≈8%); tight-web materials can be 2–3%.',
        'Quên cập nhật Waste % cho vật tư mới: mặc định là thận trọng (~8%); vật tư tight-web có thể chỉ 2-3%.'
      ),
      bp(
        'Margin vs. markup confusion: 40% margin = 67% markup on cost. Always use the Margin % field, not markup.',
        'Nhầm Margin với Markup: 40% margin = 67% markup trên cost. Luôn dùng ô Margin %, không phải markup.'
      ),
      bp(
        'Saving overwrites the previous SKU entry. For variants (A/B pricing) use different SKU suffixes (e.g. "LBL-001-v2").',
        'Save sẽ ghi đè SKU cũ. Với các biến thể (pricing A/B) dùng hậu tố SKU khác (vd "LBL-001-v2").'
      ),
    ],
    relatedTabs: ['complex', 'ink-calc', 'print-area', 'lib-mat', 'lib-rate', 'summarize'],
    screenshot: 'standard.png',
  },

  complex: {
    id: 'complex',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet (Complex)', 'Bảng tính giá (Phức tạp)'),
    function: bi(
      'Multi-level BOM cost roll-up with per-level yield + shared setup',
      'Tính giá BOM nhiều cấp có yield từng cấp + setup dùng chung'
    ),
    path: 'Ops Cost > Calculators > Pricing (Cpx)',
    purpose: bi(
      'Multi-level BOM cost roll-up for assemblies: multi-layer labels, multi-part kits, in-mold decorations. Handles per-level waste, per-process yield, and cross-level shared setup.',
      'Tính giá theo BOM nhiều cấp: tem nhiều lớp, bộ kit nhiều linh kiện, IML. Xử lý waste từng cấp, yield từng công đoạn, setup dùng chung giữa các cấp.'
    ),
    whenToUse: bi(
      'When Standard calc is not enough: 2+ substrates laminated, face + liner with different specs, or a product going through 3+ distinct process chains.',
      'Khi Standard không đủ: nhiều substrate ép/laminate, face/liner khác spec, hoặc qua 3+ chuỗi công đoạn khác nhau.'
    ),
    preRequisites: [
      br(
        'BOM structure pre-loaded in Mfg Structures or entered manually.',
        'Cấu trúc BOM có sẵn trong Mfg Structures hoặc nhập thủ công.'
      ),
      br(
        'Rate Table with per-operation hourly rates configured.',
        'Rate Table có đơn giá/giờ theo từng công đoạn đã cấu hình.'
      ),
    ],
    procedures: [
      proc(
        'New BOM / Open',
        'Tạo BOM mới / Mở BOM có sẵn',
        bi(
          'Cloning an existing SKU saves time — Complex BOMs often share 70-80% of structure.',
          'Clone SKU cũ tiết kiệm thời gian — BOM phức tạp thường chia sẻ 70-80% cấu trúc.'
        ),
        [
          bs(
            'Click New BOM to start from blank, OR click Open → pick SKU from the LOV.',
            'Click New BOM để làm từ đầu, HOẶC click Open → chọn SKU từ LOV.'
          ),
          bs(
            'When opening: all levels hydrate with the saved yield, routing, materials.',
            'Khi open: mọi cấp được hydrate với yield, routing, vật tư đã lưu.'
          ),
          bs(
            'Click Save As to clone a new SKU from the current state — preserves the source.',
            'Click Save As để clone SKU mới từ trạng thái hiện tại — giữ nguyên nguồn.'
          ),
        ]
      ),
      proc(
        'Per-level materials',
        'Vật tư theo cấp',
        bi(
          'Level 0 = finished product; each higher level is a sub-assembly consumed by the level below.',
          'Level 0 = thành phẩm; mỗi cấp cao hơn là sub-assembly được tiêu thụ bởi cấp dưới.'
        ),
        [
          bs(
            'For each level row, click + to add a material line.',
            'Với mỗi dòng level, click + để thêm dòng vật tư.'
          ),
          bs(
            'Pick material from Material Library LOV; qty-per-assembly is required.',
            'Chọn vật tư từ LOV Material Library; qty-per-assembly bắt buộc.'
          ),
          bs(
            "Override Waste % if this level's press has different efficiency than default.",
            'Ghi đè Waste % nếu máy ở cấp này có hiệu suất khác mặc định.'
          ),
        ]
      ),
      proc(
        'Alternative materials per subproduct (Maint.Mat ↔ Alternative.Mat)',
        'Vật tư thay thế theo subproduct (Maint.Mat ↔ Alternative.Mat)',
        bi(
          'Each subproduct carries its own Maint and Alternative material sets independently — useful for what-if pricing on multi-substrate assemblies where only one level changes substrate.',
          'Mỗi subproduct mang bộ Maint và Alternative riêng biệt — phù hợp phân tích what-if cho assembly nhiều lớp khi chỉ 1 cấp đổi substrate.'
        ),
        [
          bs(
            'Same toggle UI as Standard calc (radio Maint/Alt + ⇄ copy icon + confirm modal) but rendered PER subproduct in the SP expandable row.',
            'UI toggle giống Standard (radio Maint/Alt + icon ⇄ copy + modal confirm) nhưng render TRÊN MỖI subproduct trong row SP mở rộng.'
          ),
          bs(
            'Only the active set per SP drives aggregateComplex output (Cost Breakdown, Summarize, Formal Quotation). Inactive sets are stored alongside but ignored.',
            'Chỉ bộ active của mỗi SP driver output aggregateComplex (Cost Breakdown, Summarize, Formal Quotation). Bộ inactive lưu nhưng không tính.'
          ),
          bs(
            'Mixed active sets across SPs are supported: e.g., SP-A active=main while SP-B active=alt produces a valid hybrid quote.',
            'Cho phép trộn bộ active giữa các SP: vd SP-A active=main còn SP-B active=alt vẫn ra báo giá hợp lệ.'
          ),
          bs(
            'Audit events MATERIALS_COPY and MATERIALS_ACTIVE_SWITCH include sp_index + sp_code in the detail JSON for per-SP forensic tracing.',
            'Audit MATERIALS_COPY và MATERIALS_ACTIVE_SWITCH có sp_index + sp_code trong detail JSON cho forensic tracing theo từng SP.'
          ),
          bs(
            'Feature is gated by the same OPS_FEATURE_ALT_MATERIALS env var as Standard. When off (prod default), the toggle is hidden and only the main set renders, matching legacy behavior.',
            'Tính năng gate cùng env var OPS_FEATURE_ALT_MATERIALS như Standard. Khi off (mặc định prod), toggle ẩn và chỉ render main set, hành vi giống cũ.'
          ),
          bs(
            "Per-tier Setup LM overrides (PR #C) — sp_mat_setup_lm vs sp_mat_setup_lm_alt branch PER SP. SP-A active=main + SP-B active=alt at the same MOQ tier pick independent override maps. Switching one SP's toggle does not affect another SP's tier overrides.",
            'Setup LM ghi đè theo tier (PR #C) — sp_mat_setup_lm vs sp_mat_setup_lm_alt branch PER SP. SP-A active=main + SP-B active=alt cùng MOQ tier pick các override map độc lập. Toggle 1 SP không ảnh hưởng tier override của SP khác.'
          ),
          bs(
            'Quote History badge for Cpx: shows "Main" if all SPs are main, "Alt" if all alt, "Mixed (N alt / M main)" otherwise. Counts give reviewers a fast snapshot of the quote\'s composition.',
            'Badge Quote History cho Cpx: "Main" nếu tất cả SP main, "Alt" nếu tất cả alt, "Mixed (N alt / M main)" khi có cả 2. Số đếm cho reviewer snapshot nhanh thành phần quote.'
          ),
        ]
      ),
      proc('Per-level routing', 'Routing theo cấp', null, [
        bs(
          'Click the Routing column of any level → LOV of operations from Routing Ops library.',
          'Click cột Routing của cấp bất kỳ → LOV công đoạn từ thư viện Routing Ops.'
        ),
        bs(
          'Multi-select to string ops in sequence: Print → Die-cut → Laminate, etc.',
          'Multi-select để xâu chuỗi công đoạn: Print → Die-cut → Laminate, v.v.'
        ),
        bs(
          'Check Shared setup when the same press runs multiple levels in the same window (amortizes setup across jobs).',
          'Tick Shared setup khi cùng máy chạy nhiều cấp trong cùng cửa sổ (phân bổ setup giữa các job).'
        ),
      ]),
      proc(
        'Yield configuration',
        'Cấu hình Yield',
        bi(
          'Yield is per-level, compounds across levels. Example: 95% × 95% × 95% = 85.7% overall.',
          'Yield theo từng cấp, compound qua các cấp. Ví dụ: 95% × 95% × 95% = 85.7% tổng.'
        ),
        [
          bs(
            'Enter Yield % per level (column "Yield").',
            'Nhập Yield % cho từng cấp (cột "Yield").'
          ),
          bs(
            'System computes Required input qty upstream so final output matches the order qty.',
            'Hệ thống tính Required input qty ngược lên để output cuối khớp số lượng đơn hàng.'
          ),
          bs(
            'Red cell = yield below warning threshold (default 85%); review with ops before quoting.',
            'Ô đỏ = yield dưới ngưỡng cảnh báo (mặc định 85%); review với ops trước khi báo giá.'
          ),
        ]
      ),
      proc('Waterfall review + save', 'Review waterfall + lưu', null, [
        bs(
          'Right panel shows the cost waterfall: raw → after level N → final.',
          'Panel phải hiển thị waterfall chi phí: raw → sau level N → final.'
        ),
        bs(
          'Click any level bar → drilldown table with material + labor + overhead.',
          'Click thanh level bất kỳ → bảng drilldown vật tư + nhân công + overhead.'
        ),
        bs(
          'Right-click any row → "What-if yield" for ±2% sensitivity preview.',
          'Right-click dòng bất kỳ → "What-if yield" để preview ±2% sensitivity.'
        ),
        bs(
          'Click Save — stored in the "Complex" bucket of Quote History (separate from Standard).',
          'Click Save — lưu vào bucket "Complex" của Quote History (tách khỏi Standard).'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field(
        'Level',
        'number',
        'BOM depth. Level 0 is the finished product; higher numbers are sub-assemblies.'
      ),
      field(
        'Yield %',
        'percent',
        'Fraction of good units to advance. Compound: 95% × 95% × 95% ≈ 85.7% overall.'
      ),
      field(
        'Shared setup',
        'bool',
        'True = setup hours amortized across ALL levels sharing this press; False = duplicated per level.'
      ),
    ],
    formulas: [
      {
        name: 'Required input qty',
        expr: 'required_input = required_output / (yield_1 × yield_2 × … × yield_n)',
        meaning: bi(
          'To get N good pieces out, you must start with MORE in. Yield compounds across every process step.',
          'Để ra N sản phẩm tốt, phải đưa vào NHIỀU HƠN. Yield compound qua từng công đoạn.'
        ),
        example:
          'Order 10,000, yields 95% × 95% × 95% = 85.7%\nrequired_input = 10000 / 0.857 = 11,670 raw units',
        notes: 'Must input more than you need — compounds per level.',
      },
      {
        name: 'Setup amortized (shared)',
        expr: 'per_unit_setup = total_setup_hours × hourly_rate / Σ qty_i',
        meaning: bi(
          'When one setup serves multiple levels/jobs on the same press, split the cost across all units they produce.',
          'Khi 1 setup phục vụ nhiều cấp/job trên cùng máy, chia chi phí cho tổng đơn vị sản xuất.'
        ),
        example:
          'Setup 2h × $20/h = $40 total\n2 jobs sharing: qty_A=5k + qty_B=15k = 20k units\nper_unit = 40 / 20000 = $0.002 / unit',
        notes:
          'When shared_setup=True, the setup cost is split across ALL jobs on the press in the same run window.',
      },
    ],
    tips: [
      bt(
        "Build reusable BOM templates in Mfg Structures — don't re-enter 6-level BOMs from scratch every quote.",
        'Tạo template BOM dùng lại trong Mfg Structures — đừng nhập lại BOM 6 cấp từ đầu mỗi báo giá.'
      ),
      bt(
        'Sensitivity view: right-click any level row → "What-if yield" to see how ±2% yield changes sell price.',
        'View nhạy cảm: right-click hàng bất kỳ → "What-if yield" để xem ±2% yield ảnh hưởng giá bán thế nào.'
      ),
    ],
    pitfalls: [
      bp(
        'Forgetting to mark shared setup: will over-count press-hour cost by 2–3× on multi-level jobs.',
        'Quên đánh dấu shared setup: sẽ đếm gấp 2-3× chi phí giờ máy cho job nhiều cấp.'
      ),
      bp(
        'Yield entered as decimal instead of percent: 0.95 vs 95 produces a 95× error. Field is always percent.',
        'Nhập yield thập phân thay vì phần trăm: 0.95 vs 95 sẽ lệch 95×. Ô luôn là phần trăm.'
      ),
    ],
    relatedTabs: ['standard', 'lib-mfg', 'lib-rop', 'lib-inventory', 'summarize'],
    screenshot: 'complex.png',
  },

  'lib-mat': {
    id: 'lib-mat',
    section: 'CALCULATORS',
    title: bi('Material Library', 'Thư viện Vật tư'),
    function: bi(
      'Master catalog of materials + unit cost + waste defaults',
      'Catalog gốc vật tư + đơn giá + waste mặc định'
    ),
    path: 'Ops Cost > Calculators > Material Cost',
    purpose: bi(
      'Central reference for all materials used across quoting. Unit costs, waste defaults, supplier cross-references, substitution chains.',
      'Thư viện trung tâm cho mọi vật tư dùng trong báo giá. Đơn giá, waste mặc định, mã nhà cung cấp, chuỗi thay thế.'
    ),
    whenToUse: bi(
      'Before quoting: verify material cost is current. When sourcing: check alternates. When onboarding: see the catalog.',
      'Trước khi báo giá: kiểm tra đơn giá còn hiện hành. Khi sourcing: tra phương án thay thế. Khi on-board: xem catalog.'
    ),
    preRequisites: [
      br(
        'User+ role to view costs; Cost+ role to edit unit prices.',
        'Role User+ để xem chi phí; Role Cost+ để sửa đơn giá.'
      ),
    ],
    procedures: [
      proc('Search + filter', 'Tìm kiếm + lọc', null, [
        bs(
          'Use the search box (top) — matches code, description, supplier.',
          'Dùng ô search (trên cùng) — match theo code, mô tả, nhà cung cấp.'
        ),
        bs(
          'Filter by substrate type dropdown: Paper / Film / Foil / Composite.',
          'Lọc theo dropdown loại substrate: Paper / Film / Foil / Composite.'
        ),
        bs(
          'Sort by clicking column headers (Code, Cost, Last updated).',
          'Sắp xếp bằng cách click header cột (Code, Cost, Last updated).'
        ),
      ]),
      proc(
        'Detail panel',
        'Panel chi tiết',
        bi(
          'Click any row to open the right-side detail drawer.',
          'Click dòng bất kỳ để mở drawer chi tiết bên phải.'
        ),
        [
          bs('Review current unit cost + currency.', 'Xem đơn giá hiện tại + đơn vị tiền tệ.'),
          bs(
            'Price History section shows last 12 months (chart + table).',
            'Mục Price History hiển thị 12 tháng gần nhất (chart + bảng).'
          ),
          bs(
            'Linked SKUs section shows every quote currently using this material.',
            'Mục Linked SKUs hiển thị mọi báo giá đang dùng vật tư này.'
          ),
        ]
      ),
      proc(
        'Edit unit cost (Cost+ role)',
        'Sửa đơn giá (role Cost+)',
        bi(
          'Every edit is audited: username + timestamp + old-value kept.',
          'Mọi chỉnh sửa đều được audit: username + timestamp + giá cũ được giữ.'
        ),
        [
          bs(
            'Click pencil icon on the row to enter edit mode.',
            'Click icon bút chì trên dòng để vào chế độ edit.'
          ),
          bs(
            'Change Unit cost; optionally add a Note (why, source).',
            'Đổi Unit cost; tuỳ chọn thêm Note (lý do, nguồn).'
          ),
          bs(
            'Save → audit entry created; Linked SKUs can be bulk-resaved to propagate.',
            'Save → tạo audit entry; Linked SKUs có thể bulk-resave để lan toả.'
          ),
        ]
      ),
      proc('Export', 'Xuất', null, [
        bs('Click ⬇ CSV in the toolbar.', 'Click ⬇ CSV trong toolbar.'),
        bs(
          'Current filter set is preserved — use for procurement weekly review.',
          'Filter hiện tại được giữ — dùng cho procurement review hàng tuần.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field(
        'Code',
        'string',
        'Internal material code; must match the code stored in Standard/Complex calcs.'
      ),
      field('Substrate', 'enum', 'Paper / Film / Foil / Composite / Other.'),
      field('Unit cost', 'money', 'VND or USD (configurable per tenant); sensitive to role.'),
      field(
        'Waste default',
        'percent',
        'Pre-populated in Standard calc; operators can override per job.'
      ),
    ],
    formulas: [],
    tips: [
      bt(
        'Use the Price History button to audit unusual quote variations — a hidden price change is often the cause.',
        'Dùng nút Price History để audit biến thiên báo giá bất thường — đổi giá âm thầm thường là nguyên nhân.'
      ),
    ],
    pitfalls: [
      bp(
        'Editing unit cost without recording the source in the notes field makes future audits difficult.',
        'Sửa đơn giá mà không ghi nguồn vào notes khiến audit sau này khó khăn.'
      ),
    ],
    relatedTabs: ['standard', 'complex', 'lib-inventory', 'rfq-tracker'],
    screenshot: null,
  },

  'ink-calc': {
    id: 'ink-calc',
    section: 'CALCULATORS',
    title: bi('Inks Calculator', 'Máy tính Mực in'),
    function: bi(
      'Per-process ink consumption (µL/label, mL/1k) and cost',
      'Tính tiêu thụ mực theo công đoạn (µL/nhãn, mL/1k) + chi phí'
    ),
    path: 'Ops Cost > Calculators > Inks',
    purpose: bi(
      'Per-process ink consumption + cost. Two sub-processes: Silkscreen (mesh + Q·P·A method) and Flexo (anilox database + chroma volume).',
      'Tính lượng + chi phí mực theo công đoạn. 2 sub-process: Silkscreen (lưới + Q·P·A) và Flexo (database anilox).'
    ),
    whenToUse: bi(
      'After a Print Area run: convert per-color mm² into per-process mL, or verify µL/label against press logs.',
      'Sau Print Area: quy đổi mm² từng màu ra mL theo công đoạn, hoặc đối chiếu µL/label với log máy in.'
    ),
    preRequisites: [
      br(
        'Print Area result (per-color mm² breakdown) for the artwork.',
        'Kết quả Print Area (mm² chi tiết từng màu) cho artwork.'
      ),
      br(
        'Anilox reference (flexo) or mesh + emulsion spec (silkscreen) for the press.',
        'Reference anilox (flexo) hoặc spec lưới + emulsion (silkscreen) cho máy.'
      ),
    ],
    procedures: [
      proc('Process selector', 'Chọn công đoạn', null, [
        bs('Top tabs: Silkscreen / Flexo.', 'Tab trên cùng: Silkscreen / Flexo.'),
        bs('Pick the one matching the target press.', 'Chọn công đoạn khớp với máy mục tiêu.'),
        bs(
          'Each sub-tab is independent — settings do not copy across.',
          'Mỗi sub-tab độc lập — cài đặt không copy qua lại.'
        ),
      ]),
      proc(
        'Silkscreen — spec input',
        'Silkscreen — nhập thông số',
        bi(
          'See entry "Inks — Silkscreen detail" for the physics + calibration.',
          'Xem entry "Mực in — Chi tiết Silkscreen" để biết vật lý + hiệu chỉnh.'
        ),
        [
          bs(
            'Pick mesh from library, OR enter mesh count (T/cm) + thread diameter.',
            'Chọn lưới từ library, HOẶC nhập mesh count (T/cm) + đường kính sợi.'
          ),
          bs('Enter emulsion thickness (µm).', 'Nhập độ dày emulsion (µm).'),
          bs(
            'System computes film thickness + open area automatically.',
            'Hệ thống tự tính độ dày film + open area.'
          ),
        ]
      ),
      proc(
        'Flexo — anilox input',
        'Flexo — nhập anilox',
        bi(
          'See entry "Inks — Flexo detail" for BCM conversion.',
          'Xem entry "Mực in — Chi tiết Flexo" để biết cách quy đổi BCM.'
        ),
        [
          bs(
            'Pick anilox from library → LPI + BCM auto-populate.',
            'Chọn anilox từ library → LPI + BCM tự điền.'
          ),
          bs(
            'Override transfer_factor only for calibrated values specific to your press.',
            'Ghi đè transfer_factor chỉ với giá trị đã hiệu chỉnh cho máy cụ thể.'
          ),
        ]
      ),
      proc('Area + output', 'Diện tích + kết quả', null, [
        bs(
          'Enter area (mm²) OR click "← Import from Print Area" to pull by SKU.',
          'Nhập diện tích (mm²) HOẶC click "← Import from Print Area" để lấy theo SKU.'
        ),
        bs(
          'Output rows: µL/label, mL/1k, cost/label, cost/1k.',
          'Dòng output: µL/nhãn, mL/1k, chi phí/nhãn, chi phí/1k.'
        ),
        bs(
          'Compare "Calculated" vs "Actual from press logs" — delta > 15% flags a palette miss or anilox wear.',
          'So sánh "Tính toán" vs "Thực tế từ log máy" — delta > 15% báo hiệu thiếu màu hoặc anilox mòn.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field(
        'Mesh count (silk)',
        'number',
        'Threads per inch. Higher mesh = finer detail, less ink per pass.'
      ),
      field('Emulsion (silk)', 'number', 'µm. Thicker emulsion = thicker ink layer.'),
      field('Anilox LPI (flexo)', 'number', 'Lines per inch of the engraved roll.'),
      field(
        'BCM (flexo)',
        'number',
        'Billion cubic microns per square inch — the anilox ink-carrying capacity.'
      ),
    ],
    formulas: [
      {
        name: 'Silkscreen ink volume',
        expr: 'µL = area_mm² × film_thickness_µm × transfer_factor × 0.001',
        notes: 'film_thickness depends on mesh + emulsion; typical 10–20 µm.',
      },
      {
        name: 'Flexo ink volume',
        expr: 'µL = area_mm² × (BCM × 0.06451) × transfer_factor × 0.001',
        notes:
          '0.06451 converts BCM (billion cubic µm per in²) to wet film µm assuming full anilox volume transfers.',
      },
    ],
    tips: [
      bt(
        'Keep a calibrated anilox in the library and mark one as "reference" for the facility — it shortcuts new-job setup.',
        'Giữ một anilox đã hiệu chỉnh trong library và đánh dấu làm "reference" cho xưởng — giúp setup job mới nhanh hơn.'
      ),
    ],
    pitfalls: [
      bp(
        "Using last year's mesh spec on a new emulsion batch — re-characterize after every chemistry change.",
        'Dùng spec mesh năm trước cho lô emulsion mới — phải characterize lại sau mỗi lần đổi hoá chất.'
      ),
    ],
    relatedTabs: ['print-area', 'standard', 'complex', 'lib-rate'],
    screenshot: 'ink-calc.png',
  },

  'print-area': {
    id: 'print-area',
    section: 'CALCULATORS',
    title: bi('Print Area Calculator', 'Máy tính Diện tích In'),
    function: bi(
      'Measure per-color ink coverage on artwork → mm² → µL',
      'Đo độ phủ mực từng màu trên artwork → mm² → µL'
    ),
    path: 'Ops Cost > Calculators > Print Area',
    authorization: auth(
      'User',
      'View + analyze available to all. Cost role required to commit results to an SKU Library record.'
    ),
    businessScenario: biz(
      'Use this screen to derive defensible per-colour ink consumption for any label artwork. The engine runs a nine-stage pixel pipeline (render → background detect → crop → mask → perceptual quantize → merge → outlier rescue → pin inject → count) to surface rare spot inks that density-biased methods would miss, then converts coverage to physical mm² and ink volume in µL/label. The output is consumed by the Inks sub-tab of Pricing Worksheet.',
      'Dùng màn hình này để suy ra lượng mực tiêu thụ từng màu có căn cứ cho artwork nhãn bất kỳ. Engine chạy pipeline 9 bước (render → phát hiện nền → crop → mask → lượng tử hoá theo cảm nhận → gộp → cứu outlier → pin inject → đếm) để đưa ra màu spot hiếm mà phương pháp density-biased bỏ sót, rồi quy đổi độ phủ ra mm² vật lý + µL/nhãn. Kết quả được sub-tab Inks của Pricing Worksheet dùng.'
    ),
    features: [
      feat(
        'Artwork input: PNG / JPG / WebP / SVG / PDF / AI (with native Adobe Illustrator support via embedded PDF stream).',
        'Đầu vào: PNG / JPG / WebP / SVG / PDF / AI (hỗ trợ AI gốc qua PDF stream).'
      ),
      feat(
        'Perceptual color separation using CIE L*a*b* ΔE76 — JND-aware.',
        'Tách màu theo cảm nhận CIE L*a*b* ΔE76.'
      ),
      feat(
        'Spot-color rescue: chroma-boost + outlier rescue + manual pin (3-layer defense).',
        'Cứu màu spot: chroma-boost + outlier rescue + pin thủ công (3 lớp).'
      ),
      feat(
        'Anti-aliasing sub-pixel weighting — AA edges contribute fractional ink.',
        'Trọng số sub-pixel chống răng cưa — cạnh AA đóng góp mực phần.'
      ),
      feat(
        'Per-method ink transfer factors + film thickness (Flexo / Silkscreen / Offset / Letterpress / Digital).',
        'Transfer factor + độ dày film theo công nghệ in.'
      ),
      feat(
        'Separations export: one PNG per ink (film-positive for plate / screen burning).',
        'Xuất separations: 1 PNG/màu (film positive).'
      ),
    ],
    example: ex(
      bi(
        'A Samsung washing-machine control panel label (WA4000B) is 240×54 mm, predominantly black with 0.3% red "Wash / Rinse / Spin" warning text. Pre-Sprint-9 analysis absorbed the red into the dominant dark cluster, producing a 3-ink palette (Black / Gray / Silver).',
        'Tem panel máy giặt Samsung (WA4000B) 240×54 mm, nền đen với 0.3% chữ cảnh báo đỏ "Wash/Rinse/Spin". Trước Sprint-9, màu đỏ bị hấp thụ vào cluster đen dominant, kết quả chỉ có 3 màu (Black / Gray / Silver).'
      ),
      [
        bs(
          'Drag the AI file onto the drop zone. Enter Width 240, Height 54.',
          'Kéo thả file AI. Nhập Width 240, Height 54.'
        ),
        bs(
          'Select Print Method = Flexo. Chroma-boost and Outlier Rescue are ON by default.',
          'Chọn Flexo. Chroma-boost + Outlier Rescue mặc định BẬT.'
        ),
        bs(
          'Choose Analyze. The system surfaces the red cluster at 0.3% coverage.',
          'Chọn Analyze. Hệ thống đưa ra cluster đỏ ở 0.3% coverage.'
        ),
        bs(
          'If red is still missing, choose 🎯 Inspect color, click the red pixel, choose 📌 Pin as spot ink, and re-Analyze.',
          'Nếu đỏ vẫn thiếu, chọn Inspect color, click pixel đỏ, Pin as spot ink, Analyze lại.'
        ),
        bs(
          'Choose Save → results are persisted under the SKU and available to Pricing Worksheet via Import.',
          'Chọn Save → kết quả lưu theo SKU, Pricing Worksheet có thể Import.'
        ),
      ],
      bi(
        'The palette now contains 4 inks including the warning red at 0.3% coverage. Ink volumes downstream are accurate, preventing a 3-4× under-cost on warning-text quotes.',
        'Palette giờ có 4 màu gồm màu đỏ cảnh báo ở 0.3%. Thể tích mực downstream chính xác, tránh tính thiếu 3-4× cho quote có chữ cảnh báo.'
      )
    ),
    result: res(
      'A per-colour coverage table (mm², %, µL/label, mL/1k) is saved under the SKU. Downstream screens (Pricing Inks sub-tab, Ink Calculator) import these volumes automatically.',
      'Một bảng coverage theo màu (mm², %, µL/nhãn, mL/1k) được lưu theo SKU. Các màn hình downstream (Inks sub-tab, Ink Calculator) tự import.'
    ),
    purpose: bi(
      'Measures per-color ink coverage on label artwork and converts into physical area (mm²) + ink volume (µL / mL per 1000). Industry-grade with perceptual color separation (Lab ΔE76).',
      'Đo độ phủ mực từng màu trên artwork nhãn, quy đổi ra diện tích vật lý (mm²) + thể tích mực (µL / mL per 1000). Chuẩn công nghiệp với tách màu theo cảm nhận Lab ΔE76.'
    ),
    whenToUse: bi(
      'Before any quote where ink is > 5% of the cost. Always for new SKUs. Re-run when artwork changes or the press anilox is re-certified.',
      'Trước mọi báo giá mà mực > 5% chi phí. Luôn chạy cho SKU mới. Chạy lại khi artwork thay đổi hoặc anilox được re-cert.'
    ),
    preRequisites: [
      br(
        'Artwork file: PNG / JPG / WebP / SVG / PDF / AI.',
        'File artwork: PNG / JPG / WebP / SVG / PDF / AI.'
      ),
      br(
        'Product trim dimensions (mm) — CRITICAL, drives every mm² output.',
        'Kích thước trim sản phẩm (mm) — QUAN TRỌNG, quyết định mọi mm² output.'
      ),
      br('Drawing scale if artwork is not 1:1.', 'Drawing scale nếu artwork không phải 1:1.'),
    ],
    procedures: [
      proc(
        'Product panel',
        'Khối Sản phẩm',
        bi(
          'All mm² outputs scale from these dimensions. Wrong dims = wrong quote.',
          'Mọi output mm² scale theo các kích thước này. Sai dims = sai báo giá.'
        ),
        [
          bs(
            'Enter SKU — identifies the saved job in the Library.',
            'Nhập SKU — định danh job đã lưu trong Library.'
          ),
          bs(
            'Enter Width × Height in mm (trim size, without bleed).',
            'Nhập Chiều rộng × Chiều cao mm (kích thước trim, chưa có bleed).'
          ),
          bs(
            'Optional: enter Bleed (mm) if the artwork includes bleed margins — ink printed on bleed still counts toward consumption.',
            'Tuỳ chọn: nhập Bleed (mm) nếu artwork có bleed — mực in trên bleed VẪN tính vào tiêu thụ.'
          ),
          bs(
            'Pick Drawing scale — 1:1 for most artworks; 2:1 or 4:1 if the design is oversized for detail.',
            'Chọn Drawing scale — 1:1 cho đa số; 2:1 hoặc 4:1 nếu design được vẽ lớn hơn để dễ nhìn chi tiết.'
          ),
          bs(
            'Set Render DPI (300 default, 600 for fine detail — doubles render time).',
            'Đặt Render DPI (300 mặc định, 600 cho chi tiết mịn — gấp đôi thời gian render).'
          ),
        ]
      ),
      proc('Print method panel', 'Khối Công nghệ in', null, [
        bs(
          'Click one of: Letterpress / Flexo / Silkscreen / Offset / Digital.',
          'Click 1 trong: Letterpress / Flexo / Silkscreen / Offset / Digital.'
        ),
        bs(
          'The transfer factor + film thickness are fixed per method (see Legend §4); change only if you have calibrated values for this press.',
          'Transfer factor + độ dày film cố định theo công nghệ (xem Legend §4); chỉ đổi nếu có giá trị đã hiệu chỉnh cho máy này.'
        ),
      ]),
      proc(
        'Artwork upload',
        'Tải Artwork',
        bi(
          'Three ways to load: drag-drop, click-to-browse, or Cmd/Ctrl-V paste. PDF/AI are rendered via pdf.js at the requested DPI.',
          '3 cách tải: kéo-thả, click-chọn file, hoặc Cmd/Ctrl-V paste. PDF/AI render qua pdf.js theo DPI đã chọn.'
        ),
        [
          bs(
            'Drag the artwork file onto the drop zone, OR',
            'Kéo file artwork vào vùng drop, HOẶC'
          ),
          bs(
            'Click the drop zone to open the file picker, OR',
            'Click vùng drop để mở file picker, HOẶC'
          ),
          bs(
            'Paste with Cmd+V (Mac) / Ctrl+V (Windows) if you have an image on the clipboard.',
            'Paste bằng Cmd+V (Mac) / Ctrl+V (Windows) nếu đã có ảnh trong clipboard.'
          ),
          bs(
            'Wait for the preview canvas to show the rendered artwork (1-3 s depending on DPI).',
            'Chờ preview canvas hiển thị artwork (1-3 giây tuỳ DPI).'
          ),
        ]
      ),
      proc(
        'Analysis run',
        'Chạy phân tích',
        bi(
          'Runs the 9-stage pipeline: BG detect → crop → mask → quantize → merge → rescue → pin inject → count → build result.',
          'Chạy pipeline 9 bước: BG detect → crop → mask → quantize → merge → rescue → pin inject → count → build.'
        ),
        [
          bs('Click ▶ Analyze artwork.', 'Click ▶ Analyze artwork.'),
          bs(
            'Review the per-color table: COLOR swatch, NAME, HEX, AREA %, AREA mm², ML/LABEL, ML/1K.',
            'Xem bảng theo màu: ô COLOR, NAME, HEX, AREA %, AREA mm², ML/LABEL, ML/1K.'
          ),
          bs(
            'Click any color ROW to toggle "ignore" — excluded colors drop from the total (use for dieline magenta, varnish).',
            'Click HÀNG màu bất kỳ để bật/tắt "ignore" — màu loại trừ không tính vào tổng (dùng cho dieline magenta, varnish).'
          ),
          bs(
            'Click any color CHIP above the table to overlay that ink on the canvas (visual QC).',
            'Click CHIP màu phía trên bảng để overlay màu đó lên canvas (QC trực quan).'
          ),
          bs(
            'Click Total row to see aggregate printed pct, printed mm², total µL.',
            'Click dòng Total để xem tổng % in, mm² in, tổng µL.'
          ),
        ]
      ),
      proc(
        'Pin missing spot ink (Sprint 9)',
        'Pin màu spot bị thiếu',
        bi(
          'Three-layer defense handles 95% of spot-color cases automatically. Use this only when coverage is < 0.05% AND the ink must appear.',
          '3 lớp defense xử lý tự động 95% case. Chỉ dùng pin khi coverage < 0.05% VÀ bắt buộc phải hiện màu đó.'
        ),
        [
          bs(
            'Click 🎯 Inspect color — button turns purple "✓ Inspect ON".',
            'Click 🎯 Inspect color — button chuyển tím "✓ Inspect ON".'
          ),
          bs(
            'Zoom in if needed (scroll or pinch on the canvas).',
            'Zoom vào nếu cần (scroll hoặc pinch trên canvas).'
          ),
          bs(
            'Click the exact pixel of the spot ink you want preserved (e.g. the red W in "Wash").',
            'Click đúng pixel của màu spot muốn giữ (vd chữ W đỏ trong "Wash").'
          ),
          bs(
            'A purple pick-info panel appears below the overlay chips.',
            'Panel pick-info màu tím xuất hiện dưới các chip overlay.'
          ),
          bs(
            'Click 📌 Pin as spot ink — button flips to filled amber.',
            'Click 📌 Pin as spot ink — button chuyển amber đầy.'
          ),
          bs(
            'An amber chip strip appears above Results listing the pinned hex.',
            'Một chip strip amber xuất hiện phía trên Results liệt kê các hex đã pin.'
          ),
          bs(
            'Click ▶ Analyze artwork again — the pinned hex now has its own cluster.',
            'Click ▶ Analyze artwork lại — hex đã pin giờ có cluster riêng.'
          ),
          bs(
            'To unpin: click the × inside the amber chip, or click the pin button again.',
            'Để unpin: click × trong chip amber, hoặc click lại button pin.'
          ),
        ]
      ),
      proc(
        'Manual ROI',
        'ROI thủ công',
        bi(
          'When auto-crop picks up unwanted content (dim lines, multi-up layouts, front+back), draw the exact label box.',
          'Khi auto-crop bắt phải nội dung không mong muốn (dim lines, multi-up, front+back), vẽ ROI chính xác.'
        ),
        [
          bs('Click ⬚ Draw ROI in the Results header.', 'Click ⬚ Draw ROI ở header Results.'),
          bs(
            'On the Analysis Area canvas, drag a rectangle around ONLY the label.',
            'Trên canvas Analysis Area, kéo hình chữ nhật bao quanh CHỈ nhãn.'
          ),
          bs(
            'Review the live X × Y mm readout to confirm it matches the trim size.',
            'Kiểm tra readout X × Y mm trực tiếp để xác nhận khớp kích thước trim.'
          ),
          bs(
            'Click ▶ Analyze — the ROI persists with the saved job.',
            'Click ▶ Analyze — ROI lưu cùng với job.'
          ),
          bs('To clear: click × next to the ROI button.', 'Để xoá: click × cạnh nút ROI.'),
        ]
      ),
      proc('Save + separations export', 'Lưu + xuất Separations', null, [
        bs(
          'Click 💾 Save result — persists under this SKU in the Library tab.',
          'Click 💾 Save result — lưu theo SKU này trong tab Library.'
        ),
        bs(
          'For film-positive export: click ⬇ Separations — downloads one PNG per non-ignored ink, rendered as solid black on white, sized to the analyzed region.',
          'Xuất film-positive: click ⬇ Separations — tải về 1 PNG mỗi màu không bị ignore, render đen trên nền trắng, kích thước theo vùng đã phân tích.'
        ),
        bs(
          'Drop the PNGs into your screen-burning (silkscreen) or plate-imaging (flexo) workflow.',
          'Thả PNG vào workflow screen-burning (silkscreen) hoặc plate-imaging (flexo).'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field('Width/Height (mm)', 'number', 'TRIM size. Frame (+bleed) is computed automatically.'),
      field('Bleed (mm)', 'number', 'Extra margin on all 4 sides; ink on bleed counts.'),
      field('Drawing scale', 'enum', '1:1, 2:1, 4:1 etc. Artwork-to-physical ratio.'),
      field('K colors', '1-16', 'Upper bound of MMCQ palette. Default 8 after Sprint 9.'),
      field('Chroma boost', 'bool', 'Upsamples high-chroma pixels to rescue rare spot inks.'),
      field(
        'Rescue outliers',
        'bool',
        'Post-pass that promotes coherent outlier pixels to new clusters.'
      ),
      field('Pinned spot hex', 'hex[]', 'User-forced centroids via the eyedropper pin.'),
    ],
    formulas: [
      {
        name: 'Coverage',
        expr: 'pct = C_i / total_pixels',
        meaning: bi(
          'Fraction of the label area that color i covers. C_i is the weighted pixel count for cluster i.',
          'Tỉ lệ diện tích nhãn mà màu i phủ. C_i là số pixel có trọng số của cluster i.'
        ),
        example: 'C_black=88687 pixels, total=100000 → pct_black = 0.887 (88.7%)',
        notes: 'Weighted by AA sub-pixel weight when anti-aliasing is ON.',
      },
      {
        name: 'Area',
        expr: 'color_mm² = pct × (widthMm × heightMm / scaleRatio²)',
        meaning: bi(
          'Physical mm² covered by color i. Drawing scale corrects when artwork is drawn at non-1:1.',
          'mm² vật lý phủ bởi màu i. scaleRatio hiệu chỉnh khi artwork không vẽ theo tỉ lệ 1:1.'
        ),
        example:
          'pct_black=0.887, width=30mm, height=20mm, scale=1\n= 0.887 × (30 × 20 / 1²) = 532.2 mm²',
      },
      {
        name: 'Ink volume',
        expr: 'µL/label = color_mm² × film_µm × transfer_factor × 0.001',
        meaning: bi(
          'Volume of wet ink laid per label (1 µL = 1 mm³ = 1 mm² × 1 mm = 1 mm² × 1000 µm → ×0.001).',
          'Thể tích mực ướt cho mỗi nhãn (1 µL = 1 mm³ = 1 mm² × 1 mm = 1 mm² × 1000 µm → ×0.001).'
        ),
        example:
          'Flexo: color_mm²=532.2, film=3µm, factor=1.12\n= 532.2 × 3 × 1.12 × 0.001 = 1.788 µL / label',
        notes: 'film+factor per method; see §4 of Legend.',
      },
      {
        name: 'Dot gain',
        expr: 'effective = P + g·4·P·(1−P)',
        meaning: bi(
          'Yule-Nielsen dot-gain: mechanical spread of dots on press. g peaks at 50% tint, zero at solids/whites.',
          'Dot-gain Yule-Nielsen: mở rộng cơ học của chấm trên máy. g lớn nhất ở 50%, bằng 0 ở fill đặc/trắng.'
        ),
        example:
          'Flexo g=18%, file=50% tint (P=0.5):\neffective = 0.5 + 0.18 × 4 × 0.5 × 0.5 = 0.68 (prints as 68%)',
        notes: 'g = gain_at_50%; peaks at P=0.5.',
      },
      {
        name: 'ΔE76',
        expr: '√((ΔL)² + (Δa)² + (Δb)²)',
        meaning: bi(
          'Perceptual color distance in Lab space. Straight Euclidean after Lab conversion.',
          'Khoảng cách màu cảm nhận trong không gian Lab. Euclidean thẳng sau khi chuyển Lab.'
        ),
        example: 'Two grays (90, 0, 0) vs (92, 0, 0): ΔE = √(4+0+0) = 2.0 (JND threshold)',
        notes: 'Perceptual distance; JND ≈ 2.3 for trained eye.',
      },
    ],
    tips: [
      bt(
        'Trust the amber banner "Background detection may be wrong" — it fires when auto-BG goes sideways on full-bleed art.',
        'Tin banner amber "Background detection may be wrong" — nó xuất hiện khi auto-BG sai trên artwork full-bleed.'
      ),
      bt(
        'Pin persists with the saved job; re-opening from Library keeps the red surviving automatically.',
        'Pin lưu cùng job; mở lại từ Library tự động giữ màu đỏ.'
      ),
      bt(
        'Use Separations export (⬇ button) to generate film positives for plate/screen burning.',
        'Dùng Separations export (nút ⬇) để tạo film positive cho bản/lưới.'
      ),
    ],
    pitfalls: [
      bp(
        'Drawing scale forgotten on a 2:1 artwork: mm² off by 4×, µL off by 4×, quote off by the same factor.',
        'Quên drawing scale cho artwork 2:1: mm² sai 4×, µL sai 4×, báo giá sai 4×.'
      ),
      bp(
        'Wrong Print Method: Flexo vs. Silkscreen differ in film thickness by 5×; ink cost will be wildly off.',
        'Sai Print Method: Flexo vs. Silkscreen khác nhau độ dày film 5×; chi phí mực sẽ sai rất nhiều.'
      ),
    ],
    relatedTabs: ['ink-calc', 'standard', 'complex', 'summarize'],
    screenshot: 'print-area.png',
  },

  messages: {
    id: 'messages',
    section: 'CALCULATORS',
    title: bi('Messages', 'Tin nhắn'),
    function: bi(
      'Peer-to-peer messaging with image attachments',
      'Nhắn tin nội bộ có đính kèm ảnh'
    ),
    path: 'Ops Cost > Calculators > Messages',
    purpose: bi(
      'Peer-to-peer messaging inside the app. Three-pane inbox: people list / thread / compose.',
      'Nhắn tin nội bộ trong app. 3 panel: danh sách người / hội thoại / soạn tin.'
    ),
    whenToUse: bi(
      'Quick questions about a specific SKU; attaching screenshots of a quote for a colleague.',
      'Hỏi đồng nghiệp về một SKU; gửi kèm screenshot báo giá.'
    ),
    preRequisites: [],
    procedures: [
      proc('Pick recipient', 'Chọn người nhận', null, [
        bs(
          'Left pane lists contacts sorted by last-interaction.',
          'Panel trái liệt kê contact sắp xếp theo last-interaction.'
        ),
        bs(
          'Click a name → thread opens in the middle pane.',
          'Click tên → thread mở ở panel giữa.'
        ),
        bs('Search box at top filters by name.', 'Ô search trên cùng lọc theo tên.'),
      ]),
      proc('Send message', 'Gửi tin', null, [
        bs('Click into composer (bottom of middle pane).', 'Click vào composer (đáy panel giữa).'),
        bs(
          'Enter to send; Shift+Enter for a new line.',
          'Enter để gửi; Shift+Enter để xuống dòng.'
        ),
        bs(
          'Drag-drop image / paste from clipboard (Cmd+V) to attach.',
          'Kéo-thả ảnh / paste từ clipboard (Cmd+V) để đính kèm.'
        ),
      ]),
      proc('Read + mark', 'Đọc + đánh dấu', null, [
        bs('Unread count shows as sidebar badge.', 'Số tin chưa đọc hiện ở badge sidebar.'),
        bs(
          'Opening a thread auto-marks its messages read.',
          'Mở thread tự đánh dấu các tin đã đọc.'
        ),
        bs(
          'Pin important threads via 📌 icon to keep at top.',
          'Pin thread quan trọng qua icon 📌 để giữ trên cùng.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Pinned threads stay at the top — useful for ongoing quote reviews.',
        'Thread đã pin luôn ở trên cùng — hữu ích cho review báo giá đang theo dõi.'
      ),
    ],
    pitfalls: [
      bp(
        'Messages are not a ticket system — use Pending Approvals / Quote History for official tracking.',
        'Messages không phải hệ thống ticket — dùng Pending Approvals / Quote History cho theo dõi chính thức.'
      ),
    ],
    relatedTabs: [],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // QUOTING
  // ─────────────────────────────────────────────────────────────

  summarize: {
    id: 'summarize',
    section: 'QUOTING',
    title: bi('Cost Breakdown', 'Cơ cấu Chi phí'),
    function: bi(
      'Sortable sidebar table of every saved quote × MOQ tier',
      'Bảng sidebar sắp xếp được cho mọi báo giá đã lưu × bậc MOQ'
    ),
    path: 'Ops Cost > Quoting > Cost Breakdown',
    purpose: bi(
      'Browseable cross-quote table — one row per (quote × MOQ tier). ~32 sortable columns covering identity (#, DATE, RFQ NO, Sale Owner, Direct/End Customer, Project, PNs, materials), economics (MOQ, USD Price, VND Price, Tooling, GM%, VA%, Contr%), and Snapshot status. Single source for cross-quote filtering, CSV export, and right-click forensic flags.',
      'Bảng cross-quote duyệt được — một dòng cho mỗi (báo giá × bậc MOQ). ~32 cột sortable bao phủ identity (#, DATE, RFQ NO, Sale Owner, Direct/End Customer, Project, PN, vật tư), kinh tế (MOQ, USD Price, VND Price, Tooling, GM%, VA%, Contr%), và trạng thái Snapshot. Nguồn duy nhất cho lọc cross-quote, xuất CSV, gắn cờ forensic bằng chuột phải.'
    ),
    whenToUse: bi(
      'Daily scan for margin outliers; cross-quote filtering by Sale Owner / Date / Customer; CSV pull for Excel reconciliation; right-click an RFQ to colour-flag while reviewing a batch.',
      'Quét hàng ngày các báo giá lệch margin; lọc cross-quote theo Sale Owner / Ngày / Khách; pull CSV để đối chiếu Excel; right-click RFQ để gắn màu khi review một loạt.'
    ),
    preRequisites: [
      br(
        'At least one saved quote (Standard or Complex). Pre-FIX-41 legacy quotes show "—" on per-row cells until re-saved.',
        'Tối thiểu 1 báo giá đã lưu (Standard hoặc Complex). Báo giá legacy trước FIX-41 hiển thị "—" ở các ô per-row cho tới khi save lại.'
      ),
    ],
    procedures: [
      proc(
        'Scan + sort the table',
        'Quét + sắp xếp bảng',
        bi(
          '~32 columns; click any header to sort ASC/DESC. Click again to flip. Sort indicator (▲/▼) appears on the active column.',
          '~32 cột; click header bất kỳ để sort ASC/DESC. Click lại để đảo. Chỉ báo sort (▲/▼) hiển thị trên cột đang active.'
        ),
        [
          bs(
            'Anchors: # (visible row index), DATE (dd/MM/yyyy on top, HH:mm beneath — mirrors Quote History date cell), RFQ NO, Sale Owner.',
            'Anchor: # (chỉ số dòng hiển thị), DATE (dd/MM/yyyy ở trên, HH:mm ở dưới — mirror cột date của Quote History), RFQ NO, Sale Owner.'
          ),
          bs(
            'Economics columns: MOQ, USD Price, VND Price, Tooling/pcs, Tooling Cost (USD), GM%, VA%, Contr%. Color-coding flags margin floor breaches.',
            'Cột kinh tế: MOQ, USD Price, VND Price, Tooling/pcs, Tooling Cost (USD), GM%, VA%, Contr%. Color-code đánh dấu margin dưới sàn.'
          ),
          bs(
            'Snapshot column — Frozen / Live / No pill per row. Default-hidden; opt in via Columns toggle when auditing whether quotes are frozen.',
            'Cột Snapshot — pill Frozen / Live / No theo từng dòng. Mặc định ẩn; opt in qua Columns toggle khi kiểm tra báo giá đã được freeze chưa.'
          ),
        ]
      ),
      proc(
        'Filter (ScopedFilterBar)',
        'Lọc (ScopedFilterBar)',
        bi(
          'Shared bar across Quote History + Cost Breakdown — same scopes, same debounce. Filter state lives outside the 30s polling tick so auto-refresh never resets what you typed.',
          'Bar dùng chung giữa Quote History và Cost Breakdown — cùng scope, cùng debounce. State filter nằm ngoài tick polling 30s nên auto-refresh không bao giờ reset thứ đã gõ.'
        ),
        [
          bs(
            'Global search (300ms debounce) — matches across RFQ NO, customer, project, materials, sale owner.',
            'Global search (debounce 300ms) — match qua RFQ NO, khách, project, vật tư, sale owner.'
          ),
          bs(
            'Date range — native picker + 5 presets (Today / This week / This month / Last 30 days / Clear).',
            'Date range — picker native + 5 preset (Hôm nay / Tuần này / Tháng này / 30 ngày gần nhất / Xoá).'
          ),
          bs(
            'Three scoped boxes: Customer, Part, Sale. Case-insensitive substring. AND-combine with the global box + date range.',
            'Ba ô scoped: Customer, Part, Sale. Case-insensitive substring. AND-combine với ô global + date range.'
          ),
          bs(
            'N-of-M counter on the right shows matched vs total. Clear-all button resets every scope.',
            'Counter N-of-M bên phải hiện số match / tổng. Nút Clear-all reset mọi scope.'
          ),
        ]
      ),
      proc(
        'Columns toggle',
        'Toggle cột',
        bi(
          'Popover above the table. Hide/show any non-required column; choice persists in localStorage (`ops-cost-summarize-cols`). Required: RFQ NO.',
          'Popover phía trên bảng. Ẩn/hiện cột bất kỳ không phải required; lựa chọn lưu trong localStorage (`ops-cost-summarize-cols`). Required: RFQ NO.'
        ),
        [
          bs(
            'Click the Columns icon → checkbox per column. DATE column is required (cannot be hidden) — anchors timestamp parity with Quote History.',
            'Click icon Columns → checkbox cho từng cột. Cột DATE là required (không ẩn được) — anchor parity dấu thời gian với Quote History.'
          ),
          bs(
            'Optional default-hidden columns include Snapshot + the 6 Lead Time & Notice columns — opt in when forensically auditing.',
            'Các cột mặc định ẩn gồm Snapshot + 6 cột Lead Time & Notice — opt in khi kiểm tra forensic.'
          ),
        ]
      ),
      proc(
        'Per-row select + CSV export',
        'Chọn dòng + Xuất CSV',
        bi(
          'Checkbox in each row; Select-All header with indeterminate state. CSV uses the native macOS Save dialog (File System Access API; falls back to download anchor on older Electron).',
          'Checkbox mỗi dòng; header Select-All có trạng thái indeterminate. CSV dùng hộp thoại Save native của macOS (File System Access API; fallback download anchor trên Electron cũ).'
        ),
        [
          bs(
            'Tick rows to include; toolbar "CSV Export (N)" updates with the selected-visible count.',
            'Tick các dòng muốn xuất; nút "CSV Export (N)" trên toolbar cập nhật theo số đã chọn (và hiển thị).'
          ),
          bs(
            'No selection → export ships all visible rows; selection is intersected with the filter so hidden rows are never written to disk.',
            'Không chọn gì → xuất toàn bộ dòng đang hiển thị; selection được intersect với filter nên dòng bị ẩn không bao giờ ghi xuống file.'
          ),
          bs(
            'CSV ships UTF-8 with BOM (Excel VN locale opens × correctly), RFC 4180 escaping, and an always-include audit prefix: quote_id, tier, update_date, type, sale_owner.',
            'CSV xuất UTF-8 có BOM (Excel locale VN hiển thị × đúng), escape RFC 4180, và prefix audit luôn có: quote_id, tier, update_date, type, sale_owner.'
          ),
        ]
      ),
      proc(
        'Open quote + right-click flags',
        'Mở báo giá + cờ chuột phải',
        bi(
          'Double-click any row opens the showcard. Right-click opens the context menu — Open shortcut, RFQ colour picker, Copy summary.',
          'Double-click dòng để mở showcard. Right-click mở context menu — shortcut Open, color picker RFQ, Copy tóm tắt.'
        ),
        [
          bs(
            'Double-click row → showcard / detail modal opens.',
            'Double-click dòng → showcard / modal chi tiết mở.'
          ),
          bs(
            'Right-click row → context menu. Pick from the colour palette to tint RFQ NO text (helps batch reviews). Click × to clear the colour.',
            'Right-click dòng → context menu. Chọn màu trên palette để tô màu chữ RFQ NO (tiện review hàng loạt). Click × để bỏ màu.'
          ),
          bs(
            'Context menu also has Copy → puts "RFQ | Direct CU | Project | End CU PN" on the clipboard for chat/email.',
            'Context menu còn có Copy → copy "RFQ | Direct CU | Project | End CU PN" vào clipboard để paste chat/email.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [],
    formulas: [
      {
        name: 'Margin',
        expr: 'margin = (sell − cost) / sell × 100',
        meaning: bi(
          'Gross margin as a percentage of the sell price. The standard finance metric for profitability.',
          'Biên lợi nhuận gộp tính theo phần trăm giá bán. Chỉ số tài chính chuẩn cho lợi nhuận.'
        ),
        example: 'cost=0.368, sell=0.526 → margin = (0.526−0.368)/0.526 × 100 = 30.04%',
      },
      {
        name: 'Markup',
        expr: 'markup = (sell − cost) / cost × 100',
        meaning: bi(
          'Markup is profit as a percentage of COST, not sell. Always larger than margin for positive profit.',
          'Markup là lợi nhuận theo phần trăm COST, không phải sell. Luôn lớn hơn margin nếu có lãi.'
        ),
        example: 'cost=0.368, sell=0.526 → markup = (0.526−0.368)/0.368 × 100 = 42.93%',
        notes: '≠ margin; check which the stakeholder asked for.',
      },
    ],
    tips: [
      bt(
        'Sale Owner column (sortable) groups quotes per salesperson — handy for weekly review meetings.',
        'Cột Sale Owner (sortable) gộp báo giá theo từng nhân viên bán hàng — tiện cho meeting review hàng tuần.'
      ),
      bt(
        'Snapshot column (default-hidden, opt in via Columns toggle) shows Frozen / Live / No per row — scan for unfrozen quotes before sign-off.',
        'Cột Snapshot (mặc định ẩn, opt in qua Columns toggle) hiển thị Frozen / Live / No mỗi dòng — quét quote chưa frozen trước khi ký duyệt.'
      ),
    ],
    pitfalls: [
      bp(
        'Frozen rows reflect library rates AT SAVE TIME — current library edits do not propagate until the quote is re-saved.',
        'Dòng Frozen phản ánh rate library TẠI THỜI ĐIỂM SAVE — chỉnh library hiện tại không lan tới quote tới khi save lại.'
      ),
    ],
    relatedTabs: ['standard', 'complex', 'formal-quote', 'quote-history'],
    screenshot: 'summarize.png',
  },

  'formal-quote': {
    id: 'formal-quote',
    section: 'QUOTING',
    title: bi('Formal Quotation', 'Báo giá Chính thức'),
    function: bi('Generate branded customer-facing quote PDF', 'Tạo file PDF báo giá gửi khách'),
    path: 'Ops Cost > Quoting > Formal Quotation',
    purpose: bi(
      'Customer-facing quote generator: branded PDF with cover page, terms, itemized pricing.',
      'Tạo báo giá gửi khách: PDF branded với cover, điều khoản, bảng giá chi tiết.'
    ),
    whenToUse: bi(
      'Final step before sending to customer. Only after Cost Breakdown sign-off.',
      'Bước cuối cùng trước khi gửi khách. Chỉ sau khi Cost Breakdown đã duyệt.'
    ),
    preRequisites: [
      br(
        'Approved quote in Pending Approvals (or auto-approved by role).',
        'Báo giá đã duyệt trong Pending Approvals (hoặc auto-approved theo role).'
      ),
    ],
    procedures: [
      proc('SKU selection', 'Chọn SKU', null, [
        bs(
          'Pick SKU from the dropdown — only approved quotes appear.',
          'Chọn SKU từ dropdown — chỉ báo giá đã duyệt xuất hiện.'
        ),
        bs(
          'Fields auto-fill from the approved snapshot (customer, qty, price).',
          'Các ô tự điền từ snapshot đã duyệt (khách, qty, giá).'
        ),
      ]),
      proc('Customer header', 'Thông tin khách hàng', null, [
        bs(
          'Verify customer name + address (pulled from Drop-Down Lists).',
          'Xác nhận tên + địa chỉ khách (lấy từ Drop-Down Lists).'
        ),
        bs(
          'Override Attention contact if different from default.',
          'Ghi đè Attention contact nếu khác mặc định.'
        ),
        bs(
          'Optional: add a reference (PO#, RFQ#) for customer tracking.',
          'Tuỳ chọn: thêm reference (PO#, RFQ#) để khách theo dõi.'
        ),
      ]),
      proc(
        'Commercial terms',
        'Điều khoản thương mại',
        bi(
          'Templates per customer segment live in Drop-Down Lists — set up once.',
          'Template theo phân khúc khách hàng nằm trong Drop-Down Lists — setup 1 lần.'
        ),
        [
          bs('Validity (days): typical 30-90.', 'Thời hạn hiệu lực (ngày): thường 30-90.'),
          bs(
            'Payment terms (free text, e.g. "Net 45").',
            'Điều khoản thanh toán (free text, vd "Net 45").'
          ),
          bs(
            'Incoterms: EXW / FOB / CIF / DDP per agreement.',
            'Incoterms: EXW / FOB / CIF / DDP theo thoả thuận.'
          ),
          bs('Delivery lead time (weeks).', 'Delivery lead time (tuần).'),
        ]
      ),
      proc('Preview + send', 'Preview + gửi', null, [
        bs('Click Preview → renders PDF in-page.', 'Click Preview → render PDF trên trang.'),
        bs('Click ⬇ Download PDF → saves locally.', 'Click ⬇ Download PDF → lưu local.'),
        bs(
          'Click Mark as Sent → freezes quote numbers; starts RFQ timer in RFQ Tracker.',
          'Click Mark as Sent → đóng băng số báo giá; khởi động timer RFQ trong RFQ Tracker.'
        ),
        bs(
          'Changing price AFTER Sent requires a new quote (audit integrity).',
          'Đổi giá SAU Sent cần tạo báo giá mới (để audit trail).'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field('Validity', 'days', 'Typical 30-90 days.'),
      field('Payment terms', 'text', 'Free text; e.g., "Net 45".'),
      field('Incoterms', 'enum', 'EXW / FOB / CIF / DDP per commercial agreement.'),
    ],
    formulas: [],
    tips: [
      bt(
        'Terms templates live in Drop-Down Lists — set up once per customer segment.',
        'Template điều khoản nằm trong Drop-Down Lists — setup 1 lần cho mỗi phân khúc khách hàng.'
      ),
    ],
    pitfalls: [
      bp(
        'Changing the SKU price after Sent requires a new quote, not an edit — for audit trail integrity.',
        'Đổi giá SKU sau khi Sent cần tạo báo giá mới, không phải sửa — để đảm bảo audit trail.'
      ),
    ],
    relatedTabs: ['summarize', 'quote-history', 'approvals-inbox'],
    screenshot: 'formal-quote.png',
  },

  'quote-history': {
    id: 'quote-history',
    section: 'QUOTING',
    title: bi('Quote History', 'Lịch sử Báo giá'),
    function: bi(
      'Sortable browseable table of every saved quote with 27-column config + scoped filter + Trash bin',
      'Bảng duyệt sortable của mọi báo giá đã lưu với cấu hình 27 cột + filter scoped + Trash bin'
    ),
    path: 'Ops Cost > Quoting > Quote History',
    purpose: bi(
      'The browseable history of every saved quote (draft / pending_sales / pending_finance / price_approved / cancelled / rejected). 27 sortable columns — 6 required (anchors), 5 default-hidden (rare). Adds Sale Owner (PR #156), Option column (replaces VER badge), Material Active badge (Main/Alt/Mixed). Drives operator scan, xlsx export per row, soft-delete + restore.',
      'Lịch sử duyệt được của mọi báo giá đã lưu (draft / pending_sales / pending_finance / price_approved / cancelled / rejected). 27 cột sortable — 6 required (anchor), 5 mặc định ẩn (ít dùng). Thêm Sale Owner (PR #156), cột Option (thay badge VER), Material Active badge (Main/Alt/Mixed). Phục vụ operator scan, xuất xlsx từng dòng, soft-delete + restore.'
    ),
    whenToUse: bi(
      'Cross-quote scan (sort by Sale Owner, Option text, GM% etc.); export xlsx per row for customer/internal review; right-click to soft-delete or restore from Trash bin.',
      'Quét cross-quote (sort theo Sale Owner, Option text, GM% v.v.); xuất xlsx từng dòng cho khách/nội bộ; right-click để soft-delete hoặc restore từ Trash bin.'
    ),
    preRequisites: [],
    procedures: [
      proc(
        'Scan + sort the 27-column table',
        'Quét + sort bảng 27 cột',
        bi(
          'Required anchors (cannot be hidden): #, DATE, RFQ, STATUS, APPROVE action, LAYOUT (xlsx export). Default-hidden: UL, IFS, dcu_pn, ecu_pn, target — opt in via Columns toggle.',
          'Anchor required (không ẩn được): #, DATE, RFQ, STATUS, APPROVE, LAYOUT (xuất xlsx). Mặc định ẩn: UL, IFS, dcu_pn, ecu_pn, target — opt in qua Columns toggle.'
        ),
        [
          bs(
            'Click any header to sort ASC/DESC (▲/▼ indicator). STATUS uses workflow ordinal — draft → pending_sales → pending_finance → price_approved with cancelled/rejected sinking to bottom.',
            'Click header bất kỳ để sort ASC/DESC (chỉ báo ▲/▼). STATUS dùng ordinal workflow — draft → pending_sales → pending_finance → price_approved, cancelled/rejected chìm xuống cuối.'
          ),
          bs(
            'Sale Owner column (Sprint S-SALE-OWNER-COL) — sortable; reads state.sale_owner from Pricing → RFQ & MOQ info sub-tab.',
            'Cột Sale Owner (Sprint S-SALE-OWNER-COL) — sortable; đọc state.sale_owner từ Pricing → RFQ & MOQ info sub-tab.'
          ),
          bs(
            'Option column (Sprint S-OPTIONS-FIELD) — replaces the old VER badge. Free-text notes from RFQ Information; truncated with ellipsis + native title tooltip; sortable.',
            'Cột Option (Sprint S-OPTIONS-FIELD) — thay badge VER cũ. Ghi chú free-text từ RFQ Information; cắt ngắn ellipsis + tooltip native title; sortable.'
          ),
          bs(
            'STD/CPX type badge + Material Active badge — alt-materials surface shows Main / Alt / Mixed (N alt / M main) at quote / per-SP level (Sprint S-ALT-MAT PR #C).',
            'Badge STD/CPX + Material Active badge — surface alt-materials hiển thị Main / Alt / Mixed (N alt / M main) ở mức quote / per-SP (Sprint S-ALT-MAT PR #C).'
          ),
        ]
      ),
      proc(
        'Columns toggle (Phase 2)',
        'Toggle cột (Phase 2)',
        bi(
          'Same shared <ColumnsToggle> popover used by Cost Breakdown. Persists in localStorage `ops-cost-quote-history-cols`. Required keys cannot be hidden.',
          'Cùng popover <ColumnsToggle> dùng chung với Cost Breakdown. Lưu vào localStorage `ops-cost-quote-history-cols`. Cột required không ẩn được.'
        ),
        [
          bs(
            'Click Columns icon above the table → check/uncheck per column. 27 keys total, 5 default-hidden (UL, IFS, dcu_pn, ecu_pn, target).',
            'Click icon Columns phía trên bảng → check/uncheck từng cột. Tổng 27 key, 5 mặc định ẩn (UL, IFS, dcu_pn, ecu_pn, target).'
          ),
          bs(
            'Hiding the currently-sorted column auto-snaps sort back to DATE DESC. Legacy `npi` → `owner` and `ver` → `option` sort-key rewrites preserve saved sort prefs across upgrades.',
            'Ẩn cột đang sort sẽ tự snap sort về DATE DESC. Rewrite legacy `npi` → `owner` và `ver` → `option` giữ sort prefs cũ qua các bản upgrade.'
          ),
        ]
      ),
      proc(
        'Scoped filter bar',
        'Thanh lọc scoped',
        bi(
          'Same shared bar as Cost Breakdown — global search + date range + 3 scoped boxes (Customer / Part / Sale). 300ms debounce; AND-combine.',
          'Cùng thanh dùng chung với Cost Breakdown — global search + date range + 3 ô scoped (Customer / Part / Sale). Debounce 300ms; AND-combine.'
        ),
        [
          bs(
            'Pill chips (All / Standard / Complex / Trash) sit in the rightSlot of the filter bar — Trash chip opens the soft-deleted bin.',
            'Pill chip (All / Standard / Complex / Trash) nằm trong rightSlot của filter bar — chip Trash mở bin các bản đã soft-delete.'
          ),
          bs(
            'Filter survives the 30s polling + SSE refresh tick (state lives outside `useAbortableFetch`).',
            'Filter sống sót qua tick polling 30s + SSE refresh (state nằm ngoài `useAbortableFetch`).'
          ),
        ]
      ),
      proc(
        'Open + right-click context menu',
        'Mở + context menu chuột phải',
        bi(
          'Double-click row to load the quote into Pricing (Std/Cpx). Right-click for context menu (Open / Copy / Trash / Status workflow).',
          'Double-click dòng để load báo giá vào Pricing (Std/Cpx). Right-click mở context menu (Open / Copy / Trash / Workflow trạng thái).'
        ),
        [
          bs(
            'Right-click row → Open (loads quote), Copy (copies quote to new draft — clears snapshot freeze + activeQuoteId), Trash (soft-delete).',
            'Right-click dòng → Open (load quote), Copy (copy sang draft mới — xoá freeze snapshot + activeQuoteId), Trash (soft-delete).'
          ),
          bs(
            'Trash uses soft-delete (`DELETE /api/quotes/:id`) so the row moves to the Trash bin instead of being purged. Sys role can hard-delete via `?purge=1`.',
            'Trash dùng soft-delete (`DELETE /api/quotes/:id`) để dòng chuyển vào Trash bin thay vì xoá hẳn. Role sys có thể xoá cứng qua `?purge=1`.'
          ),
        ]
      ),
      proc(
        'Trash bin (soft-delete + restore)',
        'Trash bin (soft-delete + restore)',
        bi(
          'Trash chip in the filter bar → opens a modal listing soft-deleted quotes (loaded from `?trashed=1`). Restore button calls `POST /api/quotes/:id/restore`.',
          'Chip Trash trong filter bar → mở modal liệt kê quote đã soft-delete (load từ `?trashed=1`). Nút Restore gọi `POST /api/quotes/:id/restore`.'
        ),
        [
          bs(
            'Click Trash chip → modal opens with columns: #, Type (STD/CPX), Label / RFQ, Direct CU, Trashed at, By, Actions.',
            'Click chip Trash → modal mở với cột: #, Type (STD/CPX), Label / RFQ, Direct CU, Đã xoá lúc, Người xoá, Actions.'
          ),
          bs(
            'Restore returns the quote to the main list at its original status; Purge (sys role only) hard-deletes.',
            'Restore đưa quote về list chính ở status gốc; Purge (chỉ role sys) xoá cứng.'
          ),
        ]
      ),
      proc(
        'xlsx export per row',
        'Xuất xlsx từng dòng',
        bi(
          'LAYOUT column has a download icon per row → opens variant/lang/tier dialog. Multi-tier exports return a single zip.',
          'Cột LAYOUT có icon download mỗi dòng → mở dialog variant/lang/tier. Xuất nhiều tier trả về một file zip.'
        ),
        [
          bs(
            'Click ⬇ icon in the LAYOUT cell → pick variant (Customer / Internal), language (EN / VI / EN+VI), tiers (1 .. all).',
            'Click icon ⬇ trong ô LAYOUT → chọn variant (Khách / Nội bộ), ngôn ngữ (EN / VI / Song ngữ), tier (1 .. tất cả).'
          ),
          bs(
            'Pre-FIX-41 legacy quotes show "saved before per-row tracking" — re-save the quote once in Pricing to populate `result.rows` so xlsx renders real Material/Ink/Process numbers.',
            'Báo giá legacy trước FIX-41 hiển thị "saved before per-row tracking" — save lại quote một lần trong Pricing để populate `result.rows` để xlsx render số Material/Ink/Process thực.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [
      field('Status', 'enum', 'Draft / Submitted / Approved / Rejected / Sent / Won / Lost.'),
      field('Owner', 'user', 'Cost engineer who owns the quote.'),
    ],
    formulas: [],
    features: [
      feat(
        'Export to xlsx — download icon in each row opens a dialog to pick variant (Customer / Internal), language (EN / VI / EN+VI), and which MOQ tiers to include. Multi-tier exports come back as a single zip.',
        'Xuất ra xlsx — biểu tượng download ở mỗi dòng mở hộp thoại chọn phiên bản (Khách / Nội bộ), ngôn ngữ (EN / VI / Song ngữ), và các bậc MOQ cần xuất. Xuất nhiều bậc trả về một file zip.'
      ),
    ],
    tips: [
      bt(
        'Sale Owner column (sortable) groups quotes per salesperson — type a name into the Sale scoped box to filter.',
        'Cột Sale Owner (sortable) gộp báo giá theo từng nhân viên bán hàng — gõ tên vào ô scoped Sale để lọc.'
      ),
      bt(
        'Option column (replaces the old VER badge — Sprint S-OPTIONS-FIELD) shows free-text RFQ notes; sortable + hover tooltip for full text.',
        'Cột Option (thay badge VER cũ — Sprint S-OPTIONS-FIELD) hiển thị ghi chú RFQ free-text; sortable + tooltip hover để xem đầy đủ.'
      ),
      bt(
        'If the export dialog shows "saved before per-row tracking", open the quote in the calculator and Save once to refresh export data — pre-v1.5 quotes need a re-save before Materials / Inks / Processes sheets can render real numbers.',
        'Nếu hộp thoại xuất hiện thông báo "lưu trước khi có theo dõi từng dòng", mở báo giá trong calculator và Save một lần để cập nhật dữ liệu xuất — báo giá lưu trước v1.5 cần lưu lại để các sheet Vật liệu / Mực / Quy trình hiển thị số liệu thực.'
      ),
    ],
    pitfalls: [
      bp(
        'History is append-only — edits become new versions, never overwrites.',
        'History là append-only — sửa sẽ tạo phiên bản mới, không bao giờ ghi đè.'
      ),
    ],
    relatedTabs: ['summarize', 'formal-quote', 'quote-analysis', 'dashboard'],
    screenshot: null,
  },

  'approvals-inbox': {
    id: 'approvals-inbox',
    section: 'QUOTING',
    title: bi('Pending Approvals', 'Chờ Phê duyệt'),
    function: bi('Queue of quotes awaiting sign-off', 'Hàng chờ báo giá cần ký duyệt'),
    path: 'Ops Cost > Quoting > Pending Approvals',
    purpose: bi(
      'Queue of quotes awaiting sign-off from the approver role. Sidebar badge shows count.',
      'Queue báo giá chờ ký duyệt của role approver. Badge trên sidebar hiện số lượng.'
    ),
    whenToUse: bi(
      'Approvers: daily at start-of-shift. Cost engineers: check here when a submitted quote is stuck > 1 day.',
      'Approver: mở đầu ca hàng ngày. Cost engineer: check khi báo giá bị treo > 1 ngày.'
    ),
    preRequisites: [
      br(
        'Admin/Cost role to approve; everyone can view their own submissions.',
        'Role Admin/Cost để duyệt; mọi người có thể xem submission của mình.'
      ),
    ],
    procedures: [
      proc(
        'View mode chips + scoped filter',
        'Chip view mode + filter scoped',
        bi(
          'Two chips at the top: My queue (rows where you can act per role) / All pending (every quote in pending_sales or pending_finance). Shared ScopedFilterBar below = global search + date range + 3 scoped boxes (Customer / Part / Sale).',
          'Hai chip ở trên cùng: My queue (dòng bạn có quyền action theo role) / All pending (mọi quote pending_sales hoặc pending_finance). ScopedFilterBar dùng chung phía dưới = global search + date range + 3 ô scoped (Customer / Part / Sale).'
        ),
        [
          bs(
            'View mode chip "My queue" filters to rows where canUserSetStatus(user, "price_approved") is true (your role allows acting). "All pending" shows everything in pending_sales + pending_finance.',
            'Chip view mode "My queue" lọc về dòng mà canUserSetStatus(user, "price_approved") = true (role bạn có quyền action). "All pending" hiện mọi dòng pending_sales + pending_finance.'
          ),
          bs(
            'Header tag "N in my queue" anchors to the true queue size; the N-of-M counter on ScopedFilterBar reflects matches vs viewMode queue.',
            'Tag header "N in my queue" anchor về kích thước queue thật; counter N-of-M trên ScopedFilterBar phản ánh số match / kích thước queue theo viewMode.'
          ),
          bs(
            'Filter state lives outside the 30s polling + SSE refresh tick, so auto-refresh never resets what you typed.',
            'State filter nằm ngoài tick polling 30s + SSE refresh, nên auto-refresh không bao giờ reset thứ đã gõ.'
          ),
        ]
      ),
      proc(
        'Column layout (Sprint S-INBOX-COLS)',
        'Bố cục cột (Sprint S-INBOX-COLS)',
        bi(
          'Operator scan order: AGE → RFQ → SUBMITTED → QUOTED BY → STATUS, then identity / financials block. "QUOTED BY" replaces the legacy "Submitted by" header (same person quotes + submits in CCL workflow).',
          'Thứ tự scan operator: AGE → RFQ → SUBMITTED → QUOTED BY → STATUS, sau đó là khối identity / financials. "QUOTED BY" thay header cũ "Submitted by" (cùng một người báo giá và submit trong workflow CCL).'
        ),
        [
          bs(
            '8 new columns adjacent to identity/financials block — Sale Owner, END CU, PROJECT, MATERIALS (bulleted Main.Mat), PRICE USD, PRICE VND (raw — no USD×rate fallback), VA%, CONTR.%.',
            '8 cột mới sát khối identity/financials — Sale Owner, END CU, PROJECT, MATERIALS (liệt kê Main.Mat), PRICE USD, PRICE VND (raw — không fallback USD×rate), VA%, CONTR.%.'
          ),
          bs(
            'Total now 18 columns (was 11). Reads from shared helper `deriveInboxRow(q)` so the inbox stays pinned to the same Quote History contract (Lesson 21 end_cu/project guards baked in).',
            'Tổng 18 cột (cũ 11). Đọc qua helper dùng chung `deriveInboxRow(q)` để inbox bám theo cùng contract của Quote History (guards end_cu/project theo Lesson 21).'
          ),
          bs(
            'AGE chip color-codes overdue rows (≥7 days red, ≥3 days amber); STATUS chip is the workflow state.',
            'Chip AGE color-code dòng quá hạn (≥7 ngày đỏ, ≥3 ngày vàng); chip STATUS là trạng thái workflow.'
          ),
        ]
      ),
      proc(
        'Quote detail modal',
        'Modal chi tiết',
        bi(
          'Open by clicking any row. Modal shows the full Cost Breakdown + submitter comment + audit trail.',
          'Mở bằng cách click dòng bất kỳ. Modal hiển thị Cost Breakdown đầy đủ + comment người submit + audit trail.'
        ),
        [
          bs(
            'Click a row → modal opens on top of the queue.',
            'Click dòng → modal mở đè lên queue.'
          ),
          bs(
            "Review the cost waterfall, the submitter's comment, and the history of prior revisions.",
            'Xem waterfall chi phí, comment người submit, và lịch sử các revision trước.'
          ),
          bs(
            'Scroll to the bottom for the Approve / Reject action bar.',
            'Cuộn xuống đáy để thấy thanh action Approve / Reject.'
          ),
        ]
      ),
      proc(
        'Approve action',
        'Thao tác Duyệt',
        bi(
          'Approved quotes auto-advance to Formal Quotation, visible to the submitter immediately.',
          'Báo giá đã duyệt tự động chuyển sang Formal Quotation, người submit thấy ngay.'
        ),
        [
          bs('Click ✓ Approve.', 'Click ✓ Approve.'),
          bs(
            "Optionally add a one-line comment (shown in the submitter's Quote History).",
            'Tuỳ chọn thêm comment 1 dòng (hiển thị trong Quote History của người submit).'
          ),
          bs(
            'Click Confirm → quote moves to "Approved" state; badge on sidebar decrements.',
            'Click Confirm → báo giá chuyển sang state "Approved"; badge trên sidebar giảm.'
          ),
        ]
      ),
      proc(
        'Reject action',
        'Thao tác Từ chối',
        bi(
          'Reject reason is MANDATORY and immutable. Think before submitting — you cannot silently edit a rejection.',
          'Lý do reject BẮT BUỘC và không sửa được. Nghĩ kỹ trước khi submit — không thể âm thầm sửa reject.'
        ),
        [
          bs('Click ✗ Reject.', 'Click ✗ Reject.'),
          bs(
            'Type a reason (min 10 chars) — required.',
            'Gõ lý do (tối thiểu 10 ký tự) — bắt buộc.'
          ),
          bs(
            'Click Confirm → quote returns to the submitter as "Rejected" with your comment attached.',
            'Click Confirm → báo giá quay lại người submit dưới dạng "Rejected" kèm comment.'
          ),
          bs(
            'The submitter can revise + resubmit as a new version; the original rejection remains in history.',
            'Người submit có thể revise + resubmit thành phiên bản mới; reject gốc vẫn nằm trong history.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Set a daily reminder to clear this queue — stuck approvals are the #1 customer-wait complaint.',
        'Đặt nhắc nhở hàng ngày clear queue này — approval kẹt là phàn nàn #1 khiến khách chờ.'
      ),
    ],
    pitfalls: [
      bp(
        'Reject reason is immutable — think before submitting; review is impossible to redo silently.',
        'Lý do reject không sửa được — nghĩ kỹ trước khi gửi; không thể review âm thầm lại.'
      ),
    ],
    relatedTabs: ['summarize', 'quote-history', 'formal-quote'],
    screenshot: 'approvals-inbox.png',
  },

  'npi-parts-list': {
    id: 'npi-parts-list',
    section: 'QUOTING',
    title: bi('NPI Parts List', 'Danh sách NPI Parts'),
    function: bi(
      'Read-only viewer of the bundled NPI Quote part list snapshot (~25k rows)',
      'Trình xem chỉ-đọc snapshot NPI Quote part list (~25k dòng)'
    ),
    path: 'Ops Cost > Quoting > NPI Parts List',
    purpose: bi(
      'Browse the bundled `NPI Quote part list.xlsx` snapshot (Henry production reference, 25k rows × 64 cols). v1.6 ships read-only — no Add/Edit/Delete; lookup + reference only. Snapshot at `client/public/npi-parts/parts-snapshot.json`.',
      'Duyệt snapshot `NPI Quote part list.xlsx` đã đóng gói (data tham chiếu sản xuất của Henry, 25k dòng × 64 cột). v1.6 ship chỉ-đọc — không Add/Edit/Delete; lookup + tham khảo. Snapshot tại `client/public/npi-parts/parts-snapshot.json`.'
    ),
    whenToUse: bi(
      'Cross-reference an IFS code, system code, or customer PN against historical NPI parts; pull tooling fee + unit-price reference for an existing PN.',
      'Tra cứu chéo IFS code, system code, hoặc PN khách với NPI parts lịch sử; lấy tham chiếu tooling fee + unit-price cho một PN có sẵn.'
    ),
    procedures: [
      proc('Search + filter', 'Tìm kiếm + lọc', null, [
        bs(
          'Search box matches across 6 fields (case-insensitive substring): Part Name / Code IFS / System code / Customer / PIC / Direct Project.',
          'Ô search match qua 6 trường (case-insensitive substring): Part Name / Code IFS / System code / Customer / PIC / Direct Project.'
        ),
        bs(
          'Year filter dropdown — built from distinct RFQ-date years in the snapshot. Pick a year or "All".',
          'Dropdown lọc năm — xây từ các năm distinct của RFQ date trong snapshot. Chọn năm hoặc "All".'
        ),
      ]),
      proc('Columns toggle', 'Toggle cột', null, [
        bs(
          'Reuses the shared <ColumnsToggle> popover (Sprint S-D20). 12 columns visible by default; 52 opt-in via toggle. Persists in `ops-cost-npi-parts-cols`.',
          'Dùng popover <ColumnsToggle> dùng chung (Sprint S-D20). 12 cột mặc định hiển thị; 52 opt-in qua toggle. Lưu trong `ops-cost-npi-parts-cols`.'
        ),
      ]),
      proc('Showcard modal', 'Modal showcard', null, [
        bs(
          'Double-click any row → modal opens with 9 high-value fields (RFQ date / Quoted date / System code / Code IFS / Unit price VND / Unit price USD / Customer / MOQ / Process) + 5 tooling fee lines (woodie / Pinacle die / Rotary Die / Dieset / NC die).',
          'Double-click dòng → modal mở với 9 trường quan trọng (RFQ date / Quoted date / System code / Code IFS / Unit price VND / Unit price USD / Customer / MOQ / Process) + 5 dòng tooling fee (woodie / Pinacle die / Rotary Die / Dieset / NC die).'
        ),
        bs(
          'VND format en-US 0 decimals; USD format 4 decimals; tabular-nums alignment.',
          'Định dạng VND en-US 0 chữ số thập phân; USD 4 chữ số; căn tabular-nums.'
        ),
      ]),
      proc('Pagination', 'Phân trang', null, [
        bs(
          'Client-side pagination at 200 rows / page (matches MaterialLibrary). Prev / Next buttons; page X of Y indicator.',
          'Phân trang client-side 200 dòng / trang (giống MaterialLibrary). Nút Prev / Next; chỉ báo page X of Y.'
        ),
      ]),
    ],
    tips: [
      bt(
        'Read-only in v1.6; edit + sync deferred to v1.7. Snapshot rebuilds via `npm run build:npi-parts` before each DMG cut.',
        'Chỉ-đọc trong v1.6; edit + sync hoãn sang v1.7. Snapshot rebuild qua `npm run build:npi-parts` trước mỗi đợt cut DMG.'
      ),
    ],
    relatedTabs: ['quote-history', 'summarize', 'lib-mat'],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // MANUFACTURING
  // ─────────────────────────────────────────────────────────────

  'lib-mfg': {
    id: 'lib-mfg',
    section: 'MANUFACTURING',
    title: bi('Mfg Structures', 'Cấu trúc Sản xuất'),
    function: bi(
      'Reusable BOM + process templates for Complex calc',
      'Template BOM + công đoạn dùng lại cho Complex calc'
    ),
    path: 'Ops Cost > Manufacturing > Mfg Structures',
    purpose: bi(
      'Reusable BOM + process templates. Define once, reuse across every Complex quote for the same product family.',
      'Template BOM + công đoạn dùng lại. Định nghĩa một lần, dùng cho mọi báo giá Complex của cùng dòng sản phẩm.'
    ),
    whenToUse: bi(
      'Onboarding new product family; factory adds new process chain.',
      'Onboard dòng sản phẩm mới; nhà máy mở chuỗi công đoạn mới.'
    ),
    preRequisites: [
      br(
        'Routing Ops library populated (templates reference operations from there).',
        'Thư viện Routing Ops đã có data (template tham chiếu công đoạn từ đó).'
      ),
    ],
    procedures: [
      proc('Create template', 'Tạo template', null, [
        bs('Click + New Template.', 'Click + New Template.'),
        bs(
          'Name — use descriptive convention "Multi-layer v2024-Q3" to preserve history.',
          'Name — dùng quy ước mô tả "Multi-layer v2024-Q3" để giữ lịch sử.'
        ),
        bs(
          'Product family — pick from LOV (drives which quotes can use this template).',
          'Product family — chọn từ LOV (quyết định báo giá nào được dùng template này).'
        ),
      ]),
      proc('Define levels', 'Định nghĩa các cấp', null, [
        bs(
          'Click Add Level — level 0 = finished product, higher = sub-assemblies.',
          'Click Add Level — level 0 = thành phẩm, cao hơn = sub-assembly.'
        ),
        bs(
          'For each level: Materials (from Material Library) + Operations (from Routing Ops).',
          'Với mỗi cấp: Materials (từ Material Library) + Operations (từ Routing Ops).'
        ),
        bs(
          'Set default Yield % per level — operators can override per quote.',
          'Đặt Yield % mặc định cho mỗi cấp — operator có thể ghi đè theo báo giá.'
        ),
      ]),
      proc(
        'Save + version',
        'Lưu + quản lý phiên bản',
        bi(
          'Templates referenced by saved quotes MUST not be deleted — rename or create v2 instead.',
          'Template đang được báo giá cũ dùng KHÔNG được xoá — đổi tên hoặc tạo v2.'
        ),
        [
          bs(
            'Click Save → template becomes available in Complex calc New BOM picker.',
            'Click Save → template có sẵn trong picker New BOM của Complex calc.'
          ),
          bs(
            'To version: click Save As → new template name (suffix v2, v3).',
            'Để version: click Save As → tên template mới (hậu tố v2, v3).'
          ),
          bs(
            'Deprecate old versions via toggle — hidden from picker but existing quotes still open.',
            'Deprecate phiên bản cũ qua toggle — ẩn khỏi picker nhưng báo giá cũ vẫn mở được.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Version templates: suffix with date (e.g., "Multi-layer v2024-Q3") to preserve history.',
        'Version template: thêm hậu tố theo ngày (vd "Multi-layer v2024-Q3") để giữ lịch sử.'
      ),
    ],
    pitfalls: [
      bp(
        'Deleting a template used by saved quotes breaks their re-open path; rename instead.',
        'Xoá template đang được báo giá cũ dùng sẽ làm hỏng re-open; nên đổi tên thay vì xoá.'
      ),
    ],
    relatedTabs: ['complex', 'lib-rop'],
    screenshot: null,
  },

  'lib-rop': {
    id: 'lib-rop',
    section: 'MANUFACTURING',
    title: bi('Routing Ops', 'Công đoạn Sản xuất'),
    function: bi(
      'Master list of factory operations (setup, run rate, yield)',
      'Danh sách gốc công đoạn (setup, tốc độ, yield)'
    ),
    path: 'Ops Cost > Manufacturing > Routing Ops',
    purpose: bi(
      'Master list of all factory operations: setup time, run rate, yield, hourly rate ref, work-cell.',
      'Danh sách gốc mọi công đoạn: setup time, tốc độ chạy, yield, ref hourly rate, work-cell.'
    ),
    whenToUse: bi(
      'Setting up a new press; updating run rates after a press upgrade or maintenance event.',
      'Lắp máy mới; cập nhật tốc độ chạy sau khi nâng cấp/bảo dưỡng máy.'
    ),
    preRequisites: [
      br(
        'Rate Table populated with the hourly rate for each work-cell.',
        'Rate Table đã có đơn giá/giờ cho từng work-cell.'
      ),
    ],
    procedures: [
      proc('Search + filter', 'Tìm + lọc', null, [
        bs('Filter by work-cell (LOV).', 'Lọc theo work-cell (LOV).'),
        bs('Search by operation code or description.', 'Search theo code công đoạn hoặc mô tả.'),
        bs(
          'Sort by last-updated to see recent changes.',
          'Sort theo last-updated để xem thay đổi gần đây.'
        ),
      ]),
      proc('Add / edit operation', 'Thêm / sửa công đoạn', null, [
        bs(
          'Click + (or pencil icon to edit existing).',
          'Click + (hoặc icon bút chì để sửa có sẵn).'
        ),
        bs(
          'Fill Operation code (5 chars) + description (max 20).',
          'Điền Operation code (5 ký tự) + mô tả (tối đa 20).'
        ),
        bs(
          'Pick Work cell from LOV → hourly rate auto-looks up from Rate Table.',
          'Chọn Work cell từ LOV → đơn giá/giờ tự tra từ Rate Table.'
        ),
        bs(
          'Enter Setup hours + Run rate (units/hour) + Yield %.',
          'Nhập Setup hours + Run rate (units/giờ) + Yield %.'
        ),
        bs(
          'Click Save → operation available in Mfg Structures + Complex calc.',
          'Click Save → công đoạn có sẵn trong Mfg Structures + Complex calc.'
        ),
      ]),
      proc(
        'Periodic rate audit',
        'Audit tốc độ định kỳ',
        bi(
          'Press run rate decays 2-5% per year without maintenance. Quarterly audit.',
          'Tốc độ máy xuống cấp 2-5%/năm nếu không bảo dưỡng. Audit hàng quý.'
        ),
        [
          bs(
            'Pull the last 3 months of shop floor logs for the operation.',
            'Lấy 3 tháng gần nhất shop floor log cho công đoạn.'
          ),
          bs(
            'Compare actual avg run rate vs. library value.',
            'So sánh tốc độ trung bình thực tế vs giá trị library.'
          ),
          bs(
            'Update if delta > 5%; note reason in the audit trail.',
            'Update nếu delta > 5%; note lý do vào audit trail.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [
      field('Run rate', 'units/hour', 'Realistic sustained rate, not nameplate.'),
      field(
        'Yield',
        'percent',
        'Good units out / units in. Defaults from typical; override per process.'
      ),
    ],
    formulas: [],
    tips: [
      bt(
        'Track run rate decay — press ages, rates drop 2-5% per year without maintenance.',
        'Theo dõi tốc độ xuống cấp — máy càng cũ, tốc độ giảm 2-5%/năm nếu không bảo dưỡng.'
      ),
    ],
    pitfalls: [
      bp(
        'Over-optimistic run rates cause under-priced quotes → margin loss at month-end.',
        'Tốc độ quá lạc quan → báo giá thấp → mất margin cuối tháng.'
      ),
    ],
    relatedTabs: ['lib-mfg', 'complex', 'lib-rate'],
    screenshot: null,
  },

  'lib-inventory': {
    id: 'lib-inventory',
    section: 'MANUFACTURING',
    title: bi('IFS Inventory', 'Tồn kho IFS'),
    function: bi(
      'Read-only IFS ERP stock levels (on-hand / on-order / allocated)',
      'View chỉ đọc tồn kho IFS ERP'
    ),
    path: 'Ops Cost > Manufacturing > IFS Inventory',
    purpose: bi(
      'Read-only view of real-time stock levels from the IFS ERP. Stock on hand, on order, allocated.',
      'View chỉ đọc của tồn kho thời gian thực từ IFS ERP. Tồn, đặt hàng, đã allocate.'
    ),
    whenToUse: bi(
      'Before quoting: check if material is available. Before confirming delivery: check allocation.',
      'Trước khi báo giá: kiểm tra vật tư có sẵn không. Trước khi xác nhận giao hàng: kiểm tra allocation.'
    ),
    preRequisites: [
      br(
        'IFS integration active; admin has set up the ODBC/API bridge.',
        'IFS integration đang hoạt động; admin đã setup cầu nối ODBC/API.'
      ),
    ],
    procedures: [
      proc('Search + filter', 'Tìm + lọc', null, [
        bs('Search box: material code or description.', 'Ô search: code vật tư hoặc mô tả.'),
        bs(
          'Filter chips: In-stock only / Shortage only / Oversupply.',
          'Chip lọc: Chỉ còn hàng / Chỉ thiếu / Dư thừa.'
        ),
        bs(
          'Last-refresh timestamp shown top-right (data 15 min stale max).',
          'Timestamp refresh cuối hiển thị trên phải (data chậm tối đa 15 phút).'
        ),
      ]),
      proc('Row detail', 'Chi tiết dòng', null, [
        bs('Click row → expanded panel.', 'Click dòng → panel mở rộng.'),
        bs(
          'Breakdown: On-hand / On-order / Allocated / Free-to-promise / Next ETA.',
          'Breakdown: Tồn / Đặt hàng / Đã allocate / FTP / ETA kế.'
        ),
        bs(
          'Click through "Open POs" → list with supplier + ETA.',
          'Click "Open POs" → list kèm NCC + ETA.'
        ),
        bs(
          'Click "Allocated SOs" → list with customer + ship-by.',
          'Click "Allocated SOs" → list kèm khách + ngày giao.'
        ),
      ]),
      proc(
        'Alternate search',
        'Tra vật tư thay thế',
        bi(
          'IFS substitution chains are respected. If primary out of stock, see alternates with stock + cost delta.',
          'Chuỗi thay thế IFS được tôn trọng. Nếu vật tư chính hết, xem phương án thay thế kèm tồn + delta giá.'
        ),
        [
          bs('Right-click row → "Show alternates".', 'Right-click dòng → "Show alternates".'),
          bs(
            'Alternate list with: code, stock, unit cost delta (+/− %), historical substitution rate.',
            'List thay thế kèm: code, tồn, delta đơn giá (+/− %), tỉ lệ thay thế lịch sử.'
          ),
          bs(
            'Cross-reference with Material Library before committing.',
            'Đối chiếu với Material Library trước khi commit.'
          ),
        ]
      ),
    ],
    workflow: null,
    keyFields: [],
    formulas: [
      {
        name: 'Free to promise',
        expr: 'FTP = on_hand + on_order − allocated',
        meaning: bi(
          'Units available to promise to a new customer without breaking existing commitments.',
          'Số đơn vị có thể cam kết cho khách mới mà không phá vỡ cam kết cũ.'
        ),
        example:
          'on_hand=5,000 + on_order=3,000 − allocated=4,000\nFTP = 4,000 units available for new quotes',
      },
    ],
    tips: [
      bt(
        'Integration refresh is every 15 min. For live-critical decisions, cross-check with IFS directly.',
        'Integration refresh 15 phút/lần. Với quyết định gấp, kiểm tra trực tiếp trong IFS.'
      ),
    ],
    pitfalls: [
      bp(
        'Allocated ≠ consumed — cancelled SOs may still show allocated until IFS EOD cleanup.',
        'Allocated ≠ tiêu thụ — SO đã huỷ vẫn có thể hiển thị allocated cho tới khi IFS cleanup cuối ngày.'
      ),
    ],
    relatedTabs: ['lib-mat', 'rfq-tracker'],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // TRACKING
  // ─────────────────────────────────────────────────────────────

  'rfq-tracker': {
    id: 'rfq-tracker',
    section: 'TRACKING',
    title: bi('RFQ Tracker', 'Theo dõi RFQ'),
    function: bi(
      '5-stage customer RFQ pipeline: Sale → Feasibility → Design → Sourcing → Pricing',
      'Pipeline RFQ khách hàng 5 giai đoạn: Sale → Khả thi → Thiết kế → Sourcing → Báo giá'
    ),
    path: 'Ops Cost > Tracking > RFQ Tracker',
    purpose: bi(
      'End-to-end pipeline for customer RFQs. From the moment Sales receives a design file until Pricing releases the quote, every stage has an owner, an SLA, and a checklist. The tab is the single source of truth for "where is my RFQ right now, who is holding it, and what is overdue".',
      'Pipeline đầu-cuối cho RFQ của khách hàng. Từ lúc Sale nhận được file thiết kế đến khi Pricing phát hành báo giá — mỗi giai đoạn có người phụ trách, SLA và checklist. Tab này là nguồn sự thật duy nhất cho "RFQ của tôi đang ở đâu, ai đang giữ, cái gì trễ hạn".'
    ),
    whenToUse: bi(
      'Every incoming customer RFQ goes here FIRST. Review the board every morning to see blocked items and SLA breaches.',
      'Mọi RFQ khách hàng đến ĐỀU bắt đầu từ đây. Review bảng Kanban mỗi sáng để phát hiện item bị chặn và vi phạm SLA.'
    ),
    preRequisites: [
      bi(
        'Design file (AI / PDF) received from customer.',
        'File thiết kế (AI / PDF) đã nhận từ khách.'
      ),
      bi('Customer provided EAU, MOQ, and deadline.', 'Khách đã cung cấp EAU, MOQ, deadline.'),
    ],
    features: [
      feat(
        'KPI bar — Total, Active, SLA Breach, Win Rate, Negotiating, Pipeline $, + 6-month win-rate / cycle-time trend chart (▼ Show 6-mo trend)',
        'Thanh KPI — Tổng, Đang chạy, Vi phạm SLA, Tỷ lệ Win, Đang đàm phán, Giá trị pipeline, + biểu đồ xu hướng 6 tháng (▼ Show 6-mo trend)'
      ),
      feat(
        'Kanban board — 6 columns (5 stages + Done) with per-column RFQ count + progress bars',
        'Bảng Kanban — 6 cột (5 giai đoạn + Done) với số RFQ mỗi cột + thanh tiến độ'
      ),
      feat(
        'List view toggle — sortable table of all RFQs with stage pill + SLA highlight + multi-select checkboxes for bulk close / delete',
        'Chuyển view dạng List — bảng sort được, pill giai đoạn, highlight SLA, checkbox multi-select cho đóng/xoá hàng loạt'
      ),
      feat(
        'My Inbox filter — one-click filter showing only RFQs where the current user owns the active stage',
        'Bộ lọc My Inbox — 1 click lọc chỉ RFQ mà user hiện tại là chủ của giai đoạn đang active'
      ),
      feat(
        'Saved Views — save the current filter as a named view (localStorage); reapply from the ⭐ menu',
        'Saved Views — lưu bộ filter hiện tại thành view có tên (localStorage); apply lại từ menu ⭐'
      ),
      feat(
        'Detail drawer — slides from right, 3 tabs: Detail (Identity / Print Specs / Document Flow / Pipeline) · History · Attachments',
        'Drawer chi tiết — slide từ phải, 3 tab: Detail (Identity / Print Specs / Document Flow / Pipeline) · History · Attachments'
      ),
      feat(
        'Required-field gates — each checklist item can be marked "req"; Next → is DISABLED until all required items in the current stage are ticked and stage required fields are filled',
        'Khoá theo trường bắt buộc — mỗi item checklist có thể đánh dấu "req"; Next → BỊ KHOÁ đến khi tick đủ các item "req" và các trường bắt buộc của giai đoạn đã điền'
      ),
      feat(
        'Per-stage signatures — when a stage moves to Done, the owner + timestamp are stamped immutably; the stage is read-only until an explicit ⟲ Reopen (logged in audit)',
        'Chữ ký mỗi giai đoạn — khi stage done, owner + timestamp được đóng dấu bất biến; stage read-only đến khi ⟲ Reopen tường minh (ghi vào audit)'
      ),
      feat(
        'Standardized reason codes — Blocked (R01-R99), WIN (W01-W99), LOSS (L01-L99) dropdowns replace free-text for reportable analysis',
        'Mã lý do chuẩn hoá — Blocked (R01-R99), WIN (W01-W99), LOSS (L01-L99) bằng dropdown thay vì text tự do, phục vụ phân tích'
      ),
      feat(
        'Append-only audit trail — every field change, stage transition, reopen, checklist tick, sync, upload is logged server-side with user + timestamp. View in the History tab.',
        'Audit trail append-only — mọi thay đổi trường, chuyển giai đoạn, reopen, tick checklist, sync, upload đều được log bên server kèm user + timestamp. Xem ở tab History.'
      ),
      feat(
        'Attachment manager — upload dieline / customer emails / quote PDFs to server-side content-addressed store; 15 MB / file default cap',
        'Quản lý đính kèm — upload dieline / email khách / PDF báo giá lên store content-addressed bên server; mặc định giới hạn 15 MB / file'
      ),
      feat(
        'Document Flow strip — visual chain RFQ → Pricing Worksheet → Sample → Customer Order; clickable to jump to downstream tabs',
        'Dải Document Flow — chuỗi trực quan RFQ → Pricing Worksheet → Mẫu → Đơn hàng; click được để nhảy sang tab downstream'
      ),
      feat(
        'Sync → Pricing Worksheet — one click pushes RFQ No, Customer, Product, EAU, MOQ, owners, dimensions into Pricing (Std), and records the handoff in Document Flow + audit',
        'Sync → Pricing Worksheet — 1 click đẩy RFQ No, Customer, Product, EAU, MOQ, người phụ trách, kích thước sang Pricing (Std), và ghi handoff vào Document Flow + audit'
      ),
      feat(
        'Move-stage buttons — "Next →" auto-stamps done date + signature on current stage, activates next. Disabled with a tooltip when requirements are unmet.',
        'Nút chuyển giai đoạn — "Next →" tự đóng dấu done + chữ ký, kích hoạt stage kế. Bị disable + tooltip khi chưa đủ điều kiện.'
      ),
      feat(
        'Drawer edits insulated from background sync — once you open an RFQ, your in-progress edits (checklist toggles, text fields, req badges) stay local and are not overwritten by the 60-second background refresh. No flash, no reset mid-edit.',
        'Drawer edit cách ly với background sync — khi đã mở RFQ, các edit dở (toggle checklist, text fields, req badge) giữ nguyên cục bộ và không bị 60s background refresh ghi đè. Không nhấp nháy, không reset giữa chừng.'
      ),
      feat(
        'Background list auto-refresh + SSE live events — Kanban / List view refreshes every 60 seconds; teammate updates pushed via SSE land within ~1 second. Both run alongside an open drawer without disturbing your edits.',
        'Background list auto-refresh + SSE live event — Kanban / List view refresh mỗi 60s; cập nhật của đồng nghiệp đẩy qua SSE đến trong ~1s. Cả 2 chạy song song với drawer đang mở mà không phá edit của bạn.'
      ),
      feat(
        'Checklist user-edits preserved across refresh — when you rename a default checklist task or toggle its "req" badge, your change is kept after the next sync (per-item index merge). Custom tasks added via "+ Add task" survive too.',
        'User-edit checklist giữ qua refresh — khi bạn đổi tên task checklist mặc định hoặc toggle nhãn "req", thay đổi được giữ sau lần sync kế (merge theo chỉ số từng item). Custom task thêm qua "+ Add task" cũng được giữ.'
      ),
    ],
    procedures: [
      proc('Stage 1 — Sale (Input)', 'Giai đoạn 1 — Sale (Nhập)', null, [
        bs('Click + New RFQ to create the record.', 'Click + New RFQ để tạo hồ sơ.'),
        bs(
          'Enter Identity: RFQ No, Customer, Product, EAU, MOQ, RFQ Date, Deadline, Sales Owner.',
          'Nhập Thông tin chung: RFQ No, Khách, Sản phẩm, EAU, MOQ, Ngày RFQ, Deadline, Sale phụ trách.'
        ),
        bs(
          'Tick the Sale checklist as you confirm each input (design file, specs, EAU/MOQ, deadline).',
          'Tick checklist Sale khi xác nhận mỗi mục (file thiết kế, thông số, EAU/MOQ, deadline).'
        ),
        bs('Click Next → to advance to Feasibility.', 'Click Next → để chuyển sang Feasibility.'),
      ]),
      proc(
        'Stage 2 — NPI Quote Specialist (Feasibility)',
        'Giai đoạn 2 — NPI Quote (Tính khả thi)',
        null,
        [
          bs(
            'Open the detail drawer, expand the Feasibility accordion.',
            'Mở drawer chi tiết, expand accordion Feasibility.'
          ),
          bs(
            'Fill Print Type (Offset / Flexo / Digital / Hybrid) in the Print Specs section.',
            'Điền Loại in (Offset / Flexo / Digital / Hybrid) trong mục Print Specs.'
          ),
          bs(
            'Tick feasibility checklist: risks logged, approved for costing.',
            'Tick checklist: rủi ro đã ghi nhận, đã duyệt để tính giá.'
          ),
          bs(
            'If blocked (e.g. tolerance impossible), set stage Status = Blocked and add notes.',
            'Nếu bị chặn (ví dụ dung sai bất khả thi), set Trạng thái = Blocked và ghi notes.'
          ),
        ]
      ),
      proc('Stage 3 — NPI Design Process', 'Giai đoạn 3 — NPI Thiết kế', null, [
        bs(
          'NPI Design Owner takes over — expand the Design accordion.',
          'Người phụ trách NPI Design tiếp nhận — expand accordion Design.'
        ),
        bs(
          'Tick imposition / dieline / wastage items as they complete.',
          'Tick các mục bình đồ / dieline / hao hụt khi hoàn thành.'
        ),
        bs(
          'Attach dieline file path + layout file path in Print Specs.',
          'Đính kèm đường dẫn dieline + layout trong Print Specs.'
        ),
      ]),
      proc('Stage 4 — Materials Sourcing', 'Giai đoạn 4 — Mua vật tư', null, [
        bs(
          'Sourcing team quotes paper, ink, foil, die tooling from approved suppliers.',
          'Bộ phận mua hàng hỏi giá giấy, mực, nhũ, khuôn bế từ NCC đã duyệt.'
        ),
        bs(
          'Update the Material Library with the latest prices (see Library > Material Library).',
          'Cập nhật Library vật tư với giá mới nhất (xem Library > Material Library).'
        ),
        bs(
          'Tick "Prices updated in Library" to confirm Costing has the inputs it needs.',
          'Tick "Prices updated in Library" để xác nhận Costing có input cần thiết.'
        ),
      ]),
      proc('Stage 5 — Pricing (Final)', 'Giai đoạn 5 — Báo giá (Cuối)', null, [
        bs(
          'Open Pricing Worksheet directly via Sync → Pricing Worksheet in the drawer footer.',
          'Mở Pricing Worksheet trực tiếp qua nút Sync → Pricing Worksheet dưới drawer.'
        ),
        bs(
          'RFQ No, Customer, Product, EAU, MOQ, owners, dimensions land on the RFQ & MOQ Info tab automatically.',
          'RFQ No, Khách, Sản phẩm, EAU, MOQ, người phụ trách, kích thước sẽ tự đổ sang tab RFQ & MOQ Info.'
        ),
        bs(
          'Compute the full cost sheet, save the quote, then return here and set Result = WIN / LOSS / NEGOTIATING.',
          'Tính toàn bộ cost sheet, lưu báo giá, quay lại đây set Kết quả = WIN / LOSS / NEGOTIATING.'
        ),
        bs(
          'Enter Quote Value (USD) to update the Pipeline $ KPI.',
          'Nhập Giá trị báo giá (USD) để cập nhật KPI Pipeline $.'
        ),
      ]),
    ],
    workflow: bi(
      'Sale(1d) → Feasibility(1d) → Design(2d) → Sourcing(3d) → Pricing(1d)  =  8-day target cycle',
      'Sale(1 ngày) → Khả thi(1 ngày) → Thiết kế(2 ngày) → Sourcing(3 ngày) → Báo giá(1 ngày)  =  Chu kỳ mục tiêu 8 ngày'
    ),
    keyFields: [
      {
        field: 'rfq_no',
        label: bi('RFQ No.', 'Số RFQ'),
        type: 'text',
        notes: bi(
          'Unique RFQ identifier — used as the join key for Sync → Pricing Worksheet.',
          'Mã RFQ duy nhất — dùng làm khoá nối cho Sync → Pricing Worksheet.'
        ),
      },
      {
        field: 'customer',
        label: bi('Customer', 'Khách hàng'),
        type: 'text',
        notes: bi(
          'Direct customer code — maps to Pricing.direct_cu.',
          'Mã khách trực tiếp — map sang Pricing.direct_cu.'
        ),
      },
      {
        field: 'product',
        label: bi('Product', 'Sản phẩm'),
        type: 'text',
        notes: bi(
          'Description — maps to Pricing.description + project_name.',
          'Mô tả — map sang Pricing.description + project_name.'
        ),
      },
      {
        field: 'eau_qty',
        label: bi('EAU', 'Sản lượng năm'),
        type: 'number',
        notes: bi(
          'Estimated Annual Usage — maps to Pricing.annual_qty.',
          'Estimated Annual Usage — map sang Pricing.annual_qty.'
        ),
      },
      {
        field: 'moq',
        label: bi('MOQ', 'MOQ'),
        type: 'number',
        notes: bi(
          'Min order qty — maps to Pricing.moq.',
          'Số lượng tối thiểu — map sang Pricing.moq.'
        ),
      },
      {
        field: 'deadline',
        label: bi('Deadline', 'Hạn chót'),
        type: 'date',
        notes: bi(
          'Card goes red if deadline has passed and result is not WIN/LOSS.',
          'Card chuyển đỏ nếu quá deadline và kết quả chưa WIN/LOSS.'
        ),
      },
      {
        field: 'pipeline_stage',
        label: bi('Current Stage', 'Giai đoạn'),
        type: 'enum',
        notes: bi(
          'Derived from per-stage status. Override by clicking Next/Back.',
          'Suy ra từ trạng thái từng stage. Override bằng nút Next/Back.'
        ),
      },
      {
        field: 'result',
        label: bi('Result', 'Kết quả'),
        type: 'enum',
        notes: bi(
          'PENDING / WIN / LOSS / NEGOTIATING. WIN+LOSS move the card to the Done column.',
          'PENDING / WIN / LOSS / NEGOTIATING. WIN+LOSS chuyển card sang cột Done.'
        ),
      },
      {
        field: 'quote_value',
        label: bi('Quote Value', 'Giá trị báo giá'),
        type: 'number',
        notes: bi(
          'USD — aggregated into the Pipeline $ KPI.',
          'USD — tổng hợp vào KPI Pipeline $.'
        ),
      },
      {
        field: 'specs.width_mm / height_mm',
        label: bi('Dimensions', 'Kích thước'),
        type: 'number',
        notes: bi(
          'mm — map to Pricing.part_width + part_length_md.',
          'mm — map sang Pricing.part_width + part_length_md.'
        ),
      },
    ],
    formulas: [
      {
        name: bi('Win Rate %', 'Tỷ lệ Win %'),
        formula: 'wins / (wins + losses) * 100',
        notes: bi(
          'Only closed RFQs count (WIN + LOSS). PENDING and NEGOTIATING are excluded.',
          'Chỉ tính RFQ đã đóng (WIN + LOSS). PENDING và NEGOTIATING bị loại trừ.'
        ),
      },
      {
        name: bi('SLA Breach (per RFQ)', 'Vi phạm SLA (mỗi RFQ)'),
        formula: 'deadline < today  OR  any stage.status = "blocked"',
        notes: bi(
          'Closed RFQs (WIN/LOSS) never count as breach.',
          'RFQ đã đóng (WIN/LOSS) không bao giờ tính là vi phạm.'
        ),
      },
      {
        name: bi('Stage progress %', '% Tiến độ giai đoạn'),
        formula: 'checklist_checked_count / checklist_total_count * 100',
        notes: bi(
          'Drives the progress bar on the Kanban card.',
          'Lái thanh tiến độ trên card Kanban.'
        ),
      },
      {
        name: bi('Days in stage', 'Số ngày trong giai đoạn'),
        formula: 'today - stage.start (or null if start not set)',
        notes: bi(
          'Turns red on the card if > stage.sla_days.',
          'Chuyển đỏ trên card nếu > stage.sla_days.'
        ),
      },
    ],
    tips: [
      bt(
        'Start every day on the Kanban view — the SLA Breach KPI tells you what needs action before anything else.',
        'Bắt đầu mỗi ngày ở view Kanban — KPI Vi phạm SLA cho biết việc gì cần làm trước tất cả.'
      ),
      bt(
        'Use the List view for weekly management reports — faster to scan than 6 columns.',
        'Dùng view List cho báo cáo quản lý tuần — scan nhanh hơn 6 cột.'
      ),
      bt(
        'Sync → Pricing Worksheet is one-way (RFQ → Pricing). Changes in the Pricing tab do NOT push back; keep the RFQ fields up to date manually if specs change.',
        'Sync → Pricing Worksheet là một chiều (RFQ → Pricing). Thay đổi bên Pricing KHÔNG push ngược lại; cập nhật thủ công nếu spec thay đổi.'
      ),
      bt(
        'Move-back is for corrections only — do NOT use it to "skip" a stage backwards; use the Status = Blocked field to represent a real hold.',
        'Chỉ dùng Move-back để sửa lỗi — KHÔNG dùng để "nhảy lùi" giai đoạn; dùng Status = Blocked để thể hiện hold thật.'
      ),
    ],
    pitfalls: [
      bp(
        'If the RFQ No is empty, Sync → Pricing Worksheet is disabled. Always fill RFQ No first.',
        'Nếu RFQ No rỗng, Sync → Pricing Worksheet bị disable. Luôn điền RFQ No trước.'
      ),
      bp(
        'The Kanban card progress bar reflects checklist ticks, not stage status. A 100%-ticked stage still needs Next → to advance to the next column.',
        'Thanh tiến độ trên card Kanban phản ánh tick checklist, không phải stage status. Stage tick đủ 100% vẫn cần Next → để chuyển cột.'
      ),
      bp(
        'Deleting an RFQ is permanent — no soft-delete audit trail. Back up before bulk cleanup.',
        'Xoá RFQ là vĩnh viễn — không có audit trail soft-delete. Backup trước khi dọn hàng loạt.'
      ),
      bp(
        'Drawer is a snapshot the moment you opened it — if you leave it open for 10+ minutes while teammates are editing the same RFQ, you may save over their changes. For long edit sessions on shared RFQs, close + reopen periodically to pick up server state.',
        'Drawer là snapshot tại thời điểm mở — nếu để mở 10+ phút trong khi đồng nghiệp cũng đang edit cùng RFQ, bạn có thể save đè lên thay đổi của họ. Với phiên edit dài trên RFQ chung, nên đóng + mở lại định kỳ để lấy state mới từ server.'
      ),
    ],
    constraints: [
      con(
        'Max ~500 RFQs per file before load/save latency noticeable (single JSON file).',
        'Tối đa ~500 RFQ mỗi file trước khi load/save chậm rõ rệt (một file JSON duy nhất).'
      ),
      con(
        'No multi-user conflict detection — last write wins. Coordinate edits over chat if multiple operators work the same RFQ.',
        'Chưa phát hiện xung đột đa người dùng — last write wins. Phối hợp qua chat nếu nhiều người cùng sửa 1 RFQ.'
      ),
      con(
        'Drag-and-drop between Kanban columns is NOT supported — use the Next / Back buttons on the card or drawer.',
        'Chưa hỗ trợ kéo-thả giữa cột Kanban — dùng nút Next / Back trên card hoặc drawer.'
      ),
    ],
    example: ex(
      bi(
        'Samsung sends an RFQ for a 40×20 mm Flexo label, EAU 200,000, deadline 15 May. Walk the RFQ through all 5 stages to final quote.',
        'Samsung gửi RFQ nhãn Flexo 40×20 mm, EAU 200.000, deadline 15/5. Dẫn RFQ qua cả 5 giai đoạn đến báo giá cuối.'
      ),
      [
        bs(
          '+ New RFQ → fill Identity (RFQ No RFQ00042, Customer Samsung, Product 40×20 Flexo Label, EAU 200000, MOQ 50000, Deadline 2026-05-15, Sales Owner Dora).',
          '+ New RFQ → điền Identity (RFQ No RFQ00042, Khách Samsung, Sản phẩm Nhãn Flexo 40×20, EAU 200000, MOQ 50000, Deadline 15/5/2026, Sale Dora).'
        ),
        bs(
          'Tick all 5 Sale checklist items → Next → card moves to Feasibility column.',
          'Tick cả 5 mục checklist Sale → Next → card chuyển sang cột Feasibility.'
        ),
        bs(
          'In Print Specs, set Print Type = Flexo, Width = 40, Height = 20 → tick Feasibility checklist → Next.',
          'Trong Print Specs, set Loại in = Flexo, Rộng = 40, Cao = 20 → tick checklist Feasibility → Next.'
        ),
        bs(
          'NPI Design does imposition (6-up, 1 web) + dieline → tick checklist → Next.',
          'NPI Design làm bình đồ (6-up, 1 web) + dieline → tick checklist → Next.'
        ),
        bs(
          'Sourcing quotes substrate + ink + die → Library updated → Next.',
          'Sourcing hỏi giá vật liệu + mực + khuôn → Library cập nhật → Next.'
        ),
        bs(
          'In Pricing stage: click Sync → Pricing Worksheet. Standard tab opens on RFQ & MOQ Info with all fields prefilled.',
          'Ở stage Pricing: click Sync → Pricing Worksheet. Tab Standard mở ở RFQ & MOQ Info với field đã điền sẵn.'
        ),
      ],
      bi(
        'Full quote in 8 days, audit trail shows every stage start/done date + who ticked what.',
        'Hoàn tất báo giá trong 8 ngày, audit trail hiện đủ ngày start/done từng stage + ai tick gì.'
      )
    ),
    result: res(
      'Every RFQ traceable from receipt to release. Blocked items surface immediately via the SLA Breach KPI, and customer-facing commitments (deadline) are enforced by the red card border.',
      'Mọi RFQ truy vết được từ khi nhận đến khi phát hành. Item bị chặn nổi lên ngay qua KPI Vi phạm SLA, cam kết với khách (deadline) được enforce bằng viền card đỏ.'
    ),
    authorization: auth(
      'Sales + NPI + Sourcing + Costing teams',
      bi(
        'Sales creates the RFQ; NPI + Sourcing advance middle stages; Costing releases Stage 5. Admin can delete any record.',
        'Sale tạo RFQ; NPI + Sourcing đẩy các stage giữa; Costing phát hành Stage 5. Admin có thể xoá bất kỳ record nào.'
      )
    ),
    relatedTabs: ['standard', 'complex', 'lib-mat', 'quote-history'],
    screenshot: null,
  },

  'sample-tracking': {
    id: 'sample-tracking',
    section: 'TRACKING',
    title: bi('Sample Tracking', 'Theo dõi Mẫu'),
    function: bi(
      '6-stage sample pipeline: Request → Prep → Run → QC → Customer → Spec Released',
      'Pipeline mẫu 6 giai đoạn: Yêu cầu → Chuẩn bị → Chạy mẫu → QC → Phản hồi khách → Ra SPEC'
    ),
    path: 'Ops Cost > Tracking > Sample Tracking',
    purpose: bi(
      'End-to-end pipeline for every customer sample request. Sales receives the request, NPI procures material + film/plate + cutter in parallel, Production runs the sample, QC inspects, Sales gathers customer feedback, and NPI releases the spec to Production. Every stage has an owner, SLA, and checklist — the board is the single source of truth for "where is this sample right now".',
      'Pipeline đầu-cuối cho mọi yêu cầu mẫu. Sale nhận yêu cầu, NPI chuẩn bị song song vật liệu + film/plate + dao, Sản xuất chạy mẫu, QC kiểm tra, Sale thu thập phản hồi khách, NPI ra SPEC cho Sản xuất. Mỗi stage có owner, SLA, checklist — bảng là nguồn sự thật duy nhất cho "mẫu đang ở đâu".'
    ),
    whenToUse: bi(
      'Every new SKU, major redesign, material change, or colour-match request goes through this tab before mass-production quote release.',
      'Mọi SKU mới, redesign lớn, đổi vật liệu, hoặc yêu cầu colour-match đều qua tab này trước khi phát hành báo giá sản xuất hàng loạt.'
    ),
    preRequisites: [
      bi(
        'Customer request received (email, RFQ, or call).',
        'Đã nhận yêu cầu từ khách (email, RFQ, hoặc điện thoại).'
      ),
      bi('Quantity + due date agreed.', 'Đã thống nhất số lượng + ngày giao.'),
    ],
    features: [
      feat(
        'KPI bar — Total, Pending, SLA Breach, OK Rate %, Finished %, Spec Released, + 6-month trend (OK Rate / avg cycle)',
        'Thanh KPI — Tổng, Pending, Vi phạm SLA, OK Rate %, Finished %, Spec Released, + xu hướng 6 tháng (OK Rate / chu kỳ TB)'
      ),
      feat(
        'Per-NPI-Owner summary strip — parts, finished, OK, NG, OK rate %, spec released (mirrors the xlsx summary)',
        'Strip tổng kết theo NPI Owner — parts, finished, OK, NG, OK rate %, spec released (giống xlsx)'
      ),
      feat(
        'Kanban board — 7 columns (6 stages + Done) with per-card progress bar',
        'Bảng Kanban — 7 cột (6 giai đoạn + Done) với thanh tiến độ trên mỗi card'
      ),
      feat(
        'List view toggle — sortable table with multi-select checkboxes for bulk Mark OK / NG / PARTIAL / Delete',
        'Chuyển view List — bảng sort được, multi-select để bulk Mark OK / NG / PARTIAL / Delete'
      ),
      feat(
        'My Inbox filter — 📥 shows only samples where current user is CS, NPI Owner, or active-stage owner',
        'Filter My Inbox — 📥 chỉ hiện mẫu mà user hiện tại là CS, NPI Owner, hoặc owner giai đoạn đang active'
      ),
      feat(
        'Saved Views — ⭐ menu stores named filter combos in localStorage',
        'Saved Views — menu ⭐ lưu filter đã đặt tên vào localStorage'
      ),
      feat(
        'Detail drawer — 3 tabs: Detail (Identity / Specs / Document Flow / Pipeline) · History · Attachments',
        'Drawer chi tiết — 3 tab: Detail (Identity / Specs / Document Flow / Pipeline) · History · Attachments'
      ),
      feat(
        'Parallel Prep tracking — Material / Film-Plate / Cutter each with Name, ETA, Status — all three must turn Done before the Prep stage can advance',
        'Theo dõi Prep song song — Vật liệu / Film-Plate / Dao mỗi thứ có Tên, ETA, Trạng thái — cả 3 phải Done trước khi Prep advance'
      ),
      feat(
        'Required-field gates — Next → is DISABLED until stage required fields are filled AND required checklist items ticked',
        'Khoá theo trường bắt buộc — Next → BỊ KHOÁ đến khi trường bắt buộc + item "req" của stage đủ'
      ),
      feat(
        'Immutable signatures — when a stage goes Done, owner + timestamp stamp; read-only until ⟲ Reopen',
        'Chữ ký bất biến — khi stage done, đóng dấu owner + timestamp; read-only đến khi ⟲ Reopen'
      ),
      feat(
        'Standardized reason codes — NG (N01-N99), Blocked (R01-R99), Accept (A01-A02) via dropdowns',
        'Mã lý do chuẩn hoá — NG (N01-N99), Blocked (R01-R99), Accept (A01-A02) bằng dropdown'
      ),
      feat(
        'Append-only audit trail — every field edit, stage transition, reopen, checklist tick, upload logged server-side. View in History tab.',
        'Audit trail append-only — mọi thay đổi, chuyển giai đoạn, reopen, tick checklist, upload được log bên server. Xem ở tab History.'
      ),
      feat(
        'Attachments — upload sample photos, customer feedback emails, QC reports; 15 MB / file default cap',
        'Đính kèm — upload ảnh mẫu, email phản hồi khách, QC report; mặc định giới hạn 15 MB / file'
      ),
      feat(
        'Document Flow — RFQ → Sample → Production Order → Spec Released. Fill Linked RFQ / Linked Production Order in Identity to activate.',
        'Document Flow — RFQ → Mẫu → Production Order → SPEC. Điền Linked RFQ / Linked Production Order trong Identity để kích hoạt.'
      ),
      feat(
        'Drawer is insulated from background sync — your in-progress edits stay intact through the 60-second auto-refresh tick (no flash, no revert mid-edit).',
        'Panel chi tiết được cách ly khỏi background sync — edits đang làm giữ nguyên qua mỗi 60 giây auto-refresh (không nhấp nháy, không revert giữa chừng).'
      ),
      feat(
        'Background list (Kanban cards / List view) auto-refreshes every 60 seconds with the latest server state — your drawer-local edits remain protected, and teammate updates pushed via SSE land within ~1 second.',
        'Background list (Kanban / List view) tự refresh mỗi 60 giây từ server — edits trong drawer vẫn được bảo vệ, và cập nhật của đồng nghiệp đẩy qua SSE đến trong ~1 giây.'
      ),
      feat(
        'Checklist user-edits preserved across refresh — when you rename a default checklist task or toggle its "req" badge, your change is kept after the next sync (per-item index merge). Custom tasks added via "+ Add task" survive too.',
        'User-edit checklist giữ qua refresh — khi bạn đổi tên task checklist mặc định hoặc toggle nhãn "req", thay đổi được giữ sau lần sync kế (merge theo chỉ số từng item). Custom task thêm qua "+ Add task" cũng được giữ.'
      ),
    ],
    procedures: [
      proc('Stage 1 — Request (Intake)', 'Giai đoạn 1 — Request (Nhập)', null, [
        bs('Click + New Sample.', 'Click + New Sample.'),
        bs(
          'Fill Identity: Customer, CS, NPI Owner, IFS Code / Part Number, Qty, Submit Date, Due Date.',
          'Điền Identity: Khách, CS, NPI Owner, IFS Code / Part Number, Qty, Ngày nhận, Deadline.'
        ),
        bs(
          'In Specs: set Sample Type, Product Type (HP/Flexo/Offset/...), Width × Height.',
          'Trong Specs: set Loại mẫu, Loại in (HP/Flexo/Offset/...), Rộng × Cao.'
        ),
        bs(
          'Optionally fill Linked RFQ No if this sample comes from a tracked RFQ.',
          'Tuỳ chọn điền Linked RFQ No nếu mẫu này đến từ RFQ đã track.'
        ),
        bs(
          'Tick all 4 required Request items → Next →.',
          'Tick cả 4 mục bắt buộc của Request → Next →.'
        ),
      ]),
      proc('Stage 2 — Prep (parallel procurement)', 'Giai đoạn 2 — Prep (mua song song)', null, [
        bs(
          'Fill Material Spec in Specs section (required).',
          'Điền Material Spec trong mục Specs (bắt buộc).'
        ),
        bs(
          'In Prep stage body, update the 3 parallel tracks: Material ETA + Status, Film/Plate Name + ETA + Status, Cutter Name + ETA + Status.',
          'Trong phần Prep, cập nhật 3 track song song: Vật liệu ETA + Status, Film/Plate Tên + ETA + Status, Dao Tên + ETA + Status.'
        ),
        bs(
          'Tick required checklist items as each procurement closes.',
          'Tick checklist khi mỗi hạng mục mua xong.'
        ),
        bs(
          'When all 3 tracks show Done and checklist is complete → Next →.',
          'Khi cả 3 track Done và checklist đủ → Next →.'
        ),
      ]),
      proc('Stage 3 — Run (Sample Production)', 'Giai đoạn 3 — Chạy mẫu', null, [
        bs(
          'Production Owner takes over; issue YCM request.',
          'Production Owner tiếp nhận; phát YCM request.'
        ),
        bs(
          'Tick run-started / run-finished as production progresses.',
          'Tick run-started / run-finished theo tiến độ.'
        ),
        bs(
          'Hand the physical batch to QC, tick "Sample batch handed to QC" → Next →.',
          'Giao batch vật lý cho QC, tick "Sample batch handed to QC" → Next →.'
        ),
      ]),
      proc('Stage 4 — QC (Internal)', 'Giai đoạn 4 — QC (nội bộ)', null, [
        bs(
          'Perform visual + dimensional + (optional) functional checks.',
          'Thực hiện kiểm tra visual + dimensional + (tuỳ chọn) functional.'
        ),
        bs(
          'Attach the QC report in the Attachments tab.',
          'Đính kèm QC report trong tab Attachments.'
        ),
        bs('Sign off → Next →.', 'Ký duyệt → Next →.'),
      ]),
      proc('Stage 5 — Customer Feedback', 'Giai đoạn 5 — Phản hồi khách', null, [
        bs(
          'Ship the sample; attach shipment tracking as an attachment.',
          'Giao mẫu; đính kèm shipment tracking.'
        ),
        bs(
          'Record customer feedback: set Result = OK / NG / PARTIAL, fill OK count / NG count.',
          'Ghi nhận phản hồi: set Result = OK / NG / PARTIAL, điền OK count / NG count.'
        ),
        bs(
          'If NG/PARTIAL: pick an NG Reason Code (N01-N99) and log the improvement action in notes.',
          'Nếu NG/PARTIAL: chọn NG Reason Code (N01-N99) và ghi improvement action vào notes.'
        ),
      ]),
      proc('Stage 6 — Spec Released', 'Giai đoạn 6 — Ra SPEC', null, [
        bs(
          'Only release SPEC when Result = OK (or PARTIAL-acceptable).',
          'Chỉ release SPEC khi Result = OK (hoặc PARTIAL chấp nhận được).'
        ),
        bs(
          'Fill Linked Production Order (the PO / shop-order this SPEC feeds into).',
          'Điền Linked Production Order (PO / shop-order mà SPEC này đi vào).'
        ),
        bs(
          'Tick "Production order triggered" → Next → lands the card in Done.',
          'Tick "Production order triggered" → Next → card chuyển sang Done.'
        ),
      ]),
    ],
    workflow: bi(
      'Request(1d) → Prep(3d: material‖film‖cutter) → Run(2d) → QC(1d) → Customer(5d) → Spec(1d)  =  13-day target cycle',
      'Request(1 ngày) → Prep(3 ngày: vật liệu‖film‖dao) → Run(2 ngày) → QC(1 ngày) → Khách(5 ngày) → SPEC(1 ngày)  =  Chu kỳ mục tiêu 13 ngày'
    ),
    keyFields: [
      {
        field: 'cs',
        label: bi('CS', 'Sale'),
        type: 'text',
        notes: bi('Sales person who owns the customer relationship.', 'Sale phụ trách khách hàng.'),
      },
      {
        field: 'npi_owner',
        label: bi('NPI Owner', 'NPI Owner'),
        type: 'text',
        notes: bi(
          'NPI team member coordinating the sample pipeline.',
          'Người NPI điều phối pipeline mẫu.'
        ),
      },
      {
        field: 'customer',
        label: bi('Customer', 'Khách hàng'),
        type: 'text',
        notes: bi('Customer code (Samsung, LG, SVP, ...).', 'Mã khách (Samsung, LG, SVP, ...).'),
      },
      {
        field: 'ifs_code',
        label: bi('IFS Code', 'IFS Code'),
        type: 'text',
        notes: bi('IFS material / SKU code.', 'Mã IFS / SKU.'),
      },
      {
        field: 'part_number',
        label: bi('Part Number', 'Mã số part'),
        type: 'text',
        notes: bi(
          'Customer-facing part number on the sample.',
          'Mã part khách nhìn thấy trên mẫu.'
        ),
      },
      {
        field: 'shop_order',
        label: bi('Shop Order', 'Shop Order'),
        type: 'text',
        notes: bi('IFS shop-order number if already allocated.', 'Shop order IFS nếu đã cấp.'),
      },
      {
        field: 'qty',
        label: bi('Qty', 'Số lượng'),
        type: 'number',
        notes: bi('Number of sample pieces requested.', 'Số lượng mẫu yêu cầu.'),
      },
      {
        field: 'specs.width_mm / height_mm',
        label: bi('Size', 'Kích thước'),
        type: 'number',
        notes: bi(
          'mm — sample dimensions for quick visual scan.',
          'mm — kích thước mẫu để scan nhanh.'
        ),
      },
      {
        field: 'specs.sample_type',
        label: bi('Sample Type', 'Loại mẫu'),
        type: 'enum',
        notes: bi(
          '1st article / Colour match / Engineering / Limit / Pre-production.',
          '1st article / Colour match / Engineering / Limit / Pre-production.'
        ),
      },
      {
        field: 'specs.product_type',
        label: bi('Product Type', 'Loại sản phẩm'),
        type: 'enum',
        notes: bi(
          'HP / Flexo / Offset / Silk Screen / Digital / Gallus / Hybrid.',
          'HP / Flexo / Offset / Silk Screen / Digital / Gallus / Hybrid.'
        ),
      },
      {
        field: 'submit_date',
        label: bi('Submit Date', 'Ngày nhận'),
        type: 'date',
        notes: bi('Date the sample request was received.', 'Ngày nhận yêu cầu mẫu.'),
      },
      {
        field: 'due_date',
        label: bi('Due Date', 'Deadline'),
        type: 'date',
        notes: bi(
          'Customer-promised delivery date. Card goes red if passed.',
          'Ngày cam kết với khách. Card đỏ nếu quá.'
        ),
      },
      {
        field: 'result',
        label: bi('Result', 'Kết quả'),
        type: 'enum',
        notes: bi(
          'PENDING / OK / NG / PARTIAL. OK unlocks Spec Released.',
          'PENDING / OK / NG / PARTIAL. OK mở khoá Spec Released.'
        ),
      },
      {
        field: 'reason_code',
        label: bi('NG Reason Code', 'Mã lý do NG'),
        type: 'enum',
        notes: bi(
          'N01-N99 for NG/PARTIAL results. Drives quarterly NG analysis.',
          'N01-N99 cho NG/PARTIAL. Phục vụ phân tích NG theo quý.'
        ),
      },
      {
        field: 'ok_count / ng_count',
        label: bi('OK / NG count', 'Số lượng OK / NG'),
        type: 'number',
        notes: bi('Breakdown within a mixed batch.', 'Phân tách trong batch hỗn hợp.'),
      },
      {
        field: 'linked_rfq',
        label: bi('Linked RFQ', 'RFQ liên kết'),
        type: 'text',
        notes: bi(
          'Back-link to the RFQ Tracker record (for Document Flow).',
          'Liên kết ngược về RFQ Tracker (cho Document Flow).'
        ),
      },
      {
        field: 'linked_production_order',
        label: bi('Linked Production Order', 'PO sản xuất liên kết'),
        type: 'text',
        notes: bi(
          'Forward link to the production order that this SPEC feeds.',
          'Liên kết tới PO sản xuất mà SPEC này đi vào.'
        ),
      },
    ],
    formulas: [
      {
        name: bi('OK Rate %', 'Tỷ lệ OK %'),
        formula: 'OK / (OK + NG + PARTIAL) * 100',
        notes: bi(
          'Only judged samples count. PENDING is excluded.',
          'Chỉ tính mẫu đã phán xét. PENDING bị loại.'
        ),
      },
      {
        name: bi('Finished Rate %', 'Tỷ lệ hoàn thành %'),
        formula: '(total − pending) / total * 100',
        notes: bi(
          'How much of the backlog has a result (any of OK/NG/PARTIAL).',
          'Bao nhiêu % backlog đã có kết quả.'
        ),
      },
      {
        name: bi('SLA Breach (per sample)', 'Vi phạm SLA (mỗi mẫu)'),
        formula: 'due_date < today  OR  any stage.status = "blocked"',
        notes: bi(
          'Samples with OK/NG never count as breach.',
          'Mẫu OK/NG không bao giờ là vi phạm.'
        ),
      },
      {
        name: bi('Per-NPI-Owner summary', 'Tổng kết theo NPI Owner'),
        formula: 'parts, finished, OK, NG, OK rate %, spec released',
        notes: bi(
          'Mirrors the xlsx master summary — owner-by-owner performance.',
          'Giống master summary trong xlsx — hiệu suất từng owner.'
        ),
      },
    ],
    tips: [
      bt(
        'Start each day on My Inbox — it shows only samples the NPI / CS / QC Owner currently holds.',
        'Bắt đầu mỗi ngày ở My Inbox — chỉ hiện mẫu mà NPI / CS / QC đang giữ.'
      ),
      bt(
        "Use the parallel Prep tracks aggressively — blocking one (e.g. cutter not ready) doesn't force the other two to stall; each updates independently.",
        'Dùng 3 track Prep song song tích cực — chặn một (ví dụ dao chưa sẵn) không buộc 2 track kia đứng lại; cập nhật độc lập.'
      ),
      bt(
        'Attach the customer feedback email (not just the gist) — the full thread is the audit record.',
        'Đính kèm email phản hồi khách (không chỉ tóm tắt) — full thread là audit record.'
      ),
      bt(
        'When a sample is NG, fill BOTH the reason code AND a short notes line — the code drives the dashboard; the note helps the next person.',
        'Khi mẫu NG, điền CẢ reason code VÀ 1 dòng notes ngắn — code cho dashboard; notes cho người kế tiếp.'
      ),
      bt(
        'Click × on the drawer header to close — the list view catches up to the latest server state on close.',
        'Click × ở header panel để đóng — list view sẽ sync state mới nhất khi đóng.'
      ),
      bt(
        'To force-refresh a single sample to the latest server state (e.g. teammate just hit Next on the same record), close the drawer and reopen it — the snapshot is rebuilt from fresh data.',
        'Để force-refresh 1 sample về state mới nhất từ server (vd đồng nghiệp vừa Next cùng record), đóng drawer và mở lại — snapshot dựng lại từ dữ liệu mới.'
      ),
      bt(
        'When the SSE live banner shows a teammate updating a sample, your Kanban / List card updates within ~1 second. The detail drawer (if open on a different sample) is unaffected — no surprise re-render.',
        'Khi banner SSE live báo đồng nghiệp đang update 1 sample, card Kanban / List của bạn cập nhật trong ~1 giây. Drawer chi tiết (nếu đang mở sample khác) không bị ảnh hưởng — không có re-render bất ngờ.'
      ),
    ],
    pitfalls: [
      bp(
        'Required Prep checklist items force all 3 sub-tracks closed before advance. If a cutter is genuinely out of scope, mark that item optional in the drawer (uncheck the "req" badge).',
        'Item checklist Prep bắt buộc ép cả 3 sub-track Done trước khi advance. Nếu cutter thực sự không cần, bỏ dấu "req" trong drawer.'
      ),
      bp(
        "Result = OK on a sample doesn't auto-trigger Spec Released — you still need to tick Stage 6 checklist and hit Next.",
        'Result = OK KHÔNG tự kích hoạt Spec Released — vẫn phải tick checklist Stage 6 và Next.'
      ),
      bp(
        'Per-NPI-Owner summary counts only top 5 owners. Rare owners roll into "(unassigned)".',
        'Strip NPI Owner chỉ đếm top 5. Owner hiếm vào "(unassigned)".'
      ),
      bp(
        'Drawer is a snapshot the moment you opened it — if you leave it open for 10+ minutes while teammates are editing the same sample, you may save over their changes. For long edit sessions on shared samples, close + reopen periodically to pick up server state.',
        'Drawer là snapshot tại thời điểm mở — nếu để mở 10+ phút trong khi đồng nghiệp cũng đang edit cùng sample, bạn có thể save đè lên thay đổi của họ. Với phiên edit dài trên sample chung, nên đóng + mở lại định kỳ để lấy state mới từ server.'
      ),
    ],
    constraints: [
      con(
        'Max ~2000 samples per file before load/save latency noticeable (single JSON file).',
        'Tối đa ~2000 mẫu mỗi file trước khi load/save chậm rõ (1 JSON file).'
      ),
      con(
        'No multi-user conflict detection — last write wins. Coordinate over chat for the same sample.',
        'Chưa phát hiện xung đột đa người dùng — last write wins. Phối hợp qua chat trên cùng 1 mẫu.'
      ),
      con(
        'Attachments capped at 15 MB / file (override via OPS_SAMPLE_ATTACH_MAX_MB). Large video / CAD files must go elsewhere.',
        'Đính kèm tối đa 15 MB / file (override qua OPS_SAMPLE_ATTACH_MAX_MB). Video / CAD lớn phải lưu nơi khác.'
      ),
    ],
    example: ex(
      bi(
        'Samsung requests a colour-match sample for a 40×20 mm HP label, 50 pcs, due 2026-05-10. Walk it end-to-end.',
        'Samsung yêu cầu mẫu colour-match nhãn HP 40×20 mm, 50 cái, deadline 10/5/2026. Đi hết pipeline.'
      ),
      [
        bs(
          '+ New Sample → Identity: Customer Samsung, CS Ivy, NPI Mark, Qty 50, Submit 2026-04-23, Due 2026-05-10. Specs: Colour match / HP / 40×20.',
          '+ New Sample → Identity: Khách Samsung, CS Ivy, NPI Mark, Qty 50, Nhận 23/4/2026, Deadline 10/5/2026. Specs: Colour match / HP / 40×20.'
        ),
        bs(
          'Next → Prep: set Material Spec "BW-0153 + BW-0112N", Material ETA 2026-04-25 Active → Done, Film/Plate "File in HP" ETA Done, Cutter "CCL-HT-3075" ETA Done. Next →.',
          'Next → Prep: set Material Spec "BW-0153 + BW-0112N", Material ETA 25/4 Active → Done, Film/Plate "File in HP" ETA Done, Dao "CCL-HT-3075" ETA Done. Next →.'
        ),
        bs(
          'Run: YCM issued, machine allocated, run started 2026-04-28, finished 2026-04-29, handed to QC. Next →.',
          'Run: YCM đã gửi, máy đã cấp, chạy bắt đầu 28/4, kết thúc 29/4, giao QC. Next →.'
        ),
        bs(
          'QC: visual OK, dimensional OK, QC report signed, attached to Attachments tab. Next →.',
          'QC: visual OK, dimensional OK, QC report ký, đính kèm tab Attachments. Next →.'
        ),
        bs(
          'Customer: ship, customer feedback "OK with minor notes" → Result = OK, Reason A02, OK count 50 / NG 0. Next →.',
          'Customer: giao, phản hồi khách "OK với note nhỏ" → Result = OK, Reason A02, OK 50 / NG 0. Next →.'
        ),
        bs(
          'Spec: release spec document, fill Linked Production Order "SO-12345", tick "Production order triggered", Next → card moves to Done.',
          'Spec: phát SPEC, điền Linked Production Order "SO-12345", tick "Production order triggered", Next → card sang Done.'
        ),
      ],
      bi(
        '13-day cycle, full audit trail showing every stage start/done, who signed each stage, every checklist item tick.',
        'Chu kỳ 13 ngày, audit trail đầy đủ: mọi ngày start/done, ai ký mỗi stage, mọi tick checklist.'
      )
    ),
    result: res(
      'Every sample request is traceable from intake to spec release. NG patterns surface via the reason-code histogram; owners are accountable via the signature stamps; SLA breaches are visible in real time on the KPI bar.',
      'Mọi yêu cầu mẫu truy vết được từ nhận đến ra SPEC. Pattern NG nổi lên qua reason code; owner có trách nhiệm qua chữ ký; vi phạm SLA hiện realtime trên thanh KPI.'
    ),
    authorization: auth(
      'Sales + NPI + Production + QC teams',
      bi(
        'Sales creates; NPI advances Prep/Spec; Production advances Run; QC advances QC. Admin can delete any record.',
        'Sale tạo; NPI đẩy Prep/Spec; Sản xuất đẩy Run; QC đẩy QC. Admin xoá bất kỳ record nào.'
      )
    ),
    relatedTabs: ['rfq-tracker', 'standard', 'quote-history', 'approvals-inbox'],
    screenshot: 'sample-tracking.png',
  },

  // ─────────────────────────────────────────────────────────────
  // REPORTS
  // ─────────────────────────────────────────────────────────────

  dashboard: {
    id: 'dashboard',
    section: 'REPORTS',
    title: bi('Dashboard', 'Bảng điều khiển'),
    function: bi(
      'Enterprise KPI snapshot — win rate, revenue, margin trend',
      'Snapshot KPI công ty — tỉ lệ thắng, doanh thu, xu hướng margin'
    ),
    path: 'Ops Cost > Reports > Dashboard',
    purpose: bi(
      'Enterprise KPI snapshot: win rate, revenue, margin trend, approval funnel. Charts auto-refresh every 5 minutes.',
      'Snapshot KPI cấp công ty: tỉ lệ thắng, doanh thu, xu hướng margin, funnel phê duyệt. Chart tự refresh mỗi 5 phút.'
    ),
    whenToUse: bi(
      'Leadership daily standup; month-end reviews. Anyone (role user+).',
      'Standup lãnh đạo hàng ngày; review cuối tháng. Mọi role (user+).'
    ),
    preRequisites: [
      br('Role user+ to view. Admin+ to export CSV.', 'Role user+ để xem. Admin+ để xuất CSV.'),
    ],
    procedures: [
      proc('Period picker', 'Chọn kỳ', null, [
        bs(
          'Top-right period selector: This Month / Quarter / YTD / Custom.',
          'Bộ chọn kỳ trên phải: Tháng này / Quý / YTD / Tuỳ chỉnh.'
        ),
        bs(
          'All KPI cards refresh on change; auto-refresh every 5 min otherwise.',
          'Mọi card KPI refresh khi đổi; auto-refresh 5 phút/lần.'
        ),
      ]),
      proc('KPI card drill-down', 'Drill-down thẻ KPI', null, [
        bs(
          'Click any card (Win rate, Revenue, Margin, Approval SLA).',
          'Click card bất kỳ (Win rate, Revenue, Margin, Approval SLA).'
        ),
        bs(
          'Modal opens with the underlying quote list.',
          'Modal mở với danh sách báo giá chi tiết.'
        ),
        bs(
          'Click a quote → jumps to Quote History with that row selected.',
          'Click báo giá → nhảy sang Quote History với dòng đó được chọn.'
        ),
      ]),
      proc('Chart interaction', 'Tương tác biểu đồ', null, [
        bs(
          'Hover bars/lines for tooltip with exact numbers.',
          'Hover bar/line để xem tooltip số chính xác.'
        ),
        bs(
          'Click a bar → filter the KPI cards to just that slice (e.g. one month).',
          'Click bar → lọc card KPI chỉ cho slice đó (vd 1 tháng).'
        ),
        bs('Reset filter via breadcrumb at top.', 'Reset filter qua breadcrumb ở trên.'),
      ]),
      proc('Export (admin)', 'Xuất (admin)', null, [
        bs(
          'Click ⬇ CSV in toolbar — exports the CURRENT filtered dataset.',
          'Click ⬇ CSV trên toolbar — xuất dataset HIỆN TẠI đã lọc.'
        ),
        bs(
          'Scheduled email reports configured in Settings → Notifications.',
          'Báo cáo email theo lịch cấu hình trong Settings → Notifications.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [],
    formulas: [
      {
        name: 'Win rate',
        expr: 'wins / (wins + losses) × 100',
        meaning: bi(
          'Share of closed quotes that were won (customer placed order). Quotes still open are EXCLUDED.',
          'Tỉ lệ báo giá đã đóng mà thắng (khách đặt hàng). Báo giá đang mở KHÔNG tính.'
        ),
        example: 'Q1: 45 won, 35 lost, 20 still open\nWin rate = 45 / (45+35) × 100 = 56.25%',
      },
      {
        name: 'Average margin',
        expr: 'Σ margin_i × revenue_i / Σ revenue_i',
        meaning: bi(
          'Revenue-weighted average margin. A small high-margin quote does NOT inflate the company average.',
          'Margin trung bình có trọng số theo doanh thu. Quote nhỏ margin cao KHÔNG đẩy trung bình công ty lên.'
        ),
        example:
          'Q1: $10k × 40% + $100k × 25% = $4k + $25k = $29k profit on $110k\navg = 29/110 × 100 = 26.4% (not 32.5% arithmetic mean)',
        notes: 'Weighted by revenue, not arithmetic mean.',
      },
      {
        name: 'Approval SLA',
        expr: '95th percentile of (approved_at − submitted_at)',
        meaning: bi(
          '95% of approvals complete within this time. Catches slow-tail outliers better than average.',
          '95% phê duyệt hoàn tất trong khoảng này. Bắt được outlier chậm tốt hơn trung bình.'
        ),
        example:
          '100 quotes: median 4h, p95 = 27h\nSLA target < 24h → currently FAILING at p95 level',
      },
    ],
    tips: [
      bt(
        'Pin the dashboard as your home tab — set in Settings → Appearance.',
        'Pin dashboard làm home tab — setup trong Settings → Appearance.'
      ),
    ],
    pitfalls: [
      bp(
        'Data is from Quote History; quotes without Won/Lost status are excluded from win rate.',
        'Data từ Quote History; báo giá không có trạng thái Won/Lost sẽ bị loại khỏi tỉ lệ thắng.'
      ),
    ],
    relatedTabs: ['quote-analysis', 'quote-history'],
    screenshot: 'dashboard.png',
  },

  'quote-analysis': {
    id: 'quote-analysis',
    section: 'REPORTS',
    title: bi('Quote Analysis', 'Phân tích Báo giá'),
    function: bi(
      'Deep-dive win/loss analytics by segment / material / price band',
      'Phân tích sâu thắng/thua theo phân khúc / vật tư / mức giá'
    ),
    path: 'Ops Cost > Reports > Quote Analysis',
    purpose: bi(
      'Deep-dive analytics: win/loss by segment, margin distribution, material price sensitivity.',
      'Phân tích sâu: thắng/thua theo phân khúc, phân phối margin, độ nhạy giá vật tư.'
    ),
    whenToUse: bi(
      "Quarterly business review; when a specific customer segment's win rate suddenly changes.",
      'Review kinh doanh hàng quý; khi tỉ lệ thắng của phân khúc khách hàng đột biến.'
    ),
    preRequisites: [],
    procedures: [
      proc('Select view', 'Chọn view', null, [
        bs(
          'Top tabs: By Customer / By Material / By Price band / By Cost engineer.',
          'Tab trên cùng: Theo Khách / Theo Vật tư / Theo Mức giá / Theo Cost engineer.'
        ),
        bs(
          'Each view has its own default charts + aggregations.',
          'Mỗi view có chart + aggregation mặc định riêng.'
        ),
      ]),
      proc('Filter + time range', 'Lọc + khoảng thời gian', null, [
        bs(
          'Left panel: date range + status filter (Won / Lost / All closed).',
          'Panel trái: date range + filter status (Won / Lost / Tất cả đã đóng).'
        ),
        bs(
          'Segment filter per view (customer group, material category, etc.).',
          'Filter phân khúc theo view (nhóm khách, danh mục vật tư, v.v.).'
        ),
        bs(
          'Min sample size toggle (default: hide segments with < 20 quotes).',
          'Toggle kích thước mẫu tối thiểu (mặc định: ẩn phân khúc có < 20 báo giá).'
        ),
      ]),
      proc('Drill-down', 'Drill-down', null, [
        bs(
          'Click any chart bar → underlying quote list filtered to that slice.',
          'Click bar chart bất kỳ → danh sách báo giá lọc theo slice đó.'
        ),
        bs('Click a quote → jumps to Quote History.', 'Click báo giá → nhảy sang Quote History.'),
        bs(
          'Breadcrumb navigation to go back to the full view.',
          'Navigation breadcrumb để quay lại full view.'
        ),
      ]),
      proc('Export for QBR', 'Xuất cho QBR', null, [
        bs(
          'Click ⬇ PNG — chart-only export for presentation.',
          'Click ⬇ PNG — xuất chỉ chart cho presentation.'
        ),
        bs(
          'Click ⬇ CSV — tabular export for further Excel analysis.',
          'Click ⬇ CSV — xuất bảng để phân tích tiếp trong Excel.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Material sensitivity view surfaces which materials drive the most quote volatility.',
        'View material sensitivity cho thấy vật tư nào gây biến động báo giá nhiều nhất.'
      ),
    ],
    pitfalls: [
      bp(
        "Sample size matters — segments with < 20 quotes shouldn't drive strategy decisions alone.",
        'Kích thước mẫu quan trọng — phân khúc < 20 báo giá không nên quyết định chiến lược một mình.'
      ),
    ],
    relatedTabs: ['dashboard', 'quote-history'],
    screenshot: 'quote-analysis.png',
  },

  // ─────────────────────────────────────────────────────────────
  // LIBRARIES
  // ─────────────────────────────────────────────────────────────

  'lib-rate': {
    id: 'lib-rate',
    section: 'LIBRARIES',
    title: bi('Rate Table', 'Bảng Định mức'),
    function: bi(
      'Per-work-center hourly rates (labor / machine / overhead)',
      'Đơn giá/giờ theo work-center (labor / machine / overhead)'
    ),
    path: 'Ops Cost > Libraries > Rate Table',
    purpose: bi(
      'Hourly rates for every work-cell, labor category, and overhead bucket. Drives every labor cost calc.',
      'Đơn giá/giờ cho mọi work-cell, category lao động, bucket overhead. Nguồn cho mọi phép tính chi phí lao động.'
    ),
    whenToUse: bi(
      'Annual rate refresh (Q4 review); when HR changes wage scales; after a depreciation schedule update.',
      'Cập nhật đơn giá hàng năm (review Q4); khi HR đổi thang lương; sau khi khấu hao đổi.'
    ),
    preRequisites: ['Cost+ role to edit; everyone can view.'],
    procedures: [
      proc('Category filter', 'Lọc theo loại', null, [
        'Filter chips at top: Labor / Machine / Overhead.',
        'Each category has distinct rate structure.',
        'Search by work-center code within the selected category.',
      ]),
      proc(
        'Edit rate',
        'Sửa đơn giá',
        'Edit creates a new revision with an effective-from date. Previous revisions are kept for audit.',
        [
          'Click pencil icon on a row (Cost+ role only).',
          'Enter new hourly rate; effective date defaults to today.',
          'Backdate only for correcting clear errors — retroactively changes historic quotes.',
          'Save → revision history grows.',
        ]
      ),
      proc('Annual Q4 refresh', 'Cập nhật Q4 hàng năm', null, [
        'Import new rates via CSV (format template in toolbar).',
        'Review diff preview before commit.',
        'Click Commit All → single atomic update across categories.',
        'Announce to team same day — Standard + Complex calcs reflect immediately for NEW saves.',
      ]),
    ],
    workflow: null,
    keyFields: [
      field('Effective from', 'date', 'Rate applies to quotes saved on or after this date.'),
      field('Category', 'enum', 'Labor / Machine / Overhead.'),
      field('Rate', 'money/hour', 'Fully loaded hourly cost.'),
    ],
    formulas: [],
    tips: [
      bt(
        'Annual Q4 rate refresh: bump every rate, publish, and communicate to the team same day.',
        'Cập nhật đơn giá hàng năm Q4: tăng mọi rate, publish, và thông báo cho team cùng ngày.'
      ),
    ],
    pitfalls: [
      bp(
        'Backdating an effective date retroactively changes historic quote recalculations. Avoid except for correction of clear errors.',
        'Backdate effective date sẽ retroactively đổi tính toán báo giá cũ. Tránh trừ khi sửa lỗi rõ ràng.'
      ),
    ],
    relatedTabs: ['lib-rop', 'standard', 'complex'],
    screenshot: null,
  },

  'lib-ddl': {
    id: 'lib-ddl',
    section: 'LIBRARIES',
    title: bi('Drop-Down Lists', 'Danh sách Lựa chọn'),
    function: bi(
      'Master reference enums for every LOV in the app',
      'Enum gốc cho mọi LOV trong app'
    ),
    path: 'Ops Cost > Libraries > Drop-Down Lists',
    purpose: bi(
      'Master reference enums for every dropdown: customers, currencies, units, incoterms, substrate types.',
      'Enum gốc cho mọi dropdown: khách hàng, tiền tệ, đơn vị, incoterms, loại substrate.'
    ),
    whenToUse: bi(
      'Onboarding new customer; adding a new currency; standardizing naming after an audit finding.',
      'Onboard khách mới; thêm tiền tệ mới; chuẩn hoá naming sau audit.'
    ),
    preRequisites: ['Admin role.'],
    workflow: [
      bs('Pick the list (e.g., Customers).', 'Chọn list (vd Customers).'),
      bs(
        'Add / edit / deprecate entries. Deprecated = hidden in future dropdowns but kept for old records.',
        'Thêm / sửa / deprecate entry. Deprecated = ẩn khỏi dropdown tương lai nhưng giữ cho bản ghi cũ.'
      ),
      bs(
        'Reorder drag handles; order becomes the default display order everywhere.',
        'Kéo drag handle để sắp xếp lại; thứ tự thành default display order mọi nơi.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Never HARD-delete an entry — older quotes break. Always mark deprecated.',
        'Không bao giờ XOÁ cứng entry — báo giá cũ sẽ hỏng. Luôn đánh dấu deprecated.'
      ),
    ],
    pitfalls: [
      bp(
        'Renaming an entry changes the display in old quotes too — use with care for customer-facing labels.',
        'Đổi tên entry cũng đổi display trên báo giá cũ — cẩn thận với label hiển thị cho khách.'
      ),
    ],
    relatedTabs: ['lib-mat', 'formal-quote'],
    screenshot: null,
  },

  'lib-finance': {
    id: 'lib-finance',
    section: 'LIBRARIES',
    title: bi('Finance Data', 'Dữ liệu Tài chính'),
    function: bi(
      'Company-wide finance aggregates (P&L, balances, transfer pricing)',
      'Tổng hợp tài chính công ty (P&L, số dư, transfer pricing)'
    ),
    path: 'Ops Cost > Libraries > Finance Data',
    purpose: bi(
      'Company-wide finance aggregates: P&L by cost group, balance snapshots, transfer pricing rates.',
      'Tổng hợp tài chính toàn công ty: P&L theo cost group, snapshot số dư, transfer pricing.'
    ),
    whenToUse: bi(
      'Finance month-close; setting overhead absorption rates for the next period.',
      'Chốt sổ tháng tài chính; đặt tỷ lệ phân bổ overhead kỳ sau.'
    ),
    preRequisites: ['Finance / Admin role.'],
    workflow: [
      bs('Select period + cost group.', 'Chọn kỳ + cost group.'),
      bs(
        'Review the aggregate; drill to source transactions if the IFS bridge is online.',
        'Xem aggregate; drill xuống transaction nguồn nếu IFS bridge online.'
      ),
      bs(
        'Publish overhead rate for the period → propagates to Rate Table.',
        'Publish rate overhead cho kỳ → lan sang Rate Table.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Keep finance + ops views separate — this tab is the SOURCE, Rate Table is the CONSUMER.',
        'Tách view finance + ops — tab này là NGUỒN, Rate Table là NGƯỜI TIÊU DÙNG.'
      ),
    ],
    pitfalls: [
      bp(
        'Overhead rate changes mid-period cause quote inconsistencies; publish once at period start.',
        'Đổi rate overhead giữa kỳ gây báo giá không nhất quán; publish 1 lần đầu kỳ.'
      ),
    ],
    relatedTabs: ['lib-rate', 'dashboard'],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // SYSTEM
  // ─────────────────────────────────────────────────────────────

  settings: {
    id: 'settings',
    section: 'SYSTEM',
    title: bi('Settings', 'Cài đặt'),
    function: bi(
      'Personal preferences + admin-only system controls',
      'Tuỳ chỉnh cá nhân + quyền quản trị'
    ),
    path: 'Ops Cost > System > Settings',
    purpose: bi(
      'Personal preferences + admin-only system controls. Sub-tabs: Profile, Password, Appearance, Hardware Devices (desktop), Connection Mode (desktop), Account Control (admin), Backup/Restore (admin), System Logs (admin).',
      'Tuỳ chỉnh cá nhân + quyền quản trị. Sub-tabs: Profile, Password, Appearance, Thiết bị phần cứng (desktop), Chế độ kết nối (desktop), Account Control (admin), Backup/Restore (admin), System Logs (admin).'
    ),
    whenToUse: bi(
      'First login (password change); appearance preferences; admins for user management and backups.',
      'Lần đầu đăng nhập (đổi mật khẩu); tuỳ chỉnh giao diện; admin quản lý user và backup.'
    ),
    preRequisites: [],
    workflow: [
      bs('My Profile: update avatar + name + phone.', 'My Profile: cập nhật avatar + tên + phone.'),
      bs('My Password: old → new (min 8 chars).', 'My Password: cũ → mới (tối thiểu 8 ký tự).'),
      bs(
        'Appearance: language, theme (light/dark/system), date format, default home tab.',
        'Appearance: ngôn ngữ, theme (sáng/tối/theo hệ thống), format ngày, home tab mặc định.'
      ),
      bs(
        '(Desktop) Hardware Devices: configure label printer, scale, scanner, office printer.',
        '(Desktop) Thiết bị phần cứng: cấu hình máy in nhãn, cân, scanner, máy in văn phòng.'
      ),
      bs(
        '(Desktop) Connection Mode: switch Embedded / Thin / Smart, edit Remote URL, re-run setup wizard.',
        '(Desktop) Chế độ kết nối: chuyển Embedded / Thin / Smart, sửa Remote URL, chạy lại setup wizard.'
      ),
      bs(
        '(Admin) Account Control: create/disable users, reset passwords, generate Provisioning Card (SAP/IFS handover), change roles.',
        '(Admin) Account Control: tạo/vô hiệu user, reset mật khẩu, tạo Provisioning Card (bàn giao SAP/IFS), đổi role.'
      ),
      bs(
        '(Admin) Backup/Restore: download a full data snapshot; or upload to restore.',
        '(Admin) Backup/Restore: tải snapshot dữ liệu đầy đủ; hoặc upload để restore.'
      ),
      bs(
        '(Admin) System Logs: view last 1k events filtered by level.',
        '(Admin) System Logs: xem 1k sự kiện gần nhất lọc theo mức.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Take a full backup before any risky admin action (bulk user disable, rate-table batch edit).',
        'Backup đầy đủ trước mọi thao tác admin rủi ro (disable user hàng loạt, sửa rate-table hàng loạt).'
      ),
    ],
    pitfalls: [
      bp(
        'Restore OVERWRITES the current DB — not a merge. Test on a staging URL first if available.',
        'Restore GHI ĐÈ DB hiện tại — không merge. Thử trên URL staging trước nếu có.'
      ),
    ],
    relatedTabs: ['metrics'],
    screenshot: 'settings.png',
  },

  'settings-profile': {
    id: 'settings-profile',
    section: 'SYSTEM',
    title: bi('Settings — My Profile', 'Cài đặt — Hồ sơ'),
    function: bi(
      'Personal identity fields (avatar, name, phone, default home)',
      'Thông tin cá nhân (avatar, tên, phone, home mặc định)'
    ),
    path: 'Ops Cost > System > Settings > My Profile',
    purpose: bi(
      'Personal identity fields: avatar, display name, phone, email, default home tab.',
      'Thông tin cá nhân: avatar, tên hiển thị, số điện thoại, email, tab home mặc định.'
    ),
    whenToUse: bi(
      'First login, to upload an avatar. When you change phone / email. When you want a different home tab on sign-in.',
      'Lần đầu đăng nhập, upload avatar. Khi đổi số điện thoại/email. Khi muốn tab home khác khi sign-in.'
    ),
    preRequisites: [],
    workflow: [
      bs('Settings → My Profile.', 'Settings → My Profile.'),
      bs(
        'Click the avatar to upload a new image (max 2 MB, square crop recommended).',
        'Click avatar để upload ảnh mới (tối đa 2 MB, nên crop vuông).'
      ),
      bs('Edit display name / phone / email.', 'Sửa tên hiển thị / phone / email.'),
      bs(
        'Default home tab: pick which tab opens after login. Saves per user, not per device.',
        'Home tab mặc định: chọn tab mở sau đăng nhập. Lưu theo user, không theo thiết bị.'
      ),
      bs(
        'Save → immediate effect; no re-login required.',
        'Save → hiệu lực ngay; không cần đăng nhập lại.'
      ),
    ],
    keyFields: [
      field(
        'Display name',
        'string',
        'Shown everywhere your user is mentioned (quotes, messages, audit log).'
      ),
      field(
        'Default home',
        'tab id',
        'Tab that auto-opens after login; falls back to Standard Calc if cleared.'
      ),
    ],
    formulas: [],
    tips: [
      bt(
        'Upload a recognizable avatar — helps teammates tag you in messages.',
        'Tải lên avatar dễ nhận diện — giúp đồng nghiệp tag bạn trong Messages.'
      ),
    ],
    pitfalls: [
      bp(
        "Changing display name mid-quote doesn't rewrite history — old quotes still show the old name.",
        'Đổi display name giữa quote không ghi đè lịch sử — quote cũ vẫn hiển thị tên cũ.'
      ),
    ],
    relatedTabs: ['settings', 'settings-password'],
    screenshot: null,
  },

  'settings-password': {
    id: 'settings-password',
    section: 'SYSTEM',
    title: bi('Settings — My Password', 'Cài đặt — Đổi mật khẩu'),
    function: bi('Self-service password change', 'Tự đổi mật khẩu'),
    path: 'Ops Cost > System > Settings > My Password',
    purpose: bi(
      'Self-service password change. Never expose passwords to admins — this is the only channel for a user to rotate their own secret.',
      'Tự đổi mật khẩu. Admin KHÔNG biết được mật khẩu — đây là kênh duy nhất để user tự thay.'
    ),
    whenToUse: bi(
      'Mandatory on first login. After a suspected leak. Every 90 days per IT policy.',
      'Bắt buộc lần đầu đăng nhập. Khi nghi bị lộ. Mỗi 90 ngày theo chính sách IT.'
    ),
    preRequisites: [br('Current password.', 'Mật khẩu hiện tại.')],
    workflow: [
      bs('Settings → My Password.', 'Settings → My Password.'),
      bs(
        'Enter current password → new password (min 8 chars, mix letters + digits) → confirm.',
        'Nhập mật khẩu hiện tại → mật khẩu mới (tối thiểu 8 ký tự, có chữ + số) → xác nhận.'
      ),
      bs(
        'Save → you are logged out; sign back in with the new password.',
        'Save → bạn bị logout; đăng nhập lại bằng mật khẩu mới.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Use a password manager (1Password, Bitwarden) — never share passwords via Messages or Email.',
        'Dùng password manager (1Password, Bitwarden) — KHÔNG chia sẻ mật khẩu qua Messages hay Email.'
      ),
    ],
    pitfalls: [
      bp(
        'Forgot the current one? Admin MUST reset via Account Control — no backdoor.',
        'Quên mật khẩu hiện tại? Admin PHẢI reset qua Account Control — không có backdoor.'
      ),
      bp(
        'If 2FA is on (Administrator account), a password change does NOT reset the TOTP secret; you still need the old Google Authenticator entry.',
        'Nếu 2FA bật (tài khoản Administrator), đổi mật khẩu KHÔNG reset secret TOTP; vẫn cần entry Google Authenticator cũ.'
      ),
    ],
    relatedTabs: ['settings', 'settings-account-control'],
    screenshot: null,
  },

  'settings-appearance': {
    id: 'settings-appearance',
    section: 'SYSTEM',
    title: bi('Settings — Appearance', 'Cài đặt — Giao diện'),
    function: bi(
      'Per-user UI preferences (language, theme, formats)',
      'Tuỳ chỉnh UI per-user (ngôn ngữ, theme, format)'
    ),
    path: 'Ops Cost > System > Settings > Appearance',
    purpose: bi(
      'Per-user UI preferences: language (EN/VI), theme (light/dark/system), date + number format.',
      'Tuỳ chỉnh giao diện của user: ngôn ngữ (EN/VI), chế độ sáng/tối/theo hệ thống, định dạng ngày và số.'
    ),
    whenToUse: bi(
      'First login; when HR onboards a new VI user who needs VI-default.',
      'Lần đầu đăng nhập; khi HR onboard user VI cần default VI.'
    ),
    preRequisites: [],
    workflow: [
      bs('Settings → Appearance.', 'Settings → Appearance.'),
      bs(
        'Language: EN / VI. All labels + Help content flip instantly.',
        'Ngôn ngữ: EN / VI. Mọi label + nội dung Help chuyển ngay.'
      ),
      bs(
        'Theme: Light / Dark / System (follows OS-level prefers-color-scheme).',
        'Theme: Sáng / Tối / Theo hệ thống (theo prefers-color-scheme OS).'
      ),
      bs(
        'Date format: DD/MM/YYYY (VI default) or MM/DD/YYYY (US).',
        'Format ngày: DD/MM/YYYY (mặc định VI) hoặc MM/DD/YYYY (US).'
      ),
      bs(
        'Number format: VI (1.234,56) or US (1,234.56).',
        'Format số: VI (1.234,56) hoặc US (1,234.56).'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Dark theme cuts eye strain for long quote-review sessions.',
        'Theme tối giảm mỏi mắt cho phiên review báo giá dài.'
      ),
    ],
    pitfalls: [
      bp(
        'VI and US number formats swap comma/dot — changing mid-session confuses calculators. Set once, keep it.',
        'Format số VI và US đổi vai dấu phẩy/chấm — đổi giữa phiên làm calculator nhầm. Đặt 1 lần, giữ nguyên.'
      ),
    ],
    relatedTabs: ['settings'],
    screenshot: null,
  },

  'settings-hardware': {
    id: 'settings-hardware',
    section: 'SYSTEM',
    title: bi('Settings — Hardware Devices', 'Cài đặt — Thiết bị phần cứng'),
    function: bi(
      'Per-machine industrial peripheral configuration (desktop only)',
      'Cấu hình thiết bị ngoại vi công nghiệp per-máy (chỉ desktop)'
    ),
    path: 'Ops Cost > System > Settings > Hardware Devices',
    purpose: bi(
      'Wire up Zebra/TSC label printers (TCP:9100), electronic scales (RS232/USB-Serial), barcode scanners (USB-HID or Keyboard Wedge), and the OS office printer for PDF reports. Settings are saved locally per machine — not synced to the server.',
      'Kết nối máy in nhãn Zebra/TSC (TCP:9100), cân điện tử (RS232/USB-Serial), máy quét barcode (USB-HID hoặc Keyboard Wedge), và máy in văn phòng OS cho PDF báo cáo. Cấu hình lưu cục bộ per-máy — không đồng bộ về server.'
    ),
    whenToUse: bi(
      'Initial install of a workstation that has hardware attached; replacing a printer; troubleshooting a scale that stopped streaming weight; pairing a new HID barcode scanner.',
      'Cài đặt máy trạm mới có gắn thiết bị; thay máy in; troubleshoot cân không stream được trọng lượng; pair scanner barcode HID mới.'
    ),
    preRequisites: [
      br(
        'Ops Control Desktop App (web build shows a banner — browser sandbox blocks raw USB/Serial/TCP).',
        'Ops Control Desktop App (bản web hiện banner — browser sandbox chặn USB/Serial/TCP raw).'
      ),
      br(
        'Device drivers installed at the OS level (Windows printer driver, USB-Serial driver for the scale).',
        'Driver thiết bị cài ở mức OS (Windows printer driver, USB-Serial driver cho cân).'
      ),
    ],
    features: [
      feat(
        'Bilingual UI — flag toggle (🇬🇧 EN / 🇻🇳 VN) at the top-right of the tab header switches every label instantly. Same control as Settings → Appearance, surfaced inline so handover-time operators can flip without leaving the tab.',
        'UI song ngữ — toggle cờ (🇬🇧 EN / 🇻🇳 VN) ở góc trên-phải tiêu đề chuyển ngay mọi label. Cùng control với Settings → Appearance, đặt inline để operator lúc bàn giao đổi mà không cần rời tab.'
      ),
      feat(
        'Label printer card: IP + port, Ping connection (round-trip latency), Send test label (minimal ZPL "Ops Control TEST").',
        'Card máy in nhãn: IP + port, Ping kết nối (round-trip latency), Gửi nhãn test (ZPL tối giản "Ops Control TEST").'
      ),
      feat(
        'Scale card: COM port dropdown (auto-discovered), baud rate, Connect + read realtime (live weight stream from RS232/USB-Serial).',
        'Card cân: dropdown COM port (tự discover), baud rate, Connect + đọc realtime (stream trọng lượng live từ RS232/USB-Serial).'
      ),
      feat(
        'Scanner card: Keyboard Wedge mode (default — scanner types into active field) OR HID raw mode (open device by VID:PID, app receives scan events).',
        'Card scanner: Keyboard Wedge mode (mặc định — scanner gõ vào field active) HOẶC HID raw mode (open device theo VID:PID, app nhận event scan).'
      ),
      feat(
        'Office printer: pick default printer name from OS spooler list + paper size (A4/A3/Letter) for PDF report output.',
        'Máy in văn phòng: chọn máy in mặc định từ danh sách OS spooler + khổ giấy (A4/A3/Letter) cho output PDF báo cáo.'
      ),
    ],
    workflow: [
      bs(
        'Open the Hardware Devices tab. If you see "only available in Desktop App" banner, you\'re on the web build — install the desktop app.',
        'Mở tab Thiết bị phần cứng. Nếu thấy banner "chỉ khả dụng trong Desktop App", bạn đang ở bản web — cài bản desktop.'
      ),
      bs(
        'Label printer: enter IP (e.g. 192.168.1.50) + port (default 9100). Click Ping — expect ✓ Connection OK with latency. Click Send test label — physical printer should produce a small "TEST" label.',
        'Máy in nhãn: nhập IP (vd 192.168.1.50) + port (mặc định 9100). Click Ping — kỳ vọng ✓ Connection OK với latency. Click Gửi nhãn test — máy in thật sẽ in nhãn "TEST" nhỏ.'
      ),
      bs(
        'Scale: click ↻ Scan ports → pick the COM port assigned to your scale (Manufacturer name shown in parens). Set baud rate to match scale (typical 9600 for industrial scales). Click Connect + Read realtime — weight should stream live below.',
        'Cân: click ↻ Quét cổng → chọn COM port của cân (Manufacturer hiện trong ngoặc). Set baud rate trùng cân (thường 9600 cho cân công nghiệp). Click Kết nối + Đọc realtime — trọng lượng stream live phía dưới.'
      ),
      bs(
        'Scanner: leave Keyboard Wedge ON (default) — scanner just types into whatever input the user has focus in (works for any tab without app code changes). Toggle OFF + select HID device only if you need raw event capture (rare).',
        'Scanner: để Keyboard Wedge BẬT (mặc định) — scanner gõ vào bất kỳ input nào user đang focus (hoạt động cho mọi tab không cần code app). Toggle TẮT + chọn HID device chỉ khi cần raw event (hiếm).'
      ),
      bs(
        'Office printer: pick a printer from the dropdown (system default works for most cases). Set paper size matching the report templates.',
        'Máy in văn phòng: chọn máy in từ dropdown (mặc định hệ thống đủ dùng cho hầu hết). Set khổ giấy trùng template báo cáo.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Use Ethernet over Wi-Fi for label printers when possible — Wi-Fi adds ~50-200ms ping, noticeable when batch-printing dozens of labels.',
        'Dùng Ethernet thay Wi-Fi cho máy in nhãn khi có thể — Wi-Fi thêm ~50-200ms ping, dễ nhận thấy khi in batch hàng chục nhãn.'
      ),
      bt(
        'Keyboard Wedge mode is the safest default for scanners — works without any app-side handler. Switch to HID raw only when you need scan-event metadata (timestamp, source) for audit.',
        'Keyboard Wedge mode là default an toàn nhất cho scanner — hoạt động không cần handler app. Chuyển HID raw chỉ khi cần metadata sự kiện scan (timestamp, source) cho audit.'
      ),
    ],
    pitfalls: [
      bp(
        'Settings here are PER MACHINE (electron-store, local userData). Re-installing the app or moving to a new machine means re-entering all device IPs/ports/COM paths.',
        'Cấu hình ở đây là PER MÁY (electron-store, userData cục bộ). Cài lại app hoặc chuyển máy mới phải nhập lại tất cả IP/port/COM path thiết bị.'
      ),
      bp(
        "A label printer that worked yesterday but Pings failed today is usually a DHCP-changed IP. Check the printer's LCD/network panel for the current IP and update here.",
        'Máy in nhãn hôm qua chạy nhưng hôm nay Ping fail thường là IP đổi do DHCP. Check màn hình LCD/network panel của máy in để xem IP hiện tại và update ở đây.'
      ),
    ],
    relatedTabs: ['settings', 'settings-mode'],
    screenshot: null,
  },

  'settings-mode': {
    id: 'settings-mode',
    section: 'SYSTEM',
    title: bi('Settings — Connection Mode', 'Cài đặt — Chế độ kết nối'),
    function: bi(
      'Switch the desktop app between Embedded / Thin / Smart connection modes',
      'Đổi desktop app giữa 3 chế độ kết nối Embedded / Thin / Smart'
    ),
    path: 'Ops Cost > System > Settings > Connection Mode',
    purpose: bi(
      'Pick how this machine talks to data: in-process server (Embedded), remote server only (Thin), or hybrid local cache + auto-sync (Smart). The choice is per-machine and survives restarts via electron-store.',
      'Chọn cách máy này nói chuyện với dữ liệu: server in-process (Embedded), chỉ remote server (Thin), hoặc hybrid cache local + auto-sync (Smart). Lựa chọn per-máy và giữ qua restart bằng electron-store.'
    ),
    whenToUse: bi(
      'Initial install (pick the right role); reassigning a workstation; moving the server to a new IP; switching from single-user demo to multi-user team.',
      'Cài đặt ban đầu (chọn role đúng); chuyển máy trạm; chuyển server sang IP mới; chuyển từ demo single-user sang multi-user team.'
    ),
    preRequisites: [
      br(
        'Ops Control Desktop App (web build always behaves as Thin against the current host).',
        'Ops Control Desktop App (bản web luôn hành xử như Thin với host hiện tại).'
      ),
      br(
        "Network reachability to the chosen mode's server (LAN ping for Thin/Smart; localhost for Embedded).",
        'Network với server tương ứng (LAN ping cho Thin/Smart; localhost cho Embedded).'
      ),
    ],
    features: [
      feat(
        'Bilingual UI — same flag toggle (🇬🇧 EN / 🇻🇳 VN) as the Hardware tab.',
        'UI song ngữ — cùng toggle cờ (🇬🇧 EN / 🇻🇳 VN) như tab Hardware.'
      ),
      feat(
        '3-card mode picker with Pros/Trade-off per mode + ACTIVE badge for the current selection.',
        'Picker 3 thẻ mode với Ưu điểm/Đánh đổi mỗi mode + badge ACTIVE cho lựa chọn hiện tại.'
      ),
      feat(
        'Server-role inline LAN URL block — when Embedded mode is active AND build is SERVER, surfaces every reachable LAN IP with one-click Copy. Replaces the once-per-install first-run dialog as a permanent reference.',
        'Block URL LAN inline cho server-role — khi Embedded mode active VÀ build là SERVER, hiện mọi IP LAN reach được với Copy 1-click. Thay thế dialog first-run 1-lần làm reference vĩnh viễn.'
      ),
      feat(
        "Bilingual Decision Legend (collapsible) — quick-reference matrix showing which mode fits which scenario. Includes a Smart-mode readiness warning so admins know which tabs work offline today vs. don't.",
        'Legend Quyết định song ngữ (thu gọn được) — ma trận tham chiếu nhanh mode nào hợp scenario nào. Có cảnh báo readiness Smart-mode để admin biết tab nào chạy offline được hôm nay vs. không.'
      ),
      feat(
        'Sprint 1.5 — "↻ Re-run setup wizard" button (bottom of tab) clears firstRunCompleted + mode + remoteUrl, then relaunches the app so the role-specific first-run dialog fires fresh. Useful for reassigning a workstation without uninstall. User data is NOT touched.',
        'Sprint 1.5 — nút "↻ Chạy lại wizard" (cuối tab) xoá firstRunCompleted + mode + remoteUrl, rồi relaunch app để dialog first-run theo role chạy lại. Hữu ích khi chuyển máy trạm không cần uninstall. KHÔNG động vào dữ liệu user.'
      ),
    ],
    workflow: [
      bs(
        'Open Connection Mode tab. Read the Legend (collapsible at the top of the page) if unsure which mode to pick.',
        'Mở tab Chế độ kết nối. Đọc Legend (thu gọn ở đầu trang) nếu chưa chắc chọn mode nào.'
      ),
      bs(
        'Click the radio on the desired mode card. Embedded = local only. Thin = remote required. Smart = hybrid (offline-capable when wiring complete).',
        'Click radio trên thẻ mode mong muốn. Embedded = chỉ local. Thin = cần remote. Smart = hybrid (offline được khi wire xong).'
      ),
      bs(
        'For Thin/Smart: enter the Remote Server URL (e.g. http://10.102.3.61:3000). Get this from the admin who installed the SERVER build.',
        'Cho Thin/Smart: nhập Remote Server URL (vd http://10.102.3.61:3000). Lấy từ admin cài bản SERVER.'
      ),
      bs(
        'Click Apply. If the server says needsRestart=true, restart the app via the green banner that appears.',
        'Click Áp dụng. Nếu server báo needsRestart=true, khởi động lại app qua banner xanh xuất hiện.'
      ),
      bs(
        'SERVER role + Embedded mode: copy ONE of the LAN URLs shown to give to client machines. Prefer Ethernet IPs over Wi-Fi (more stable).',
        'SERVER role + Embedded mode: copy MỘT trong các URL LAN hiện ra để đưa cho máy client. Ưu tiên IP Ethernet hơn Wi-Fi (ổn định hơn).'
      ),
      bs(
        'To re-onboard the machine (new user, new server, IP change): scroll to bottom → "↻ Re-run wizard" → confirm → app restarts with the role-specific first-run dialog.',
        'Để onboard lại máy (user mới, server mới, đổi IP): kéo xuống cuối → "↻ Chạy lại wizard" → confirm → app restart với dialog first-run theo role.'
      ),
    ],
    keyFields: [
      {
        field: 'mode',
        label: bi('Connection mode', 'Chế độ kết nối'),
        type: 'enum',
        notes: bi(
          'embedded | thin | smart. Persisted per machine in electron-store.',
          'embedded | thin | smart. Lưu per-máy trong electron-store.'
        ),
      },
      {
        field: 'remoteUrl',
        label: bi('Remote server URL', 'URL server remote'),
        type: 'text',
        notes: bi(
          'Required for thin/smart. Format: http://host:port (no trailing slash).',
          'Bắt buộc cho thin/smart. Format: http://host:port (không có dấu / cuối).'
        ),
      },
      {
        field: 'embeddedPort',
        label: bi('Embedded port', 'Port embedded'),
        type: 'number',
        notes: bi(
          'Auto-picked at first boot for the in-process server. Read-only here.',
          'Tự chọn lần boot đầu cho server in-process. Chỉ đọc ở đây.'
        ),
      },
      {
        field: 'buildRole',
        label: bi('Build role', 'Bản cài'),
        type: 'enum',
        notes: bi(
          'SERVER | CLIENT | generic. Baked into the installer; surfaces which first-run dialog fires.',
          'SERVER | CLIENT | generic. Embed vào installer; quyết định dialog first-run nào fire.'
        ),
      },
    ],
    formulas: [],
    tips: [
      bt(
        'When unsure between Thin and Smart: start with Thin (simpler, real-time). Move to Smart once the network is unreliable enough to be a daily problem AND the audit shows enough tabs are wired for offline cache.',
        'Khi phân vân Thin và Smart: bắt đầu với Thin (đơn giản, real-time). Chuyển Smart khi mạng đủ unstable để thành vấn đề hàng ngày VÀ audit cho thấy đủ tab wire offline cache.'
      ),
      bt(
        "Configure a static IP or DHCP reservation for the SERVER machine on the router. Without that, the server's LAN IP can change after a power outage and every client will lose connection.",
        'Cấu hình static IP hoặc DHCP reservation cho máy SERVER trên router. Không có, IP LAN của server có thể đổi sau mất điện và mọi client mất kết nối.'
      ),
    ],
    pitfalls: [
      bp(
        "Smart mode infrastructure is ready (cache + sync engine + outbox), but per-tab wiring is incremental. Today, no operational tab uses the offline cache yet — choosing Smart behaves like Thin (network required) for Quote History, Calculators, Material Library, RFQ Tracker, etc. Only Hardware, Connection Mode, and About are usable offline because they don't make network calls.",
        'Hạ tầng Smart mode đã sẵn sàng (cache + sync + outbox), nhưng wire từng tab đang triển khai dần. Hiện tại chưa tab nghiệp vụ nào dùng cache offline — chọn Smart hành xử như Thin (cần mạng) cho Quote History, Calculator, Material Library, RFQ Tracker, v.v. Chỉ Hardware, Connection Mode, About chạy được offline vì không gọi network.'
      ),
      bp(
        'Re-running the wizard wipes mode + remoteUrl on this machine. After clicking, this client will lose its server connection until the wizard re-asks for the URL on next launch. Schedule it during downtime.',
        'Chạy lại wizard xoá mode + remoteUrl trên máy này. Sau khi click, client này mất kết nối server đến khi wizard hỏi lại URL ở lần launch kế. Lên lịch ngoài giờ.'
      ),
    ],
    relatedTabs: ['settings', 'settings-hardware'],
    screenshot: null,
  },

  'settings-account-control': {
    id: 'settings-account-control',
    section: 'SYSTEM',
    title: bi('Settings — Account Control', 'Cài đặt — Quản trị tài khoản'),
    function: bi(
      'SAP-style 3-layer access control (Role × Department × Permission Group) — admin only',
      'Phân quyền SAP 3 lớp (Role × Department × Permission Group) — chỉ admin'
    ),
    path: 'Ops Cost > System > Settings > Account Control',
    purpose: bi(
      'Single admin surface for: user lifecycle (create/disable/reset/2FA), role change, department assignment, and permission-group membership that controls per-tab Hidden/Read/Edit access.',
      'Màn admin duy nhất cho: vòng đời user (tạo/vô hiệu/reset/2FA), đổi role, gán department, và permission-group điều khiển Hidden/Read/Edit từng tab.'
    ),
    whenToUse: bi(
      'Onboarding new staff (role + department + permission group); employee leaves (DISABLE); password reset; team change (reassign permission group); compliance review.',
      'Onboard nhân viên mới (role + dept + permission group); nhân viên nghỉ (VÔ HIỆU); reset mật khẩu; đổi team (re-assign group); review compliance.'
    ),
    preRequisites: [br('Admin role.', 'Role Admin.')],
    features: [
      feat(
        '4 sub-tabs: Users (roster CRUD) · Permissions (legacy canDeleteQuote / approval roles) · Permission Groups (SAP-style authorization profiles) · Sessions (sys-only — see all active logins, revoke any)',
        '4 sub-tab: Users (CRUD roster) · Permissions (canDeleteQuote / approval role cũ) · Permission Groups (profile phân quyền SAP) · Sessions (sys-only — xem mọi session đang đăng nhập, revoke bất kỳ)'
      ),
      feat(
        'Đợt 4 (v1.3) — login anomaly detection: server emits SSE security.alert when a user logs in concurrently from 2+ IPs, from a new IP not seen in 30d, or at unusual hours. Audit logged as LOGIN_ANOMALY; admins see real-time toast; user themselves sees a yellow toast post-login.',
        'Đợt 4 (v1.3) — phát hiện login bất thường: server emit SSE security.alert khi user login đồng thời từ 2+ IP, từ IP mới chưa thấy trong 30d, hoặc giờ bất thường. Audit ghi LOGIN_ANOMALY; admin thấy toast real-time; user thấy toast vàng sau khi login.'
      ),
      feat(
        'Per-user Department dropdown (sales/cs/npi/purchasing/production/quality/finance/leader/ops) — informational + default-group suggestion',
        'Dropdown Department mỗi user (sales/cs/npi/purchasing/production/quality/finance/leader/ops) — tham chiếu + gợi ý group'
      ),
      feat(
        'Per-user Permission Group dropdown — controls which tabs render, which inputs disable',
        'Dropdown Permission Group mỗi user — điều khiển tab nào hiện, input nào disable'
      ),
      feat(
        'Permission Groups CRUD: matrix of 23 tabs × 3 modes (Hidden/Read/Edit) + bulk set + duplicate + delete (system group protected)',
        'CRUD Permission Groups: ma trận 23 tab × 3 mode (Hidden/Read/Edit) + bulk set + duplicate + xoá (group system được bảo vệ)'
      ),
      feat(
        'User coverage banner — counts X/Y users assigned to a group, warns if any still using default all-access',
        'Banner coverage user — đếm X/Y user đã gán group, cảnh báo nếu còn user dùng default all-access'
      ),
      feat(
        'Session auto-revoke on permission-group change — user must re-login for new matrix to kick in',
        'Auto-revoke session khi đổi permission-group — user phải login lại để matrix mới áp dụng'
      ),
      feat(
        'Sprint 1.5 — SAP/IFS-style Provisioning Card. Per-user "ID-card" button generates a cryptographically random temp password (12 chars, dash-grouped, no ambiguous glyphs), forces change-on-first-login, and opens a printable handover card with Server URL + Username + Temp Pwd + warning + 3-step instructions (bilingual EN/VN). Temp pwd is shown ONCE — Copy or Print before closing.',
        'Sprint 1.5 — Thẻ bàn giao kiểu SAP/IFS. Nút "ID-card" mỗi user tạo mật khẩu tạm random (12 ký tự, chia nhóm dấu gạch, không có ký tự nhập nhằng), bắt buộc đổi khi login đầu, và mở thẻ bàn giao có thể in (Server URL + Username + Temp Pwd + cảnh báo + 3 bước hướng dẫn, song ngữ EN/VN). Temp pwd hiện 1 LẦN duy nhất — Copy hoặc Print trước khi đóng.'
      ),
      feat(
        'Forced password change — when the server flag must_change_password=true (set by Add User OR Reset Pwd OR Generate Temp Pwd), the login screen auto-flips to change-pwd mode the moment the user types their username; the Cancel toggle is hidden so the user cannot dismiss it.',
        'Bắt buộc đổi mật khẩu — khi server set must_change_password=true (sau Add User HOẶC Reset Pwd HOẶC Generate Temp Pwd), màn login tự bật chế độ đổi mật khẩu ngay khi user gõ username; nút Cancel bị ẩn nên user không thể bỏ qua.'
      ),
    ],
    workflow: [
      bs('Settings → Account Control → Users.', 'Settings → Account Control → Users.'),
      bs(
        'Create user: + Add User → fill username + role. Temp password auto-set + must_change_password flag enabled by default. User is forced to change pwd on first login.',
        'Tạo user: + Add User → điền username + role. Mật khẩu tạm tự set + flag must_change_password bật mặc định. User bắt buộc đổi pwd khi login đầu.'
      ),
      bs(
        'Assign Department (dropdown). Same as company org chart — helps pick the right group.',
        'Gán Department (dropdown). Giống sơ đồ tổ chức công ty — giúp chọn đúng group.'
      ),
      bs(
        'Assign Permission Group (dropdown). Session auto-revoked; user re-logs in with new tab access.',
        'Gán Permission Group (dropdown). Session auto-revoke; user login lại với quyền tab mới.'
      ),
      bs(
        'Create a NEW group: switch to Permission Groups sub-tab → + Add Group. Fill ID + name + default dept.',
        'Tạo group MỚI: chuyển sub-tab Permission Groups → + Add Group. Điền ID + name + default dept.'
      ),
      bs(
        'In the matrix, click a radio for each tab (Hidden = ẩn, Read = chỉ đọc, Edit = sửa). Use Bulk for mass-set.',
        'Trong ma trận, click radio cho từng tab (Hidden = ẩn, Read = chỉ đọc, Edit = sửa). Dùng Bulk để set hàng loạt.'
      ),
      bs(
        'Save. Users assigned to this group pick up changes on next login.',
        'Save. User gán group này nhận thay đổi khi login kế tiếp.'
      ),
      bs(
        'Password reset for another user: admin uses the Provisioning Card flow (ID-card icon, next row). The legacy "Reset password" key-icon button was removed — its window.prompt() did not work in the Electron desktop shell.',
        'Reset mật khẩu cho user khác: admin dùng Provisioning Card (icon ID-card, mục kế tiếp). Nút "Reset password" hình chìa khoá đã bị bỏ — window.prompt() không hoạt động trong vỏ Electron.'
      ),
      bs(
        'SAP/IFS handover (Sprint 1.5): user row → Provisioning Card (ID-card icon) → confirm → modal opens with auto-generated temp pwd. Click Print for an A6 paper card OR Copy for a multi-line text block to send via secure channel. Hand to the new user. Temp pwd is gone the moment you close the modal — re-issue if lost. This is also the canonical "reset another user\'s password" path.',
        'Bàn giao SAP/IFS (Sprint 1.5): dòng user → Provisioning Card (icon ID-card) → confirm → modal hiện với temp pwd tự tạo. Click Print để in thẻ giấy A6 HOẶC Copy để có text gửi qua kênh bảo mật. Đưa cho user. Temp pwd biến mất ngay khi đóng modal — phải re-issue nếu mất. Đây cũng là đường chính để "reset password cho user khác".'
      ),
      bs(
        'Disable user: toggle Active OFF. For immediate session kill, click "Sign out sessions".',
        'Vô hiệu user: toggle Active OFF. Để kill session ngay, click "Sign out sessions".'
      ),
    ],
    keyFields: [
      {
        field: 'username',
        label: bi('Username', 'Tên đăng nhập'),
        type: 'text',
        notes: bi(
          'Login identifier; cannot be changed after create.',
          'ID đăng nhập; không đổi được sau khi tạo.'
        ),
      },
      {
        field: 'role',
        label: bi('Role', 'Vai trò'),
        type: 'enum',
        notes: bi(
          'viewonly < user < cost < admin < sys. Coarse gate; sys bypasses all tab checks.',
          'viewonly < user < cost < admin < sys. Gate thô; sys bỏ qua mọi check tab.'
        ),
      },
      {
        field: 'department',
        label: bi('Department', 'Phòng ban'),
        type: 'enum',
        notes: bi(
          'Informational. Suggests default group but does NOT enforce on its own.',
          'Tham chiếu. Gợi ý group mặc định nhưng KHÔNG enforce một mình.'
        ),
      },
      {
        field: 'permission_group_id',
        label: bi('Permission Group', 'Nhóm quyền'),
        type: 'enum',
        notes: bi(
          'Controls per-tab Hidden/Read/Edit. Empty = fall back to role-only (all-access).',
          'Điều khiển Hidden/Read/Edit từng tab. Rỗng = fallback role-only (all-access).'
        ),
      },
      {
        field: 'active',
        label: bi('Active', 'Hoạt động'),
        type: 'bool',
        notes: bi(
          'OFF = cannot log in. Audit log retained.',
          'OFF = không login được. Audit log vẫn giữ.'
        ),
      },
      {
        field: '2fa',
        label: bi('2FA', '2FA'),
        type: 'bool',
        notes: bi(
          'Google Authenticator TOTP; shows QR on user next login.',
          'Google Authenticator TOTP; hiện QR khi user login kế.'
        ),
      },
    ],
    formulas: [
      {
        name: bi('Access resolution (client & server)', 'Cách tính access (client + server)'),
        formula:
          "access(user, tabId) =\n  if !user                                  → 'hidden'\n  if user.role === 'sys'                    → 'edit'\n  if !user.permission_group_id              → 'edit'  (legacy fallback)\n  if group not found                        → 'edit'  (graceful)\n  group.tab_permissions[tabId]              → as declared\n  else                                      → 'edit'  (tab unlisted)",
        notes: bi(
          'Same logic runs in client AccessContext and server permissionService.resolveTabAccess — single source of truth.',
          'Cùng logic chạy trong client AccessContext và server permissionService.resolveTabAccess — 1 nguồn sự thật.'
        ),
      },
      {
        name: bi('Sort order — tied suggestions', 'Thứ tự sắp xếp khi score bằng nhau'),
        formula: 'score desc → reuse_status (full > partial > none) → offcut_total asc → tooth asc',
        notes: bi(
          '(Layout Optimizer only — listed here for reference.)',
          '(Chỉ áp dụng cho Layout Optimizer — liệt kê để tham khảo.)'
        ),
      },
    ],
    tips: [
      bt(
        'Start with seed groups: Sales / CS / NPI / Purchasing / Production / Quality / Leader. Duplicate + customise if your team differs.',
        'Bắt đầu với group seed: Sales / CS / NPI / Purchasing / Production / Quality / Leader. Duplicate + chỉnh nếu team khác.'
      ),
      bt(
        'System group "all_access" is protected — cannot be edited or deleted. Use it as the implicit admin fallback.',
        'Group system "all_access" được bảo vệ — không sửa/xoá được. Dùng làm fallback ngầm cho admin.'
      ),
      bt(
        'Permission change auto-revokes user sessions. Warn the user before flipping their group in the middle of the day.',
        'Đổi permission tự revoke session user. Báo trước khi đổi group giữa giờ làm.'
      ),
      bt(
        'Grant sys role only to 1-2 people (ops). Sys bypasses all tab checks + can reset 2FA — over-grant is a real risk.',
        'Cấp role sys chỉ cho 1-2 người (ops). Sys bỏ qua mọi check tab + reset 2FA được — cấp nhiều là rủi ro.'
      ),
      bt(
        "Prefer the Provisioning Card flow over the manual Reset prompt — admin doesn't need to invent a password, the card has all info on one page (server URL + username + temp pwd + instructions), and the printed handout is a clean record of who got which credentials when.",
        'Ưu tiên flow Provisioning Card thay vì Reset thủ công — admin khỏi nghĩ pwd, thẻ in 1 trang đủ thông tin (URL server + username + temp pwd + hướng dẫn), và là chứng từ rõ ràng ai nhận credentials khi nào.'
      ),
    ],
    pitfalls: [
      bp(
        "Role and Permission Group are ORTHOGONAL. A user with role=admin but group=sales_default still SEES only what sales_default allows — until they're also assigned all_access or a leader group.",
        'Role và Permission Group ĐỘC LẬP. User role=admin nhưng group=sales_default VẪN chỉ thấy những gì sales_default cho phép — trừ khi gán thêm all_access hoặc leader group.'
      ),
      bp(
        "Hard-deleting a user breaks quote ownership on old records. Deactivate, don't delete.",
        'Xoá cứng user phá quote ownership trên record cũ. Deactivate, không xoá.'
      ),
      bp(
        'Resetting a password DOES NOT reset 2FA. User still needs their Authenticator entry unless you also toggle 2FA off + on.',
        'Reset mật khẩu KHÔNG reset 2FA. User vẫn cần entry Authenticator trừ khi toggle 2FA off + on.'
      ),
      bp(
        "Users without a permission group fall back to edit on EVERY tab. That's the default until an admin assigns one — the coverage banner warns about this.",
        'User không có permission group fallback sang edit MỌI tab. Đó là default đến khi admin gán — banner coverage cảnh báo.'
      ),
      bp(
        'Provisioning Card temp pwd is shown ONCE — the server hashes + stores it but does not echo it back. If the admin closes the modal before copying or printing, the only recovery is to re-issue (which generates a new pwd and revokes the old one). Always Copy or Print BEFORE clicking Done.',
        'Temp pwd của Provisioning Card chỉ hiện 1 LẦN — server hash + lưu nhưng không trả lại. Nếu admin đóng modal trước khi copy/print, cách duy nhất để khôi phục là re-issue (tạo pwd mới + revoke pwd cũ). LUÔN Copy hoặc Print TRƯỚC khi click Done.'
      ),
      bp(
        "Generating a temp pwd revokes ALL of the target user's active sessions (server-side audit: PWD_TEMP_REVOKE). If you do this on a user mid-shift they'll be logged out instantly — coordinate with them or do it during downtime.",
        'Tạo temp pwd revoke MỌI session đang chạy của user (audit server: PWD_TEMP_REVOKE). Nếu làm giữa ca, user bị logout ngay lập tức — phối hợp với họ hoặc làm ngoài giờ.'
      ),
    ],
    example: ex(
      bi(
        'Onboard a new Sales rep "minh.nguyen" using the SAP/IFS-style Provisioning Card flow.',
        'Onboard 1 Sale mới "minh.nguyen" theo flow Provisioning Card kiểu SAP/IFS.'
      ),
      [
        bs(
          'Settings → Account Control → Users → + Add User. Username=minh.nguyen, Role=user (Password field can stay default; will be replaced in next step).',
          'Settings → Account Control → Users → + Add User. Username=minh.nguyen, Role=user (Password field để mặc định cũng được; sẽ bị thay ở bước kế).'
        ),
        bs(
          'Row minh.nguyen → Dept dropdown → sales. Permission Group dropdown → Sales Team (default).',
          'Dòng minh.nguyen → dropdown Dept → sales. Dropdown Permission Group → Sales Team (default).'
        ),
        bs(
          'Same row → click Provisioning Card icon (ID-card) → confirm → modal opens with auto-generated temp pwd e.g. "Tx9-mK2p-Qv8L".',
          'Cùng dòng → click icon Provisioning Card (ID-card) → confirm → modal hiện temp pwd tự tạo vd "Tx9-mK2p-Qv8L".'
        ),
        bs(
          'Click Print to print an A6 paper card OR Copy to send via Slack DM. Hand to minh.',
          'Click Print để in thẻ giấy A6 HOẶC Copy để gửi qua Slack DM. Đưa cho minh.'
        ),
        bs(
          'Minh installs Ops Control CLIENT, opens app → first-run wizard asks for server URL → she types it from the card → test → save → login screen.',
          'Minh cài Ops Control CLIENT, mở app → first-run wizard hỏi server URL → cô ấy gõ URL từ thẻ → test → save → màn login.'
        ),
        bs(
          'Minh types her username — login form auto-flips to change-pwd mode + amber banner appears: "Admin đã cấp mật khẩu tạm". She types temp pwd + new pwd + confirm → Submit → in.',
          'Minh gõ username — form login tự chuyển sang chế độ đổi pwd + banner amber hiện: "Admin đã cấp mật khẩu tạm". Cô ấy gõ temp pwd + new pwd + confirm → Submit → vào app.'
        ),
        bs(
          'Minh sees sidebar: RFQ Tracker (edit), Quote History (read), Formal Quotation (edit), Dashboard (read). Pricing (Std/Cpx), Material Cost, Finance Data — NOT rendered.',
          'Minh thấy sidebar: RFQ Tracker (edit), Quote History (read), Formal Quotation (edit), Dashboard (read). Pricing (Std/Cpx), Material Cost, Finance Data — KHÔNG hiển thị.'
        ),
      ],
      bi(
        'Audit log captures: USER_CREATE, DEPARTMENT_CHANGE sales, PERMISSION_GROUP_CHANGE sales_default, PWD_TEMP_GENERATED, then PWD_CHANGE (when minh sets her own pwd). Full compliance-ready handover trail.',
        'Audit log ghi: USER_CREATE, DEPARTMENT_CHANGE sales, PERMISSION_GROUP_CHANGE sales_default, PWD_TEMP_GENERATED, rồi PWD_CHANGE (khi minh đặt pwd của mình). Trail bàn giao sẵn sàng compliance.'
      )
    ),
    result: res(
      'Every tab visibility + input-disable decision is driven by one assignment. Operators change permission-group membership (not per-field checkboxes) — cleaner, faster, auditable. Server middleware blocks any curl bypass.',
      'Mọi quyết định tab-hiển-thị + input-disable lái bởi 1 assignment. Operator đổi permission-group (không tick từng field) — sạch hơn, nhanh hơn, auditable. Middleware server chặn mọi bypass bằng curl.'
    ),
    authorization: auth(
      'Admin + Sys only',
      bi(
        'CRUD on Permission Groups requires admin/sys. Assigning groups to users requires admin+. System group "all_access" cannot be modified.',
        'CRUD Permission Groups yêu cầu admin/sys. Gán group cho user yêu cầu admin+. Group system "all_access" không sửa được.'
      )
    ),
    constraints: [
      con(
        'Unassigned users fall back to edit-all — NOT a default-deny system. Migration to default-deny is opt-in per user.',
        'User chưa gán group fallback sang edit-all — KHÔNG phải hệ thống default-deny. Migration sang default-deny opt-in từng user.'
      ),
      con(
        'Permission changes take effect on NEXT login, not instantly (sessions revoked but active tabs keep their matrix until refresh).',
        'Thay đổi permission áp dụng ở lần login KẾ (session bị revoke nhưng tab đang mở giữ matrix cũ đến khi refresh).'
      ),
      con(
        'Group deletion cascades: users assigned to a deleted group auto-fall back to edit-all. Review user assignments before deleting.',
        'Xoá group cascade: user gán group bị xoá tự fallback edit-all. Review assignment trước khi xoá.'
      ),
    ],
    relatedTabs: ['settings', 'settings-password', 'settings-system-logs'],
    screenshot: null,
  },

  'settings-backup-restore': {
    id: 'settings-backup-restore',
    section: 'SYSTEM',
    title: bi('Settings — Backup / Restore', 'Cài đặt — Sao lưu / Khôi phục'),
    function: bi(
      'Full-system data snapshot + its inverse (admin only)',
      'Snapshot toàn bộ dữ liệu + ngược lại (chỉ admin)'
    ),
    path: 'Ops Cost > System > Settings > Backup / Restore',
    purpose: bi(
      'Full-system data snapshot (DB + uploaded files) and its inverse. The last resort when something goes badly wrong.',
      'Snapshot toàn bộ dữ liệu hệ thống (DB + file upload) và ngược lại. Biện pháp cuối cùng khi có sự cố nghiêm trọng.'
    ),
    whenToUse: bi(
      'BEFORE any risky admin action (bulk user disable, rate-table batch edit, data-model migration). Weekly as a routine.',
      'TRƯỚC mọi thao tác rủi ro (disable hàng loạt user, sửa rate-table hàng loạt, migration). Hàng tuần theo routine.'
    ),
    preRequisites: [
      br(
        'Admin role; at least 500 MB free disk space on the client.',
        'Role Admin; ít nhất 500 MB trống trên client.'
      ),
    ],
    workflow: [
      bs(
        'Settings → Backup / Restore. Default tab: Data Backups.',
        'Settings → Backup / Restore. Tab mặc định: Data Backups.'
      ),
      bs(
        'Create Data Backup → click → snapshot JSON ghi xuống server/data/Backup & restore/Data/manual_<ts>.json.',
        'Create Data Backup → click → snapshot JSON ghi xuống server/data/Backup & restore/Data/manual_<ts>.json.'
      ),
      bs(
        'Auto daily backup chạy nền (đợt 5 default ON) — auto_<YYYYMMDD>_<HHMMSS>.json. Kept 30 ngày, prune tự động.',
        'Auto daily backup chạy nền (đợt 5 default ON) — auto_<YYYYMMDD>_<HHMMSS>.json. Giữ 30 ngày, tự prune.'
      ),
      bs(
        'SQLite online backup chạy song song mỗi ngày 02:00 → server/data/Backup/SQLite/ops_<ts>.sqlite (PRAGMA integrity_check sau mỗi backup).',
        'SQLite online backup chạy song song mỗi ngày 02:00 → server/data/Backup/SQLite/ops_<ts>.sqlite (PRAGMA integrity_check sau mỗi backup).'
      ),
      bs(
        'Đợt 3 (v1.3) — UPLOAD từ máy khác: nút "📤 Upload từ máy khác…" (sys-only). Pick file .json từ USB / off-site copy → server validate có ≥1 known dataset key → save vào Backup & restore/Data/uploaded_<ts>_<original>.json. Sau đó click Restore từ list.',
        'Đợt 3 (v1.3) — UPLOAD từ máy khác: nút "📤 Upload từ máy khác…" (sys-only). Chọn file .json từ USB / off-site copy → server validate có ≥1 known dataset key → save vào Backup & restore/Data/uploaded_<ts>_<original>.json. Sau đó click Restore từ list.'
      ),
      bs(
        'Off-site backup script (scripts/backup-offsite.sh) chạy cron 02:30 → rsync newest local backup sang USB/NAS/SSH target + sha256 verify + webhook alert on fail. Cấu hình env OPS_DATA_DIR + OPS_OFFSITE_TARGET.',
        'Off-site backup script (scripts/backup-offsite.sh) chạy cron 02:30 → rsync backup mới nhất sang USB/NAS/SSH target + sha256 verify + webhook alert nếu fail. Cấu hình env OPS_DATA_DIR + OPS_OFFSITE_TARGET.'
      ),
      bs(
        'Restore: pick row → Restore → confirm prompt. Pre-restore snapshot tự tạo (pre_restore_<ts>.json) cho rollback.',
        'Restore: chọn dòng → Restore → confirm. Pre-restore snapshot tự tạo (pre_restore_<ts>.json) cho rollback.'
      ),
      bs(
        'Code backup (admin) — snapshot toàn bộ source tree vào Backup & restore/Code/code_<ts>/ (loại trừ node_modules, dist, .git, server/data).',
        'Code backup (admin) — snapshot toàn bộ source vào Backup & restore/Code/code_<ts>/ (loại trừ node_modules, dist, .git, server/data).'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Keep at least 3 off-site snapshots: latest + last Monday + last end-of-month.',
        'Giữ ít nhất 3 snapshot off-site: mới nhất + thứ Hai trước + cuối tháng trước.'
      ),
      bt(
        'Restore on a STAGING URL first if available — verify the data looks right before touching production.',
        'Restore trên URL STAGING trước nếu có — xác nhận data đúng trước khi động vào production.'
      ),
    ],
    pitfalls: [
      bp(
        'Restore OVERWRITES the current DB in full. It is NOT a merge or selective restore.',
        'Restore GHI ĐÈ toàn bộ DB hiện tại. KHÔNG phải merge hoặc selective restore.'
      ),
      bp(
        'A restore rolls back every record, including saved quotes made since the backup. Communicate to users BEFORE restoring.',
        'Restore rollback mọi bản ghi, kể cả báo giá lưu sau backup. Thông báo cho user TRƯỚC khi restore.'
      ),
      bp(
        'File manifest mismatch (SHA-256) aborts the restore — don\'t hex-edit backup zips to "fix" them.',
        'Sai SHA-256 manifest sẽ huỷ restore — không hex-edit zip backup để "fix".'
      ),
    ],
    relatedTabs: ['settings', 'settings-account-control', 'settings-system-logs'],
    screenshot: null,
  },

  'settings-system-logs': {
    id: 'settings-system-logs',
    section: 'SYSTEM',
    title: bi('Settings — System Logs', 'Cài đặt — Nhật ký hệ thống'),
    function: bi(
      'Last 10k server events filtered by level (admin only)',
      '10k sự kiện server gần nhất lọc theo mức (chỉ admin)'
    ),
    path: 'Ops Cost > System > Settings > System Logs',
    purpose: bi(
      'Last 10,000 server events filtered by level (debug / info / warn / error / fatal). First stop for "why did this happen" investigations.',
      '10.000 sự kiện server gần nhất, lọc theo mức (debug / info / warn / error / fatal). Điểm đến đầu tiên khi điều tra "tại sao xảy ra vậy".'
    ),
    whenToUse: bi(
      "User reports a confusing error; scheduled action didn't fire; unexpected slow login. Precede any bug report with a log check.",
      'User báo lỗi khó hiểu; action theo lịch không chạy; login chậm bất thường. Trước khi log bug luôn check log trước.'
    ),
    preRequisites: [br('Admin role.', 'Role Admin.')],
    workflow: [
      bs('Settings → System Logs.', 'Settings → System Logs.'),
      bs(
        'Filter by level (errors first), user, time window (last 1h / 24h / 7d / custom).',
        'Lọc theo mức (errors trước), user, khoảng thời gian (1h / 24h / 7d / tuỳ chỉnh).'
      ),
      bs(
        'Click a row → full request context: method, path, params (redacted), duration, stack trace (if error).',
        'Click dòng → context đầy đủ: method, path, params (đã redact), duration, stack trace (nếu lỗi).'
      ),
      bs(
        'Export filtered rows as JSON/CSV for attaching to a bug report.',
        'Xuất các dòng đã lọc dạng JSON/CSV để gửi kèm bug report.'
      ),
    ],
    keyFields: [
      field('Level', 'enum', 'debug / info / warn / error / fatal.'),
      field('Request id', 'uuid', 'Trace a single HTTP request across the full logline set.'),
      field(
        'Duration',
        'ms',
        'Total time from receipt to response. > 2000 ms on simple reads means DB contention.'
      ),
    ],
    formulas: [],
    tips: [
      bt(
        'Bookmark "level=error + last 24h" — opens the actionable subset in one click.',
        'Bookmark "level=error + last 24h" — mở subset actionable trong 1 click.'
      ),
      bt(
        'Correlate by request id when investigating — a single user action may produce 3–4 log lines.',
        'Tương quan theo request id khi điều tra — 1 action user có thể tạo 3-4 log line.'
      ),
    ],
    pitfalls: [
      bp(
        'Logs are in-memory; restart wipes them. Configure a Loki / Promtail sidecar for long-term retention.',
        'Log in-memory; restart sẽ xoá. Cấu hình Loki / Promtail sidecar để retention dài hạn.'
      ),
      bp(
        "Level fatal auto-pages the on-call engineer via the error beacon — don't test with ?simulate=fatal in prod.",
        'Level fatal tự page on-call engineer qua error beacon — không test với ?simulate=fatal trên prod.'
      ),
    ],
    relatedTabs: ['settings', 'metrics'],
    screenshot: null,
  },

  'ink-silkscreen': {
    id: 'ink-silkscreen',
    section: 'CALCULATORS',
    title: bi('Inks — Silkscreen detail', 'Mực in — Chi tiết Silkscreen'),
    function: bi(
      'Silkscreen-specific ink volume math (mesh + emulsion → film → µL)',
      'Công thức thể tích mực silkscreen (lưới + emulsion → film → µL)'
    ),
    path: 'Ops Cost > Calculators > Inks > Silkscreen',
    purpose: bi(
      'Silkscreen-specific ink volume math using mesh count + emulsion thickness to derive film thickness, then the Q·P·A method to convert to volume per label.',
      'Tính thể tích mực silkscreen dùng mesh count + độ dày emulsion để suy ra độ dày màng mực, rồi dùng phương pháp Q·P·A quy ra thể tích trên nhãn.'
    ),
    whenToUse: bi(
      'Silkscreen-process jobs only. Re-characterize when changing mesh supplier or emulsion batch.',
      'Chỉ cho job silkscreen. Hiệu chỉnh lại khi đổi nhà cung cấp mesh hoặc lô emulsion.'
    ),
    preRequisites: [
      'Mesh count (T/cm or T/in) from the screen vendor.',
      'Emulsion thickness (µm), usually on the emulsion datasheet.',
      'Print area (mm²) from Print Area Calculator.',
    ],
    procedures: [
      proc('Mesh spec input', 'Nhập thông số lưới', null, [
        bs(
          'Pick mesh from library → count + thread diameter auto-fill.',
          'Chọn lưới từ library → count + đường kính sợi tự điền.'
        ),
        bs(
          'Manual: enter mesh count (T/cm) and thread diameter (µm).',
          'Thủ công: nhập mesh count (T/cm) và đường kính sợi (µm).'
        ),
        bs(
          'System computes Open area % = (1 − d × count)².',
          'Hệ thống tính Open area % = (1 − d × count)².'
        ),
      ]),
      proc(
        'Emulsion + film',
        'Emulsion + độ dày film',
        bi(
          'Film thickness is the stencil thickness plus a mesh-dependent correction.',
          'Độ dày film là độ dày stencil cộng hiệu chỉnh theo lưới.'
        ),
        [
          bs(
            'Enter emulsion thickness (µm) from datasheet.',
            'Nhập độ dày emulsion (µm) từ datasheet.'
          ),
          bs(
            'System computes film_µm ≈ emulsion_µm × 1.2 + k × √open_area.',
            'Hệ thống tính film_µm ≈ emulsion_µm × 1.2 + k × √open_area.'
          ),
          bs(
            'k calibrated via step-wedge test (typical 3-5, emulsion-dependent).',
            'k hiệu chỉnh qua step-wedge test (thường 3-5, phụ thuộc emulsion).'
          ),
        ]
      ),
      proc('Area + output', 'Diện tích + kết quả', null, [
        bs(
          'Import area (mm²) from Print Area run, or enter manually.',
          'Import diện tích (mm²) từ run Print Area, hoặc nhập thủ công.'
        ),
        bs(
          'Output: µL/label, mL/1k, cost (when ink unit-price in Material Library).',
          'Output: µL/nhãn, mL/1k, chi phí (khi đơn giá mực có trong Material Library).'
        ),
        bs(
          'Compare "Calculated" vs "Actual press logs" — delta > 15% flags mesh batch variance.',
          'So sánh "Tính toán" vs "Log máy thực tế" — delta > 15% báo hiệu biến thiên lô lưới.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field('Mesh', 'T/cm', 'Threads per cm. Higher = finer + thinner film.'),
      field('Emulsion thickness', 'µm', 'Stencil-only thickness; excludes ink layer above.'),
      field(
        'Ink open area',
        'percent',
        'Fraction of mesh that passes ink; derived from thread diameter.'
      ),
    ],
    formulas: [
      {
        name: 'Mesh open area',
        expr: 'open = (1 − thread_diameter × mesh_count)²',
        meaning: bi(
          'Fraction of the mesh surface that is open (ink passes). Finer meshes block more ink.',
          'Phần trăm bề mặt lưới hở (mực chảy qua). Lưới càng mịn càng chặn nhiều mực.'
        ),
        example:
          'Mesh 120 T/cm, thread diameter 35 µm = 0.0035 cm\nopen = (1 − 0.0035 × 120)² = (1 − 0.42)² = 0.336 = 33.6%',
        notes: 'Pythagoras approximation; valid for plain weave meshes.',
      },
      {
        name: 'Silkscreen film thickness',
        expr: 'film_µm ≈ emulsion_µm × 1.2 + k × √(open_area)',
        meaning: bi(
          'Wet ink film laid down = stencil thickness adjusted for mesh topography. k calibrates per emulsion batch.',
          'Độ dày film mực ướt = độ dày stencil hiệu chỉnh theo hình học lưới. k hiệu chỉnh theo từng lô emulsion.'
        ),
        example:
          'emulsion=8 µm, open=0.336, k=4\nfilm ≈ 8 × 1.2 + 4 × √0.336 = 9.6 + 2.32 = 11.9 µm',
        notes: 'k is a vendor-specific constant (typ. 3–5) calibrated via step-wedge test.',
      },
      {
        name: 'Ink volume',
        expr: 'µL = area_mm² × film_µm × 1.30 × 0.001',
        meaning: bi(
          'µL per label for silkscreen. 1.30 accounts for the 25-30% ink held back in the mesh.',
          'µL mỗi nhãn cho silkscreen. 1.30 là phần 25-30% mực bị giữ lại trong lưới.'
        ),
        example: 'area=500 mm², film=11.9 µm\nµL = 500 × 11.9 × 1.30 × 0.001 = 7.74 µL / label',
        notes: '1.30 = silkscreen transfer factor (25–30% hold-back in the mesh).',
      },
    ],
    tips: [
      bt(
        'Step-wedge calibration once per emulsion batch — run a 5/25/50/75/100% patch on a scrap label and weigh ink consumed.',
        'Hiệu chỉnh step-wedge 1 lần/lô emulsion — chạy patch 5/25/50/75/100% trên nhãn scrap và cân mực tiêu thụ.'
      ),
    ],
    pitfalls: [
      bp(
        'Using anilox-style BCM math for silkscreen is wrong — silkscreen has no anilox cells; film thickness is directly the mesh + emulsion stack.',
        'Dùng công thức BCM anilox cho silkscreen là SAI — silkscreen không có cell anilox; độ dày film trực tiếp từ stack lưới + emulsion.'
      ),
    ],
    relatedTabs: ['ink-calc', 'ink-flexo', 'print-area'],
    screenshot: null,
  },

  'ink-flexo': {
    id: 'ink-flexo',
    section: 'CALCULATORS',
    title: bi('Inks — Flexo detail', 'Mực in — Chi tiết Flexo'),
    function: bi(
      'Flexo-specific ink volume math (anilox BCM → film → µL)',
      'Công thức thể tích mực flexo (BCM anilox → film → µL)'
    ),
    path: 'Ops Cost > Calculators > Inks > Flexo',
    purpose: bi(
      'Flexo-specific ink volume math using anilox BCM (Billion Cubic Microns per in²) and engraving geometry. Differs from silkscreen because flexo meters ink through engraved cells, not through a mesh.',
      'Tính thể tích mực flexo dùng BCM anilox (Billion Cubic Microns mỗi in²) và hình học engrave. Khác silkscreen vì flexo đo mực qua cell khắc, không phải qua mesh.'
    ),
    whenToUse: bi(
      'Flexo jobs. Re-run after anilox re-engrave or replacement.',
      'Job flexo. Chạy lại sau khi anilox được khắc lại hoặc thay.'
    ),
    preRequisites: [
      'Anilox LPI (Lines per Inch) + BCM from the engraving quality certificate.',
      'Print area (mm²) from Print Area Calculator.',
    ],
    procedures: [
      proc(
        'Anilox pick',
        'Chọn anilox',
        bi(
          'Keep a "reference" anilox flagged in the library — new jobs can clone it as a starting point.',
          'Giữ một anilox "reference" trong library — job mới có thể clone làm điểm xuất phát.'
        ),
        [
          bs(
            'Click Anilox LOV → pick by engraving code.',
            'Click LOV Anilox → chọn theo engraving code.'
          ),
          bs('LPI + BCM auto-fill from the library.', 'LPI + BCM tự điền từ library.'),
          bs(
            'Certification date column shows age — re-cert quarterly on high-volume rolls.',
            'Cột ngày cert hiện tuổi — re-cert hàng quý với roll volume cao.'
          ),
        ]
      ),
      proc('BCM → film conversion', 'Quy đổi BCM → film', null, [
        bs(
          'System computes film_µm = BCM × 0.06451 (BCM bn µm³/in² × in² per mm² × mm per µm).',
          'Hệ thống tính film_µm = BCM × 0.06451 (BCM tỉ µm³/in² × in² mỗi mm² × mm mỗi µm).'
        ),
        bs(
          'Transfer factor default 1.12 (10-15% cell residue for flexo).',
          'Transfer factor mặc định 1.12 (10-15% đọng trong cell anilox cho flexo).'
        ),
        bs(
          'Override only with calibrated press-specific data.',
          'Ghi đè chỉ với data đã hiệu chỉnh cho máy cụ thể.'
        ),
      ]),
      proc('Output + compare', 'Kết quả + đối chiếu', null, [
        bs(
          'Import area from Print Area run, OR enter manually.',
          'Import diện tích từ run Print Area, HOẶC nhập thủ công.'
        ),
        bs('Output: µL/label, mL/1k, cost/label.', 'Output: µL/nhãn, mL/1k, chi phí/nhãn.'),
        bs(
          'Cross-check "calculated µL" vs "metered µL from press tank" — delta > 10% flags anilox wear or bad BCM cert.',
          'Đối chiếu "µL tính toán" vs "µL đo từ bồn mực máy" — delta > 10% báo hiệu anilox mòn hoặc BCM cert sai.'
        ),
      ]),
    ],
    workflow: null,
    keyFields: [
      field(
        'LPI',
        'lines/in',
        'Engrave fineness. Higher LPI = finer detail, smaller cells, less ink.'
      ),
      field('BCM', 'bn µm³/in²', 'Anilox ink-carrying capacity.'),
      field(
        'Transfer factor',
        'x',
        'Fraction of BCM that transfers to plate → substrate. Default 1.12.'
      ),
    ],
    formulas: [
      {
        name: 'BCM → film thickness',
        expr: 'film_µm = BCM × 0.06451',
        meaning: bi(
          'BCM (bn cubic µm per in²) is the anilox ink-carrying capacity. Converts to wet film thickness per mm².',
          'BCM (tỉ µm³ mỗi in²) là dung tích mực của anilox. Quy đổi sang độ dày film ướt mỗi mm².'
        ),
        example: 'Anilox BCM=3.5\nfilm = 3.5 × 0.06451 = 0.226 µm (theoretical full-transfer)',
        notes:
          '0.06451 converts BCM (bn µm³/in²) to wet film µm assuming full transfer; discount by transfer_factor for reality.',
      },
      {
        name: 'Ink volume',
        expr: 'µL = area_mm² × film_µm × 1.12 × 0.001',
        meaning: bi(
          'µL per label for flexo. 1.12 accounts for ~10-15% cell residue that never leaves the anilox.',
          'µL mỗi nhãn cho flexo. 1.12 tính phần ~10-15% mực còn đọng trong anilox.'
        ),
        example: 'area=500 mm², film=0.226 µm\nµL = 500 × 0.226 × 1.12 × 0.001 = 0.127 µL / label',
        notes: '1.12 = flexo transfer factor (10-15% cell residue).',
      },
      {
        name: 'Effective coverage with dot gain',
        expr: 'effective_pct = P + 0.18 × 4 × P × (1 − P)',
        meaning: bi(
          'Yule-Nielsen dot-gain for flexo (g=0.18). A 50% file prints as 68% on substrate.',
          'Dot-gain Yule-Nielsen cho flexo (g=0.18). File 50% in ra thành 68% trên substrate.'
        ),
        example:
          'File tint P=0.25 (25%):\neffective = 0.25 + 0.18 × 4 × 0.25 × 0.75 = 0.385 (38.5% press)',
        notes: 'g=18% at 50% peak is the flexo default.',
      },
    ],
    tips: [
      bt(
        'Anilox wear is real — re-certify BCM quarterly on high-volume rolls. Wear drops BCM 5-10% per year.',
        'Anilox mòn là có thật — re-cert BCM hàng quý với roll volume cao. Mòn giảm BCM 5-10%/năm.'
      ),
      bt(
        'Mark one anilox as the facility "reference" — most new jobs can clone it as a starting point.',
        'Đánh dấu 1 anilox là "reference" của xưởng — hầu hết job mới có thể clone làm điểm xuất phát.'
      ),
    ],
    pitfalls: [
      bp(
        'Using the nameplate BCM from the anilox vendor without certified test data is unreliable — always use the QC certificate.',
        'Dùng BCM nameplate của NCC anilox mà không có data test đã chứng nhận là không đáng tin — luôn dùng QC certificate.'
      ),
      bp(
        'Anilox cleaning with aggressive chemistry can actually INCREASE BCM temporarily (the cells widen); re-certify after a deep clean.',
        'Vệ sinh anilox bằng hoá chất mạnh có thể TĂNG BCM tạm thời (cell nở); re-cert sau khi deep clean.'
      ),
    ],
    relatedTabs: ['ink-calc', 'ink-silkscreen', 'print-area'],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // STANDARD CALC — sub-tabs
  // ─────────────────────────────────────────────────────────────

  'standard-layout': {
    id: 'standard-layout',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Layout', 'Bảng tính giá — Layout'),
    function: bi(
      'Configure product dimensions + roll/sheet layout + MOQ tiers',
      'Cấu hình kích thước sản phẩm + layout cuộn/tờ + bậc MOQ'
    ),
    path: 'Ops Cost > Pricing (Std) >Layout',
    purpose: bi(
      'Defines how many labels fit across a web/sheet and how many MOQ tiers are priced. Drives waste + material cost upstream.',
      'Định nghĩa số nhãn lên web/sheet + số bậc MOQ báo giá. Ảnh hưởng waste + chi phí vật tư.'
    ),
    whenToUse: bi(
      'First sub-tab to open for a new SKU — Layout parameters feed every downstream tab.',
      'Sub-tab đầu tiên mở cho SKU mới — các tham số Layout ảnh hưởng mọi tab phía sau.'
    ),
    preRequisites: [
      br(
        'Product trim dimensions known; press web width known.',
        'Biết kích thước trim sản phẩm; biết web width máy in.'
      ),
    ],
    procedures: [
      proc('Product dimensions', 'Kích thước sản phẩm', null, [
        bs(
          'Enter Length × Width (mm) — the trim size, exclusive of bleed.',
          'Nhập Chiều dài × Chiều rộng (mm) — kích thước trim, không gồm bleed.'
        ),
        bs(
          'Optional: add bleed if material utilization depends on it.',
          'Tuỳ chọn: thêm bleed nếu sử dụng vật tư phụ thuộc vào nó.'
        ),
        bs(
          'Thickness (µm) — drives material weight + UoM conversions.',
          'Độ dày (µm) — ảnh hưởng cân nặng vật tư + quy đổi UoM.'
        ),
      ]),
      proc('Roll / Sheet layout', 'Layout cuộn / tờ', null, [
        bs(
          'Pick "Roll" or "Sheet" feed per the target press.',
          'Chọn "Roll" hoặc "Sheet" theo máy in mục tiêu.'
        ),
        bs(
          'Enter web width (roll) or sheet dims (sheet).',
          'Nhập web width (cuộn) hoặc kích thước tờ (sheet).'
        ),
        bs(
          'Across count: labels per row. Down count: rows per sheet (sheet only).',
          'Across count: nhãn mỗi hàng. Down count: hàng mỗi tờ (chỉ cho sheet).'
        ),
        bs(
          'Gap between labels (mm): press-dependent; default 3 for flexo.',
          'Khoảng cách giữa các nhãn (mm): phụ thuộc máy; mặc định 3 cho flexo.'
        ),
      ]),
      proc(
        'MOQ tiers',
        'Bậc MOQ',
        bi(
          'Customers often ask for tiered pricing. Configure up to 5 tiers; each tier gets its own Summarize row.',
          'Khách thường yêu cầu báo giá theo bậc. Cấu hình tối đa 5 bậc; mỗi bậc có dòng Summarize riêng.'
        ),
        [
          bs('Enter Tier 1 qty — the base MOQ.', 'Nhập số lượng Bậc 1 — MOQ cơ sở.'),
          bs(
            'Enter up to 4 additional tier quantities (ascending).',
            'Nhập tối đa 4 số lượng bậc tiếp theo (tăng dần).'
          ),
          bs(
            'Each tier amortizes setup over its qty — larger tier = lower per-unit cost.',
            'Mỗi bậc phân bổ setup theo qty — bậc càng lớn = chi phí/đơn vị càng thấp.'
          ),
        ]
      ),
    ],
    tips: [
      bt(
        'Layout counts cascade: a wrong Across = N changes labels/hr, waste %, and material cost on EVERY sub-tab.',
        'Layout count chảy xuống: Across = N sai sẽ đổi labels/hr, waste %, và chi phí vật tư ở MỌI sub-tab.'
      ),
    ],
    pitfalls: [
      bp(
        'Forgetting Gap causes Materials to over-estimate utilization — your quote will be optimistic.',
        'Quên Gap khiến Materials ước lượng sử dụng quá cao — báo giá sẽ lạc quan.'
      ),
    ],
    // Sprint S-PRICING-COMBINED-P2 — 3 standalone Mat/Ink/Process tabs
    // retired; pivot cross-link to 'standard-combined' (the new primary
    // entry point). The 3 standalone help entries still exist as section
    // documentation, reachable via search.
    relatedTabs: ['standard', 'standard-combined'],
    screenshot: null,
  },

  'standard-material': {
    id: 'standard-material',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Material', 'Bảng tính giá — Vật tư'),
    function: bi(
      'Pick substrate + adhesive + liner; compute material cost per label',
      'Chọn face + adhesive + liner; tính chi phí vật tư/nhãn'
    ),
    path: 'Ops Cost > Pricing (Std) > Materials & Process (Materials section)',
    purpose: bi(
      'Note: this section now lives inside the Materials & Process tab (Sprint S-PRICING-COMBINED-P2, 2026-06-18). This help entry is preserved as a deep-dive on the Materials section; the operator-facing tab is "Materials & Process". Select each material layer (face + adhesive + liner + optional laminate/varnish) from Material Library and compute the material cost line.',
      'Lưu ý: section này giờ nằm trong tab Vật tư & Công đoạn (Sprint S-PRICING-COMBINED-P2, 2026-06-18). Entry help này được giữ làm tra cứu sâu cho section Vật tư; tab operator nhìn thấy là "Vật tư & Công đoạn". Chọn từng lớp vật tư (face + adhesive + liner + optional laminate/varnish) từ Material Library và tính dòng chi phí vật tư.'
    ),
    whenToUse: bi(
      'After Layout is complete. Re-visit when switching substrate.',
      'Sau khi Layout xong. Quay lại khi đổi substrate.'
    ),
    preRequisites: [
      br(
        'Layout sub-tab completed; Material Library populated.',
        'Sub-tab Layout đã xong; Material Library đã có data.'
      ),
    ],
    procedures: [
      proc('Face material', 'Vật tư mặt (Face)', null, [
        bs('Click Face LOV → pick material code.', 'Click LOV Face → chọn code vật tư.'),
        bs(
          'Unit cost auto-populates from Material Library.',
          'Đơn giá tự điền từ Material Library.'
        ),
        bs(
          'Waste % override if press-specific value differs from library default.',
          'Ghi đè Waste % nếu giá trị riêng của máy khác mặc định library.'
        ),
      ]),
      proc('Adhesive + Liner', 'Keo + Đế', null, [
        bs(
          'Pick Adhesive from LOV (permanent / removable / freezer-grade).',
          'Chọn Keo từ LOV (vĩnh viễn / gỡ được / cấp đông).'
        ),
        bs('Pick Liner (PET 30µm, glassine, etc.).', 'Chọn Đế (PET 30µm, glassine, v.v.).'),
        bs(
          'Per-layer waste accumulates to the material cost line.',
          'Waste từng lớp cộng dồn vào dòng chi phí vật tư.'
        ),
      ]),
      proc('Optional layers', 'Lớp tuỳ chọn', null, [
        bs(
          'Laminate (over-laminate film) — toggle ON and pick from LOV.',
          'Laminate (film over-laminate) — bật ON và chọn từ LOV.'
        ),
        bs(
          'Varnish — toggle ON, select type (water / UV).',
          'Varnish — bật ON, chọn loại (gốc nước / UV).'
        ),
        bs(
          'Each optional layer adds a cost line; toggle OFF to skip.',
          'Mỗi lớp tuỳ chọn thêm 1 dòng chi phí; tắt OFF để bỏ qua.'
        ),
      ]),
      proc('Cost summary', 'Tóm tắt chi phí', null, [
        bs(
          'Right panel shows per-layer breakdown + total material cost / label.',
          'Panel phải hiển thị breakdown từng lớp + tổng chi phí vật tư/nhãn.'
        ),
        bs(
          'Hover any row for formula + library row reference.',
          'Hover dòng bất kỳ để xem công thức + reference dòng library.'
        ),
      ]),
      proc(
        'Alternative materials (Maint.Mat ↔ Alternative.Mat)',
        'Vật tư thay thế (Maint.Mat ↔ Alternative.Mat)',
        null,
        [
          bs(
            'Each quote can carry TWO parallel material sets — Maint.Mat (default) and Alternative.Mat — for what-if pricing or substrate-swap proposals.',
            'Mỗi báo giá có thể lưu HAI bộ vật tư song song — Maint.Mat (mặc định) và Alternative.Mat — phục vụ phân tích what-if hoặc đề xuất đổi substrate.'
          ),
          bs(
            'Click the radio toggle at the top of the table to switch. The badge on each pill shows the row count so you can tell which set has data.',
            'Click radio toggle ở đầu bảng để chuyển. Badge trên mỗi pill hiển thị số dòng để biết bộ nào đã có data.'
          ),
          bs(
            'Only the ACTIVE set drives TTL.MAT, Cost Breakdown, Summarize, Formal Quotation. The inactive set is stored but ignored.',
            'Chỉ bộ ĐANG ACTIVE driver TTL.MAT, Cost Breakdown, Summarize, Formal Quotation. Bộ còn lại được lưu nhưng không tính.'
          ),
          bs(
            'Use the ⇄ icon next to the toggle to copy one set onto the other (Main → Alt or Alt → Main). When the destination already has rows, a confirm modal warns before overwriting.',
            'Dùng icon ⇄ cạnh toggle để copy bộ này đè bộ kia (Main → Alt hoặc Alt → Main). Khi đích đã có dòng, modal confirm sẽ cảnh báo trước khi ghi đè.'
          ),
          bs(
            'Feature is gated by the OPS_FEATURE_ALT_MATERIALS server env var — when off (prod default), the toggle is hidden and only Maint.Mat is shown, matching legacy behavior. Ask your admin to flip the flag when the workflow is approved for your site.',
            'Tính năng được gate bằng env var OPS_FEATURE_ALT_MATERIALS trên server — khi off (mặc định prod), toggle bị ẩn và chỉ hiển thị Maint.Mat, hành vi giống cũ. Liên hệ admin để bật khi workflow được phê duyệt cho site.'
          ),
          bs(
            'Per-tier Setup LM overrides (PR #C) — editing the per-MOQ-tier Setup LM in the header table writes to the ACTIVE set only. Switch to Alternative.Mat first if you want different per-tier values for the alt rows; otherwise the alt rows inherit their base Setup LM values when alt-mode active and no _alt-tier override is set.',
            'Setup LM ghi đè theo tier MOQ (PR #C) — chỉnh Setup LM trong bảng per-MOQ ở header chỉ ghi vào bộ ĐANG ACTIVE. Switch sang Alternative.Mat trước nếu muốn per-tier values khác cho alt rows; nếu không, alt rows kế thừa Setup LM gốc khi alt-mode active mà chưa có _alt-tier override.'
          ),
          bs(
            'Quote History row shows a Main / Alt / Mixed badge so reviewers spot which set was driving each saved quote without opening it. Cpx quote with mixed per-SP active states shows "Mixed (N alt / M main)" with the SP counts.',
            'Row Quote History hiển thị badge Main / Alt / Mixed để reviewer biết bộ nào đang driver giá báo mỗi quote mà không cần mở. Cpx quote với trạng thái mixed per-SP hiển thị "Mixed (N alt / M main)" với số SP tương ứng.'
          ),
        ]
      ),
    ],
    // Sprint S-PRICING-COMBINED-P2 — Materials section now lives inside
    // the merged "Materials & Process" tab. Add standard-combined as
    // primary navigation target; keep 'standard' top-level + cross-links.
    relatedTabs: ['standard-combined', 'standard', 'standard-layout', 'lib-mat'],
    screenshot: null,
  },

  'lead-time-notice': {
    id: 'lead-time-notice',
    section: 'CALCULATORS',
    title: bi('Lead time & Notice', 'L/T & Ghi chú'),
    function: bi(
      'Capture per-quote tooling cost, lead times, and notice on the quotation cover sheet.',
      'Ghi chi phí tooling, lead time, và ghi chú cho mỗi báo giá.'
    ),
    path: 'Ops Cost > Pricing (Std) > Lead time & Notice / Pricing (Cpx) > Lead time & Notice',
    purpose: bi(
      'Single 1-row cover sheet for quotation metadata not driven by calc engine — tooling cost (auto-synced from Processes), supplier lead times (Material/Sample/PO), Remark, Process notes, Type of Material. Persists with quote on Save and round-trips via Quote History.',
      'Trang phụ 1 dòng cho metadata báo giá ngoài calc engine — chi phí tooling (tự cộng từ Processes), lead time nhà cung cấp (Vật liệu/Mẫu/PO), Ghi chú, Công đoạn, Loại vật liệu. Lưu cùng quote và round-trip qua Quote History.'
    ),
    whenToUse: bi(
      'Before sending quotation xlsx to customer — fill 6 free-text fields with supplier-provided lead times + tooling notes.',
      'Trước khi gửi xlsx báo giá cho khách — điền 6 ô free-text với lead time từ nhà cung cấp + ghi chú tooling.'
    ),
    preRequisites: [
      br(
        'Processes sub-tab populated (Tooling cost cell auto-derives from Σ Tool Cost; Std reads from state.processes, Cpx reads cross-SP from cplxState.subproducts[].processes).',
        'Sub-tab Processes đã điền (ô Tooling cost tự lấy Σ Tool Cost; Std đọc từ state.processes, Cpx đọc cross-SP từ cplxState.subproducts[].processes).'
      ),
    ],
    procedures: [
      proc('Tooling cost — read-only', 'Chi phí Tooling — chỉ-đọc', null, [
        bs(
          'Auto-syncs as Σ tool_cost from Processes tab — no manual entry. Edit happens on Processes/Calculators tab; switch back to Lead time & Notice to see updated total.',
          'Tự cộng tổng Σ tool_cost từ tab Processes — không nhập tay. Chỉnh ở tab Processes/Calculators rồi quay lại Lead time & Notice để thấy tổng cập nhật.'
        ),
        bs(
          'Cell hiển thị "$X,XXX.XX" (Intl USD format) hoặc "—" nếu tổng = 0. Lock icon 🔒 + cursor not-allowed báo hiệu read-only.',
          'Ô hiển thị "$X,XXX.XX" (định dạng USD) hoặc "—" nếu tổng = 0. Icon 🔒 + con trỏ not-allowed báo chỉ-đọc.'
        ),
      ]),
      proc('6 free-text cells', '6 ô free-text', null, [
        bs(
          'Material L/T — supplier lead time for raw material (e.g. "4 weeks").',
          'L/T Vật liệu — lead time nhà cung cấp vật liệu thô (vd "4 tuần").'
        ),
        bs(
          'Sample L/T — sample production lead time (e.g. "7 days").',
          'L/T Mẫu — lead time làm mẫu (vd "7 ngày").'
        ),
        bs(
          'PO L/T — PO-to-delivery lead time (e.g. "30 days from PO").',
          'L/T PO — lead time từ PO đến giao hàng (vd "30 ngày từ PO").'
        ),
        bs(
          'Remark — free-form notes; multi-line supported (Enter wraps inside cell).',
          'Ghi chú — văn bản tự do; hỗ trợ nhiều dòng (Enter xuống dòng trong ô).'
        ),
        bs(
          'Process — process-specific notes for the quotation cover sheet.',
          'Công đoạn — ghi chú công đoạn cụ thể cho trang bìa báo giá.'
        ),
        bs(
          'Type of Material (In quotation) — material type as it appears in customer quotation.',
          'Loại vật liệu (Báo giá) — loại vật liệu như xuất hiện trong báo giá khách.'
        ),
      ]),
      proc('Save + round-trip', 'Lưu + round-trip', null, [
        bs(
          'Click Save (top-right toolbar) to persist 6 fields with quote.state.lead_time. Newline characters in Remark preserve through JSON round-trip.',
          'Bấm Save (toolbar phải trên) để lưu 6 trường vào quote.state.lead_time. Ký tự xuống dòng trong Ghi chú được giữ qua JSON round-trip.'
        ),
        bs(
          'Reload quote via Quote History → 6 fields restore exactly. Legacy quote pre-feature loads empty 6 cells, no crash.',
          'Reload quote qua Quote History → 6 trường khôi phục y nguyên. Quote cũ trước feature mở ra 6 ô trống, không crash.'
        ),
      ]),
    ],
    tips: [
      bi(
        'Tab position: Pricing (Std) — between Pack & Ship and Cost Breakdown (P2 reorder, Sprint S-PRICING-COMBINED-P2). Pricing (Cpx) — last sub-tab, AFTER Summarize.',
        'Vị trí tab: Pricing (Std) — giữa Pack & Ship và Cost Breakdown (P2 reorder, Sprint S-PRICING-COMBINED-P2). Pricing (Cpx) — sub-tab cuối, SAU Summarize.'
      ),
      bi(
        'For Cpx, Tooling cost sums ACROSS all sub-products (cross-SP flatMap). Adding/removing SPs or per-SP processes auto-updates the total on next tab switch.',
        'Với Cpx, Tooling cost tổng cộng QUA TẤT CẢ sub-product (cross-SP flatMap). Thêm/xoá SP hoặc per-SP processes tự cập nhật khi switch tab.'
      ),
      bi(
        'Container query @900px stacks 7 cells into card view for narrow viewports / collapsed sidebar.',
        'Container query @900px xếp dọc 7 ô thành card view cho viewport hẹp / sidebar collapse.'
      ),
    ],
    // Sprint S-PRICING-COMBINED-P2 — pivot to standard-combined (new
    // primary tab); standard-process still reachable via search.
    relatedTabs: ['standard', 'standard-combined', 'quote-history'],
  },

  'standard-inks': {
    id: 'standard-inks',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Inks', 'Bảng tính giá — Mực in'),
    function: bi(
      'Per-color ink consumption + cost for Standard quote',
      'Tiêu thụ mực từng màu + chi phí cho báo giá Standard'
    ),
    path: 'Ops Cost > Pricing (Std) > Materials & Process (Inks section)',
    purpose: bi(
      'Note: this section now lives inside the Materials & Process tab (Sprint S-PRICING-COMBINED-P2, 2026-06-18). This help entry is preserved as a deep-dive on the Inks section; the operator-facing tab is "Materials & Process". Per-ink µL/label and total ink cost. Pulls volumes from Print Area Calc when imported; falls back to method defaults otherwise.',
      'Lưu ý: section này giờ nằm trong tab Vật tư & Công đoạn (Sprint S-PRICING-COMBINED-P2, 2026-06-18). Entry help này được giữ làm tra cứu sâu cho section Mực; tab operator nhìn thấy là "Vật tư & Công đoạn". µL/nhãn và chi phí mực tổng. Lấy volume từ Print Area khi import; fallback defaults nếu không.'
    ),
    whenToUse: bi(
      'After Material sub-tab. Critical when ink > 5% of total cost.',
      'Sau sub-tab Material. Quan trọng khi mực > 5% tổng chi phí.'
    ),
    preRequisites: [
      br(
        'Print method selected in header; Print Area run for this SKU (recommended).',
        'Đã chọn công nghệ in trong header; đã chạy Print Area cho SKU (khuyến nghị).'
      ),
    ],
    procedures: [
      proc('Ink count', 'Số màu', null, [
        bs('Enter Number of inks (the separation count).', 'Nhập Số màu (số separation).'),
        bs('Table shows one row per ink.', 'Bảng hiển thị một dòng mỗi màu.'),
      ]),
      proc(
        'Import from Print Area',
        'Import từ Print Area',
        bi(
          'Biggest accuracy win — replaces ink-count-based defaults with real pixel measurements.',
          'Cú bứt chính xác lớn nhất — thay mặc định theo số màu bằng đo pixel thực tế.'
        ),
        [
          bs(
            'Click ← Import from Print Area in toolbar.',
            'Click ← Import from Print Area trên toolbar.'
          ),
          bs(
            'System matches by SKU; µL/label auto-fills per row.',
            'Hệ thống match theo SKU; µL/nhãn tự điền từng dòng.'
          ),
          bs(
            'If no match found, fill manually (see defaults table below).',
            'Nếu không match, nhập thủ công (xem bảng mặc định bên dưới).'
          ),
        ]
      ),
      proc('Per-ink adjustment', 'Điều chỉnh từng màu', null, [
        bs(
          'Override ink name (e.g. "Red 485C") for the customer-facing quote.',
          'Ghi đè tên mực (vd "Red 485C") cho báo giá khách thấy.'
        ),
        bs(
          'Unit cost / mL — auto-pulled from Material Library (ink category).',
          'Đơn giá / mL — tự lấy từ Material Library (danh mục mực).'
        ),
        bs(
          'Waste % per ink — press tank min level drives this (5-10% typical).',
          'Waste % mỗi màu — mức tối thiểu bồn mực máy quyết định (thường 5-10%).'
        ),
      ]),
    ],
    // Sprint S-PRICING-COMBINED-P2 — Inks section now lives inside the
    // merged "Materials & Process" tab. standard-combined as primary nav.
    relatedTabs: ['standard-combined', 'standard', 'ink-calc', 'print-area'],
    screenshot: null,
  },

  'standard-process': {
    id: 'standard-process',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Processes', 'Bảng tính giá — Công đoạn'),
    function: bi(
      'Configure process routing (work-centers, setup, run rate) per tier',
      'Cấu hình routing (work-center, setup, tốc độ) theo bậc'
    ),
    path: 'Ops Cost > Pricing (Std) > Materials & Process (Processes section)',
    purpose: bi(
      'Note: this section now lives inside the Materials & Process tab (Sprint S-PRICING-COMBINED-P2, 2026-06-18). This help entry is preserved as a deep-dive on the Processes section; the operator-facing tab is "Materials & Process". Each process row = one operation on the routing. Drives labor + machine cost across all MOQ tiers.',
      'Lưu ý: section này giờ nằm trong tab Vật tư & Công đoạn (Sprint S-PRICING-COMBINED-P2, 2026-06-18). Entry help này được giữ làm tra cứu sâu cho section Công đoạn; tab operator nhìn thấy là "Vật tư & Công đoạn". Mỗi process row = 1 công đoạn trên routing. Ảnh hưởng labor + chi phí máy cho mọi bậc MOQ.'
    ),
    whenToUse: bi(
      'After Inks. Use Balancing sub-tab if press has capacity bottleneck.',
      'Sau Inks. Dùng Balancing nếu máy tới hạn.'
    ),
    preRequisites: [
      br(
        'Routing Ops library populated; Rate Table current.',
        'Thư viện Routing Ops có data; Rate Table up-to-date.'
      ),
    ],
    procedures: [
      proc('Add process row', 'Thêm process row', null, [
        bs('Click + Add Process Row.', 'Click + Add Process Row.'),
        bs(
          'Pick Process Type (Print / Cut / Laminate / Slit / Rewind / QC).',
          'Chọn Loại công đoạn (Print / Cut / Laminate / Slit / Rewind / QC).'
        ),
        bs(
          'Pick Work-center → hourly rate auto-loads from Rate Table.',
          'Chọn Work-center → đơn giá/giờ tự load từ Rate Table.'
        ),
        bs(
          'Setup hours + Run rate + Yield populate from Routing Ops library.',
          'Setup hours + Run rate + Yield tự điền từ thư viện Routing Ops.'
        ),
        bs('Override for press-specific anomalies.', 'Ghi đè cho bất thường riêng của máy.'),
      ]),
      proc(
        'Layout batch count',
        'Layout batch',
        bi(
          'Required for machine work-centers. Usage bumps from 0 → 1 → 2 as the operation consumes sheets in batches.',
          'Bắt buộc cho work-center loại máy. Usage tăng từ 0 → 1 → 2 khi công đoạn tiêu thụ sheet theo batch.'
        ),
        [
          bs(
            'Set Layout / batch count — how many layouts run per press-hour.',
            'Đặt Layout / batch count — bao nhiêu layout chạy mỗi giờ máy.'
          ),
          bs(
            'Machine workcenters REQUIRE this > 0; manual skips.',
            'Work-center loại máy BẮT BUỘC > 0; thủ công có thể bỏ qua.'
          ),
        ]
      ),
      proc('Per-tier tuning', 'Tuỳ chỉnh theo bậc', null, [
        bs(
          'Each process has N copies (one per MOQ tier from Layout).',
          'Mỗi process có N bản (một cho mỗi bậc MOQ từ Layout).'
        ),
        bs(
          'Override setup/run rate per-tier ONLY if the press behavior differs at scale (rare).',
          'Ghi đè setup/run rate theo từng bậc CHỈ khi máy hoạt động khác theo quy mô (hiếm).'
        ),
        bs(
          'Visible column toggle: show/hide tiers to reduce horizontal scroll.',
          'Toggle cột hiển thị: ẩn/hiện bậc để giảm scroll ngang.'
        ),
      ]),
    ],
    // Sprint S-PRICING-COMBINED-P2 — Processes section now lives inside
    // the merged "Materials & Process" tab. standard-combined as primary nav.
    relatedTabs: ['standard-combined', 'standard', 'standard-balancing', 'lib-rop', 'lib-rate'],
    screenshot: null,
  },

  'standard-combined': {
    id: 'standard-combined',
    section: 'CALCULATORS',
    // Sprint S-PRICING-COMBINED-P2 (2026-06-18) — this is now the PRIMARY
    // pricing-phase tab. The 3 standalone tabs (Materials / Inks /
    // Processes) were retired; their help entries remain as section-level
    // documentation but the operator-facing tab is "Materials & Process".
    title: bi('Pricing Worksheet — Materials & Process', 'Bảng tính giá — Vật tư & Công đoạn'),
    function: bi(
      'Sole pricing-phase surface for Standard quote — Materials + Inks + Processes stacked in one scrollable tab',
      'Surface pricing-phase duy nhất cho báo giá Standard — Vật tư + Mực + Công đoạn xếp chồng trong một tab cuộn dọc'
    ),
    path: 'Ops Cost > Pricing (Std) > Materials & Process',
    purpose: bi(
      'Replaces the 3 retired sub-tabs (Materials / Inks / Processes — retired in Phase 2 of S-PRICING-COMBINED roadmap). Renders all three sections stacked under bold section headings; cross-section live updates work because all 3 share the same React state via useCalc(). Mirrors the Cpx SubProductRow layout.',
      'Thay thế 3 sub-tab đã gỡ (Materials / Inks / Processes — gỡ ở Phase 2 của lộ trình S-PRICING-COMBINED). Render cả 3 section xếp chồng dưới heading section in đậm; cross-section live update hoạt động vì cả 3 dùng chung React state qua useCalc(). Giống layout SubProductRow của Cpx.'
    ),
    whenToUse: bi(
      'When you want to see all pricing-phase data without tab-switching — useful for cross-section sanity checks (e.g. process workcenter ↔ ink RUN cost live update) or for a guided walk-through with a reviewer.',
      'Khi muốn nhìn toàn bộ data pricing-phase mà không cần chuyển tab — hữu ích cho cross-section sanity check (vd workcenter công đoạn ↔ ink RUN cost cập nhật live) hoặc walk-through cùng reviewer.'
    ),
    preRequisites: [
      br(
        'Layout sub-tab completed; Material Library populated.',
        'Sub-tab Layout đã xong; Material Library đã có data.'
      ),
    ],
    procedures: [
      proc('Scrolling pattern', 'Mẫu cuộn dọc', null, [
        bs(
          'Sections appear in workflow order: Materials → Inks → Processes. Bold section headings mark each phase boundary.',
          'Các section xuất hiện theo thứ tự workflow: Vật tư → Mực → Công đoạn. Heading section in đậm đánh dấu ranh giới mỗi phase.'
        ),
        bs(
          'All field inputs (Materials usage, Ink AREA%, Process setup_h, etc.) behave identically to the standalone sub-tabs — same warnings (red borders), same alt-materials toggle, same MOQ-tier override bar.',
          'Tất cả input (Usage vật tư, AREA% mực, setup_h công đoạn, v.v.) hoạt động giống hệt sub-tab độc lập — cùng warning (viền đỏ), cùng alt-materials toggle, cùng MOQ-tier override bar.'
        ),
      ]),
      proc('Cross-section live update', 'Cập nhật live giữa các section', null, [
        bs(
          'Edit a process workcenter → the ink RUN cost on the same screen updates immediately (no tab switch needed). All 3 sections share the same React state via useCalc().',
          'Sửa workcenter công đoạn → ink RUN cost trên cùng màn hình cập nhật ngay (không cần chuyển tab). Cả 3 section dùng chung React state qua useCalc().'
        ),
      ]),
      proc('Section deep dives', 'Tra cứu chi tiết từng section', null, [
        bs(
          'For deep field-by-field documentation of each section, see the Materials / Inks / Processes help entries via search — they retain the original detail content from when those were standalone tabs.',
          'Để tra cứu chi tiết từng field của mỗi section, mở các help entry Materials / Inks / Processes qua search — chúng giữ nguyên nội dung chi tiết từ thời còn là tab độc lập.'
        ),
      ]),
    ],
    // Sprint S-PRICING-COMBINED-P2 — the 3 standalone help entries
    // remain as section documentation (reachable via search). Listed
    // first as related-tabs because they're the per-section deep dives;
    // 'standard' is the parent calculator entry.
    relatedTabs: ['standard-material', 'standard-inks', 'standard-process', 'standard'],
    screenshot: null,
  },

  'standard-balancing': {
    id: 'standard-balancing',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Process Balancing', 'Bảng tính giá — Cân bằng Công đoạn'),
    function: bi(
      'Identify the bottleneck operation + compute realistic lead-time',
      'Xác định công đoạn bottleneck + tính lead-time thực tế'
    ),
    path: 'Ops Cost > Pricing (Std) >Balancing',
    purpose: bi(
      'Gantt-style view of process durations per tier. Highlights the bottleneck and proposes parallelization.',
      'View Gantt thời lượng process theo bậc. Highlight bottleneck và gợi ý chạy song song.'
    ),
    whenToUse: bi(
      'Tight delivery; multiple presses available; considering overtime.',
      'Giao hàng gấp; nhiều máy; cân nhắc tăng ca.'
    ),
    preRequisites: [
      br(
        'Processes sub-tab filled with work-center + rates.',
        'Sub-tab Processes đã điền work-center + đơn giá.'
      ),
    ],
    procedures: [
      proc('Review per-tier timings', 'Xem thời lượng từng bậc', null, [
        bs(
          'Chart rows = process steps; bar length = run time.',
          'Dòng chart = các bước process; độ dài bar = thời gian chạy.'
        ),
        bs(
          'Red bar = bottleneck (longest-running op at that tier).',
          'Bar đỏ = bottleneck (công đoạn chạy lâu nhất ở bậc đó).'
        ),
        bs(
          'Hover for start/end times + work-center.',
          'Hover để xem thời gian start/end + work-center.'
        ),
      ]),
      proc('What-if parallelization', 'What-if chạy song song', null, [
        bs(
          'Click any bottleneck bar → suggestion: "Run on 2 machines, save X h".',
          'Click bar bottleneck → gợi ý: "Chạy 2 máy, tiết kiệm X h".'
        ),
        bs(
          'Apply → new process row added at half the run time each.',
          'Apply → dòng process mới thêm với một nửa thời gian mỗi máy.'
        ),
        bs(
          'Review cost impact on the Cost Breakdown tab.',
          'Xem ảnh hưởng chi phí trên tab Cost Breakdown.'
        ),
      ]),
    ],
    // Sprint S-PRICING-COMBINED-P2 — Balancing reads Process data which
    // now lives inside the merged "Materials & Process" tab.
    relatedTabs: ['standard-combined', 'standard'],
    screenshot: null,
  },

  'standard-cost-breakdown': {
    id: 'standard-cost-breakdown',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Cost Breakdown', 'Bảng tính giá — Cơ cấu Chi phí'),
    function: bi(
      'Read-only itemised cost waterfall per MOQ tier + Pricing Snapshot panel',
      'Waterfall chi phí read-only theo từng bậc MOQ + panel Pricing Snapshot'
    ),
    path: 'Ops Cost > Pricing (Std) > Cost Breakdown',
    purpose: bi(
      'Read-only review surface. Shows every cost line at every tier (Material / Ink / Labor / Machine / Overhead / Packing / VAT / Extra) computed live from current state and the active pricing snapshot. Pricing Snapshot panel + Copy-mode banner at the bottom expose which library rates drove the numbers.',
      'Surface review chỉ-đọc. Hiển thị mọi dòng chi phí × mọi bậc (Vật tư / Mực / Nhân công / Máy / Overhead / Packing / VAT / Extra) tính live từ state hiện tại và snapshot pricing đang active. Panel Pricing Snapshot + banner Copy-mode ở dưới cho biết library rate nào driver ra số này.'
    ),
    whenToUse: bi(
      'Last review before Summarize. Confirm each cost line looks reasonable; check Snapshot panel to see if rates are frozen (saved snapshot) or live (recomputed against current library).',
      'Review cuối trước Summarize. Xác nhận mỗi dòng hợp lý; check panel Snapshot để biết rate đã frozen (snapshot đã lưu) hay live (tính lại theo library hiện tại).'
    ),
    preRequisites: [
      br(
        'Materials & Process tab filled, Layout configured.',
        'Tab Materials & Process đã điền, Layout đã cấu hình.'
      ),
    ],
    procedures: [
      proc('Read the cost matrix', 'Đọc matrix chi phí', null, [
        bs(
          'Rows: Material / Ink / Labor (per process) / Machine (per process) / Overhead / Packing & Ship / VAT Loss / Extra.',
          'Dòng: Vật tư / Mực / Nhân công (mỗi process) / Máy (mỗi process) / Overhead / Packing & Ship / VAT Loss / Extra.'
        ),
        bs(
          'Columns: one per MOQ tier; active-tier column is highlighted.',
          'Cột: một cột mỗi bậc MOQ; cột tier đang active được highlight.'
        ),
        bs(
          'No drill-down modal in the shipped UI — cells are display-only. Read by row to verify each cost component.',
          'Không có modal drill-down trong UI hiện tại — các ô chỉ hiển thị. Đọc theo dòng để xác nhận từng thành phần chi phí.'
        ),
      ]),
      proc(
        'Pricing Snapshot panel (Phase 4)',
        'Panel Pricing Snapshot (Phase 4)',
        bi(
          'Native <details> at the BOTTOM of Cost Breakdown. Click to expand/collapse. Shows 5 audit fields with one of 3 source-tone badges.',
          '<details> native ở DƯỚI CÙNG Cost Breakdown. Click để mở/đóng. Hiển thị 5 trường audit với một trong 3 badge tone-source.'
        ),
        [
          bs(
            '🟢 persisted — snapshot was captured at save time; numbers are frozen against the library version at that moment.',
            '🟢 persisted — snapshot đã capture tại thời điểm save; số đã frozen theo phiên bản library lúc đó.'
          ),
          bs(
            '🟡 synthesized — quote was loaded but no snapshot persisted yet; numbers are recomputed live against current library rates.',
            '🟡 synthesized — quote load nhưng chưa có snapshot persisted; số tính lại live theo rate library hiện tại.'
          ),
          bs(
            '⚪ empty — no snapshot data; numbers also live but with no audit trail.',
            '⚪ empty — không có dữ liệu snapshot; số cũng live nhưng không có audit trail.'
          ),
          bs(
            'Panel surfaces: Quote saved at, Pricing captured at, Pricing captured by, Site, Library version. Warnings (e.g. site_mismatch) appear in the panel when the saved snapshot site differs from current state.',
            'Panel hiện: Quote saved at, Pricing captured at, Pricing captured by, Site, Library version. Warning (vd site_mismatch) xuất hiện khi site snapshot đã lưu khác state hiện tại.'
          ),
        ]
      ),
      proc(
        'Copy-mode banner',
        'Banner Copy-mode',
        bi(
          "Blue banner appears at top of the Pricing Worksheet (Cost Breakdown sub-tab included) when the operator right-clicked Copy on a quote in Quote History. Surfaces that this is a COPY — saving will create a NEW quote and freeze CURRENT library rates (not the original quote's frozen snapshot).",
          'Banner xanh xuất hiện ở đầu Pricing Worksheet (gồm sub-tab Cost Breakdown) khi operator right-click Copy quote trên Quote History. Báo hiệu đây là một COPY — save sẽ tạo quote MỚI và freeze rate library HIỆN TẠI (không phải snapshot frozen của quote gốc).'
        ),
        [
          bs(
            'Banner text: "Copy mode — saving will create a new quote and freeze current library rates".',
            'Text banner: "Copy mode — save sẽ tạo quote mới và freeze rate library hiện tại".'
          ),
          bs(
            'Detected via isCopyMode(state, activeQuoteId); banner persists until you save (or discard) the copy.',
            'Detect qua isCopyMode(state, activeQuoteId); banner còn cho tới khi bạn save (hoặc bỏ) copy.'
          ),
        ]
      ),
    ],
    relatedTabs: ['standard', 'standard-summarize', 'summarize', 'quote-history'],
    screenshot: null,
  },

  'standard-pack-ship': {
    id: 'standard-pack-ship',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Packing & Ship', 'Bảng tính giá — Đóng gói & Vận chuyển'),
    function: bi(
      'Packaging material cost + freight estimate',
      'Chi phí bao bì + ước tính cước vận chuyển'
    ),
    path: 'Ops Cost > Pricing (Std) >Pack & Ship',
    purpose: bi(
      'Roll/box packaging + pallet + freight. Often 2-5% of total cost but makes the difference on low-margin jobs.',
      'Đóng gói cuộn/thùng + pallet + cước. Thường 2-5% tổng, nhưng quyết định job margin thấp.'
    ),
    whenToUse: bi(
      'Always for export quotes (Incoterms CIF / DDP); optional for EXW-local.',
      'Luôn làm với quote xuất khẩu (CIF / DDP); optional với EXW-nội địa.'
    ),
    preRequisites: [
      br(
        'Material sub-tab completed for net weight calc.',
        'Sub-tab Material đã điền để tính net weight.'
      ),
    ],
    procedures: [
      proc('Roll/Box config', 'Cấu hình cuộn/thùng', null, [
        bs(
          'Pick Roll core type (3-inch / 6-inch) OR Box type for sheet-fed.',
          'Chọn loại lõi cuộn (3-inch / 6-inch) HOẶC loại thùng cho sheet-fed.'
        ),
        bs(
          'Labels per roll / sheets per box — drives box count.',
          'Số nhãn/cuộn hoặc sheet/thùng — quyết định số thùng.'
        ),
        bs(
          'Core + box unit cost auto-pulled from Material Library (Packaging category).',
          'Đơn giá lõi + thùng tự lấy từ Material Library (danh mục Packaging).'
        ),
      ]),
      proc('Pallet', 'Pallet', null, [
        bs('Boxes per pallet (typical 24-48).', 'Số thùng/pallet (thường 24-48).'),
        bs('Pallet type (wood / plastic) from LOV.', 'Loại pallet (gỗ / nhựa) từ LOV.'),
        bs(
          'Stretch-wrap + strap cost auto-included.',
          'Chi phí stretch-wrap + dây đai tự bao gồm.'
        ),
      ]),
      proc('Freight', 'Cước vận chuyển', null, [
        bs(
          'Pick Incoterms (EXW / FOB / CIF / DDP) and enter the shipping / other-ship costs directly. There is no freight library or origin → destination auto-lookup in the shipped UI.',
          'Chọn Incoterms (EXW / FOB / CIF / DDP) và nhập trực tiếp chi phí shipping / other-ship. UI hiện không có thư viện freight hoặc auto-lookup điểm đi → điểm đến.'
        ),
      ]),
      proc(
        'Per-MOQ-tier overrides (Sprint S-PACK-SHIP-PER-TIER)',
        'Override theo bậc MOQ (Sprint S-PACK-SHIP-PER-TIER)',
        bi(
          'Tier 0 (MOQ 1) is the base; tier > 0 panes carry an inherit hint banner at the top — values cascade from MOQ 1 unless you override per tier.',
          'Tier 0 (MOQ 1) là cơ sở; pane tier > 0 có banner gợi ý inherit ở trên cùng — giá trị thừa kế từ MOQ 1 trừ khi bạn override theo bậc.'
        ),
        [
          bs(
            'Switch the active MOQ tier from the Pricing header. Tier > 0 shows the `.sc-pack-tier-hint` inherit banner explaining override mode.',
            'Chuyển active MOQ tier từ header Pricing. Tier > 0 hiển thị banner inherit `.sc-pack-tier-hint` giải thích chế độ override.'
          ),
          bs(
            'Type a value into any of the 5 cells (container_cost / box_cost / other_packing / shipping_cost / other_ship) at tier > 0 → cell flips to `.sc-pack-tier-ovr` (violet + bold) marking it as an operator override.',
            'Gõ giá trị vào 1 trong 5 ô (container_cost / box_cost / other_packing / shipping_cost / other_ship) ở tier > 0 → ô đổi sang `.sc-pack-tier-ovr` (tím + đậm) đánh dấu override của operator.'
          ),
          bs(
            'Inherited (un-overridden) cells render as `.sc-pack-tier-inherit` (gray italic) showing the MOQ 1 base value live.',
            'Ô thừa kế (chưa override) hiển thị `.sc-pack-tier-inherit` (xám in nghiêng) hiện giá trị base MOQ 1 live.'
          ),
          bs(
            'Click the ↻ reset button beside an overridden cell to remove the override and revert to MOQ 1 base. Clearing the field to empty also reverts (`preserveEmpty` opt-in on the 5 fields).',
            'Click nút ↻ reset bên cạnh ô đã override để bỏ override và quay về base MOQ 1. Xoá ô về rỗng cũng revert (opt-in `preserveEmpty` trên 5 ô đó).'
          ),
          bs(
            'Totals (Total Packing/pcs + Total Shipping/pcs) compute from the active-tier-merged state, so the override effect is visible immediately.',
            'Tổng (Total Packing/pcs + Total Shipping/pcs) tính từ state đã merge theo active-tier, nên hiệu ứng override hiển thị ngay.'
          ),
        ]
      ),
    ],
    relatedTabs: ['standard', 'lib-mat'],
    screenshot: null,
  },

  'standard-summarize': {
    id: 'standard-summarize',
    section: 'CALCULATORS',
    title: bi('Pricing Worksheet — Summarize', 'Bảng tính giá — Tóm tắt'),
    function: bi(
      'Read-only KPI dashboard for the active MOQ tier + Process Flow chart',
      'Bảng KPI chỉ-đọc cho bậc MOQ đang active + biểu đồ Process Flow'
    ),
    path: 'Ops Cost > Pricing (Std) > Summarize',
    purpose: bi(
      '6 KPI cards (MOQ qty, Total Cost, Selling Price, VA%, Contr%, GM%) computed live against the active tier + active pricing snapshot. ProcessFlowChart renders below. No data entry on this sub-tab — margin / price targets are set on the Pricing (Std) header (RFQ & MOQ Info).',
      '6 thẻ KPI (MOQ qty, Total Cost, Selling Price, VA%, Contr%, GM%) tính live theo bậc đang active + snapshot pricing đang active. ProcessFlowChart hiển thị bên dưới. Không nhập liệu trên sub-tab này — target margin / price đặt ở header Pricing (Std) (RFQ & MOQ Info).'
    ),
    whenToUse: bi(
      'Last sub-tab review before Save. Verify the active-tier KPIs (especially GM%, VA%, Contr%) match expectations.',
      'Review sub-tab cuối trước khi Save. Xác nhận các KPI của tier đang active (đặc biệt GM%, VA%, Contr%) khớp kỳ vọng.'
    ),
    preRequisites: [
      br(
        'Materials & Process tab filled (replaces the retired Layout / Material / Inks / Process tabs — see Sprint S-PRICING-COMBINED-P2).',
        'Tab Materials & Process đã điền (thay cho các tab Layout / Material / Inks / Process đã retire — xem Sprint S-PRICING-COMBINED-P2).'
      ),
      br(
        'Layout sub-tab configured (drives QPA / yield).',
        'Sub-tab Layout đã cấu hình (driver QPA / yield).'
      ),
    ],
    procedures: [
      proc('Read the 6 KPI cards', 'Đọc 6 thẻ KPI', null, [
        bs(
          'MOQ N — active tier index + EA quantity. Total Cost — USD/unit (computed s_ttl). Selling Price — USD/unit per the active tier.',
          'MOQ N — chỉ số tier đang active + số lượng EA. Total Cost — USD/đơn vị (s_ttl tính). Selling Price — USD/đơn vị theo tier đang active.'
        ),
        bs(
          'VA% (Value Add), Contr% (Contribution), GM% (Gross Margin) — color-coded; GM% uses gmClr threshold (red if below floor).',
          'VA% (Value Add), Contr% (Contribution), GM% (Gross Margin) — color-code; GM% dùng ngưỡng gmClr (đỏ nếu dưới sàn).'
        ),
        bs(
          'Hover each card for the KPI tooltip (formula from KPI_TOOLTIPS).',
          'Hover từng thẻ để xem tooltip KPI (công thức từ KPI_TOOLTIPS).'
        ),
      ]),
      proc('Process Flow chart', 'Biểu đồ Process Flow', null, [
        bs(
          'Below the KPIs, ProcessFlowChart renders the routing of `state.processes` as a directed chain. Read-only visualisation; edit happens in the Materials & Process tab.',
          'Dưới KPI, ProcessFlowChart render routing của `state.processes` thành chuỗi directed. Visualisation chỉ-đọc; edit ở tab Materials & Process.'
        ),
      ]),
      proc(
        'Save + submit (toolbar at top of Pricing Std)',
        'Save + submit (toolbar trên cùng Pricing Std)',
        bi(
          'The Save button lives in the Pricing Std header toolbar, NOT on this sub-tab. Save opens the SaveChoiceModal (Save as new vs Update existing) for existing quotes.',
          'Nút Save nằm trong toolbar header Pricing Std, KHÔNG ở sub-tab này. Save mở SaveChoiceModal (Save as new vs Update existing) cho quote có sẵn.'
        ),
        [
          bs(
            'Click Save in the toolbar → SaveChoiceModal appears for existing quotes; brand-new quotes save straight away.',
            'Click Save trên toolbar → SaveChoiceModal xuất hiện cho quote có sẵn; quote mới hoàn toàn save thẳng.'
          ),
          bs(
            'Ctrl/Cmd+S also triggers Save when the calculator pane is focused.',
            'Ctrl/Cmd+S cũng kích hoạt Save khi pane calculator đang focus.'
          ),
        ]
      ),
    ],
    relatedTabs: [
      'standard',
      'standard-cost-breakdown',
      'summarize',
      'formal-quote',
      'approvals-inbox',
    ],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // COMPLEX CALC — sub-tabs
  // ─────────────────────────────────────────────────────────────

  'complex-project': {
    id: 'complex-project',
    section: 'CALCULATORS',
    subSection: 'calculators',
    title: bi('Pricing (Complex) — RFQ & MOQ info', 'Bảng tính giá (Phức tạp) — RFQ & MOQ info'),
    function: bi(
      'Cover-sheet identity + MOQ-tier setup for a Complex quote',
      'Trang bìa identity + thiết lập bậc MOQ cho báo giá Complex'
    ),
    path: 'Ops Cost > Pricing (Cpx) > RFQ & MOQ info',
    purpose: bi(
      'First sub-tab. Captures customer / project identity (RFQ number, Sale Owner, Direct/End Customer, Options notes) and configures the MOQ tiers + EAU / VND-USD price targets that drive every downstream sub-product.',
      'Sub-tab đầu tiên. Ghi identity khách / project (RFQ number, Sale Owner, Direct/End Customer, ghi chú Options) và cấu hình bậc MOQ + target EAU / VND-USD áp xuống mọi sub-product.'
    ),
    whenToUse: bi(
      'Open first when creating a new Complex quote — every other sub-tab reads from this state slice.',
      'Mở đầu tiên khi tạo Complex quote mới — mọi sub-tab khác đọc từ state slice này.'
    ),
    procedures: [
      proc('Identity block', 'Khối identity', null, [
        bs(
          'Fill RFQ Number, Sale Owner, Direct/End Customer, Project — same fields as Std header.',
          'Điền RFQ Number, Sale Owner, Direct/End Customer, Project — cùng các trường với header Std.'
        ),
        bs(
          'Options textarea captures free-text quote notes (surfaces as the Option column on Quote History).',
          'Textarea Options ghi ghi chú free-text cho báo giá (hiển thị thành cột Option trên Quote History).'
        ),
      ]),
      proc('MOQ tiers + price targets', 'Bậc MOQ + target giá', null, [
        bs(
          'Configure tier 1 (base MOQ) + up to 4 additional tiers with EAU + Price USD / VND + target margin.',
          'Cấu hình bậc 1 (MOQ cơ sở) + tối đa 4 bậc thêm với EAU + Price USD / VND + target margin.'
        ),
        bs(
          'Tier dispatch routes Cpx-side writes through SET_CPLX_EXTRA_MOQ (MES-3-FIX-53) so values land on cplxState slice (data-loss bug fixed 2026-06-16).',
          'Dispatch tier chạy qua SET_CPLX_EXTRA_MOQ (MES-3-FIX-53) để giá trị landed đúng slice cplxState (bug data-loss fix 2026-06-16).'
        ),
      ]),
    ],
    relatedTabs: ['complex', 'complex-calculators', 'complex-bom-tree', 'complex-summary'],
    screenshot: null,
  },

  'complex-calculators': {
    id: 'complex-calculators',
    section: 'CALCULATORS',
    subSection: 'calculators',
    title: bi('Pricing (Complex) — Calculators', 'Bảng tính giá (Phức tạp) — Calculators'),
    function: bi(
      'Per-sub-product calculator rows (Materials + Inks + Processes) for every BOM SP',
      'Dòng calculator cho từng sub-product (Vật tư + Mực + Công đoạn) cho mọi SP của BOM'
    ),
    path: 'Ops Cost > Pricing (Cpx) > Calculators',
    purpose: bi(
      'The main data-entry surface for Complex. Renders one `SubProductRow` per sub-product — each SP has its own Materials / Inks / Processes sections (same shape as the Std Combined tab, scoped per SP via `cplxState.subproducts[i]`).',
      'Surface nhập liệu chính cho Complex. Render một `SubProductRow` cho mỗi sub-product — mỗi SP có riêng các section Materials / Inks / Processes (cùng shape với tab Combined của Std, scope theo SP qua `cplxState.subproducts[i]`).'
    ),
    whenToUse: bi(
      'After RFQ & MOQ info. This is where most of the per-SP work happens — material rows, ink rows, process routing per sub-product.',
      'Sau RFQ & MOQ info. Đây là nơi diễn ra phần lớn công việc per-SP — material rows, ink rows, process routing cho mỗi sub-product.'
    ),
    procedures: [
      proc('Add / edit sub-products', 'Thêm / sửa sub-product', null, [
        bs(
          'Each SP block is collapsible — click the header to expand/collapse. Use the BOM Tree sub-tab to add/remove SPs at higher levels.',
          'Mỗi block SP có thể thu gọn — click header để mở/đóng. Dùng sub-tab BOM Tree để thêm/xoá SP ở cấp cao hơn.'
        ),
        bs(
          'Per-SP alt-materials toggle (Maint.Mat ↔ Alternative.Mat) lives in each SP block — independent of other SPs.',
          'Toggle alt-materials per-SP (Maint.Mat ↔ Alternative.Mat) nằm trong mỗi block SP — độc lập với SP khác.'
        ),
      ]),
      proc('Cross-SP per-tier overrides', 'Override cross-SP theo tier', null, [
        bs(
          'MOQ tier dispatch routes per-SP material setup_lm and process setup_h overrides through the cplxState slice — switch active tier to apply.',
          'Dispatch tier MOQ chạy qua slice cplxState cho override per-SP material setup_lm và process setup_h — chuyển active tier để áp dụng.'
        ),
      ]),
    ],
    relatedTabs: ['complex', 'complex-project', 'complex-bom-tree', 'complex-cost-breakdown'],
    screenshot: null,
  },

  'complex-bom-tree': {
    id: 'complex-bom-tree',
    section: 'CALCULATORS',
    title: bi('Pricing (Complex) — BOM Tree', 'Bảng tính giá (Phức tạp) — Cây BOM'),
    function: bi('Visualize the multi-level BOM structure', 'Hiển thị cấu trúc BOM nhiều cấp'),
    path: 'Ops Cost > Pricing (Cpx) >BOM Tree',
    purpose: bi(
      'Tree view of the BOM levels. Expand/collapse + drag to reorganize. This is how the multi-level Complex calc is visualized.',
      'Dạng cây của các cấp BOM. Expand/collapse + drag để tổ chức lại. Đây là cách hiển thị Complex calc nhiều cấp.'
    ),
    whenToUse: bi(
      'When a BOM has 3+ levels and the flat sub-product rows become hard to follow.',
      'Khi BOM có 3+ cấp và danh sách sub-product phẳng trở nên khó theo dõi.'
    ),
    preRequisites: [
      br(
        'BOM structure defined in Mfg Structures or inline.',
        'Cấu trúc BOM định nghĩa trong Mfg Structures hoặc inline.'
      ),
    ],
    procedures: [
      proc('Expand / collapse', 'Mở rộng / thu gọn', null, [
        bs(
          'Click ▸ icon on any level to expand its children.',
          'Click icon ▸ trên cấp bất kỳ để mở rộng con.'
        ),
        bs('Click ▾ to collapse.', 'Click ▾ để thu gọn.'),
        bs(
          'Ctrl+click any level to expand all descendants at once.',
          'Ctrl+click cấp bất kỳ để mở rộng tất cả con cháu.'
        ),
      ]),
      proc('Add / remove levels', 'Thêm / xoá cấp', null, [
        bs('Right-click any level → Add Child Level.', 'Right-click cấp bất kỳ → Add Child Level.'),
        bs(
          'Right-click → Delete Level (cascades to all descendants; confirmation required).',
          'Right-click → Delete Level (cascade xuống mọi con cháu; cần xác nhận).'
        ),
        bs('Drag a level onto another to re-parent.', 'Kéo một cấp lên cấp khác để đổi cha.'),
      ]),
      proc(
        'Cost overlay',
        'Overlay chi phí',
        bi(
          'Toggle in toolbar shows cost contribution per level directly on the tree.',
          'Toggle trên toolbar hiện đóng góp chi phí từng cấp trực tiếp trên cây.'
        ),
        [
          bs('Click "Show costs" toggle.', 'Click toggle "Show costs".'),
          bs(
            'Each level shows its % of total cost — drives drill-down priority.',
            'Mỗi cấp hiển thị % tổng chi phí — quyết định thứ tự drill-down.'
          ),
          bs('Orange ≥ 15%, Red ≥ 30% — review first.', 'Cam ≥ 15%, Đỏ ≥ 30% — review trước.'),
        ]
      ),
    ],
    relatedTabs: ['complex', 'complex-cost-breakdown', 'lib-mfg'],
    screenshot: null,
  },

  'complex-cost-breakdown': {
    id: 'complex-cost-breakdown',
    section: 'CALCULATORS',
    title: bi('Pricing (Complex) — Cost Breakdown', 'Bảng tính giá (Phức tạp) — Cơ cấu Chi phí'),
    function: bi(
      'Per-level + aggregated cost waterfall',
      'Waterfall chi phí theo từng cấp + tổng hợp'
    ),
    path: 'Ops Cost > Pricing (Cpx) >Cost Breakdown',
    purpose: bi(
      'Cost by BOM level AND by cost category (material / ink / labor / overhead). The 2-dimensional view Complex quotes need.',
      'Chi phí theo cấp BOM VÀ theo loại (material / ink / labor / overhead). View 2-chiều mà Complex quote cần.'
    ),
    whenToUse: bi(
      'Before Complex quote sign-off. Must see where cost concentrates to defend margin.',
      'Trước khi ký Complex quote. Phải biết chi phí tập trung ở đâu để giải thích margin.'
    ),
    preRequisites: [
      br('Complex BOM filled with materials + routing.', 'Complex BOM đã điền vật tư + routing.'),
    ],
    procedures: [
      proc('Matrix review', 'Review matrix', null, [
        bs(
          'Rows = BOM levels; columns = cost categories.',
          'Dòng = cấp BOM; cột = danh mục chi phí.'
        ),
        bs(
          'Cell = cost contribution of that level × category.',
          'Ô = đóng góp chi phí của cấp × danh mục đó.'
        ),
        bs(
          'Heatmap gradient: darker = larger contribution.',
          'Gradient heatmap: đậm = đóng góp lớn hơn.'
        ),
      ]),
      proc(
        'Yield compound inspection',
        'Kiểm tra Yield compound',
        bi(
          'Yield hits compound across levels — 95%³ = 85.7%. This view surfaces where material waste hides.',
          'Yield compound qua các cấp — 95%³ = 85.7%. View này chỉ ra waste vật tư ẩn ở đâu.'
        ),
        [
          bs('Click "Show yield" toggle in toolbar.', 'Click toggle "Show yield" trên toolbar.'),
          bs(
            'Each level row shows compounded input qty + implied material loss.',
            'Mỗi dòng cấp hiện input qty đã compound + mất mát vật tư ngầm.'
          ),
          bs('Red cells = yield below floor threshold.', 'Ô đỏ = yield dưới ngưỡng sàn.'),
        ]
      ),
      proc('Export', 'Xuất', null, [
        bs(
          'Click ⬇ CSV — 2D matrix flattens to long format.',
          'Click ⬇ CSV — matrix 2D chuyển sang dạng long.'
        ),
        bs(
          'Click ⬇ PDF — produces the sign-off-ready exec summary.',
          'Click ⬇ PDF — tạo bản tóm tắt cấp quản lý sẵn sàng ký duyệt.'
        ),
      ]),
    ],
    relatedTabs: ['complex', 'complex-bom-tree', 'summarize'],
    screenshot: null,
  },

  'complex-packing': {
    id: 'complex-packing',
    section: 'CALCULATORS',
    subSection: 'calculators',
    title: bi(
      'Pricing (Complex) — Pack & Ship',
      'Bảng tính giá (Phức tạp) — Đóng gói & Vận chuyển'
    ),
    function: bi(
      'Quote-level packing + shipping cost for the assembled Complex quote',
      'Chi phí đóng gói + vận chuyển cấp báo giá cho Complex quote'
    ),
    path: 'Ops Cost > Pricing (Cpx) > Pack & Ship',
    purpose: bi(
      'Single quote-level pack & ship pane for Complex (sub-products do not carry their own pack/ship — packaging happens at the assembled-quote level). 5 fields: container_cost / box_cost / other_packing / shipping_cost / other_ship.',
      'Một pane pack & ship cấp báo giá cho Complex (sub-product không có pack/ship riêng — đóng gói diễn ra ở cấp báo giá đã ráp). 5 trường: container_cost / box_cost / other_packing / shipping_cost / other_ship.'
    ),
    whenToUse: bi(
      'After per-SP Calculators are populated. Always fill for export quotes (CIF / DDP); optional for EXW-local.',
      'Sau khi Calculators per-SP đã điền. Luôn điền cho quote xuất khẩu (CIF / DDP); tuỳ chọn với EXW-nội địa.'
    ),
    procedures: [
      proc('Per-MOQ-tier overrides', 'Override theo bậc MOQ', null, [
        bs(
          'Same per-tier override pattern as the Std Pack & Ship pane (Sprint S-PACK-SHIP-PER-TIER): tier 0 is base, tier > 0 inherits MOQ 1 by default with violet/bold override + ↻ reset + inherit hint banner.',
          'Cùng mẫu override per-tier như pane Pack & Ship của Std (Sprint S-PACK-SHIP-PER-TIER): tier 0 là base, tier > 0 thừa kế MOQ 1 mặc định với override tím/đậm + ↻ reset + banner gợi ý inherit.'
        ),
        bs(
          'Routes through SET_CPLX_TIER_PACKING_FIELD so cplxState.extra_moqs[i].packing carries the override.',
          'Chạy qua SET_CPLX_TIER_PACKING_FIELD nên cplxState.extra_moqs[i].packing mang override.'
        ),
      ]),
    ],
    relatedTabs: ['complex', 'complex-calculators', 'standard-pack-ship'],
    screenshot: null,
  },

  'complex-summary': {
    id: 'complex-summary',
    section: 'CALCULATORS',
    subSection: 'calculators',
    title: bi('Pricing (Complex) — Summarize', 'Bảng tính giá (Phức tạp) — Tóm tắt'),
    function: bi(
      'Per-tier margin + sell price for the assembled Complex quote',
      'Margin + giá bán theo từng bậc cho Complex quote đã ráp'
    ),
    path: 'Ops Cost > Pricing (Cpx) > Summarize',
    purpose: bi(
      'Final decision screen for Complex — aggregates per-SP cost via aggregateComplex into the quote-level summary (Cost → Margin → Sell → Profit). Set target margin per tier; commit + save from here.',
      'Màn hình quyết định cuối cho Complex — gộp chi phí per-SP qua aggregateComplex thành tóm tắt cấp báo giá (Cost → Margin → Sell → Profit). Đặt target margin theo bậc; commit + save tại đây.'
    ),
    whenToUse: bi(
      'Last data-entry sub-tab before Lead time & Notice. Final margin call before saving.',
      'Sub-tab nhập liệu cuối trước Lead time & Notice. Quyết định margin cuối trước khi save.'
    ),
    procedures: [
      proc('Set margin per tier', 'Đặt margin theo bậc', null, [
        bs(
          'Each MOQ tier row shows aggregated Cost / Margin / Sell. Enter target Margin % per tier.',
          'Mỗi dòng bậc MOQ hiển thị Cost / Margin / Sell đã gộp. Nhập target Margin % theo bậc.'
        ),
        bs(
          'Snapshot panel + Copy-mode banner identical to the Std Cost Breakdown surface — see standard-cost-breakdown for the Snapshot / Copy semantics.',
          'Snapshot panel + banner Copy-mode giống surface Cost Breakdown của Std — xem standard-cost-breakdown để biết ngữ nghĩa Snapshot / Copy.'
        ),
      ]),
    ],
    relatedTabs: ['complex', 'complex-cost-breakdown', 'lead-time-notice', 'summarize'],
    screenshot: null,
  },

  metrics: {
    id: 'metrics',
    section: 'SYSTEM',
    title: bi('Metrics', 'Metrics'),
    function: bi(
      'Runtime health (latency, errors, cache, sessions) — sys role only',
      'Health runtime (latency, lỗi, cache, session) — chỉ sys'
    ),
    path: 'Ops Cost > System > Metrics',
    purpose: bi(
      'Runtime health dashboard: request latency, error rate, cache hit rate, open sessions. Sys-role only.',
      'Dashboard health runtime: độ trễ request, tỉ lệ lỗi, cache hit, session mở. Chỉ role sys.'
    ),
    whenToUse: bi(
      'Daily sanity check by ops. Incident triage.',
      'Check định kỳ của ops. Triage sự cố.'
    ),
    preRequisites: [br('Sys role.', 'Role Sys.')],
    workflow: [
      bs(
        'Home tile grid: green = healthy, amber = warning, red = critical.',
        'Grid tile: xanh = OK, amber = cảnh báo, đỏ = nguy cấp.'
      ),
      bs(
        'Click a tile → time-series + last N events.',
        'Click tile → time-series + N sự kiện gần nhất.'
      ),
      bs(
        'Error beacon feed: client-side JS errors grouped by stack trace.',
        'Feed error beacon: lỗi JS client-side nhóm theo stack trace.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Subscribe to the error beacon via email in Settings → Notifications.',
        'Đăng ký error beacon qua email trong Settings → Notifications.'
      ),
    ],
    pitfalls: [
      bp(
        'Metrics are in-memory; restart resets them. Ship to Prometheus for long-term retention.',
        'Metrics in-memory; restart sẽ reset. Ship sang Prometheus để retention dài hạn.'
      ),
    ],
    relatedTabs: ['settings'],
    screenshot: null,
  },

  'whats-new': {
    id: 'whats-new',
    section: 'SYSTEM',
    title: bi("What's new — v1.3 (April 2026)", 'Mới — v1.3 (Tháng 4/2026)'),
    function: bi(
      'Release notes — 6 đợt enterprise hardening',
      'Ghi chú phát hành — 6 đợt hardening enterprise'
    ),
    path: "Ops Cost > System > Help > What's new",
    purpose: bi(
      'v1.3 ships 6 đợt of LAN-readiness hardening: SSE real-time, ConflictModal, login anomaly detection, sessions admin, SQLite primary, off-site backup, HTTPS Caddy. Read first on any major release.',
      'v1.3 ship 6 đợt hardening sẵn sàng LAN: SSE real-time, ConflictModal, phát hiện login bất thường, sessions admin, SQLite primary, off-site backup, HTTPS Caddy. Đọc đầu tiên ở mỗi bản lớn.'
    ),
    whenToUse: bi(
      "After installing the v1.3 DMG/EXE; when an operator reports new behavior they don't recognize.",
      'Sau khi cài DMG/EXE v1.3; khi operator báo có hành vi mới chưa biết.'
    ),
    preRequisites: [],
    features: [
      feat(
        'Đợt 1: Connection banner (top-of-app) when server unreachable, useAutoRefresh on QuoteHistory/RFQ/Sample/Approvals tabs (poll every 30-60s, pause when hidden)',
        'Đợt 1: Banner kết nối (top app) khi server không reachable, useAutoRefresh trên QuoteHistory/RFQ/Sample/Approvals (poll 30-60s, pause khi tab ẩn)'
      ),
      feat(
        'Đợt 2: SSE event bus — server emits quote.saved, rfq.updated, sample.updated, approval.transition, library.imported. Tabs refetch instantly (< 50ms) instead of waiting for poll. ConflictModal replaces blunt window.confirm() with 3-button (Reload / Overwrite / Cancel) preserving user edits.',
        'Đợt 2: SSE event bus — server emit quote.saved, rfq.updated, sample.updated, approval.transition, library.imported. Tab refetch tức thì (< 50ms) thay vì chờ poll. ConflictModal thay window.confirm() bằng 3-button (Reload / Overwrite / Cancel) giữ user edits.'
      ),
      feat(
        'Đợt 3: Active users indicator (TopBar góc phải — "● N online" pill, click xem list). Backup upload from disk (sys-only). Off-site backup helper script (scripts/backup-offsite.sh). HTTPS Caddy helper (scripts/setup-https-caddy.sh).',
        'Đợt 3: Indicator user đang online (TopBar góc phải — pill "● N online", click xem list). Upload backup từ disk (sys-only). Script off-site backup (scripts/backup-offsite.sh). Script Caddy HTTPS (scripts/setup-https-caddy.sh).'
      ),
      feat(
        'Đợt 4: Login anomaly detection — server marks LOGIN_ANOMALY in audit + emits SSE security.alert when (a) same user logged in from 2+ IPs in 5min, (b) login from new IP not seen in 30d, (c) login at unusual hour (22h-6h). Admins see real-time toast; user themselves sees yellow toast post-login to spot session hijack.',
        'Đợt 4: Phát hiện login bất thường — server stamp LOGIN_ANOMALY trong audit + emit SSE security.alert khi (a) cùng user login từ 2+ IP trong 5min, (b) login từ IP mới chưa thấy trong 30d, (c) login giờ bất thường (22h-6h). Admin thấy toast real-time; user thấy toast vàng sau login để phát hiện session hijack.'
      ),
      feat(
        'Đợt 5: SQLite primary backend default — removes JSON-mutex bottleneck @ 20 concurrent saves. AboutSection 3 new diagnostic tests (Quote backend parity, SSE subscribers, Active users count).',
        'Đợt 5: SQLite primary backend mặc định — bỏ bottleneck JSON-mutex @ 20 user save đồng thời. AboutSection 3 diagnostic test mới (parity Quote backend, SSE subscribers, count Active users).'
      ),
      feat(
        'Đợt 6: Active Sessions admin tab (sys-only, in Account Control) — see all active logins (username, role, 2FA status, token prefix, expires-in). Per-row Revoke button kicks user from all machines.',
        'Đợt 6: Tab Sessions admin (sys-only, trong Account Control) — xem mọi session đang đăng nhập (username, role, 2FA status, token prefix, expires-in). Nút Revoke mỗi dòng kick user khỏi mọi máy.'
      ),
    ],
    workflow: [
      bs('Read through the 6 đợt highlights above.', 'Đọc qua 6 đợt highlights ở trên.'),
      bs(
        'Settings → ℹ️ About / Diagnostics → click "Quote backend" — verify backend=sqlite + parity OK.',
        'Settings → ℹ️ About / Diagnostics → click "Quote backend" — xác nhận backend=sqlite + parity OK.'
      ),
      bs(
        'Login from máy thứ 2 (cùng tài khoản) → bạn sẽ thấy toast vàng "Có session khác đang mở từ IP …".',
        'Login từ máy thứ 2 (cùng tài khoản) → bạn sẽ thấy toast vàng "Có session khác đang mở từ IP …".'
      ),
      bs(
        'Settings → Account Control → Sessions tab (chỉ sys) — verify thấy 2 sessions; click Revoke để kick session kia.',
        'Settings → Account Control → Sessions tab (chỉ sys) — verify thấy 2 sessions; click Revoke để kick session kia.'
      ),
      bs(
        'Settings → Backup / Restore → click "📤 Upload từ máy khác…" để test restore từ snapshot ngoài.',
        'Settings → Backup / Restore → click "📤 Upload từ máy khác…" để test restore từ snapshot ngoài.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'SSE real-time push only works when server + client share the same origin or proxy passes Connection: keep-alive (default). nginx behind Caddy: ensure no buffering on /api/events/stream.',
        'SSE real-time push chỉ hoạt động khi server + client cùng origin hoặc proxy pass Connection: keep-alive (mặc định). nginx sau Caddy: đảm bảo không buffer trên /api/events/stream.'
      ),
      bt(
        "Login anomaly thresholds tuned for low false-positive: night-shift operators won't fire after 3 nights of normal shift logins (history baseline).",
        'Threshold anomaly tuned để false-positive thấp: operator ca đêm sẽ không trigger sau 3 đêm login bình thường (baseline history).'
      ),
      bt(
        'SQLite backend gives 5-10× faster list queries (indexed columns) vs JSON scan. Switch back to file via OPS_DATA_BACKEND=file env if SQLite issue.',
        'Backend SQLite cho list query nhanh 5-10× (cột indexed) so với scan JSON. Quay lại file qua env OPS_DATA_BACKEND=file nếu SQLite lỗi.'
      ),
      bt(
        'Sessions tab is sys-only (not admin). Grant sys role only to ops/IT.',
        'Tab Sessions chỉ sys (không phải admin). Cấp role sys chỉ cho ops/IT.'
      ),
    ],
    pitfalls: [
      bp(
        "SQLite cutover: JSON file is still mirrored as backup safety net. Don't delete quote_history.json manually — let the next /save-all rewrite it.",
        'Cutover SQLite: file JSON vẫn mirror làm safety net. Đừng xoá quote_history.json bằng tay — để /save-all kế tự ghi lại.'
      ),
      bp(
        'Revoking sessions kills the user instantly on every machine. Communicate before doing it on a prod user mid-shift.',
        'Revoke session kill user ngay trên mọi máy. Báo trước khi làm với prod user giữa ca.'
      ),
      bp(
        "SSE doesn't survive nginx default buffering. If clients show stale data despite save, check proxy_buffering off; on /api/events/stream location.",
        'SSE không sống sót qua nginx buffering mặc định. Nếu client thấy data cũ dù đã save, check proxy_buffering off; ở location /api/events/stream.'
      ),
    ],
    relatedTabs: ['help', 'settings-account-control', 'settings-backup-restore', 'metrics'],
    screenshot: null,
  },

  // Legacy Sprint 9 release notes — kept for back-reference
  'whats-new-sprint9': {
    id: 'whats-new-sprint9',
    section: 'SYSTEM',
    title: bi('Release notes — Sprint 9 (legacy)', 'Ghi chú phát hành — Sprint 9 (cũ)'),
    function: bi('Release notes for the Sprint 9 version', 'Ghi chú phát hành Sprint 9'),
    path: "Ops Cost > System > Help > What's new",
    purpose: bi(
      'Release notes for the current app version. Read first on any major release to know what changed, what moved, and what to tell operators.',
      'Ghi chú phát hành cho phiên bản hiện tại. Đọc đầu tiên ở mỗi bản lớn để biết gì đã đổi, gì đã dời, và cần báo operator những gì.'
    ),
    whenToUse: bi(
      'Right after an app update banner; when an operator reports "this used to work differently".',
      'Ngay sau banner cập nhật app; khi operator phản ánh "trước đây làm khác".'
    ),
    preRequisites: [],
    workflow: [
      bs(
        'Read through the Sprint 9 highlights below.',
        'Đọc qua các điểm nổi bật Sprint 9 bên dưới.'
      ),
      bs(
        "Confirm the Help tab's own entry works via F1 deep-link.",
        'Xác nhận entry Help tab hoạt động qua F1 deep-link.'
      ),
      bs(
        'Skim the changed tabs (Print Area, Help — both have new capabilities).',
        'Lướt qua các tab đã đổi (Print Area, Help — cả hai có khả năng mới).'
      ),
      bs(
        'If you had existing saved jobs in Print Area, re-analyze a few to confirm the spot-color detection now surfaces the red / brand inks you expect.',
        'Nếu có job đã lưu trong Print Area, phân tích lại một vài cái để xác nhận phát hiện spot-color giờ hiện các màu đỏ / brand mong đợi.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Sprint 9 added a centralized Help system — this screen — covering 37 tabs. Press F1 from any tab for context-sensitive help.',
        'Sprint 9 thêm Help system tập trung — màn hình này — phủ 37 tab. Ấn F1 ở tab bất kỳ để help theo ngữ cảnh.'
      ),
      bt(
        'Print Area Calculator now rescues rare spot colors automatically (chroma-boost + outlier rescue). Red warning text on black labels no longer vanishes from the palette.',
        'Print Area Calculator giờ tự rescue màu spot hiếm (chroma-boost + outlier rescue). Chữ cảnh báo đỏ trên nhãn đen không còn biến mất khỏi palette.'
      ),
      bt(
        'The 📌 Pin as spot ink eyedropper lets you force a cluster for colors with < 0.05% coverage. See "Print Area Calculator" for the workflow.',
        'Eyedropper 📌 Pin as spot ink cho phép force cluster cho màu coverage < 0.05%. Xem "Print Area Calculator" để biết workflow.'
      ),
      bt(
        'New NaN-guards on corrupt saved-job configs prevent the "blank palette" failure that hit a few legacy quotes.',
        'NaN-guard mới trên config job hỏng ngăn lỗi "blank palette" đã gặp ở vài báo giá cũ.'
      ),
    ],
    pitfalls: [
      bp(
        'Re-analyzing an old saved job with Sprint 9 defaults (K=8, chroma boost ON) may produce slightly different per-color splits than the archived numbers. Total coverage is unchanged; per-ink µL may shift.',
        'Phân tích lại job cũ với mặc định Sprint 9 (K=8, chroma boost ON) có thể cho chia màu khác chút so với số archive. Total coverage không đổi; µL từng màu có thể lệch.'
      ),
    ],
    relatedTabs: ['help', 'print-area'],
    screenshot: null,
  },

  'kiosk-admin': {
    id: 'kiosk-admin',
    section: 'SYSTEM',
    title: bi('Kiosk Admin', 'Quản trị Kiosk'),
    function: bi(
      'Pair shop-floor tablets to machines and revoke kiosk sessions',
      'Cặp ghép tablet xưởng với máy và thu hồi phiên kiosk'
    ),
    path: 'Ops Cost > System > Kiosk Admin',
    purpose: bi(
      'Single screen for issuing one-shot pairing cards (URL + QR + A6 print) and viewing all active kiosk sessions. Revoking a pairing logs the device out immediately. Sys + admin (or any user with the kiosk-admin tab permission) can issue and view; only sys can revoke.',
      'Một màn hình để phát hành thẻ ghép cặp dùng-một-lần (URL + QR + in A6) và xem tất cả phiên kiosk đang chạy. Thu hồi cặp ghép sẽ đăng xuất thiết bị ngay. Sys + admin (hoặc user có quyền tab kiosk-admin) có thể tạo và xem; chỉ sys mới thu hồi được.'
    ),
    whenToUse: bi(
      'Setting up a new tablet on a machine, swapping a damaged device, or revoking a kiosk that has been removed from the floor.',
      'Khi thiết lập tablet mới trên máy, thay thiết bị hỏng, hoặc thu hồi kiosk đã rút khỏi xưởng.'
    ),
    preRequisites: [
      bi('Machine added to Library/MachineProfiles.', 'Máy đã có trong Library/MachineProfiles.'),
      bi(
        'Tablet on the same network as the planner server.',
        'Tablet cùng mạng với server planner.'
      ),
    ],
    features: [
      feat(
        'Generate Pairing — modal with machine_code dropdown, single-use 15-min token, large URL + QR for tablet scan',
        'Tạo cặp ghép — modal với dropdown chọn máy, token dùng-một-lần 15 phút, URL + QR lớn cho tablet quét'
      ),
      feat(
        'Print A6 card — Cmd/Ctrl+P prints the pairing card sized to A6 with everything else hidden',
        'In thẻ A6 — Cmd/Ctrl+P in thẻ ghép cặp khổ A6, ẩn mọi thứ khác'
      ),
      feat(
        'Active kiosks table — machine code, paired-since, last-seen, status dot (green/amber/red by pulse age), Revoke action',
        'Bảng kiosk đang chạy — mã máy, thời điểm cặp ghép, lần cuối, chấm trạng thái (xanh/vàng/đỏ theo pulse), nút Thu hồi'
      ),
      feat(
        '30s polling — auto-refresh of last_seen; pauses when the browser tab is in the background',
        'Polling 30 giây — tự cập nhật last_seen; tạm dừng khi tab trình duyệt ở background'
      ),
      feat(
        'Revoke (sys-only) — confirms via inline modal, kills the kiosk JWT within 30s on the device',
        'Thu hồi (chỉ sys) — xác nhận qua modal, ngắt JWT kiosk trong 30 giây trên thiết bị'
      ),
    ],
    notes: [
      bp(
        'Pairing tokens are sha256-hashed for storage; the raw token is rendered ONCE in the modal and never logged.',
        'Token được sha256 để lưu; raw token chỉ hiện MỘT lần trong modal, không log.'
      ),
      bp(
        'Revoking does not invalidate any in-flight idempotent retry already in the kiosk queue — those drain naturally.',
        'Thu hồi không hủy retry idempotent đang chạy trong queue kiosk — chúng tự hoàn tất.'
      ),
    ],
    relatedTabs: ['settings', 'audit-log'],
    screenshot: '/help/screenshots/kiosk-admin.png',
  },

  help: {
    id: 'help',
    section: 'SYSTEM',
    title: bi('Help', 'Hướng dẫn'),
    function: bi('Centralized in-app user guide (this screen)', 'User guide in-app (màn hình này)'),
    path: 'Ops Cost > System > Help',
    purpose: bi(
      'This screen. Searchable in-app user guide covering every tab, every formula, every pitfall.',
      'Chính là màn hình này. User guide in-app có thể search cho mọi tab, mọi công thức, mọi lỗi thường gặp.'
    ),
    whenToUse: bi(
      "Any time. Press F1 anywhere in the app to jump to the help for the tab you're on.",
      'Bất kỳ lúc nào. Ấn F1 ở bất kỳ đâu trong app để nhảy đến help của tab đang mở.'
    ),
    preRequisites: [],
    workflow: [
      bs(
        'Search box: type any keyword — matches titles, purposes, and body text across all sections.',
        'Ô search: gõ keyword bất kỳ — match title, purpose, và body text qua mọi section.'
      ),
      bs(
        'Sidebar: browse by section (Calculators → Quoting → …).',
        'Sidebar: duyệt theo section (Calculators → Quoting → …).'
      ),
      bs(
        'Content panel: scroll; related-tab links jump to the related entry.',
        'Panel nội dung: scroll; link related-tab nhảy đến entry liên quan.'
      ),
      bs(
        'Download button (top right): exports the full user guide as a Word file.',
        'Nút Download (trên phải): xuất full user guide dạng Word file.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        "Press F1 for context-sensitive help — jumps to the entry for the tab you're on.",
        'Ấn F1 để Help theo ngữ cảnh — nhảy đến entry của tab đang mở.'
      ),
      bt(
        'The Word export is a printable version of what you see here — useful for onboarding packets.',
        'File Word export là phiên bản in được của những gì bạn thấy ở đây — tiện cho gói tài liệu onboarding.'
      ),
    ],
    pitfalls: [],
    relatedTabs: [],
    screenshot: null,
  },

  // ─────────────────────────────────────────────────────────────
  // PLANNING (secondary module)
  // ─────────────────────────────────────────────────────────────

  'order-entry': {
    id: 'order-entry',
    section: 'PLANNING',
    title: bi('Order Entry', 'Nhập đơn hàng'),
    function: bi(
      'Intake customer orders (SKU, qty, ship date)',
      'Tiếp nhận đơn khách (SKU, qty, ngày giao)'
    ),
    path: 'Planning > Production > Order Entry',
    purpose: bi(
      'Intake customer orders: SKU, quantity, required ship date, special instructions. The upstream of BOM Explosion.',
      'Tiếp nhận đơn hàng của khách: SKU, số lượng, ngày giao, yêu cầu đặc biệt. Đầu vào của BOM Explosion.'
    ),
    whenToUse: bi(
      'Whenever a customer order is confirmed — before Planning can touch capacity.',
      'Khi đơn hàng được xác nhận — trước khi Planning bắt đầu tính capacity.'
    ),
    preRequisites: [
      br(
        'Customer in Drop-Down Lists; SKU in Material Library or a quoted SKU.',
        'Khách hàng trong Drop-Down Lists; SKU trong Material Library hoặc SKU đã báo giá.'
      ),
    ],
    workflow: [
      bs(
        'Create order: pick customer → pick SKU → enter qty + ship-by date.',
        'Tạo đơn: chọn khách → chọn SKU → nhập qty + ngày giao.'
      ),
      bs(
        'Save → auto-passes to BOM Explosion for material requirements.',
        'Save → tự chuyển sang BOM Explosion để tính nhu cầu vật tư.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Use the Clone button for repeat orders — saves retyping.',
        'Dùng nút Clone cho đơn lặp lại — tiết kiệm nhập lại.'
      ),
    ],
    pitfalls: [
      bp(
        "Ship-by date must be realistic; Capacity Planning downstream will flag it but won't auto-reject.",
        'Ngày giao phải thực tế; Capacity Planning sẽ flag nhưng không tự reject.'
      ),
    ],
    relatedTabs: ['bom-explosion', 'capacity'],
    screenshot: null,
  },

  'bom-explosion': {
    id: 'bom-explosion',
    section: 'PLANNING',
    title: bi('BOM Explosion', 'Phân rã BOM'),
    function: bi(
      'Compute total material requirements from finished-goods orders',
      'Tính tổng nhu cầu vật tư từ đơn thành phẩm'
    ),
    path: 'Planning > Production > BOM Explosion',
    purpose: bi(
      'From a finished-goods order, compute total material requirements at every BOM level. Outputs feed Material Check.',
      'Từ đơn hàng thành phẩm, tính tổng nhu cầu vật tư ở mọi cấp BOM. Kết quả đi vào Material Check.'
    ),
    whenToUse: bi('Daily, for every new Order Entry.', 'Hàng ngày, cho mỗi Order Entry mới.'),
    preRequisites: [
      br(
        'Complete BOM definition in Mfg Structures.',
        'Định nghĩa BOM đầy đủ trong Mfg Structures.'
      ),
    ],
    workflow: [
      bs('Pick the order → click Explode.', 'Chọn đơn → click Explode.'),
      bs(
        'Review the expanded material list grouped by level + lead-time category.',
        'Xem danh sách vật tư đã phân rã nhóm theo cấp + danh mục lead-time.'
      ),
      bs('Send to Material Check.', 'Gửi sang Material Check.'),
    ],
    keyFields: [],
    formulas: [
      {
        name: 'Required qty',
        expr: 'qty_i = order_qty × compound_consumption_i / compound_yield_i',
        meaning: bi(
          'Qty of component i needed to satisfy the order, compounded through BOM levels + yield decay.',
          'Lượng linh kiện i cần để đáp ứng đơn, compound qua các cấp BOM + yield.'
        ),
        example:
          'Order 10,000 FG; component at level 2, consumption 1.2 per FG, yield chain 0.95 × 0.95\nqty = 10000 × 1.2 / 0.9025 = 13,297 units',
      },
    ],
    tips: [
      bt(
        "Review Level 1 only if short on time — it's 80% of material dollar volume.",
        'Review Level 1 trước nếu gấp — nó chiếm 80% giá trị vật tư.'
      ),
    ],
    pitfalls: [
      bp(
        'BOM changes mid-run break the explosion — freeze BOM version for active orders.',
        'Đổi BOM giữa run sẽ phá explosion — freeze phiên bản BOM cho đơn đang hoạt động.'
      ),
    ],
    relatedTabs: ['order-entry', 'material-check', 'lib-mfg'],
    screenshot: 'bom-explosion.png',
  },

  'material-check': {
    id: 'material-check',
    section: 'PLANNING',
    title: bi('Material Check', 'Kiểm tra Vật tư'),
    function: bi(
      'Feasibility check: stock + open POs vs. requirements',
      'Kiểm tra khả thi: tồn + PO mở so với nhu cầu'
    ),
    path: 'Planning > Production > Material Check',
    purpose: bi(
      'Feasibility: does current IFS stock + open POs cover the requirements from BOM Explosion?',
      'Feasibility: tồn kho IFS hiện tại + PO đang mở có đủ đáp ứng nhu cầu từ BOM Explosion không?'
    ),
    whenToUse: bi(
      'After BOM Explosion. Must pass before Work Order generation.',
      'Sau BOM Explosion. Phải pass trước khi phát Work Order.'
    ),
    preRequisites: [br('IFS Inventory live.', 'IFS Inventory đang hoạt động.')],
    workflow: [
      bs(
        'Select exploded BOM → system matches against IFS stock.',
        'Chọn BOM đã phân rã → hệ thống match với tồn IFS.'
      ),
      bs(
        'Red rows = shortage; amber = borderline; green = OK.',
        'Dòng đỏ = thiếu; amber = giáp ranh; xanh = OK.'
      ),
      bs(
        'For shortages: jump to RFQ Tracker to source or to Material Library for alternates.',
        'Với hàng thiếu: nhảy sang RFQ Tracker để source hoặc Material Library để tìm thay thế.'
      ),
    ],
    keyFields: [],
    formulas: [
      {
        name: 'Shortage',
        expr: 'required − (on_hand + on_order − allocated)',
        meaning: bi(
          'How many units are missing after accounting for stock + incoming POs minus already-committed demand.',
          'Số lượng thiếu sau khi trừ tồn + PO đang về − đã cam kết cho đơn khác.'
        ),
        example:
          'required=13,297; on_hand=5,000; on_order=3,000; allocated=4,000\nshortage = 13,297 − (5,000 + 3,000 − 4,000) = 9,297 units',
      },
    ],
    tips: [
      bt(
        'Snapshot the check result — IFS is live, a week later the picture changes.',
        'Snapshot kết quả check — IFS live, tuần sau bức tranh sẽ khác.'
      ),
    ],
    pitfalls: [
      bp(
        'Allocated-to-cancelled SOs may still show allocated until IFS nightly cleanup.',
        'SO đã huỷ vẫn có thể hiện allocated cho tới khi IFS cleanup đêm.'
      ),
    ],
    relatedTabs: ['bom-explosion', 'lib-inventory', 'rfq-tracker'],
    screenshot: null,
  },

  capacity: {
    id: 'capacity',
    section: 'PLANNING',
    title: bi('Capacity Planning', 'Kế hoạch Năng lực'),
    function: bi(
      'Gantt work-cell load vs. committed orders',
      'Gantt tải work-cell so với đơn đã cam kết'
    ),
    path: 'Planning > Scheduling > Capacity Planning',
    purpose: bi(
      'Gantt-style load view per work-cell vs. committed orders. Spot bottlenecks before they become delays.',
      'View Gantt tải từng work-cell vs. đơn đã cam kết. Phát hiện bottleneck trước khi chậm trễ.'
    ),
    whenToUse: bi(
      'Weekly planning meeting. On-demand when a new large order arrives.',
      'Họp kế hoạch hàng tuần. On-demand khi đơn lớn mới đến.'
    ),
    preRequisites: [
      br(
        'Routing Ops with run rates; Order Entry backlog.',
        'Routing Ops có run rates; Order Entry có backlog.'
      ),
    ],
    workflow: [
      bs('Pick a horizon (2 weeks default).', 'Chọn horizon (mặc định 2 tuần).'),
      bs(
        'Rows = work-cells; color = utilization. Click a bar = which order it serves.',
        'Dòng = work-cell; màu = utilization. Click bar = đang phục vụ đơn nào.'
      ),
      bs(
        'Drag to re-schedule; system recomputes downstream ship dates.',
        'Kéo để re-schedule; hệ thống tính lại ngày giao xuôi dòng.'
      ),
    ],
    keyFields: [],
    formulas: [
      {
        name: 'Utilization',
        expr: 'committed_hours / available_hours × 100',
        meaning: bi(
          "Fraction of a work-cell's available hours already committed to scheduled orders.",
          'Phần trăm giờ khả dụng của work-cell đã cam kết cho đơn đã lên lịch.'
        ),
        example:
          'Press A: 160h available/week, 136h committed\nutilization = 136/160 × 100 = 85% → practical ceiling (amber)',
        notes: '85%+ flashes amber; 100% is theoretical — real-world ceiling is ~85%.',
      },
    ],
    tips: [
      bt(
        "Over 85% utilization flashes amber — that's the practical capacity ceiling, not 100%.",
        'Utilization > 85% flash amber — đó là trần thực tế, không phải 100%.'
      ),
    ],
    pitfalls: [
      bp(
        'Drag-reschedule without approval from shop-floor leads causes friction — loop them in.',
        'Drag-reschedule không có approval của shop-floor lead gây mâu thuẫn — loop họ vào.'
      ),
    ],
    relatedTabs: ['order-entry', 'work-orders', 'wip-tracker'],
    screenshot: 'capacity.png',
  },

  'work-orders': {
    id: 'work-orders',
    section: 'PLANNING',
    title: bi('Work Orders', 'Lệnh Sản xuất'),
    function: bi(
      'Generate + release floor work orders from capacity plan',
      'Tạo + phát lệnh sản xuất từ kế hoạch năng lực'
    ),
    path: 'Planning > Scheduling > Work Orders',
    purpose: bi(
      'Generate and release floor work orders from the scheduled capacity plan.',
      'Tạo và phát lệnh sản xuất cho xưởng từ kế hoạch năng lực đã lập.'
    ),
    whenToUse: bi(
      "Daily, at end-of-shift, for the next day's run.",
      'Hàng ngày, cuối ca, cho sản xuất ngày hôm sau.'
    ),
    preRequisites: [
      br(
        'Capacity Planning approved; Material Check green.',
        'Capacity Planning đã duyệt; Material Check xanh.'
      ),
    ],
    workflow: [
      bs(
        'Select orders to release → click Generate Work Orders.',
        'Chọn đơn để release → click Generate Work Orders.'
      ),
      bs('Review the generated routing cards per cell.', 'Xem routing card đã tạo cho từng cell.'),
      bs(
        'Print + hand to shop floor, OR push to the floor terminal if integrated.',
        'In + đưa shop floor, HOẶC đẩy sang terminal shop floor nếu có tích hợp.'
      ),
    ],
    keyFields: [],
    formulas: [],
    tips: [
      bt(
        'Batch releases by press — reduces setup time by sharing tooling.',
        'Batch release theo máy — giảm thời gian setup bằng cách dùng chung tooling.'
      ),
    ],
    pitfalls: [
      bp(
        'Releasing without material check pass causes floor stall — always confirm green first.',
        'Release mà chưa pass material check gây đình trệ shop floor — luôn xác nhận green trước.'
      ),
    ],
    relatedTabs: ['capacity', 'wip-tracker'],
    screenshot: null,
  },

  'wip-tracker': {
    id: 'wip-tracker',
    section: 'PLANNING',
    title: bi('WIP Tracker', 'Theo dõi WIP'),
    function: bi(
      'Real-time WIP status per work order (completion %, holds, yield)',
      'Trạng thái WIP theo WO (% hoàn thành, giữ, yield)'
    ),
    path: 'Planning > Tracking > WIP Tracker',
    purpose: bi(
      'Real-time work-in-progress status per work order. Completion %, quality holds, yield.',
      'Trạng thái WIP thời gian thực theo từng work order. % hoàn thành, giữ chất lượng, yield.'
    ),
    whenToUse: bi(
      'Shop-floor supervisor hourly; office team for customer ETA queries.',
      'Supervisor hàng giờ; office team khi khách hỏi ETA.'
    ),
    preRequisites: [
      br(
        'Shop floor terminals reporting to the system.',
        'Terminal shop floor báo cáo về hệ thống.'
      ),
    ],
    workflow: [
      bs('Filter by work-cell or customer.', 'Lọc theo work-cell hoặc khách.'),
      bs(
        'Click a WO for the full step timeline + yield per step.',
        'Click WO để xem timeline các bước + yield từng bước.'
      ),
      bs(
        'Flag a quality hold → stops downstream release until resolved.',
        'Flag quality hold → dừng release xuôi dòng cho tới khi xử lý.'
      ),
    ],
    keyFields: [],
    formulas: [
      {
        name: 'Completion %',
        expr: 'completed_units / released_units × 100',
        meaning: bi(
          'Live progress of a work order. Completed = units scanned as good at the final operation.',
          'Tiến độ thời gian thực của work order. Completed = đơn vị scan tốt ở công đoạn cuối.'
        ),
        example:
          'WO-2026-0042: released 10,000, completed 7,230\ncompletion = 7230/10000 × 100 = 72.3%',
      },
    ],
    tips: [
      bt(
        'Drive stand-up meetings off this screen — single source of truth.',
        'Họp stand-up dựa trên màn hình này — single source of truth.'
      ),
    ],
    pitfalls: [
      bp(
        'Completion % is not always accurate if operators forget to scan. Enforce the scan with SOP.',
        'Completion % không luôn chính xác nếu operator quên scan. Ép scan bằng SOP.'
      ),
    ],
    relatedTabs: ['work-orders', 'capacity'],
    screenshot: null,
  },
};

// Convenience: grouped index for UI rendering + Word export.
export function getHelpIndex() {
  const index = {};
  for (const s of HELP_SECTIONS) index[s.key] = [];
  for (const id of Object.keys(HELP_CONTENT)) {
    const entry = HELP_CONTENT[id];
    if (index[entry.section]) index[entry.section].push(entry);
  }
  return index;
}

// Flat list for search + Word export (stable ordering).
export function getAllEntries() {
  const out = [];
  for (const s of HELP_SECTIONS) {
    for (const id of Object.keys(HELP_CONTENT)) {
      if (HELP_CONTENT[id].section === s.key) out.push(HELP_CONTENT[id]);
    }
  }
  return out;
}
