/**
 * Build Autostart_Setup_Guide.docx — operator-facing Word guide for the
 * Ops Control SERVER auto-start mechanism (macOS LaunchAgent + Windows
 * Task Scheduler). Bilingual EN+VI.
 *
 * Outputs (BOTH locations):
 *   - client/public/help/Autostart_Setup_Guide.docx
 *   - 4. CLAUDE OUTPUT/Autostart_Setup_Guide.docx
 *
 * Usage:
 *   node scripts/help/build-autostart-docx.mjs
 *
 * Companion to docs/ops/AUTOSTART_SETUP.md (developer-facing markdown).
 * This .docx targets Hương + sales operators who need printable copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  AlignmentType,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const FONT = 'Arial';
const MONO = 'Consolas';
const COLOR_ACCENT = '1E40AF';
const COLOR_OK = '15803D';
const COLOR_WARN = 'B45309';
const COLOR_DANGER = 'B91C1C';
const COLOR_CODE_BG = '111827';
const COLOR_CODE_FG = 'D1FAE5';
const COLOR_HEADER_BG = 'E0E7FF';

const bd = { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB' };
const allBorders = { top: bd, bottom: bd, left: bd, right: bd };

const p = (text, opts = {}) =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts.size ?? 22,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color,
      }),
    ],
    spacing: opts.spacing ?? { before: 60, after: 60 },
    alignment: opts.alignment,
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: COLOR_ACCENT })],
    spacing: { before: 400, after: 160 },
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: '111827' })],
    spacing: { before: 280, after: 100 },
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: COLOR_ACCENT })],
    spacing: { before: 200, after: 60 },
  });

const bullet = (text, opts = {}) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 22,
        bold: opts.bold,
        italics: opts.italics,
      }),
    ],
    spacing: { before: 30, after: 30 },
  });

const code = (text) =>
  new Paragraph({
    children: [new TextRun({ text, font: MONO, size: 20, color: COLOR_CODE_FG })],
    shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
    spacing: { before: 40, after: 40 },
    indent: { left: 240 },
  });

const callout = (emoji, title, body, bgColor, borderColor = 'D1D5DB') => {
  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: `${emoji} ${title}`, font: FONT, size: 22, bold: true })],
      shading: { fill: bgColor, type: ShadingType.CLEAR },
      spacing: { before: 80, after: 20 },
      border: { left: { color: borderColor, space: 1, style: BorderStyle.SINGLE, size: 24 } },
    })
  );
  if (body) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: body, font: FONT, size: 21 })],
        shading: { fill: bgColor, type: ShadingType.CLEAR },
        spacing: { before: 0, after: 80 },
        border: { left: { color: borderColor, space: 1, style: BorderStyle.SINGLE, size: 24 } },
      })
    );
  }
  return out;
};

const cellText = (text, opts = {}) =>
  new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: opts.mono ? MONO : FONT,
            size: opts.size ?? 21,
            bold: opts.bold,
            color: opts.color,
          }),
        ],
      }),
    ],
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    width: opts.width,
  });

const tableHeaderCell = (text, widthPct) =>
  cellText(text, {
    bold: true,
    bg: COLOR_HEADER_BG,
    width: { size: widthPct, type: WidthType.PERCENTAGE },
  });

const stepBlock = (num, titleEn, titleVi, paragraphs) => {
  const out = [];
  out.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Bước ${num} · Step ${num} — ${titleVi}`,
          font: FONT,
          size: 24,
          bold: true,
          color: COLOR_ACCENT,
        }),
      ],
      spacing: { before: 240, after: 60 },
    })
  );
  out.push(p(titleEn, { italics: true, color: '6B7280' }));
  out.push(...paragraphs);
  return out;
};

// ════════════════════════════════════════════════════════════════
// Document body
// ════════════════════════════════════════════════════════════════
function buildDocument() {
  const sections = [];

  // ─── Cover ───
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'OPS CONTROL SERVER',
          font: FONT,
          size: 40,
          bold: true,
          color: COLOR_ACCENT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 100 },
    })
  );
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Hướng dẫn cài Auto-start',
          font: FONT,
          size: 32,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
    })
  );
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Auto-start Setup Guide (macOS + Windows)',
          font: FONT,
          size: 24,
          italics: true,
          color: '6B7280',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 600 },
    })
  );

  sections.push(p('Phiên bản · Version: v1.6.0', { alignment: AlignmentType.CENTER }));
  sections.push(p('Ngày · Date: 2026-06-21', { alignment: AlignmentType.CENTER }));
  sections.push(
    p('Đối tượng · Audience: Hương (backup engineer), sales operators', {
      alignment: AlignmentType.CENTER,
    })
  );
  sections.push(
    p('CCL Design Hai Duong — Ops Control v1.6 go-live 2026-08-30', {
      alignment: AlignmentType.CENTER,
      italics: true,
      color: '6B7280',
    })
  );

  // ─── 1. Tổng quan ───
  sections.push(h1('1. Tổng quan · Overview'));
  sections.push(
    p(
      'Tài liệu này hướng dẫn cài đặt cơ chế tự khởi động cho Ops Control SERVER. Sau khi cài xong, SERVER sẽ tự bật lại sau khi máy reboot (mất điện) và tự restart nếu app bị crash. Operator không cần đụng vào máy SERVER nữa.',
      { spacing: { before: 120, after: 120 } }
    )
  );
  sections.push(
    p(
      'This guide installs the auto-start mechanism for Ops Control SERVER. After install, the SERVER auto-launches after OS reboot (post power loss) and auto-restarts on crash. Operators do not need to touch the SERVER machine.',
      { italics: true, color: '6B7280' }
    )
  );

  sections.push(h2('1.1. Cơ chế làm việc · How it works'));
  const flowTable = new Table({
    rows: [
      new TableRow({
        children: [
          tableHeaderCell('Sự kiện · Event', 40),
          tableHeaderCell('macOS', 30),
          tableHeaderCell('Windows', 30),
        ],
      }),
      new TableRow({
        children: [
          cellText('Máy reboot (mất điện) · OS reboot (power loss)'),
          cellText('LaunchAgent RunAtLoad'),
          cellText('Task Scheduler AtLogon'),
        ],
      }),
      new TableRow({
        children: [
          cellText('App crash (exit ≠ 0) · App crash (non-zero exit)'),
          cellText('KeepAlive SuccessfulExit=false — restart sau 30s'),
          cellText('RestartOnFailure — restart sau 1 phút, 3 lần'),
        ],
      }),
      new TableRow({
        children: [
          cellText('Operator quit (Cmd+Q) · Operator clean quit'),
          cellText('KHÔNG restart', { color: COLOR_OK, bold: true }),
          cellText('KHÔNG restart', { color: COLOR_OK, bold: true }),
        ],
      }),
      new TableRow({
        children: [
          cellText('Mất mạng LAN · LAN loss'),
          cellText('KHÔNG restart (đúng thiết kế)'),
          cellText('KHÔNG restart (đúng thiết kế)'),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd },
  });
  sections.push(flowTable);

  sections.push(h2('1.2. Điều kiện bắt buộc · Prerequisites'));
  sections.push(
    ...callout(
      '⚠️',
      '3 điều kiện phải có · 3 mandatory conditions',
      'Nếu thiếu một trong ba, auto-start KHÔNG hoạt động.',
      'FEF9C3',
      COLOR_WARN
    )
  );
  sections.push(bullet('SERVER app đã được cài (DMG cho Mac hoặc Setup.exe cho Win)'));
  sections.push(
    bullet('First-time setup wizard đã hoàn tất 1 lần manual (admin account, license, TOTP)')
  );
  sections.push(
    bullet('OS auto-login đã bật — nếu không, máy dừng ở màn login → SERVER không chạy')
  );
  sections.push(p(''));
  sections.push(
    bullet('SERVER app installed (DMG for Mac OR Setup.exe for Windows)', { italics: true })
  );
  sections.push(
    bullet('First-time setup wizard completed manually once (admin account, license, TOTP)', {
      italics: true,
    })
  );
  sections.push(
    bullet(
      'OS auto-login enabled — without it, machine stops at login screen, SERVER never starts',
      {
        italics: true,
      }
    )
  );

  // ═════════════════════ PART A — macOS ═════════════════════
  sections.push(h1('2. Cài cho macOS · Install for macOS'));

  sections.push(h2('2.1. Bật auto-login trên Mac · Enable auto-login on Mac'));
  sections.push(
    ...stepBlock(1, 'Open System Settings', 'Mở System Settings', [
      bullet('Click 🍎 (góc trên bên trái) → System Settings'),
      bullet('Click "Users & Groups" trong sidebar'),
    ])
  );
  sections.push(
    ...stepBlock(2, 'Enable automatic login', 'Bật automatic login', [
      bullet('Click "Automatically log in as" dropdown'),
      bullet('Chọn user account của SERVER box (thường là tài khoản admin chính của máy)'),
      bullet('Nhập password để xác nhận'),
    ])
  );
  sections.push(
    ...callout(
      'ℹ️',
      'Lưu ý bảo mật · Security note',
      'Auto-login bỏ qua màn đăng nhập OS. Mac mini SERVER nên ở vị trí có khóa physical (phòng khóa, tủ rack). KHÔNG bật auto-login trên laptop di động.',
      'F0F9FF',
      '0369A1'
    )
  );

  sections.push(h2('2.2. Cài LaunchAgent · Install LaunchAgent'));
  sections.push(
    ...stepBlock(3, 'Open Terminal', 'Mở Terminal', [
      bullet('Press Cmd+Space → gõ "Terminal" → Enter'),
    ])
  );
  sections.push(
    ...stepBlock(4, 'Navigate to scripts folder', 'Chuyển tới thư mục scripts', [
      p('Gõ lệnh sau (đường dẫn này có sẵn trong installed app, KHÔNG cần copy file từ dev box):'),
      code('cd "/Applications/Ops Control.app/Contents/Resources/app"'),
    ])
  );
  sections.push(
    ...stepBlock(5, 'Run install script', 'Chạy script cài đặt', [
      code('sh scripts/ops-autostart/install-macos.sh'),
      p('Output mong đợi · Expected output:', { italics: true, color: '6B7280' }),
      code('✓ LaunchAgent installed: ~/Library/LaunchAgents/com.ccldesign.opscontrol-server.plist'),
    ])
  );

  sections.push(h2('2.3. Kiểm tra cài đặt · Verify install'));
  sections.push(p('Chạy 3 lệnh để verify · Run 3 commands to verify:'));
  sections.push(code('launchctl list | grep com.ccldesign.opscontrol-server'));
  sections.push(p('Phải hiện: PID + "0" + tên agent. PID có thể là số khác.'));
  sections.push(code('pgrep -fl "Ops Control SERVER"'));
  sections.push(p('Phải hiện process ID + đường dẫn app.'));
  sections.push(code('curl -sS http://localhost:3100/health'));
  sections.push(p('Phải trả về: {"status":"ok",...}'));

  // ═════════════════════ PART B — Windows ═════════════════════
  sections.push(h1('3. Cài cho Windows · Install for Windows'));

  sections.push(h2('3.1. Bật auto-login trên Windows · Enable auto-login on Windows'));
  sections.push(
    ...stepBlock(1, 'Open netplwiz', 'Mở netplwiz', [
      bullet('Press Win+R → gõ "netplwiz" → Enter'),
      bullet('Cửa sổ "User Accounts" mở'),
    ])
  );
  sections.push(
    ...stepBlock(2, 'Disable password prompt', 'Tắt password prompt', [
      bullet('Chọn user account của SERVER (thường là admin chính)'),
      bullet('Uncheck "Users must enter a user name and password to use this computer"'),
      bullet('Click Apply → nhập password 2 lần để xác nhận'),
    ])
  );

  sections.push(h2('3.2. Cài Scheduled Task · Install Scheduled Task'));
  sections.push(
    ...stepBlock(3, 'Open PowerShell', 'Mở PowerShell', [
      bullet('Press Win+X → chọn "Windows PowerShell" (KHÔNG cần Administrator)'),
    ])
  );
  sections.push(
    ...stepBlock(4, 'Navigate to scripts folder', 'Chuyển tới thư mục scripts', [
      p('Gõ lệnh (đường dẫn mặc định cho cài qua Setup.exe):'),
      code('cd "$env:LOCALAPPDATA\\Programs\\Ops Control\\resources\\app"'),
    ])
  );
  sections.push(
    ...stepBlock(5, 'Run install script', 'Chạy script cài đặt', [
      code('powershell -ExecutionPolicy Bypass -File scripts\\ops-autostart\\install-windows.ps1'),
      p('Output mong đợi · Expected output:', { italics: true, color: '6B7280' }),
      code(
        '✓ Scheduled task installed: OpsControlServer\n  State: Ready\n  Trigger: AtLogon (any user)'
      ),
    ])
  );

  sections.push(h2('3.3. Kiểm tra cài đặt · Verify install'));
  sections.push(p('Chạy 3 lệnh trong PowerShell · Run 3 commands in PowerShell:'));
  sections.push(code('Get-ScheduledTask -TaskName OpsControlServer'));
  sections.push(p('Phải hiện: State = Ready'));
  sections.push(code('Get-Process "Ops Control" -ErrorAction SilentlyContinue'));
  sections.push(p('Phải hiện process với PID + StartTime.'));
  sections.push(code('Invoke-RestMethod http://localhost:3100/health'));
  sections.push(p('Phải trả về: status = "ok"'));

  // ═════════════════════ PART C — Verify BCP ═════════════════════
  sections.push(h1('4. Test BCP 4 bước · 4-step BCP Test'));
  sections.push(
    p(
      'Sau khi cài xong, chạy 4 test sau để xác nhận auto-start hoạt động đúng. Làm trên máy SERVER thực tế, KHÔNG phải dev box.',
      { spacing: { before: 120, after: 120 } }
    )
  );

  sections.push(h2('Test 1 — Process crash → tự restart'));
  sections.push(p('Trên Mac:'));
  sections.push(code('killall "Ops Control"\nsleep 35\npgrep -fl "Ops Control SERVER"'));
  sections.push(p('Trên Windows (PowerShell):'));
  sections.push(
    code(
      'Stop-Process -Name "Ops Control" -Force\nStart-Sleep -Seconds 65\nGet-Process "Ops Control"'
    )
  );
  sections.push(
    p(
      '✅ Kết quả mong đợi · Expected: process được restart với PID MỚI. Curl /health trả về 200.',
      {
        color: COLOR_OK,
      }
    )
  );

  sections.push(h2('Test 2 — Clean quit → KHÔNG restart'));
  sections.push(bullet('Mở Ops Control SERVER (đang chạy)'));
  sections.push(bullet('Quit qua menu (Cmd+Q trên Mac, đóng window thường trên Win)'));
  sections.push(bullet('Đợi 60 giây'));
  sections.push(
    p(
      '✅ Kết quả mong đợi · Expected: process vẫn dead. Đây là đúng thiết kế — để operator có thể stop SERVER khi cần bảo trì, OS không "đánh nhau" với operator.',
      { color: COLOR_OK }
    )
  );

  sections.push(h2('Test 3 — Reboot máy → tự khởi động'));
  sections.push(
    bullet('Với SERVER đang chạy, restart Mac/Win box (menu Restart, KHÔNG cần shutdown)')
  );
  sections.push(bullet('Đợi máy boot lên + auto-login + ~30-60 giây sau khi desktop hiện'));
  sections.push(bullet('Từ CLIENT khác, gõ: curl http://<server-ip>:3100/health'));
  sections.push(
    p('✅ Kết quả mong đợi · Expected: trả về {"status":"ok"} — KHÔNG ai phải click app SERVER.', {
      color: COLOR_OK,
    })
  );

  sections.push(h2('Test 4 — Mất điện thật (optional, riskier)'));
  sections.push(bullet('Với SERVER đang chạy, RÚT điện ra (hard cut)'));
  sections.push(bullet('Đợi 30 giây → cắm điện lại'));
  sections.push(bullet('Máy tự boot → auto-login → SERVER tự bật'));
  sections.push(bullet('Từ CLIENT: lưu thử 1 quote round-trip để confirm data không corrupt'));
  sections.push(
    ...callout(
      '🛡️',
      'An toàn data sau mất điện · Data safety after power loss',
      'M-5a integrity probe (PR #192) sẽ tự check SQLite ở boot. Nếu phát hiện corrupt, log vào stderr + chặn boot. M-5b bit-rot cron (PR #193) sẽ catch silent corruption sau đó.',
      'F0FDF4',
      COLOR_OK
    )
  );

  // ═════════════════════ PART D — Troubleshooting ═════════════════════
  sections.push(h1('5. Sự cố thường gặp · Troubleshooting'));

  const issues = [
    {
      symptom: 'Sau reboot, máy dừng ở màn login, SERVER không chạy',
      cause: 'Auto-login chưa bật',
      fix: 'Quay lại Mục 2.1 (Mac) hoặc 3.1 (Win) bật auto-login',
    },
    {
      symptom: 'launchctl list không thấy com.ccldesign.opscontrol-server (Mac)',
      cause: 'install-macos.sh chưa chạy hoặc bị lỗi',
      fix: 'Chạy lại install-macos.sh + đọc output có ✓ hay không',
    },
    {
      symptom: 'Get-ScheduledTask không thấy OpsControlServer (Win)',
      cause: 'install-windows.ps1 chưa chạy hoặc bị block ExecutionPolicy',
      fix: 'Chạy lại với -ExecutionPolicy Bypass đầy đủ',
    },
    {
      symptom: 'App chạy nhưng curl /health bị refused',
      cause: 'Port 3100 đã bị process khác chiếm, hoặc embedded server crash khi boot',
      fix: 'Quit Ops Control → mở lại manual → xem có error popup không',
    },
    {
      symptom: 'Auto-restart không kick sau khi kill -9',
      cause: 'ThrottleInterval (Mac 30s) hoặc RestartCount đã hết 3 lần (Win)',
      fix: 'Đợi 1 phút → nếu vẫn không restart, unload + reload LaunchAgent (Mac) hoặc re-install task (Win)',
    },
    {
      symptom: 'CLIENT báo "Failed to connect" sau khi SERVER auto-start',
      cause: 'CLIENT chưa được set Server URL đúng (Settings → Connection Mode)',
      fix: 'Trên CLIENT: Settings → Connection Mode → nhập http://<server-ip>:3100',
    },
  ];

  for (const issue of issues) {
    sections.push(h3('❌ ' + issue.symptom));
    sections.push(p('Nguyên nhân · Cause: ' + issue.cause, { color: COLOR_DANGER }));
    sections.push(p('Cách sửa · Fix: ' + issue.fix, { color: COLOR_OK, bold: true }));
  }

  // ═════════════════════ PART E — Operator quick reference ═════════════════════
  sections.push(h1('6. Quick Reference Card · Thẻ tham chiếu nhanh'));
  sections.push(
    p(
      'In trang này + dán lên máy SERVER hoặc gần Mac mini. Print this page + tape to SERVER box.',
      {
        italics: true,
        color: '6B7280',
      }
    )
  );

  sections.push(h2('🚫 KHÔNG được làm · DO NOT'));
  sections.push(bullet('Đừng QUIT Ops Control SERVER (Cmd+Q) — CLIENT sẽ mất kết nối'));
  sections.push(
    bullet('Đừng tắt nguồn Mac mini / Win box cứng khi không cần — gây SQLite corrupt nhẹ')
  );
  sections.push(bullet('Đừng tắt auto-login OS — auto-start sẽ không hoạt động sau reboot'));

  sections.push(h2('✅ Được phép · OK to do'));
  sections.push(bullet('Restart máy bình thường (menu Restart) — auto-start sẽ kick'));
  sections.push(
    bullet('Sửa cài đặt OS thông thường (network, update, etc.) — không ảnh hưởng SERVER')
  );
  sections.push(bullet('Mở CLIENT trên workstation khác → kết nối qua Server URL'));

  sections.push(h2('📞 Gọi ai khi có vấn đề · Who to call'));
  sections.push(
    p('Nếu SERVER unreachable hơn 10 phút → escalate:', { bold: true, color: COLOR_DANGER })
  );
  sections.push(bullet('Henry — Lead Engineer — +84988749869'));
  sections.push(bullet('Hương — Backup Engineer — (điền số khi available)'));

  sections.push(p('', { spacing: { before: 600, after: 0 } }));
  sections.push(
    p('— Cuối tài liệu · End of document —', {
      alignment: AlignmentType.CENTER,
      italics: true,
      color: '9CA3AF',
    })
  );

  return sections;
}

// ════════════════════════════════════════════════════════════════
// Build + write
// ════════════════════════════════════════════════════════════════
async function main() {
  const doc = new Document({
    creator: 'Ops Control · CCL Design',
    title: 'Auto-start Setup Guide',
    description: 'Operator guide for installing Ops Control SERVER auto-start (macOS + Windows)',
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children: buildDocument() }],
  });

  const buffer = await Packer.toBuffer(doc);

  // Output to 2 locations
  const publicDir = path.join(ROOT, 'client', 'public', 'help');
  const mirrorDir = path.resolve(ROOT, '..', '..', '4. CLAUDE OUTPUT');

  fs.mkdirSync(publicDir, { recursive: true });
  const primaryOut = path.join(publicDir, 'Autostart_Setup_Guide.docx');
  fs.writeFileSync(primaryOut, buffer);
  console.log(`✓ wrote ${primaryOut}`);

  // Mirror — skip silently if parent dir not writable (mirror pattern per MES-3-FIX-18)
  if (fs.existsSync(mirrorDir)) {
    try {
      const mirrorOut = path.join(mirrorDir, 'Autostart_Setup_Guide.docx');
      fs.writeFileSync(mirrorOut, buffer);
      console.log(`✓ wrote ${mirrorOut} (review mirror)`);
    } catch (e) {
      console.warn(`⚠  mirror skipped: ${e.message}`);
    }
  } else {
    console.warn(`⚠  mirror dir not found: ${mirrorDir}`);
  }
}

main().catch((e) => {
  console.error('✗ build failed:', e);
  process.exit(1);
});
