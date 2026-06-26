/**
 * Preload script — chạy trong renderer process trước khi React mount.
 *
 * Mục đích: expose một API có kiểm soát (`window.ops`) cho renderer
 * thông qua contextBridge, đồng thời giữ contextIsolation = true
 * và nodeIntegration = false (security best practice).
 *
 * Renderer KHÔNG được phép truy cập trực tiếp `require`, `process`,
 * hay node modules. Mọi tương tác với hệ thống đi qua IPC kênh ở đây.
 *
 * Tương thích web: nếu renderer chạy trong trình duyệt thường (không
 * phải Electron), `window.ops` sẽ undefined và client code dùng
 * fallback Web API. Xem client/src/services/desktopBridge.js (sẽ tạo
 * ở Sprint 2 — tham khảo file này để biết shape).
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ─── Helpers ──────────────────────────────────────────────────────
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, callback) => {
  const wrapped = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

// ─── API exposed to renderer ──────────────────────────────────────
// Naming convention: `ops:<domain>.<action>` cho IPC channel,
// `window.ops.<domain>.<action>()` cho renderer.
//
// Mọi method trả về Promise. Lỗi đi qua reject — client phải
// try/catch hoặc .catch().
const opsAPI = {
  // ─── Config & runtime ──────────────────────────────────────────
  app: {
    getConfig: () => invoke('ops:get-config'),
    setConfig: (patch) => invoke('ops:set-config', patch),
    relaunch: () => invoke('ops:relaunch'),
    onOpenSettings: (cb) => on('ops:open-settings', cb),
    // Sprint 1.5 — clear firstRunCompleted + reset mode/remoteUrl + relaunch
    // so the role-specific setup wizard fires fresh. Used by Settings →
    // Connection Mode → "Re-run setup wizard".
    rerunFirstRun: () => invoke('ops:rerun-first-run'),
  },

  // ─── Auto-update events ────────────────────────────────────────
  updater: {
    checkForUpdates: () => invoke('ops:updater.check'),
    downloadUpdate: () => invoke('ops:updater.download'),
    quitAndInstall: () => invoke('ops:updater.install'),
    onStatus: (cb) => on('ops:updater.status', cb),
  },

  // ─── Network reachability (Phase A.3a) ─────────────────────────
  // Lightweight GET /health probe used by ModeSection's "Test
  // Connection" button. Returns { ok, version?, ms?, error? }.
  net: {
    testServer: (url) => invoke('ops:net.testServer', { url }),
  },

  // ─── Shell (open with OS default handler) ──────────────────────
  // Used by FileUploadZone's "Open in new window" so PDFs go to Adobe
  // Acrobat / Preview / system browser instead of an embedded Electron
  // child window with no print dialog or annotation tools.
  shell: {
    openExternalFile: (b64Data, ext) => invoke('ops:shell.openExternalFile', { b64Data, ext }),
    openPath: (targetPath) => invoke('ops:shell.openPath', { targetPath }),
  },

  // ─── Printer (A4/A3 office printers) ───────────────────────────
  printer: {
    list: () => invoke('ops:printer.list'),
    printPdf: (pdfPath, opts) => invoke('ops:printer.printPdf', pdfPath, opts),
    printBuffer: (buffer, opts) => invoke('ops:printer.printBuffer', buffer, opts),
  },

  // ─── Zebra/TSC industrial label printers (TCP raw socket) ──────
  labelPrinter: {
    sendZpl: (host, port, zpl) => invoke('ops:zebra.sendZpl', host, port, zpl),
    sendTspl: (host, port, tspl) => invoke('ops:zebra.sendTspl', host, port, tspl),
    ping: (host, port) => invoke('ops:zebra.ping', host, port),
  },

  // ─── Electronic scale (RS232 / USB serial) ────────────────────
  scale: {
    listPorts: () => invoke('ops:scale.listPorts'),
    open: (path, baudRate) => invoke('ops:scale.open', path, baudRate),
    close: () => invoke('ops:scale.close'),
    read: () => invoke('ops:scale.read'),
    onWeight: (cb) => on('ops:scale.weight', cb),
  },

  // ─── Barcode scanner (USB-HID) ────────────────────────────────
  scanner: {
    listDevices: () => invoke('ops:scanner.listDevices'),
    open: (vendorId, productId) => invoke('ops:scanner.open', vendorId, productId),
    close: () => invoke('ops:scanner.close'),
    onScan: (cb) => on('ops:scanner.scan', cb),
  },

  // ─── Smart-client cache (offline read + write queue) ──────────
  cache: {
    get: (key) => invoke('ops:cache.get', key),
    set: (key, value) => invoke('ops:cache.set', key, value),
    queueWrite: (op) => invoke('ops:cache.queueWrite', op),
    syncStatus: () => invoke('ops:cache.syncStatus'),
    triggerSync: () => invoke('ops:cache.triggerSync'),
    onSyncStatus: (cb) => on('ops:cache.syncStatus', cb),
    // Read APIs for smartCache wrapper (cache-first reads).
    list: (tableName) => invoke('ops:cache.list', tableName),
    read: (tableName, rowId) => invoke('ops:cache.read', tableName, rowId),
    upsert: (tableName, rowId, payload) => invoke('ops:cache.upsert', tableName, rowId, payload),
  },

  // ─── Filesystem helpers (read-only, sandboxed) ────────────────
  fs: {
    showSaveDialog: (opts) => invoke('ops:fs.showSaveDialog', opts),
    showOpenDialog: (opts) => invoke('ops:fs.showOpenDialog', opts),
    writeFile: (filePath, data) => invoke('ops:fs.writeFile', filePath, data),
    readFile: (filePath) => invoke('ops:fs.readFile', filePath),
  },

  // ─── Legacy data import (v1.0 → v1.1 migration) ──────────────
  import: {
    pickFolder: (opts) => invoke('ops:import.pickFolder', opts),
    scanFolder: (path) => invoke('ops:import.scanFolder', path),
    execute: (path, opts) => invoke('ops:import.execute', path, opts),
  },

  // ─── License (S-DIAG-FIX 2026-05-05) ──────────────────────────
  // Handlers registered in desktop/license.js:309-331; the bridge
  // was missing here, so renderer's window.ops.license was undefined
  // and About / Diagnostics threw "Cannot read properties of
  // undefined" on every license check. Each method is its own
  // explicit handle (no generic invoke passthrough — keeps the
  // attack surface limited to these 4 channels).
  license: {
    status: () => ipcRenderer.invoke('ops:license.status'),
    fingerprint: () => ipcRenderer.invoke('ops:license.fingerprint'),
    apply: (lic) => ipcRenderer.invoke('ops:license.apply', lic),
    tiers: () => ipcRenderer.invoke('ops:license.tiers'),
  },
};

contextBridge.exposeInMainWorld('ops', opsAPI);

// ─── Marker để client code biết đang chạy trong Electron ──────
contextBridge.exposeInMainWorld('opsRuntime', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
