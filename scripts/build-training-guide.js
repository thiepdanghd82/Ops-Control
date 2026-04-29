/**
 * build-training-guide.js — generates the Ops Control training workbooks
 * (EN + VN) with the same visual format as the legacy CCL_Pricing_Training
 * reference file: dark-navy title banners, blue section headers, striped
 * body rows, thin gray borders on every data cell.
 *
 * Uses ExcelJS (not SheetJS community) because we need real borders,
 * fonts and alignment — SheetJS reads styles but only writes fills.
 *
 * Run: node scripts/build-training-guide.js
 */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, '..', 'Use guide');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Palette (matches the reference CCL_Pricing_Training file) ───
const COLORS = {
  titleBg:   'FF1E3A5F', // dark navy — H1 banner
  titleFg:   'FFFFFFFF',
  sectionBg: 'FF2E86AB', // medium blue — H2 section header
  sectionFg: 'FFFFFFFF',
  headerBg:  'FF1A5276', // dark blue — table column header row
  headerFg:  'FFFFFFFF',
  bodyAlt1:  'FFF2F3F4', // pale gray — odd data rows
  bodyAlt2:  'FFFFFFFF', // white — even data rows
  noteBg:    'FFEAF2F8', // soft blue tint for note rows
  noteFg:    'FF1A5276',
  borderRgb: 'FFBFC9D1', // light gray cell borders
  footerBg:  'FFF8F9FA',
  footerFg:  'FF6C7A89',
};

const FONT = 'Calibri';

const thinBorder = { style: 'thin', color: { argb: COLORS.borderRgb } };
const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

// ── Content ────────────────────────────────────────────────────

