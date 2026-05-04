/**
 * Desktop bridge — abstraction layer giữa React UI và Electron main process.
 *
 * Cùng 1 file React component có thể chạy trong:
 *   • Trình duyệt thường (Chrome/Edge tại http://10.102.3.61:3000) → web mode
 *   • Electron desktop (window.ops do preload.js inject) → desktop mode
 *
 * File này expose 1 API thống nhất `desktop.*`. Ở web mode, các method
 * native trả về `{ ok: false, reason: 'web-mode' }` hoặc dùng fallback
 * Web API (download anchor cho save dialog, ví dụ).
 *
 * Ở desktop mode, gọi qua `window.ops.*` (do preload.js bind).
 *
 * Quy ước:
 *   - `desktop.isAvailable` — boolean, true nếu chạy trong Electron
 *   - `desktop.platform` — 'win32' | 'darwin' | 'linux' | 'web'
 *   - mọi method async trả Promise; lỗi đi qua reject
 *
 * Đây là file PoC — Sprint 2 sẽ wire vào UI thật (Settings tab "Thiết bị").
 */

const w = typeof window !== 'undefined' ? window : {};
const ops = w.ops || null;
const runtime = w.opsRuntime || null;

export const isElectron = Boolean(ops && runtime?.isElectron);
export const platform = runtime?.platform || 'web';

const notInDesktop = (op) =>
  Promise.reject(
    new Error(`'${op}' không khả dụng trong web mode — cần chạy trong Ops Control desktop app`)
  );

// Reusable web fallback: download blob qua <a download>
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, path: filename, fallback: 'web-download' };
}

// Reusable web fallback: <input type=file> programmatic
function pickFileWeb({ accept = '*', multi = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multi;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      resolve({ canceled: files.length === 0, files });
    };
    input.click();
  });
}

