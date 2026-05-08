/**
 * Office printer bridge — A4/A3 PDF printing.
 *
 * Dùng `pdf-to-printer` (cross-platform: Windows dùng SumatraPDF
 * bundled, macOS/Linux dùng `lp` command). Đây là cách tránh phải
 * implement riêng từng OS.
 *
 * Phù hợp cho: in phiếu công đoạn, báo cáo, quote PDF mà Ops Control
 * sinh ra qua Puppeteer/docx.
 *
 * Lưu ý: trên Windows, lần đầu chạy có thể cần grant access
 * cho SumatraPDF.exe (Windows Defender). pdf-to-printer bundle sẵn.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);

let ptp = null;
try {
  ptp = require('pdf-to-printer');
} catch (err) {
  // pdf-to-printer không có sẵn → register sẽ trả error có ý nghĩa
}

const isWin = process.platform === 'win32';

// macOS/Linux printer enumeration via CUPS `lpstat -p -d`. Output looks like:
//   printer Brother_HL_L2350DW is idle.  enabled since ...
//   printer EPSON_L3210 is idle.  enabled since ...
//   system default destination: Brother_HL_L2350DW
// Returns the same shape as pdf-to-printer's getPrinters() so callers in
// AboutSection / HardwareSection don't need to branch by platform.
async function listPrintersUnix() {
  let stdout;
  try {
    ({ stdout } = await execFileP('lpstat', ['-p', '-d'], { timeout: 5000 }));
  } catch (err) {
    // CUPS not installed or no printers configured → return empty list
    // (matches Windows behaviour when no printers are installed).
    if (err.code === 'ENOENT') return [];
    if (/no destinations/i.test(err.stderr || err.message || '')) return [];
    throw err;
  }
  if (!stdout) return [];
  const printers = [];
  let defaultName = null;
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^printer\s+(\S+)/);
    if (m) {
      printers.push({ deviceId: m[1], name: m[1], paperSizes: [] });
      continue;
    }
    const d = line.match(/system default destination:\s+(\S+)/);
    if (d) defaultName = d[1];
  }
  if (defaultName) {
    for (const p of printers) {
      if (p.deviceId === defaultName) p.isDefault = true;
    }
  }
  return printers;
}

async function listPrinters() {
  if (isWin) {
    if (!ptp) throw new Error('pdf-to-printer not loaded');
    return ptp.getPrinters();
  }
  return listPrintersUnix();
}

async function printPdfFile(pdfPath, opts = {}) {
  if (isWin) {
    if (!ptp) throw new Error('pdf-to-printer not loaded');
    return ptp.print(pdfPath, {
      printer: opts.printer,
      paperSize: opts.paperSize || 'A4',
      scale: opts.scale || 'noscale',
      orientation: opts.orientation,
      copies: opts.copies || 1,
      silent: true,
    });
  }
  // macOS/Linux: shell to `lp` (CUPS). Limited option mapping — enough for
  // A4 reports + quote PDFs, which is the current Ops Control scope.
  const args = [];
  if (opts.printer) args.push('-d', opts.printer);
  if (opts.copies && opts.copies > 1) args.push('-n', String(opts.copies));
  if (opts.paperSize) args.push('-o', `media=${opts.paperSize}`);
  if (opts.orientation === 'landscape') args.push('-o', 'landscape');
  args.push(pdfPath);
  await execFileP('lp', args, { timeout: 30000 });
  return { ok: true };
}

async function printBuffer(buffer, opts = {}) {
  // pdf-to-printer chỉ nhận file path, nên ta ghi temp file rồi gọi.
  const tmpFile = path.join(
    os.tmpdir(),
    `ops-control-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
  );
  await fs.promises.writeFile(tmpFile, buffer);
  try {
    return await printPdfFile(tmpFile, opts);
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

function register(ipcMain, log) {
  ipcMain.handle('ops:printer.list', async () => {
    try {
      return await listPrinters();
    } catch (err) {
      log.error('[printer] list failed:', err);
      throw err;
    }
  });

  ipcMain.handle('ops:printer.printPdf', async (_evt, pdfPath, opts) => {
    log.info(`[printer] Printing ${pdfPath} on ${opts?.printer || 'default'}`);
    return printPdfFile(pdfPath, opts);
  });

  ipcMain.handle('ops:printer.printBuffer', async (_evt, buffer, opts) => {
    log.info(`[printer] Printing buffer (${buffer.length} bytes) on ${opts?.printer || 'default'}`);
    return printBuffer(Buffer.from(buffer), opts);
  });
}

module.exports = { register };