function sheetContents(lang) {
  const t = (en, vn) => (lang === 'vn' ? vn : en);

  return [
    // ── 00 Contents ─────────────────────────────────────────
    {
      name: t('00_Contents', '00_Mục lục'),
      cols: [12, 28, 72],
      blocks: [
        { type: 'title', text: t(
          'OPS CONTROL — TRAINING MANUAL v1.0\nReact Edition · Ops Cost · Planning',
          'OPS CONTROL — TÀI LIỆU ĐÀO TẠO v1.0\nBản React · Ops Cost · Planning'
        ), span: 3, height: 48 },
        { type: 'note', text: t(
          'Version: 1.0   ·   Date: April 2026   ·   Author: CCL Pricing Team\nThis manual covers the new Ops Control web app (client/server) that replaces the legacy single-HTML COST V1.0 calculator.',
          'Phiên bản: 1.0   ·   Ngày: 04/2026   ·   Tác giả: CCL Pricing Team\nTài liệu này hướng dẫn ứng dụng web Ops Control (client/server) mới, thay thế bản COST V1.0 HTML cũ.'
        ), span: 3, height: 42 },
        { type: 'section', text: t('TABLE OF CONTENTS', 'MỤC LỤC'), span: 3 },
        { type: 'table', header: [t('No.', 'STT'), t('Sheet', 'Trang'), t('Description', 'Mô tả')], rows: [
          [1, t('01_Getting Started', '01_Bắt đầu'),
            t('Login, sidebar navigation, modules, breadcrumbs, user roles',
              'Đăng nhập, điều hướng sidebar, module, breadcrumb, vai trò người dùng')],
          [2, t('02_Standard Calculator', '02_Standard Calc'),
            t('Single-product pricing: Header, Layout, Materials, Inks, Processes, Packing',
              'Báo giá 1 sản phẩm: Header, Layout, Vật tư, Mực in, Công đoạn, Đóng gói')],
          [3, t('03_Complex Calculator', '03_Complex Calc'),
            t('Multi sub-product assemblies with cross-references and tiered pricing',
              'Sản phẩm lắp ráp nhiều sub-product có tham chiếu chéo và bậc giá')],
          [4, t('04_Cost Breakdown', '04_Cost Breakdown'),
            t('Summarize tab: all saved quotes expanded per MOQ tier, search, CSV export',
              'Tab Summarize: toàn bộ báo giá theo bậc MOQ, tìm kiếm, xuất CSV')],
          [5, t('05_Quote Workflow', '05_Quy trình báo giá'),
            t('End-to-end: RFQ Tracker → Calculator → Formal Quotation → Quote History',
              'Quy trình trọn vẹn: RFQ Tracker → Máy tính → Báo giá chính thức → Lịch sử báo giá')],
          [6, t('06_Libraries', '06_Thư viện'),
            t('Rate Table, Drop-Down Lists, Finance Data, Material Library — per site',
              'Bảng Rate, Drop-Down, Finance Data, Thư viện vật tư — theo site')],
          [7, t('07_Import / Export', '07_Import / Export'),
            t('CSV/XLSX upload for IFS Inventory, Routing, Rate Table, NPI Materials',
              'Upload CSV/XLSX cho IFS Inventory, Routing, Rate Table, NPI Materials')],
          [8, t('08_Backup & Restore', '08_Sao lưu & Khôi phục'),
            t('Data backups (JSON) and Code backups (full source snapshots) with restore',
              'Sao lưu Data (JSON) và Code (snapshot toàn bộ source) kèm khôi phục')],
          [9, t('09_Settings', '09_Cài đặt'),
            t('Account Control: roles, session token TTL, password reset, 2FA',
              'Account Control: phân quyền, session TTL, reset mật khẩu, 2FA')],
          [10, t('10_Master Formulas', '10_Công thức chính'),
            t('All 41 pricing formulas (Layout, Materials, Processes, Summary)',
              'Toàn bộ 41 công thức giá (Layout, Vật tư, Công đoạn, Tổng hợp)')],
          [11, t('11_Troubleshooting', '11_Xử lý sự cố'),
            t('Common errors, root causes and step-by-step fixes',
              'Lỗi thường gặp, nguyên nhân gốc và khắc phục từng bước')],
        ] },
      ],
    },

    // ── 01 Getting Started ──────────────────────────────────
    {
      name: t('01_Getting Started', '01_Bắt đầu'),
      cols: [26, 62, 48],
      blocks: [
        { type: 'title', text: t('GETTING STARTED — LOGIN, NAVIGATION & ROLES',
                                 'BẮT ĐẦU — ĐĂNG NHẬP, ĐIỀU HƯỚNG & VAI TRÒ'), span: 3 },
        { type: 'section', text: t('A. LOGIN', 'A. ĐĂNG NHẬP'), span: 3 },
        { type: 'table', header: [t('Step', 'Bước'), t('Action', 'Thao tác'), t('Notes', 'Ghi chú')], rows: [
          [1, t('Open the app URL in your browser (typically http://<server>:3000)',
                'Mở URL ứng dụng trên trình duyệt (thường là http://<server>:3000)'),
            t('Chrome / Edge / Safari — any modern browser', 'Chrome / Edge / Safari — trình duyệt hiện đại')],
          [2, t('Enter Username + Password on the login card (subtitle: "Server version.")',
                'Nhập Username + Password vào khung login (phụ đề: "Server version.")'),
            t('Credentials are managed by SYS in Settings → Account Control',
              'Tài khoản do SYS tạo trong Settings → Account Control')],
          [3, t('Check "Remember me" to keep your session longer',
                'Tick "Remember me" để session tồn tại lâu hơn'),
            t('Session duration is set per-user by SYS (Def / 1h / 8h / 24h / 7d)',
              'Thời hạn session do SYS đặt theo user (Def / 1h / 8h / 24h / 7d)')],
          [4, t('If 2FA is enabled, enter the 6-digit code from Google Authenticator',
                'Nếu đã bật 2FA, nhập mã 6 chữ số từ Google Authenticator'),
            t('TOTP codes rotate every 30 seconds', 'Mã TOTP thay đổi mỗi 30 giây')],
        ] },
        { type: 'section', text: t('B. SIDEBAR & MODULE SWITCHING', 'B. SIDEBAR & CHUYỂN MODULE'), span: 3 },
        { type: 'note', text: t(
          'The left sidebar groups tabs into sections (CALCULATORS, QUOTING & PRICING, MANUFACTURING, TRACKING, REPORTS, LIBRARIES, SYSTEM). Two top-level modules (Ops Cost, Planning) are switched via the module buttons at the top of the sidebar.',
          'Sidebar bên trái chia các tab thành nhóm (CALCULATORS, QUOTING & PRICING, MANUFACTURING, TRACKING, REPORTS, LIBRARIES, SYSTEM). Hai module chính (Ops Cost, Planning) chuyển qua các nút module ở đầu sidebar.'
        ), span: 3, height: 40 },
        { type: 'table', header: [t('Section', 'Nhóm'), t('Tabs', 'Các tab'), t('Who uses it', 'Ai dùng')], rows: [
          ['CALCULATORS', 'Standard · Complex · Material Cost · Inks Calculator',
            t('Cost engineers creating new quotes', 'Nhân viên cost tạo báo giá mới')],
          ['QUOTING & PRICING', 'Cost Breakdown · Formal Quotation · Quote History',
            t('Anyone viewing or releasing saved quotes',
              'Người xem hoặc phát hành báo giá đã lưu')],
          ['MANUFACTURING', 'Mfg Structures · Routing Ops · IFS Inventory',
            t('Reference data synced from IFS — mostly read-only',
              'Dữ liệu tham chiếu sync từ IFS — thường chỉ đọc')],
          ['TRACKING', 'RFQ Tracker · Sample Tracking',
            t('Sales + NPI teams logging customer inquiries',
              'Sales + NPI ghi nhận inquiry khách')],
          ['LIBRARIES', 'Rate Table (⏱) · Drop-Down Lists (⏷) · Finance Data (⚖)',
            t('Cost engineers maintaining rates and DDLs',
              'Cost engineer quản lý rate và DDL')],
          ['SYSTEM', 'Settings',
            t('SYS / ADMIN for users, backups, logs', 'SYS / ADMIN quản lý user, backup, log')],
        ] },
        { type: 'section', text: t('C. USER ROLES — WHAT EACH ROLE CAN DO',
                                    'C. VAI TRÒ NGƯỜI DÙNG — QUYỀN TỪNG VAI TRÒ'), span: 3 },
        { type: 'table', header: [t('Role', 'Vai trò'), t('Can do', 'Được làm'), t('Cannot do', 'Không được làm')], rows: [
          ['SYS',
            t('Everything — user CRUD, role changes, code backup/restore, system logs',
              'Toàn quyền — CRUD user, đổi role, backup/restore code, xem log'),
            '—'],
          ['ADMIN',
            t('User edits (not delete), Rate/DDL/Finance edit, Data backup/restore',
              'Sửa user (không xoá), sửa Rate/DDL/Finance, Data backup/restore'),
            t('Delete users, code restore, role changes above own level',
              'Xoá user, code restore, đổi role trên cấp mình')],
          ['COST',
            t('Full pricing tabs, save/update quotes, import Rate/DDL/Material',
              'Toàn bộ tab pricing, save/update báo giá, import Rate/DDL/Material'),
            t('User management, system backups',
              'Quản lý user, backup hệ thống')],
          ['USER',
            t('Create quotes, view libraries, export CSV',
              'Tạo báo giá, xem thư viện, xuất CSV'),
            t('Edit rate/DDL, delete anything',
              'Sửa rate/DDL, xoá dữ liệu')],
          ['VIEW',
            t('Read-only — view all data, no writes', 'Chỉ đọc — xem toàn bộ, không ghi'),
            t('Any save / update / delete', 'Mọi thao tác save / update / delete')],
        ] },
      ],
    },

    // ── 02 Standard Calc ────────────────────────────────────
    {
      name: t('02_Standard Calc', '02_Standard Calc'),
      cols: [22, 14, 22, 60],
      blocks: [
        { type: 'title', text: t('STANDARD CALCULATOR — SINGLE-PRODUCT PRICING',
                                 'MÁY TÍNH STANDARD — BÁO GIÁ 1 SẢN PHẨM'), span: 4 },
        { type: 'note', text: t(
          'Use Standard Calculator for a single finished good (1 FG code, 1 BOM). For multi-sub-product assemblies (FG Z referencing other parts), switch to Complex Calculator instead.',
          'Dùng Standard Calculator cho 1 thành phẩm duy nhất (1 FG, 1 BOM). Nếu là sản phẩm lắp ráp nhiều sub-product (FG Z tham chiếu part khác), dùng Complex Calculator.'
        ), span: 4, height: 38 },

        { type: 'section', text: t('A. HEADER TAB — BASIC INFO', 'A. TAB HEADER — THÔNG TIN CHUNG'), span: 4 },
        { type: 'table', header: [t('Field', 'Trường'), t('Required', 'BB'), t('Example', 'Ví dụ'), t('Purpose', 'Công dụng')], rows: [
          ['CCL Part Number', '✅', 'T3000001',
            t('Internal CCL code (T + 7 digits) — anchors the quote in history',
              'Mã nội bộ CCL (T + 7 số) — định danh báo giá trong lịch sử')],
          ['RFQ Number', '⬜', 'RFQ-26-0042',
            t('Customer RFQ reference — auto-linked to RFQ Tracker when saved',
              'Mã RFQ khách — tự liên kết RFQ Tracker khi save')],
          ['Direct Customer', '⬜', 'Samsung VN',
            t('Shows on Formal Quotation document',
              'Xuất hiện trên Formal Quotation')],
          ['MOQ', '✅', '250,000',
            t('⚠ MUST be > 0. MOQ = 0 causes Setup/Tooling divided by 1 → G.TOTAL inflated',
              '⚠ PHẢI > 0. MOQ = 0 khiến Setup/Tooling chia cho 1 → G.TOTAL sai lệch')],
          ['Annual Qty (EAU)', '✅', '3,000,000',
            t('Annual volume — used for tooling amortization',
              'Sản lượng năm — dùng khấu hao tooling')],
          ['Trade Mode', '✅', 'USD(Normal)',
            t('USD(Normal) = export, no VAT loss. USD(Book) = domestic, 8–10% VAT loss',
              'USD(Normal) = xuất khẩu, không VAT loss. USD(Book) = nội địa, VAT loss 8–10%')],
          ['Site', '✅', 'VN',
            t('Selects which workcenter rate table applies (VN / 41 RDC / 55 site / ...)',
              'Chọn bảng rate workcenter áp dụng (VN / 41 RDC / 55 site / ...)')],
          ['Selling Price', '⭕', '0.099',
            t('Required for GM% / VA% / Contr%. Warning shows in bottom WarningBar if 0',
              'Bắt buộc để có GM% / VA% / Contr%. WarningBar dưới sẽ báo nếu = 0')],
        ] },

        { type: 'section', text: t('B. LAYOUT TAB — GEOMETRY', 'B. TAB LAYOUT — HÌNH HỌC'), span: 4 },
        { type: 'table', header: [t('Field', 'Trường'), t('Example', 'Ví dụ'), t('Affects', 'Ảnh hưởng'), t('Notes', 'Ghi chú')], rows: [
          ['Part Width (TD)', '82 mm', 'QPA(m²), Offcut %',
            t('Across-web dimension', 'Kích thước theo chiều ngang web')],
          ['Part Length (MD)', '52 mm', t('Pitch, QPA', 'Pitch, QPA'),
            t('Along-machine dimension', 'Kích thước theo chiều chạy máy')],
          ['Num Webs', '1', 'QPA_LM, UPH',
            t('2 for duplex web', '2 cho duplex web')],
          ['Parts in MD / TD', '1 / 4', t('Layout per sheet', 'Layout/sheet'),
            t('Rows × columns of parts on the sheet', 'Hàng × cột part trên sheet')],
          ['Rotary Cols', '0', t('Pitch', 'Pitch'),
            t('0 = sheet mode; ≥1 = rotary mode (Pitch based on 3.175 mm pitch)',
              '0 = sheet mode; ≥1 = rotary mode (Pitch theo bước 3.175 mm)')],
          ['Web Width (log)', '104 mm', 'Offcut %',
            t('Parent log width — offcut = log_w mod mat_w',
              'Chiều rộng log gốc — offcut = log_w mod mat_w')],
        ] },

        { type: 'section', text: t('C. MATERIALS TAB — BOM', 'C. TAB MATERIALS — BOM'), span: 4 },
        { type: 'note', text: t(
          'Each row = one material layer. Main.Mat = primary face/liner; Process Mat = auxiliary (varnish, bonding, etc.). Select material code from the DB dropdown — Width/Price auto-fill. Setup LM (typically 30–80 m) is material wasted during machine setup.',
          'Mỗi dòng = 1 lớp vật tư. Main.Mat = lớp mặt chính; Process Mat = phụ trợ (varnish, keo...). Chọn mã từ DB — Width/Price tự điền. Setup LM (thường 30–80 m) là vật tư hao trong setup máy.'
        ), span: 4, height: 48 },

        { type: 'section', text: t('D. PROCESSES TAB — MACHINE & LABOR', 'D. TAB PROCESSES — MÁY & NHÂN CÔNG'), span: 4 },
        { type: 'table', header: [t('Field', 'Trường'), t('Example', 'Ví dụ'), t('Affects', 'Ảnh hưởng'), t('Notes', 'Ghi chú')], rows: [
          ['Process Type', 'Die_Cut', '—',
            t('Filters the Workcenter dropdown', 'Lọc dropdown Workcenter')],
          ['Workcenter', 'RDC350-12', 'Rate, UPH',
            t('Machine code — Rate looked up from Rate Table for the active Site',
              'Mã máy — Rate lấy từ Rate Table theo Site')],
          ['Speed', '60', 'UPH',
            t('UOM auto-filled (m/min, stamps/min, ...)',
              'UOM tự điền (m/min, stamps/min, ...)')],
          ['Efficiency', '0.85', 'UPH',
            t('0–1. Default 85%', '0–1. Mặc định 85%')],
          ['Setup Hours', '2', 'Setup cost',
            t('Changeover hours × rate → Setup cost', 'Giờ thay khuôn × rate → Setup cost')],
          ['Scrap %', '0.03', 'Yield, UPH',
            t('Process yield loss. Yield% = 1 − Σ(scrap_pct)',
              'Hao công đoạn. Yield% = 1 − Σ(scrap_pct)')],
          ['Tool Type', 'Metal', 'Tooling cost',
            t('⚠ DO NOT leave blank — tool_life fallback = 1 → huge tooling cost',
              '⚠ KHÔNG để trống — fallback tool_life = 1 → tooling cost rất lớn')],
        ] },

        { type: 'section', text: t('E. PACKING TAB & SAVE', 'E. TAB PACKING & LƯU'), span: 4 },
        { type: 'note', text: t(
          'Enter container + box + shipping costs. Click "Save New" for a new revision, or "Update" to overwrite the currently-loaded quote. "Release" generates the Formal Quotation document via /save-quotation.',
          'Nhập chi phí container + box + shipping. Bấm "Save New" cho revision mới, hoặc "Update" ghi đè báo giá đang mở. "Release" tạo Formal Quotation qua /save-quotation.'
        ), span: 4, height: 42 },
      ],
    },

    // ── 03 Complex Calc ─────────────────────────────────────
    {
      name: t('03_Complex Calc', '03_Complex Calc'),
      cols: [22, 52, 40],
      blocks: [
        { type: 'title', text: t('COMPLEX CALCULATOR — MULTI SUB-PRODUCT ASSEMBLIES',
                                 'MÁY TÍNH COMPLEX — LẮP RÁP NHIỀU SUB-PRODUCT'), span: 3 },
        { type: 'note', text: t(
          'Use Complex when a finished good (e.g. FG Z) references other sub-products as a material. The calc engine runs a two-pass aggregate: pass 1 costs each SP independently, pass 2 re-runs any SP that references another SP, picking up the pass-1 cost.',
          'Dùng Complex khi một FG (vd FG Z) tham chiếu sub-product khác như vật tư. Engine tính 2 lượt: lượt 1 tính từng SP độc lập, lượt 2 chạy lại SP nào tham chiếu SP khác và lấy cost từ lượt 1.'
        ), span: 3, height: 52 },

        { type: 'section', text: t('A. SUB-PRODUCT ROWS', 'A. CÁC DÒNG SUB-PRODUCT'), span: 3 },
        { type: 'table', header: [t('SP Code', 'Mã SP'), t('Role', 'Vai trò'), t('Example', 'Ví dụ')], rows: [
          ['FG Z', t('Finished good — what ships to the customer', 'Thành phẩm — sản phẩm giao khách'), 'FG-Label-Assy'],
          ['SP 0..n', t('Sub-products referenced by FG Z (face, liner, adhesive layer, ...)',
                         'Sub-product FG Z tham chiếu (face, liner, lớp keo...)'), 'SP-Face, SP-Adhesive'],
        ] },

        { type: 'section', text: t('B. TIERED PRICING (num_moq)', 'B. BÁO GIÁ THEO BẬC (num_moq)'), span: 3 },
        { type: 'note', text: t(
          'Set num_moq > 1 and add rows in "Extra MOQs" for volume-break pricing. Each tier has its own MOQ, Selling Price, EAU, and Target. Cost Breakdown expands the quote into one row per tier. WarningBar will flag a mismatch between num_moq and the number of extra tiers.',
          'Đặt num_moq > 1 và thêm dòng trong "Extra MOQs" để có bậc giá theo sản lượng. Mỗi bậc có MOQ, Selling Price, EAU, Target riêng. Cost Breakdown hiển thị 1 dòng/bậc. WarningBar sẽ báo lỗi nếu num_moq không khớp số extra tier.'
        ), span: 3, height: 52 },

        { type: 'section', text: t('C. CROSS-REFERENCE CHECK', 'C. KIỂM TRA THAM CHIẾU CHÉO'), span: 3 },
        { type: 'table', header: ['#', t('Check', 'Kiểm tra'), t('Why', 'Lý do')], rows: [
          [1, t('Every material code referencing another SP must exist in this quote',
                'Mọi mã vật tư tham chiếu SP khác phải tồn tại trong báo giá này'),
            t('Otherwise the engine silently skips the reference → cost too low',
              'Nếu không engine bỏ qua → cost thấp hơn thực tế')],
          [2, t('FG Z row must be the LAST row so it sees all upstream SP results',
                'Dòng FG Z phải ở CUỐI để thấy kết quả tất cả SP ở trên'),
            t('Row order drives the calc-all loop', 'Thứ tự dòng quyết định vòng lặp tính')],
          [3, t('ship_qty on each SP = expected yield qty, not input qty',
                'ship_qty mỗi SP = sản lượng đầu ra, không phải đầu vào'),
            t('Input qty = ship_qty × (1 + scrap)', 'Input qty = ship_qty × (1 + scrap)')],
        ] },
      ],
    },

    // ── 04 Cost Breakdown ───────────────────────────────────
    {
      name: t('04_Cost Breakdown', '04_Cost Breakdown'),
      cols: [28, 42, 52],
      blocks: [
        { type: 'title', text: t('COST BREAKDOWN — SUMMARIZE TAB',
                                 'COST BREAKDOWN — TAB SUMMARIZE'), span: 3 },
        { type: 'note', text: t(
          'Cost Breakdown fetches every saved quote via sharedApi.getQuotes() and expands each one into one row per MOQ tier. Standard + Complex share the same row shape; the per-tier calculation differs behind the scenes.',
          'Cost Breakdown lấy mọi báo giá qua sharedApi.getQuotes() và bung thành 1 dòng/bậc MOQ. Standard + Complex dùng chung shape, chỉ khác cách tính cost mỗi bậc.'
        ), span: 3, height: 48 },

        { type: 'section', text: t('A. COLUMNS', 'A. CÁC CỘT'), span: 3 },
        { type: 'table', header: [t('Column', 'Cột'), t('Formula', 'Công thức'), t('Notes', 'Ghi chú')], rows: [
          ['RFQ NO', t('state.rfq_number OR Q<id>', 'state.rfq_number HOẶC Q<id>'),
            t('Right-click → color bar to tag important rows',
              'Click phải → color bar để đánh dấu dòng quan trọng')],
          ['Direct Customer', 'state.direct_cu', ''],
          ['End Customer', 'state.project',
            t('Legacy naming — field is "project" in state',
              'Tên cũ — field trong state là "project"')],
          ['MOQ', 'moq (tier-specific)', ''],
          ['Yield %', '1 − Σ(scrap_pct)',
            t('Simple sum across every process with a workcenter',
              'Tổng đơn giản các công đoạn có workcenter')],
          ['Material', 'r.s_mat_cost',
            t('Total material $/unit including Setup LM, Offcut%, VAT loss',
              'Tổng vật tư $/đơn vị gồm Setup LM, Offcut%, VAT loss')],
          ['Overhead / Labor / Tooling / Pack&Ship', '—',
            t('Per calcAll() outputs', 'Theo output calcAll()')],
          ['G.Total', 'Σ of above',
            t('Bolded — the grand total cost per unit', 'In đậm — tổng cost/đơn vị')],
          ['GM%', '(SP − G.Total) / SP',
            t('Color-coded: green ≥20%, amber ≥10%, red <10%',
              'Tô màu: xanh ≥20%, vàng ≥10%, đỏ <10%')],
        ] },

        { type: 'section', text: t('B. SEARCH & EXPORT', 'B. TÌM KIẾM & XUẤT'), span: 3 },
        { type: 'table', header: [t('Feature', 'Tính năng'), t('How', 'Cách dùng'), t('Notes', 'Ghi chú')], rows: [
          [t('Search', 'Tìm kiếm'),
            t('Top-right search box', 'Ô search phải trên'),
            t('Filters by CCL PN, customer, project, RFQ, NPI owner, End CU PN',
              'Lọc theo CCL PN, khách, project, RFQ, NPI owner, End CU PN')],
          [t('Right-click menu', 'Menu chuột phải'),
            t('Right-click any row', 'Click phải dòng bất kỳ'),
            t('Open (load in calc), Color bar, Copy row',
              'Open (mở trong calc), Color bar, Copy dòng')],
          [t('CSV Export', 'Xuất CSV'),
            t('CSV Export button', 'Nút CSV Export'),
            t('All visible columns, all filtered rows',
              'Tất cả cột hiển thị, tất cả dòng đã lọc')],
        ] },
      ],
    },

    // ── 05 Quote Workflow ───────────────────────────────────
    {
      name: t('05_Quote Workflow', '05_Quy trình'),
      cols: [8, 30, 28, 50],
      blocks: [
        { type: 'title', text: t('END-TO-END QUOTE WORKFLOW', 'QUY TRÌNH BÁO GIÁ TRỌN VẸN'), span: 4 },

        { type: 'section', text: t('THE 5 STAGES', 'GỒM 5 GIAI ĐOẠN'), span: 4 },
        { type: 'table', header: ['#', t('Stage', 'Giai đoạn'), t('Tab', 'Tab'), t('Output', 'Kết quả')], rows: [
          [1, t('Log inquiry', 'Ghi nhận inquiry'), 'RFQ Tracker',
            t('RFQ row with customer, project, owner, deadline',
              'Dòng RFQ gồm khách, project, owner, deadline')],
          [2, t('Build quote', 'Xây báo giá'), 'Standard / Complex Calculator',
            t('quote_history.json entry via Save/Update',
              'Entry trong quote_history.json qua Save/Update')],
          [3, t('Review cost rollup', 'Review cost tổng'), 'Cost Breakdown',
            t('Verify GM% is green (≥20%) across all MOQ tiers',
              'Kiểm tra GM% xanh (≥20%) ở mọi bậc MOQ')],
          [4, t('Issue document', 'Phát hành tài liệu'), 'Formal Quotation',
            t('Library/ReleasedQuotation/<ref>_<ts>.json via /save-quotation',
              'Library/ReleasedQuotation/<ref>_<ts>.json qua /save-quotation')],
          [5, t('Audit history', 'Kiểm tra lịch sử'), 'Quote History',
            t('Right-click → Open to reload any revision',
              'Click phải → Open để mở lại bản cũ')],
        ] },

        { type: 'section', text: t('BEST PRACTICES', 'KINH NGHIỆM TỐT'), span: 4 },
        { type: 'table', header: ['#', t('Practice', 'Nguyên tắc'), t('Why', 'Lý do'), t('Notes', 'Ghi chú')], rows: [
          [1, t('Always enter RFQ Number in Header before Save',
                'Luôn nhập RFQ Number ở Header trước khi Save'),
            t('Links Cost Breakdown / Quote History back to the tracker',
              'Liên kết Cost Breakdown / Quote History với tracker'),
            t('Use RFQ-<year>-<seq> format', 'Dùng định dạng RFQ-<năm>-<seq>')],
          [2, t('Use "Update" (not "Save New") when refining a live quote',
                'Dùng "Update" (không "Save New") khi chỉnh báo giá đang mở'),
            t('Keeps a single version; Save New creates a new id',
              'Giữ 1 bản duy nhất; Save New tạo id mới'),
            t('Save New only for major revisions', 'Save New chỉ cho revision lớn')],
          [3, t('Release only AFTER Cost Breakdown GM% is green for every tier',
                'Chỉ Release SAU KHI mọi bậc Cost Breakdown có GM% xanh'),
            t('Released quotations are hard to recall',
              'Báo giá đã phát hành khó thu hồi'),
            t('Green = ≥20% GM', 'Xanh = GM ≥20%')],
          [4, t('Watch the WarningBar at the bottom — fix all errors before Save',
                'Theo dõi WarningBar dưới cùng — sửa hết lỗi trước khi Save'),
            t('New in v1.0 — live validation of every required field',
              'Mới từ v1.0 — validate live mọi field bắt buộc'),
            t('Click the bar to see all errors', 'Click bar để xem tất cả lỗi')],
        ] },
      ],
    },

    // ── 06 Libraries ────────────────────────────────────────
    {
      name: t('06_Libraries', '06_Thư viện'),
      cols: [24, 72],
      blocks: [
        { type: 'title', text: t('LIBRARIES — RATE TABLE, DDL, FINANCE DATA',
                                 'THƯ VIỆN — RATE TABLE, DDL, FINANCE DATA'), span: 2 },

        { type: 'section', text: t('A. RATE TABLE (⏱)', 'A. RATE TABLE (⏱)'), span: 2 },
        { type: 'note', text: t(
          'Workcenter rates per site. Each row = 1 machine with Crew, Machine USD/H, Labor USD/H, Speed UOM, OH Cost, W/C code. Use the site chips (VN / 41 RDC / 41 Flexo / 55 / 49 / 54 / India) to switch the active site. All rates are in USD per hour.',
          'Rate workcenter theo site. Mỗi dòng = 1 máy với Crew, Machine USD/H, Labor USD/H, Speed UOM, OH Cost, mã W/C. Dùng chip site (VN / 41 RDC / 41 Flexo / 55 / 49 / 54 / India) để đổi site. Rate tính bằng USD/giờ.'
        ), span: 2, height: 54 },
        { type: 'table', header: [t('Action', 'Thao tác'), t('How', 'Cách dùng')], rows: [
          [t('Edit a rate', 'Sửa rate'),
            t('Click the cell, type the new value, then Save (Save enables only when dirty)',
              'Click ô, nhập giá trị mới, rồi Save (Save chỉ sáng khi có thay đổi)')],
          [t('Add a workcenter', 'Thêm workcenter'),
            t('Click "+ Add Row" below the table (moved from toolbar in v1.0)',
              'Click "+ Add Row" dưới bảng (chuyển từ toolbar xuống từ v1.0)')],
          [t('Import from CSV/XLSX', 'Import CSV/XLSX'),
            t('Click Import → pick a file. Columns are fuzzy-matched. Blank rows filtered automatically.',
              'Click Import → chọn file. Cột tự match. Dòng trống tự lọc.')],
          [t('Backup / Restore', 'Sao lưu / Khôi phục'),
            t('Backup writes to Library/Rate/backups/. Restore lists all backups.',
              'Backup ghi vào Library/Rate/backups/. Restore liệt kê bản sao lưu.')],
          [t('Export CSV', 'Xuất CSV'),
            t('Server writes Library/Rate/rate_<site>.csv and streams to the browser',
              'Server ghi Library/Rate/rate_<site>.csv và stream về trình duyệt')],
        ] },

        { type: 'section', text: t('B. DROP-DOWN LISTS (⏷)', 'B. DROP-DOWN LISTS (⏷)'), span: 2 },
        { type: 'note', text: t(
          'Per-site reference enums used across the app: Tool Life (shots per tool type), Click Charges (Indigo $/click), Ink Coverage tables, etc. Edit inline, Save. Every edit creates an automatic backup.',
          'Enum tham chiếu theo site dùng toàn app: Tool Life (số shot mỗi tool), Click Charges (Indigo $/click), bảng Ink Coverage... Sửa trực tiếp, Save. Mỗi lần sửa tự backup.'
        ), span: 2, height: 48 },
        { type: 'table', header: [t('Key Table', 'Bảng quan trọng'), t('Purpose', 'Công dụng')], rows: [
          ['tool_life',
            t('Shots before tool replacement — feeds Tooling formula in calcAll()',
              'Số shot trước khi thay tool — đưa vào công thức Tooling trong calcAll()')],
          ['click_charge',
            t('Indigo cost per click — used when print_type = Indigo',
              'Cost/click Indigo — dùng khi print_type = Indigo')],
          ['ink_coverage',
            t('SS/Flexo/LP coverage % by print type',
              'Coverage % SS/Flexo/LP theo print type')],
        ] },

        { type: 'section', text: t('C. FINANCE DATA (⚖)', 'C. FINANCE DATA (⚖)'), span: 2 },
        { type: 'note', text: t(
          'Three sub-tabs: Work Center Rates, DB Finance Data, Expenses. Year selector at top-right switches between fiscal years. Work Center Rates here are derived from the full P&L cost-group aggregation — NOT the editable Rate Table. Treat this as reference data.',
          'Ba tab con: Work Center Rates, DB Finance Data, Expenses. Chọn năm ở phải trên. Work Center Rates ở đây lấy từ P&L aggregation — KHÁC Rate Table sửa được. Đây là dữ liệu tham chiếu.'
        ), span: 2, height: 60 },
      ],
    },

    // ── 07 Import / Export ──────────────────────────────────
    {
      name: t('07_Import Export', '07_Import Export'),
      cols: [26, 38, 50],
      blocks: [
        { type: 'title', text: t('IMPORT / EXPORT — CSV & XLSX', 'IMPORT / EXPORT — CSV & XLSX'), span: 3 },

        { type: 'section', text: t('A. WHAT YOU CAN IMPORT', 'A. CÓ THỂ IMPORT GÌ'), span: 3 },
        { type: 'table', header: [t('Dataset', 'Dữ liệu'), t('Endpoint', 'Endpoint'), t('Required headers (any-case)', 'Header bắt buộc')], rows: [
          ['IFS Inventory', '/api/import/inventory', 'Part No'],
          ['Finished Goods', '/api/import/finished-goods', 'Part No'],
          ['Raw Materials', '/api/import/raw-materials', 'Part No'],
          ['Mfg Structures (BOM)', '/api/import/bom', 'Parent Part No, Component Part'],
          ['Routing Operations', '/api/import/routing', 'Part No, Operation No, Work Centre No'],
          ['Rate Table (per site)', '/api/import/rate?site=<site>',
            'Workcenter, Crew, Machine USD/H, Labor USD/H, Speed UOM, OH Cost'],
          ['NPI Materials', '/api/import/npi-materials',
            'Date, Name, Price, Type, Thick, Supplier'],
          ['Sourcing DB', '/api/import/sourcing-db',
            'Month, Customer, Material, EXW, DAP, Supplier'],
        ] },

        { type: 'section', text: t('B. HOW IMPORT WORKS', 'B. IMPORT HOẠT ĐỘNG THẾ NÀO'), span: 3 },
        { type: 'table', header: [t('Step', 'Bước'), t('What happens', 'Diễn biến'), t('Notes', 'Ghi chú')], rows: [
          [1, t('Server receives the file via multipart upload (max 50 MB)',
                'Server nhận file qua multipart upload (tối đa 50 MB)'),
            '/tmp/ops-control-uploads/'],
          [2, t('Parses CSV (comma/semicolon/tab) or XLSX (xlsx package)',
                'Parse CSV (dấu phẩy/chấm phẩy/tab) hoặc XLSX (package xlsx)'),
            t('Custom CSV parser handles quoted fields',
              'Parser CSV custom xử lý field có dấu ngoặc')],
          [3, t('Validates required headers — refuses file if any are missing',
                'Validate header bắt buộc — từ chối nếu thiếu'),
            t('Prevents wrong-dataset upload',
              'Chống upload nhầm dataset')],
          [4, t('Backs up the current target file with _backup_<timestamp> suffix',
                'Backup file hiện tại với hậu tố _backup_<timestamp>'),
            t('Auto-recoverable', 'Có thể tự khôi phục')],
          [5, t('Fuzzy-maps columns (Rate, NPI, Sourcing only)',
                'Fuzzy match cột (chỉ Rate, NPI, Sourcing)'),
            t('Header names are case-insensitive',
              'Tên header không phân biệt hoa/thường')],
          [6, t('Writes new data, clears server cache',
                'Ghi dữ liệu mới, clear cache server'),
            t('Next read serves the new data',
              'Lần đọc sau trả dữ liệu mới')],
        ] },

        { type: 'section', text: t('C. EXPORTS', 'C. XUẤT FILE'), span: 3 },
        { type: 'table', header: [t('Location', 'Vị trí'), t('Button', 'Nút'), t('Format', 'Định dạng')], rows: [
          [t('Rate Table', 'Rate Table'), 'Export CSV',
            t('CSV in Library/Rate/', 'CSV trong Library/Rate/')],
          [t('DDL (per site)', 'DDL (theo site)'), 'Export CSV',
            t('CSV in Library/DDL/', 'CSV trong Library/DDL/')],
          [t('Cost Breakdown', 'Cost Breakdown'), 'CSV Export',
            t('Browser download — all filtered rows',
              'Tải về trình duyệt — tất cả dòng đã lọc')],
          [t('Material Library', 'Thư viện vật tư'), 'Export CSV',
            t('Browser download — current dataset (NPI or Sourcing)',
              'Tải về — dataset hiện tại (NPI hoặc Sourcing)')],
        ] },
      ],
    },

    // ── 08 Backup Restore ───────────────────────────────────
    {
      name: t('08_Backup Restore', '08_Sao lưu'),
      cols: [26, 70],
      blocks: [
        { type: 'title', text: t('BACKUP & RESTORE — DATA AND CODE',
                                 'SAO LƯU & KHÔI PHỤC — DỮ LIỆU VÀ MÃ NGUỒN'), span: 2 },
        { type: 'note', text: t(
          'As of v1.0 all backups live in <package>/Backup & restore/ (NOT server/data/Backup/). Two sub-folders: Data/ for JSON snapshots of the library, Code/ for full source-tree snapshots of the package.',
          'Từ v1.0, toàn bộ backup ở <package>/Backup & restore/ (KHÔNG phải server/data/Backup/). Hai thư mục con: Data/ cho JSON snapshot thư viện, Code/ cho snapshot toàn bộ source.'
        ), span: 2, height: 52 },

        { type: 'section', text: t('A. DATA BACKUP', 'A. DATA BACKUP'), span: 2 },
        { type: 'table', header: [t('Action', 'Thao tác'), t('Result', 'Kết quả')], rows: [
          [t('Create Data Backup', 'Tạo Data Backup'),
            t('Builds a JSON snapshot of 13 library files into Backup & restore/Data/manual_<ts>.json',
              'Build JSON snapshot 13 file thư viện vào Backup & restore/Data/manual_<ts>.json')],
          [t('Restore (Data)', 'Restore Data'),
            t('SYS only. Overwrites library files. A safety pre_restore_<ts>.json is written first.',
              'Chỉ SYS. Ghi đè file thư viện. Trước đó tự ghi safety pre_restore_<ts>.json.')],
          [t('Delete', 'Xoá'),
            t('SYS only. Removes the backup file from disk.',
              'Chỉ SYS. Xoá file backup khỏi ổ đĩa.')],
          [t('Download', 'Tải về'),
            t('Streams the JSON file to the browser — useful for off-site archive',
              'Stream file JSON về trình duyệt — dùng lưu trữ off-site')],
        ] },

        { type: 'section', text: t('B. CODE BACKUP', 'B. CODE BACKUP'), span: 2 },
        { type: 'table', header: [t('Action', 'Thao tác'), t('Result', 'Kết quả')], rows: [
          [t('Create Code Backup', 'Tạo Code Backup'),
            t('ADMIN+. Copies the entire package source tree into Backup & restore/Code/code_<ts>/. Excludes node_modules, dist, .git, server/data, and the backup folder itself.',
              'ADMIN+. Copy toàn bộ source package vào Backup & restore/Code/code_<ts>/. Bỏ node_modules, dist, .git, server/data, chính thư mục backup.')],
          [t('Restore (Code)', 'Restore Code'),
            t('SYS only. DANGEROUS — overwrites the running package source. A pre_restore_<ts>/ safety snapshot is created first. You MUST restart the Node server after a code restore.',
              'Chỉ SYS. NGUY HIỂM — ghi đè source đang chạy. Trước đó tự tạo snapshot pre_restore_<ts>/. PHẢI restart Node server sau khi restore.')],
        ] },

        { type: 'section', text: t('C. FILES INCLUDED IN A CODE BACKUP',
                                    'C. FILE TRONG CODE BACKUP'), span: 2 },
        { type: 'table', header: [t('Included', 'Có'), t('Excluded', 'Không')], rows: [
          ['client/src, client/index.html, client/package.json', 'client/node_modules, client/dist'],
          ['server/ (routes, services, middleware, legacy)', 'server/data/** (backed up separately)'],
          ['package.json, scripts/, README, CLAUDE.md', '.git, node_modules'],
          ['—', 'Backup & restore/ (prevents self-recursion)'],
        ] },
      ],
    },

    // ── 09 Settings ─────────────────────────────────────────
    {
      name: t('09_Settings', '09_Cài đặt'),
      cols: [24, 50, 22],
      blocks: [
        { type: 'title', text: t('SETTINGS — ACCOUNT CONTROL & SYSTEM',
                                 'CÀI ĐẶT — ACCOUNT CONTROL & HỆ THỐNG'), span: 3 },

        { type: 'section', text: t('A. ACCOUNT CONTROL (SYS / ADMIN)',
                                    'A. ACCOUNT CONTROL (SYS / ADMIN)'), span: 3 },
        { type: 'note', text: t(
          'Users table has 10 columns: Username/Display, Full Name (VN), ID No, Email, Phone, Role, Token TTL, PWD change date, Delete flag, Actions. Responsive — columns hide on narrow screens automatically.',
          'Bảng User có 10 cột: Username/Display, Họ tên (VN), ID No, Email, Phone, Role, Token TTL, Ngày đổi PWD, Delete flag, Actions. Responsive — tự ẩn cột khi màn hình hẹp.'
        ), span: 3, height: 50 },

        { type: 'table', header: [t('Action icon', 'Icon'), t('Meaning', 'Ý nghĩa'), t('Role', 'Vai trò')], rows: [
          [t('Pencil', 'Bút chì'),
            t('Edit profile (full name, email, phone, role)',
              'Sửa profile (họ tên, email, phone, role)'),
            t('Self OR ADMIN+', 'Tự / ADMIN+')],
          [t('Key', 'Chìa khoá'),
            t('Reset password — prompts for a new plaintext password',
              'Reset mật khẩu — nhập mật khẩu mới'),
            t('Self OR ADMIN+', 'Tự / ADMIN+')],
          [t('Shield', 'Khiên'),
            t('Setup 2FA (TOTP) — coming soon', 'Setup 2FA (TOTP) — sắp có'),
            t('Self OR SYS', 'Tự / SYS')],
          [t('Padlock', 'Khoá'),
            t('Lock / unlock user account', 'Khoá / mở khoá tài khoản'),
            'SYS'],
          [t('Trash', 'Thùng rác'),
            t('Permanently delete user', 'Xoá user vĩnh viễn'),
            'SYS'],
        ] },

        { type: 'section', text: t('B. SESSION TOKEN TTL', 'B. SESSION TOKEN TTL'), span: 3 },
        { type: 'note', text: t(
          'SYS can set per-user token duration (Def / 1h / 2h / 4h / 8h / 12h / 16h / 24h / 2d / 3d / 7d). Shorter = more secure; longer = fewer re-logins.',
          'SYS đặt thời gian token cho từng user (Def / 1h / 2h / 4h / 8h / 12h / 16h / 24h / 2d / 3d / 7d). Ngắn = bảo mật cao hơn; dài = ít phải đăng nhập lại.'
        ), span: 3, height: 42 },
      ],
    },

    // ── 10 Master Formulas ──────────────────────────────────
    {
      name: t('10_Master Formulas', '10_Công thức'),
      cols: [12, 28, 52, 10, 20],
      blocks: [
        { type: 'title', text: t('MASTER FORMULA REFERENCE — 41 FORMULAS',
                                 'CÔNG THỨC TOÀN BỘ — 41 CÔNG THỨC'), span: 5 },
        { type: 'note', text: t(
          'All formulas live in client/src/services/calcEngine.js and are unit-tested in calcEngine.test.js. Variables in lowercase are state fields the user enters.',
          'Toàn bộ công thức ở client/src/services/calcEngine.js và được unit test tại calcEngine.test.js. Biến viết thường là field state do user nhập.'
        ), span: 5, height: 42 },

        { type: 'table', header: [t('Group', 'Nhóm'), t('Name', 'Tên'), t('Formula', 'Công thức'), t('Unit', 'Đv'), t('Function', 'Hàm')], rows: [
          ['LAYOUT', 'Pitch (Sheet)', 'P = sheet_length + min_gap_md', 'mm', 'calcPitch()'],
          ['LAYOUT', 'Pitch (Rotary)', 'Z=⌈(L+G)×cols/3.175⌉; P=Z×3.175/cols', 'mm', 'calcPitch()'],
          ['LAYOUT', 'Layout/Sheet', 'L = parts_in_md × parts_web_across', 'cav', 'calcLayoutPerSheet()'],
          ['LAYOUT', 'QPA (m²)', 'QPA = Pitch×Width / 1e6 / Cav / Webs × Usage', 'm²/pcs', 'calcMat()'],
          ['LAYOUT', 'QPA (LM)', 'QPA_LM = Pitch / 1000 / Cav / Webs × Usage', 'LM/pcs', 'calcQPA_LM()'],
          ['LAYOUT', 'Scrap Factor (compound)', 'S = 1 − ∏(1 − scrap_pct_i)', '%', 'calcMatScrapFactor()'],
          ['LAYOUT', 'Offcut %', 'OC = (log_w MOD mat_w) / log_w', '%', 'calcOffcut()'],
          ['LAYOUT', 'Yield (display)', 'Y = 1 − Σ(scrap_pct_i)', '%', 'Summarize.jsx'],
          ['MAT',    'Setup LM Cost', '(setup_lm × width × price) / moq', '$/pc', 'calcMat()'],
          ['MAT',    'Run LM Cost', 'QPA(m²) × price × (1+offcut) × (1+vat_loss)', '$/pc', 'calcMat()'],
          ['MAT',    'VAT Loss', 'price × 0.08  [USD(Book) only]', '$/pc', 'calcMat()'],
          ['PROC',   'UPH', 'speed × 60 × cavities × eff / scrap_factor', 'pc/hr', 'calcProc()'],
          ['PROC',   'Setup Cost/unit', '(setup_h × rate) / moq', '$/pc', 'calcProc()'],
          ['PROC',   'Run Cost/unit', 'rate / UPH', '$/pc', 'calcProc()'],
          ['PROC',   'Tooling/unit', '(tool_cost × tool_qty) / min(tool_life × moq, eau)', '$/pc', 'calcProc()'],
          ['INK',    'Coverage Cost', 'coverage% × area% × QPA(m²) × ink_price', '$/pc', 'calcInk()'],
          ['INK',    'Click Cost', 'click_charge × click_qty / moq', '$/pc', 'calcInk()'],
          ['PACK',   'Container/unit', 'container_cost / pcs_per_bag', '$/pc', 'calcPack()'],
          ['PACK',   'Box/unit', 'box_cost / bags_per_box / pcs_per_bag', '$/pc', 'calcPack()'],
          ['PACK',   'Ship/unit', '(ship_cost + other_ship) / ship_qty', '$/pc', 'calcPack()'],
          ['SUM',    'G.Total', 'mat + oh + lab + tool + pack + ink + vat_loss', '$/pc', 'calcAll()'],
          ['SUM',    'GM%', '(SP − G.Total) / SP', '%', 'calcAll()'],
          ['SUM',    'VA%', '(SP − Material) / SP', '%', 'calcAll()'],
          ['SUM',    'Contribution %', '(SP − Material − Pack_Ship) / SP', '%', 'calcAll()'],
        ] },
      ],
    },

    // ── 11 Troubleshooting ──────────────────────────────────
    {
      name: t('11_Troubleshooting', '11_Xử lý sự cố'),
      cols: [5, 34, 34, 38, 10],
      blocks: [
        { type: 'title', text: t('TROUBLESHOOTING — COMMON ERRORS & FIXES',
                                 'XỬ LÝ SỰ CỐ — LỖI THƯỜNG GẶP & KHẮC PHỤC'), span: 5 },

        { type: 'table', header: ['#', t('Symptom', 'Triệu chứng'), t('Root cause', 'Nguyên nhân gốc'),
          t('Fix', 'Khắc phục'), t('Sev', 'Mức')], rows: [
          [1,
            t('"Release Quotation" → "No known fields in payload"',
              '"Release Quotation" → "No known fields in payload"'),
            t('Backend running old api.js (POST /save-all with formalQuotation key)',
              'Backend chạy bản api.js cũ (POST /save-all với key formalQuotation)'),
            t('Restart the Node server. Fixed in v1.0 — saveQuotation now calls /save-quotation directly.',
              'Restart Node server. Đã fix ở v1.0 — saveQuotation gọi thẳng /save-quotation.'),
            '🔴'],
          [2,
            t('Create Code Backup → 500 Internal Server Error',
              'Create Code Backup → 500 Internal Server Error'),
            t('ESM __dirname polyfill missing in costApi.js',
              'Thiếu polyfill __dirname trong costApi.js'),
            t('Fixed in v1.0. Any new server file must use fileURLToPath(import.meta.url)',
              'Đã fix ở v1.0. File server mới phải dùng fileURLToPath(import.meta.url)'),
            '🔴'],
          [3,
            t('VA% / GM% = −435,000% (extreme negative)',
              'VA% / GM% = −435,000% (âm cực lớn)'),
            t('DDL tool_life = 1 instead of 200,000',
              'DDL tool_life = 1 thay vì 200,000'),
            t('Open Drop-Down Lists → tool_life → restore correct values',
              'Mở DDL → tool_life → phục hồi giá trị đúng'),
            '🔴'],
          [4,
            t('G.Total cost 250,000× too high',
              'G.Total cost cao 250,000 lần'),
            t('MOQ = 0 → Setup/Tooling divided by 1',
              'MOQ = 0 → Setup/Tooling chia cho 1'),
            t('Always enter MOQ > 0 in Header. Template default = 250,000',
              'Luôn nhập MOQ > 0 ở Header. Mặc định = 250,000'),
            '🔴'],
          [5,
            t('Tooling cost > 5% of total',
              'Tooling cost > 5% tổng'),
            t('Tool Type not selected → tool_life fallback = 1',
              'Tool Type chưa chọn → fallback tool_life = 1'),
            t('Select Tool Type from dropdown. Verify tool life > 1,000',
              'Chọn Tool Type từ dropdown. Kiểm tra tool life > 1,000'),
            '🔴'],
          [6,
            t('Material cost = $0 after selecting material code',
              'Material cost = $0 sau khi chọn mã vật tư'),
            t('Width = 0 or Price = 0 in DB; Pitch = 0',
              'Width = 0 hoặc Price = 0 trong DB; Pitch = 0'),
            t('Verify Width > 0 in DB; check Pitch + QPA display',
              'Kiểm tra Width > 0; check Pitch + QPA'),
            '🟡'],
          [7,
            t('Import CSV fails with "Missing required columns"',
              'Import CSV "Missing required columns"'),
            t('Wrong file for wrong tab — server validates headers',
              'Nhầm file cho tab — server validate header'),
            t('Check 07_Import Export for the required headers',
              'Xem 07_Import Export để biết header bắt buộc'),
            '🟡'],
          [8,
            t('Rate Table import: "No rate rows recognised"',
              'Rate Table import: "No rate rows recognised"'),
            t('Header names too unusual for fuzzy match',
              'Tên cột quá khác so với fuzzy match'),
            t('Use Workcenter / Crew / Machine USD/H / Labor USD/H / Speed UOM / OH Cost',
              'Dùng tên chuẩn: Workcenter / Crew / Machine USD/H / Labor USD/H / Speed UOM / OH Cost'),
            '🟡'],
          [9,
            t('Login OK but sidebar is empty',
              'Đăng nhập OK nhưng sidebar trống'),
            t('User role has no module access',
              'Role user không có quyền module'),
            t('SYS must grant Ops Cost / Planning module access',
              'SYS cấp quyền module Ops Cost / Planning'),
            '🟡'],
          [10,
            t('"No backups found" even after creating one',
              '"No backups found" dù đã tạo'),
            t('Wrong tab (Data vs Code) OR folder not writable',
              'Nhầm tab (Data vs Code) HOẶC thư mục không ghi được'),
            t('Switch to the correct tab; check server file permissions',
              'Chuyển đúng tab; kiểm tra quyền ghi trên server'),
            '🟢'],
          [11,
            t('WarningBar at the bottom shows errors',
              'WarningBar dưới cùng hiện lỗi'),
            t('Required calc fields missing or 0 — see the message',
              'Field bắt buộc còn thiếu hoặc = 0 — xem message'),
            t('Click the bar to expand all errors, fix them one by one',
              'Click bar để xem tất cả lỗi, sửa từng lỗi'),
            '🟢'],
        ] },
      ],
    },
  ];
}