export const desktop = {
  isAvailable: isElectron,
  platform,

  // ─── App config / lifecycle ────────────────────────────────────
  app: {
    getConfig: () =>
      isElectron
        ? ops.app.getConfig()
        : Promise.resolve({ mode: 'web', remoteUrl: w.location?.origin }),
    setConfig: (patch) => (isElectron ? ops.app.setConfig(patch) : notInDesktop('app.setConfig')),
    relaunch: () => (isElectron ? ops.app.relaunch() : Promise.resolve(w.location?.reload())),
    onOpenSettings: (cb) => (isElectron ? ops.app.onOpenSettings(cb) : () => {}),
    // Sprint 1.5 — re-fire the role-specific setup wizard. Desktop-only.
    rerunFirstRun: () => (isElectron ? ops.app.rerunFirstRun() : notInDesktop('app.rerunFirstRun')),
  },

  // ─── Auto-update ───────────────────────────────────────────────
  updater: {
    checkForUpdates: () =>
      isElectron ? ops.updater.checkForUpdates() : Promise.resolve({ state: 'web-mode' }),
    onStatus: (cb) => (isElectron ? ops.updater.onStatus(cb) : () => {}),
  },

  // ─── Network reachability (Phase A.3a) ─────────────────────────
  // Lightweight GET /health probe behind the ModeSection "Test
  // Connection" button. Returns { ok, version?, ms?, error? }.
  // Web fallback: hit the URL via fetch — matches the desktop probe
  // semantics (200 = ok, anything else = fail) for parity.
  net: {
    testServer: async (url) => {
      if (isElectron) return ops.net.testServer(url);
      if (!url) return { ok: false, error: 'url is required' };
      try {
        const start = Date.now();
        const r = await fetch(new URL('/health', url).toString(), { method: 'GET' });
        const ms = Date.now() - start;
        let parsed = {};
        try {
          parsed = await r.json();
        } catch {
          /* non-JSON body OK */
        }
        return { ok: r.ok, version: parsed?.version, ms };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  },

  // ─── Office printer (A4/A3 PDF) ────────────────────────────────
  printer: {
    available: isElectron,
    list: () => (isElectron ? ops.printer.list() : Promise.resolve([])),
    printPdf: (pdfPath, opts) =>
      isElectron ? ops.printer.printPdf(pdfPath, opts) : notInDesktop('printer.printPdf'),
    printBuffer: async (buffer, opts) => {
      if (isElectron) return ops.printer.printBuffer(buffer, opts);
      // Web fallback: open PDF in new tab cho user tự Print (Ctrl+P)
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      w.open(url, '_blank');
      return { ok: true, fallback: 'web-open' };
    },
  },

  // ─── Zebra/TSC label printer ──────────────────────────────────
  labelPrinter: {
    available: isElectron,
    sendZpl: (host, port, zpl) =>
      isElectron ? ops.labelPrinter.sendZpl(host, port, zpl) : notInDesktop('labelPrinter.sendZpl'),
    sendTspl: (host, port, tspl) =>
      isElectron
        ? ops.labelPrinter.sendTspl(host, port, tspl)
        : notInDesktop('labelPrinter.sendTspl'),
    ping: (host, port) =>
      isElectron ? ops.labelPrinter.ping(host, port) : notInDesktop('labelPrinter.ping'),
  },

  // ─── Electronic scale ──────────────────────────────────────────
  scale: {
    available: isElectron,
    listPorts: () => (isElectron ? ops.scale.listPorts() : Promise.resolve([])),
    open: (path, baudRate) =>
      isElectron ? ops.scale.open(path, baudRate) : notInDesktop('scale.open'),
    close: () => (isElectron ? ops.scale.close() : Promise.resolve({ ok: true })),
    read: () => (isElectron ? ops.scale.read() : Promise.resolve(null)),
    onWeight: (cb) => (isElectron ? ops.scale.onWeight(cb) : () => {}),
  },

  // ─── Barcode scanner (Raw HID mode) ───────────────────────────
  scanner: {
    available: isElectron,
    listDevices: () => (isElectron ? ops.scanner.listDevices() : Promise.resolve([])),
    open: (vid, pid) => (isElectron ? ops.scanner.open(vid, pid) : notInDesktop('scanner.open')),
    close: () => (isElectron ? ops.scanner.close() : Promise.resolve({ ok: true })),
    onScan: (cb) => (isElectron ? ops.scanner.onScan(cb) : () => {}),
    /**
     * Web fallback: keyboard wedge mode. Lắng nghe keydown trên window
     * và emit barcode khi gặp Enter sau >= 4 ký tự nhập trong < 100 ms
     * giữa các keypress (tốc độ scanner > tốc độ người gõ).
     */
    listenKeyboardWedge(cb, { minLength = 4, maxInterKeyMs = 50 } = {}) {
      let buffer = '';
      let lastTs = 0;
      const handler = (e) => {
        const now = Date.now();
        if (now - lastTs > maxInterKeyMs) buffer = '';
        lastTs = now;
        if (e.key === 'Enter') {
          if (buffer.length >= minLength) {
            cb({ code: buffer, timestamp: now, source: 'keyboard-wedge' });
            buffer = '';
            e.preventDefault();
          }
        } else if (e.key.length === 1) {
          buffer += e.key;
        }
      };
      w.addEventListener('keydown', handler, true);
      return () => w.removeEventListener('keydown', handler, true);
    },
  },

  // ─── Smart-client cache (offline) ─────────────────────────────
  cache: {
    available: isElectron,
    get: (key) => (isElectron ? ops.cache.get(key) : Promise.resolve(null)),
    set: (key, value) =>
      isElectron ? ops.cache.set(key, value) : Promise.resolve({ ok: false, fallback: 'web' }),
    queueWrite: (op) =>
      isElectron ? ops.cache.queueWrite(op) : Promise.resolve({ ok: false, fallback: 'web' }),
    syncStatus: () =>
      isElectron
        ? ops.cache.syncStatus()
        : Promise.resolve({ online: navigator?.onLine, pending: 0 }),
    triggerSync: () => (isElectron ? ops.cache.triggerSync() : Promise.resolve({ ok: false })),
    onSyncStatus: (cb) => (isElectron ? ops.cache.onSyncStatus(cb) : () => {}),
    list: (tableName) => (isElectron ? ops.cache.list(tableName) : Promise.resolve([])),
    read: (tableName, rowId) =>
      isElectron ? ops.cache.read(tableName, rowId) : Promise.resolve(null),
    upsert: (tableName, rowId, payload) =>
      isElectron ? ops.cache.upsert(tableName, rowId, payload) : Promise.resolve({ ok: false }),
  },

  // ─── Legacy data import (v1.0 → v1.1) ────────────────────────
  import: {
    available: isElectron,
    pickFolder: (opts) =>
      isElectron
        ? ops.import.pickFolder(opts)
        : Promise.resolve({ canceled: true, reason: 'web-mode' }),
    scanFolder: (path) =>
      isElectron ? ops.import.scanFolder(path) : Promise.resolve({ ok: false, error: 'web-mode' }),
    execute: (path, opts) =>
      isElectron
        ? ops.import.execute(path, opts)
        : Promise.resolve({ ok: false, error: 'web-mode' }),
  },

  // ─── Filesystem (open/save dialog + IO) ───────────────────────
  fs: {
    showSaveDialog: (opts) =>
      isElectron
        ? ops.fs.showSaveDialog(opts)
        : Promise.resolve({
            canceled: false,
            filePath: opts?.defaultPath || 'download.bin',
            fallback: 'web',
          }),
    showOpenDialog: (opts) =>
      isElectron
        ? ops.fs.showOpenDialog(opts)
        : pickFileWeb({ accept: opts?.accept || '*', multi: opts?.multi }),
    writeFile: (filePath, data) => {
      if (isElectron) return ops.fs.writeFile(filePath, data);
      // Web fallback: trigger browser download
      const blob = data instanceof Blob ? data : new Blob([data]);
      return Promise.resolve(downloadBlob(filePath || 'download.bin', blob));
    },
    readFile: async (filePath) => {
      if (isElectron) return ops.fs.readFile(filePath);
      // Web fallback: filePath sẽ là File object từ pickFileWeb
      if (filePath instanceof File) {
        const buf = await filePath.arrayBuffer();
        return new Uint8Array(buf);
      }
      throw new Error('readFile in web mode requires a File from showOpenDialog');
    },
  },
};

// Default export tiện cho `import desktop from '...'`
export default desktop;
