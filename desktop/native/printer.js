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

let ptp = null;
try {
  ptp = require('pdf-to-printer');
} catch (err) {
  // pdf-to-printer không có sẵn → register sẽ trả error có ý nghĩa
}

async function listPrinters() {
  if (!ptp) throw new Error('pdf-to-printer not loaded');
  return ptp.getPrinters();
}

async function printPdfFile(pdfPath, opts = {}) {
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

async function printBuffer(buffer, opts = {}) {
  // pdf-to-printer chỉ nhận file path, nên ta ghi temp file rồi gọi.
  const tmpFile = path.join(
    os.tmpdir(),
    `ops-control-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
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