// ── Rendering ──────────────────────────────────────────────────

function styleCell(cell, { fill, font, align, border = true }) {
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (font) cell.font = { name: FONT, ...font };
  if (align) cell.alignment = { wrapText: true, vertical: 'middle', ...align };
  if (border) cell.border = allBorders;
}

function renderBlock(ws, block, ncols, rowPointer) {
  let r = rowPointer;

  if (block.type === 'title') {
    const row = ws.getRow(r);
    row.getCell(1).value = block.text;
    ws.mergeCells(r, 1, r + (block.height && block.height > 40 ? 1 : 0), Math.min(block.span || ncols, ncols));
    row.height = block.height || 40;
    styleCell(row.getCell(1), {
      fill: COLORS.titleBg,
      font: { bold: true, size: 15, color: { argb: COLORS.titleFg } },
      align: { horizontal: 'left', indent: 1 },
    });
    // Blank separator row for breathing room
    r += 1;
    ws.getRow(r + 1).height = 6;
    return r + 2;
  }

  if (block.type === 'section') {
    const row = ws.getRow(r);
    row.getCell(1).value = block.text;
    ws.mergeCells(r, 1, r, Math.min(block.span || ncols, ncols));
    row.height = 26;
    styleCell(row.getCell(1), {
      fill: COLORS.sectionBg,
      font: { bold: true, size: 12, color: { argb: COLORS.sectionFg } },
      align: { horizontal: 'left', indent: 1 },
    });
    return r + 1;
  }

  if (block.type === 'note') {
    const row = ws.getRow(r);
    row.getCell(1).value = block.text;
    ws.mergeCells(r, 1, r, Math.min(block.span || ncols, ncols));
    row.height = block.height || 36;
    styleCell(row.getCell(1), {
      fill: COLORS.noteBg,
      font: { italic: true, size: 10, color: { argb: COLORS.noteFg } },
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    });
    // Blank separator row
    ws.getRow(r + 1).height = 6;
    return r + 2;
  }

  if (block.type === 'table') {
    // Header row
    const hdrRow = ws.getRow(r);
    block.header.forEach((h, c) => {
      hdrRow.getCell(c + 1).value = h;
      styleCell(hdrRow.getCell(c + 1), {
        fill: COLORS.headerBg,
        font: { bold: true, size: 11, color: { argb: COLORS.headerFg } },
        align: { horizontal: 'center' },
      });
    });
    hdrRow.height = 24;
    r += 1;

    // Body rows — zebra-striped
    block.rows.forEach((rowData, idx) => {
      const body = ws.getRow(r);
      const fill = idx % 2 === 0 ? COLORS.bodyAlt1 : COLORS.bodyAlt2;
      rowData.forEach((val, c) => {
        body.getCell(c + 1).value = val;
        styleCell(body.getCell(c + 1), {
          fill,
          font: { size: 10, color: { argb: 'FF1F2937' } },
          align: { horizontal: c === 0 ? 'left' : 'left', indent: c === 0 ? 1 : 0 },
        });
      });
      // Auto row height based on longest content — ExcelJS will also wrap
      const maxChars = rowData.reduce((m, v) => Math.max(m, String(v || '').length), 0);
      body.height = maxChars > 60 ? 38 : maxChars > 35 ? 28 : 20;
      r += 1;
    });

    // Blank row for spacing
    ws.getRow(r).height = 8;
    return r + 1;
  }

  return r;
}

function buildWorkbook(lang) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ops Control Training Generator';
  wb.created = new Date();

  for (const sheet of sheetContents(lang)) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ showGridLines: false }],
    });
    // Set column widths
    ws.columns = sheet.cols.map(w => ({ width: w }));
    const ncols = sheet.cols.length;

    let r = 1;
    for (const block of sheet.blocks) {
      r = renderBlock(ws, block, ncols, r);
    }
  }

  return wb;
}

async function writeOne(lang, filename) {
  const wb = buildWorkbook(lang);
  const out = path.join(OUT_DIR, filename);
  await wb.xlsx.writeFile(out);
  const { size } = fs.statSync(out);
  console.log(`  ✓ ${filename}  (${wb.worksheets.length} sheets, ${(size / 1024).toFixed(1)} KB)`);
}

console.log('Generating Ops Control training workbooks (ExcelJS — full borders/fonts/fills)…');
await writeOne('en', 'OpsControl_Training_EN_v1.0.xlsx');
await writeOne('vn', 'OpsControl_Training_VN_v1.0.xlsx');
console.log(`\nSaved to: ${OUT_DIR}`);
