/**
 * Zebra/TSC label printer bridge — TCP raw socket port 9100.
 *
 * Tại sao TCP raw mà không qua driver Windows?
 * ---------------------------------------------
 * Hầu hết máy in công nghiệp Zebra (ZT/ZD/GX series), TSC (TTP/TE
 * series), Datamax, Sato đều mở port 9100 mặc định cho protocol
 * raw printing. Gửi ZPL/TSPL command thẳng qua socket là cách
 * portable nhất:
 *
 *   - Không cần cài driver trên từng máy trạm
 *   - Hoạt động giống nhau Windows + macOS + Linux
 *   - Không phụ thuộc Windows print spooler (vốn hay drop job)
 *   - Đo được latency, error chính xác ngay từ socket
 *
 * Workflow điển hình:
 *
 *   const zpl = `^XA^FO50,50^A0N,50,50^FDProduct ABC^FS^XZ`;
 *   await window.ops.labelPrinter.sendZpl('192.168.1.50', 9100, zpl);
 *
 * ZPL = Zebra Programming Language (Zebra)
 * TSPL = TSC Printer Language (TSC, đôi khi cũng support EPL)
 */

'use strict';

const net = require('node:net');

function sendRaw(host, port, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve({ ok: true, bytes: Buffer.byteLength(payload) });
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error(`Timeout after ${timeoutMs}ms`)));
    socket.once('error', (err) => finish(err));
    socket.once('close', () => finish(null));

    socket.connect(port, host, () => {
      socket.write(payload, 'binary', () => {
        // Flush — đợi 50ms để máy in process xong rồi đóng socket
        setTimeout(() => socket.end(), 50);
      });
    });
  });
}

function ping(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const start = Date.now();

    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: Date.now() - start, error: err?.message });
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(false, new Error('Timeout')));
    socket.once('error', (err) => finish(false, err));
    socket.connect(port, host, () => finish(true));
  });
}

function register(ipcMain, log) {
  ipcMain.handle('ops:zebra.sendZpl', async (_evt, host, port, zpl) => {
    log.info(`[zebra] Sending ZPL to ${host}:${port}, ${zpl.length} chars`);
    return sendRaw(host, port || 9100, zpl);
  });

  ipcMain.handle('ops:zebra.sendTspl', async (_evt, host, port, tspl) => {
    log.info(`[zebra] Sending TSPL to ${host}:${port}, ${tspl.length} chars`);
    return sendRaw(host, port || 9100, tspl);
  });

  ipcMain.handle('ops:zebra.ping', async (_evt, host, port) => {
    return ping(host, port || 9100);
  });
}

module.exports = { register };
