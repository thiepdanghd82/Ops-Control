/**
 * Ops Control — Desktop Main Process
 * ===================================
 *
 * Kiến trúc 3-tier (lấy cảm hứng từ SAP GUI / IFS Aurena):
 *
 *   ┌────────────────────────────┐
 *   │  Tier 1 — Presentation     │  Electron BrowserWindow + React 19
 *   │  (this file + preload.js)  │  Cache local, native bridges
 *   └─────────────┬──────────────┘
 *                 │ HTTP/HTTPS (smart client)
 *   ┌─────────────▼──────────────┐
 *   │  Tier 2 — Application      │  Express server (server/index.js)
 *   │  (embedded HOẶC remote)    │  Có thể chạy in-process (mode embedded)
 *   │                            │  hoặc gọi remote 10.102.3.61 (mode thin)
 *   └─────────────┬──────────────┘
 *                 │
 *   ┌─────────────▼──────────────┐
 *   │  Tier 3 — Data             │  better-sqlite3 (ops.db) + JSON files
 *   └────────────────────────────┘
 *
 * Mode được chọn qua biến môi trường OPS_DESKTOP_MODE:
 *   - "embedded" (mặc định): Express chạy trong main process, single-user offline
 *   - "thin":     Connect tới remote app server (multi-user, server-of-record)
 *   - "smart":    Hybrid — local cache + sync với remote (sẽ implement Sprint 3)
 */

'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const log = require('electron-log/main');
const Store = require('electron-store');

const { initAutoUpdater } = require('./auto-update.js');
const { registerNativeBridges } = require('./native');
const license = require('./license.js');
const smartClient = require('./smart-client.js');
const { probeServer } = require('./utils/netProbe.js');

// ─── Logging ────────────────────────────────────────────────────────
log.initialize({ preload: true });
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

// Console transport ghi vào process.stdout. Khi app launch từ Finder
// (không có terminal parent), stdout pipe có thể đóng khi user wait
// một lúc → mọi console.log throw EPIPE → uncaughtException dialog
// "A JavaScript error occurred in the main process".
//
// Fix: disable console transport hoàn toàn khi packaged. Logs vẫn
// đầy đủ trong file ~/Library/Logs/<productName>/main.log. Chỉ giữ
// console transport ở dev mode (developer cần thấy log realtime).
if (app.isPackaged) {
  log.transports.console.level = false;
} else {
  log.transports.console.level = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
}

// Defensive wrap quanh process.stdout/stderr để swallow EPIPE thay vì
// crash. Có thể xảy ra với child processes (embedded server) write
// vào stdout sau khi parent đã đóng pipe.
for (const stream of [process.stdout, process.stderr]) {
  stream.on?.('error', (err) => {
    if (err && err.code === 'EPIPE') return; // ignore broken pipe
    log.warn('[stdio]', err.message);
  });
}

Object.assign(console, log.functions);

// ─── Last-resort error guards ───────────────────────────────────────
// Tránh dialog mặc định "A JavaScript error occurred in the main process"
// — vì dialog đó là Electron's defaults và không cho dismiss tốt. Ta log
// + show một dialog Vietnamese-friendly rồi quit gracefully.
process.on('uncaughtException', (err) => {
  // EPIPE từ stdout/stderr là noise, không phải bug → swallow
  if (err && err.code === 'EPIPE') {
    log.debug('[uncaught] EPIPE swallowed');
    return;
  }
  log.error('[uncaught]', err);
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        'Ops Control — lỗi không mong muốn',
        `${err.message}\n\nXem chi tiết trong log:\n${log.transports.file.getFile().path}`
      );
    }
  } catch {
    /* swallow */
  }
});

process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason);
});

// ─── Single-instance lock ───────────────────────────────────────────
// Chống user mở 2 cửa sổ Ops Control làm khoá SQLite.
// Đây là rule quan trọng — better-sqlite3 không an toàn với 2 process
// cùng ghi vào file .db. Khi user double-click icon lần 2, ta focus
// vào cửa sổ đang chạy thay vì spawn process mới.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.warn('[main] Another Ops Control instance is running — exiting.');
  app.quit();
  process.exit(0);
}

// ─── Build role (server / client / generic) ────────────────────────
// `build-role.json` is written by `scripts/build-windows-installers.mjs`
// when packaging the per-role installers. It bakes the intended role
// into the bundle so the first-run UX matches the EXE the operator
// downloaded — no Settings tweaking required.
//   { "role": "server" }  → first run defaults to embedded mode and
//                            shows a "your server IP" dialog
//   { "role": "client" }  → first run defaults to thin mode and
//                            prompts the user for the server URL
//   absent / "generic"    → legacy behaviour (no first-run prompt)
function readBuildRole() {
  try {
    const fp = path.join(__dirname, 'build-role.json');
    if (!fs.existsSync(fp)) return 'generic';
    const json = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return json.role || 'generic';
  } catch {
    return 'generic';
  }
}
const BUILD_ROLE = readBuildRole();
log.info(`[main] Build role = ${BUILD_ROLE}`);

// ─── Global state ──────────────────────────────────────────────────
const store = new Store({
  name: 'ops-control-config',
  defaults: {
    // Server-role build defaults to embedded; client-role build defaults
    // to thin. OPS_DESKTOP_MODE env var still wins (dev override).
    mode: process.env.OPS_DESKTOP_MODE || (BUILD_ROLE === 'client' ? 'thin' : 'embedded'),
    // Empty by default — operator MUST configure this in Settings → Mode
    // before picking thin/smart. Hardcoding a factory IP locked every
    // out-of-factory install into trying to reach an IP they cannot route to.
    remoteUrl: process.env.OPS_REMOTE_URL || '',
    embeddedPort: 0, // 0 = chọn tự do
    windowBounds: { width: 1440, height: 900 },
    zoomFactor: 1.0,
    // Tracks whether we already showed the role-specific first-run dialog.
    firstRunCompleted: false,
  },
});

let mainWindow = null;
let tray = null;
let embeddedServer = null;
let embeddedPort = 0;

// ─── Resolve resource paths ────────────────────────────────────────
// Trong dev: __dirname là folder desktop/, server ở ../server
// Trong prod (asar đóng gói): server nằm trong process.resourcesPath/app/server
function resolveAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.resolve(__dirname, '..');
}

const APP_ROOT = resolveAppRoot();
log.info('[main] APP_ROOT:', APP_ROOT);
log.info('[main] mode:', store.get('mode'));

// ─── Tìm cổng tự do cho embedded server ────────────────────────────
// Server gốc bind 0.0.0.0 (theo server/index.js:717). Để check chính
// xác, ta cũng phải test bind trên 0.0.0.0 — bind 127.0.0.1 sẽ "free"
// trong khi 0.0.0.0:port bị blocked nếu đã có process khác bind *:port.
//
// Range bắt đầu từ 3100 để tránh đụng server prod v1.0 đang chạy
// thường xuyên ở 3000. User có thể override qua OPS_PORT.
// Returns true if `host` matches any IPv4 address bound to one of this
// machine's network interfaces. Used by the thin-mode self-loop guard
// — if remoteUrl points at our own LAN IP, we know we're the server
// and need to auto-start embedded instead of trying to connect.
function isOwnLanAddress(host) {
  if (!host) return false;
  try {
    const interfaces = require('os').networkInterfaces();
    for (const list of Object.values(interfaces)) {
      for (const iface of list || []) {
        if (iface.address === host) return true;
      }
    }
  } catch {
    /* best-effort */
  }
  return false;
}

// Enumerate all routable IPv4 addresses on this machine (skip loopback,
// skip link-local 169.254.x.x). Used by the server-role first-run dialog
// to tell the operator which IP to give to client machines.
function getLanIPv4Addresses() {
  const out = [];
  try {
    const interfaces = require('os').networkInterfaces();
    for (const [name, list] of Object.entries(interfaces)) {
      for (const iface of list || []) {
        if (iface.family !== 'IPv4') continue;
        if (iface.internal) continue;
        if (/^169\.254\./.test(iface.address)) continue; // APIPA
        out.push({ iface: name, address: iface.address });
      }
    }
  } catch {
    /* best-effort */
  }
  return out;
}

async function findFreePort(startPort = 3100, endPort = 3199) {
  for (let port = startPort; port <= endPort; port++) {
    const free = await new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, '0.0.0.0');
    });
    if (free) return port;
  }
  throw new Error(`No free port in range ${startPort}-${endPort}`);
}

// ─── Operator runtime config (<userData>/.env) ─────────────────────
// Ops can drop a `.env` file in app.getPath('userData') to inject env
// vars (OPS_EXPORT_HMAC_KEY, etc.) without rebuilding the DMG. OS env
// always wins — this only fills in keys that aren't already present.
// Values are never logged; we only report how many keys merged.
function loadUserEnv() {
  try {
    const envFile = path.join(app.getPath('userData'), '.env');
    if (!fs.existsSync(envFile)) return;
    const raw = fs.readFileSync(envFile, 'utf-8');
    let added = 0;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && !(k in process.env)) {
        process.env[k] = v;
        added++;
      }
    }
    if (added > 0) log.info(`[main] userData/.env merged ${added} key(s)`);
  } catch (err) {
    log.warn('[main] userData/.env load failed:', err.message);
  }
}

// ─── Khởi động Express server in-process (mode embedded) ──────────
async function startEmbeddedServer() {
  loadUserEnv();
  embeddedPort = await findFreePort();
  log.info('[main] Starting embedded server on port', embeddedPort);

  // Set env vars cho server hiện hữu của Ops Control
  process.env.OPS_PORT = String(embeddedPort);
  process.env.PORT = String(embeddedPort);
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';

  // DATA_DIR: ưu tiên app.getPath('userData') để mỗi user Windows có
  // bộ dữ liệu riêng (theo chuẩn Windows AppData / macOS ~/Library)
  // Nếu user muốn dùng chung, có thể override bằng env.
  const userDataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  process.env.DATA_DIR = userDataDir;
  log.info('[main] DATA_DIR:', userDataDir);

  // F-LIC-1 — point server-side licenseService at desktop's license.json.
  // desktop/license.js writes the trial license to `<userData>/license.json`
  // (one level above DATA_DIR). server/services/licenseService.js falls back
  // to OPS_DATA_DIR/license.json which is wrong path here. Setting
  // OPS_LICENSE_FILE explicitly avoids the mismatch — fixes LICENSE_INVALID
  // on Create User + Reset Password flows that go through requireSeatAvailable.
  const licenseFile = path.join(app.getPath('userData'), 'license.json');
  if (fs.existsSync(licenseFile)) {
    process.env.OPS_LICENSE_FILE = licenseFile;
    log.info('[main] OPS_LICENSE_FILE:', licenseFile);
  }

  // Bootstrap DB: nếu lần đầu chạy, copy ops.db seed từ resources
  const seedDb = path.join(APP_ROOT, 'server', 'data', 'ops.db');
  const targetDb = path.join(userDataDir, 'ops.db');
  if (fs.existsSync(seedDb) && !fs.existsSync(targetDb)) {
    fs.copyFileSync(seedDb, targetDb);
    log.info('[main] Seeded ops.db to userData');
  }

  // Production preflight của server cần OPS_TOTP_KEY + CORS — set
  // sane defaults cho desktop (same-origin, key tự sinh nếu chưa có)
  process.env.OPS_ALLOW_SAME_ORIGIN = '1';

  // Đợt 5 — SQLite as primary read backend for desktop installs.
  // The shadow-write infrastructure has been in place since Sprint 7.2,
  // so flipping read-side to SQLite gives us:
  //   - Indexed list-view filtering (no more O(N) JSON scan)
  //   - Removes the JSON-mutex serialization bottleneck @ 20 concurrent
  //   - Strict mode (OPS_QUOTES_STRICT_SQLITE=1) deferred — keeps the
  //     file-fallback for one observation cycle so an unexpected DB
  //     issue still serves the previous list instead of an empty array.
  // Operators can override per-deploy via env (e.g. roll back to file
  // by exporting OPS_DATA_BACKEND=file before launching).
  if (!process.env.OPS_DATA_BACKEND) {
    process.env.OPS_DATA_BACKEND = 'sqlite';
  }
  // Auto-enable scheduled SQLite + Library backup on desktop installs.
  // Ops still can disable via env if they want to use only the manual
  // "Create backup" button.
  if (!process.env.OPS_BACKUP_SCHEDULE) {
    process.env.OPS_BACKUP_SCHEDULE = '1';
  }
  if (!process.env.OPS_AUDIT_RETENTION) {
    process.env.OPS_AUDIT_RETENTION = '1';
  }

  if (!process.env.OPS_TOTP_KEY) {
    let totpKey = store.get('totpKey');
    if (!totpKey || totpKey.length !== 64) {
      const crypto = require('node:crypto');
      totpKey = crypto.randomBytes(32).toString('hex');
      store.set('totpKey', totpKey);
      log.info('[main] Generated new OPS_TOTP_KEY (saved to electron-store)');
    }
    process.env.OPS_TOTP_KEY = totpKey;
  }

  // OPS_KIOSK_KEY — required by domains/planning/server/index.js (MES-2).
  // Same electron-store pattern as TOTP key: generate once, persist across
  // app restarts so kiosk JWTs remain valid. resolveKioskKey() throws fatal
  // in NODE_ENV=production if missing — must populate before spawning server.
  if (!process.env.OPS_KIOSK_KEY) {
    let kioskKey = store.get('kioskKey');
    if (!kioskKey || kioskKey.length !== 64) {
      const crypto = require('node:crypto');
      kioskKey = crypto.randomBytes(32).toString('hex');
      store.set('kioskKey', kioskKey);
      log.info('[main] Generated new OPS_KIOSK_KEY (saved to electron-store)');
    }
    process.env.OPS_KIOSK_KEY = kioskKey;
  }

  // OPS_EXPORT_HMAC_KEY — required by Sprint S-EXPORT-MVP-2 quote xlsx
  // export pipeline (preflight refuses prod boot if missing). Same
  // electron-store pattern as TOTP + KIOSK: generate once, persist
  // across app restarts so prior signed xlsx exports stay verifiable.
  // Loss = MVP-3 re-import refuses pre-loss exports (per Recovery
  // Playbook in CLAUDE.md) — make the generated key extremely durable
  // via electron-store + `<userData>/.env` fallback path.
  //
  // CLIENT-build embedded mode hit this wall on Phase 6 Day 2 hardware
  // verify (Henry's Mac DMG, 2026-06-10 17:21 onwards): fresh install
  // had no .env seed → embedded server refused to start. Auto-gen
  // closes the gap so CCL Hai Duong operators don't see "edit .env
  // file manually" friction on first run.
  if (!process.env.OPS_EXPORT_HMAC_KEY) {
    let hmacKey = store.get('exportHmacKey');
    if (!hmacKey || hmacKey.length !== 64) {
      const crypto = require('node:crypto');
      hmacKey = crypto.randomBytes(32).toString('hex');
      store.set('exportHmacKey', hmacKey);
      log.info('[main] Generated new OPS_EXPORT_HMAC_KEY (saved to electron-store)');
    }
    process.env.OPS_EXPORT_HMAC_KEY = hmacKey;
  }

  // Require Express server hiện tại — KHÔNG sửa code gốc
  const serverEntry = path.join(APP_ROOT, 'server', 'index.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Server entry not found: ${serverEntry}`);
  }

  // Server hiện tại là ESM ("type": "module" trong package.json gốc).
  // Electron main process không thể `require()` ESM trực tiếp.
  // Giải pháp: spawn child process node để chạy server, giao tiếp qua
  // HTTP (đằng nào client cũng gọi qua HTTP). Đây cũng là cách an toàn
  // nhất — nếu server crash, không kéo theo Electron main.
  //
  // Trong production build, ta dùng Node bundled với Electron.
  embeddedServer = spawn(process.execPath, [serverEntry], {
    cwd: path.join(APP_ROOT),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // bảo Electron chạy như node thuần
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  embeddedServer.stdout.on('data', (chunk) => {
    log.info('[server]', chunk.toString().trim());
  });
  embeddedServer.stderr.on('data', (chunk) => {
    log.error('[server]', chunk.toString().trim());
  });
  embeddedServer.on('exit', (code, signal) => {
    log.warn(`[main] Embedded server exited code=${code} signal=${signal}`);
    embeddedServer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showMessageBox(mainWindow, {
          type: 'error',
          title: 'Ops Control',
          message: 'Server backend đã dừng đột ngột.',
          detail: `Exit code: ${code}\nVui lòng khởi động lại ứng dụng.`,
          buttons: ['Khởi động lại', 'Thoát'],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) {
            app.relaunch();
          }
          app.quit();
        });
    }
  });

  // Đợi server lắng nghe — poll /health
  const waitReady = async () => {
    const start = Date.now();
    while (Date.now() - start < 30000) {
      try {
        const url = `http://127.0.0.1:${embeddedPort}/health`;
        const res = await fetch(url);
        if (res.ok) {
          log.info('[main] Embedded server ready in', Date.now() - start, 'ms');
          return;
        }
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Embedded server did not become ready in 30s');
  };
  await waitReady();
}

// ─── URL để load vào BrowserWindow ─────────────────────────────────
function getAppUrl() {
  const mode = store.get('mode');
  if (mode === 'thin') {
    // If the self-loop guard auto-started an embedded server (because
    // remoteUrl points at this machine), prefer the loopback URL.
    // Otherwise return the configured remote.
    const remote = String(store.get('remoteUrl') || '');
    if (embeddedPort) {
      const m = remote.match(/^https?:\/\/([^:/]+)/i);
      const host = m?.[1] || '';
      if (/^(localhost|127\.|::1$)/.test(host) || isOwnLanAddress(host)) {
        return `http://127.0.0.1:${embeddedPort}`;
      }
    }
    return remote;
  }
  // Hard fail-fast: embedded/smart MUST have a port assigned by
  // startEmbeddedServer before this is called. Returning :0 here used
  // to surface as ERR_ADDRESS_INVALID in the renderer with no useful
  // hint as to why — so we throw instead and let the outer try/catch
  // show the friendlier "lỗi khởi động" dialog.
  if (!embeddedPort) {
    throw new Error(
      `embedded server has no port (mode=${mode}). startEmbeddedServer must run before createMainWindow.`
    );
  }
  return `http://127.0.0.1:${embeddedPort}`;
}

// ─── Tạo cửa sổ chính ──────────────────────────────────────────────
function createMainWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1024,
    minHeight: 700,
    title: 'Ops Control',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f5f5f5',
    show: false, // Ẩn cho đến khi load xong, tránh flash trắng
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Cần false để preload truy cập node modules
      spellcheck: false,
      devTools: !app.isPackaged || process.env.OPS_DESKTOP_DEVTOOLS === '1',
      // v1.3 P1.4 — webview disabled and webSecurity locked. Defence
      // in depth on top of CSP below; CSP can be bypassed by main-frame
      // navigation, webSecurity catches that.
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      // F-DRAW-6 — enable Chromium's built-in PDF viewer plugin. Without
      // this, `<iframe src="blob:application/pdf">` renders as a black
      // void (no PDF reader plugin loaded). Customer Drawing PDFs in
      // FileUploadZone need this to render inline + in fullscreen modal.
      plugins: true,
    },
  });

  // v1.3 P1.4 — Content-Security-Policy injected via header rewrite.
  // Stricter than serving CSP from the React index.html because Vite's
  // HMR / inline boot scripts are out of our control. The hash sources
  // listed (sha256-...) cover Vite's known boot bootstrap blocks; if a
  // future Vite version bumps them, console will throw a CSP violation
  // and we update here. `style-src 'unsafe-inline'` is unavoidable for
  // Vite's dev styles; production builds already serve hashed CSS.
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite + React dev needs eval; tightened in P5
    "style-src 'self' 'unsafe-inline'", // Vite injects inline styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* ws://127.0.0.1:*",
    // FileUploadZone renders inline PDF previews via `<iframe src=blob:...>`.
    // Without `blob:` here Electron blocks the iframe even though the server
    // CSP already allows it. Same fix as server/index.js (F-DRAW-1).
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    const headers = { ...details.responseHeaders, 'Content-Security-Policy': [CSP] };
    cb({ responseHeaders: headers });
  });

  // Reject unexpected navigations — operator should never leave the
  // embedded SPA, and any link click that escapes the SPA goes through
  // shell.openExternal() instead of replacing the BrowserWindow contents.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = ['http://127.0.0.1', 'http://localhost', 'file://'];
    if (!allowed.some((p) => url.startsWith(p))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  // Save window bounds khi user resize/move
  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.setZoomFactor(store.get('zoomFactor'));
  });

  // Mở external links bằng default browser thay vì cửa sổ Electron mới.
  // blob: URLs (FileUploadZone "Open in new window" for drawing previews)
  // are session-scoped and can ONLY be opened by the same Electron renderer
  // — shell.openExternal can't open them. Allow blob: + same-origin to open
  // a new Electron BrowserWindow; everything else routes to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const remote = store.get('remoteUrl') || '';
    if (
      url.startsWith('blob:') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('http://localhost') ||
      (remote && url.startsWith(remote))
    ) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block in-app navigation đến external origins (security hardening)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [`http://127.0.0.1:${embeddedPort}`, store.get('remoteUrl')];
    if (!allowed.some((origin) => url.startsWith(origin))) {
      log.warn('[main] Blocked navigation to', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const url = getAppUrl();
  log.info('[main] Loading URL:', url);
  mainWindow.loadURL(url).catch((err) => {
    log.error('[main] loadURL failed:', err);
    // Offer one-click recovery: switch back to embedded mode + restart.
    // Most failures here are user picked thin/smart with an unreachable
    // remoteUrl; reverting to embedded gives them a working app to fix
    // the URL from inside Settings.
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'Ops Control — không kết nối được server',
      message: `Không kết nối được tới ${url}`,
      detail: `${err.message}\n\nApp đang ở mode "${store.get('mode')}". Có thể server LAN tắt, sai IP, hoặc firewall chặn.\n\nChọn "Reset về Embedded" để chuyển về server local và thử lại — config mode sẽ bị reset, anh có thể chỉnh lại trong Settings → ⇄ Chế độ kết nối sau khi vào được app.`,
      buttons: ['Reset về Embedded + Restart', 'Thoát app', 'Bỏ qua'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (choice === 0) {
      store.set('mode', 'embedded');
      store.set('remoteUrl', '');
      app.relaunch();
      app.exit(0);
    } else if (choice === 1) {
      app.exit(1);
    }
  });
}

// ─── Tray icon (chạy nền) ──────────────────────────────────────────
function createTray() {
  const iconPath = path.join(
    __dirname,
    'build',
    process.platform === 'darwin' ? 'tray-mac.png' : 'tray.png'
  );
  if (!fs.existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Ops Control');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mở Ops Control', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Kiểm tra cập nhật', click: () => initAutoUpdater(true) },
      { label: `Mode: ${store.get('mode')}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Thoát',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', () => mainWindow?.show());
}

// ─── App Menu (Edit/View/Help) ─────────────────────────────────────
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Tệp',
      submenu: [
        {
          label: 'Cấu hình kết nối...',
          click: () => mainWindow?.webContents.send('ops:open-settings'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Thoát' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Xem',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { role: 'forceReload', label: 'Tải lại (xóa cache)' },
        { role: 'toggleDevTools', label: 'Developer Tools', visible: !app.isPackaged },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom 100%' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ],
    },
    {
      label: 'Trợ giúp',
      submenu: [
        {
          label: 'Phiên bản',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Ops Control',
              message: `Ops Control Desktop v${app.getVersion()}`,
              detail: `Mode: ${store.get('mode')}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`,
            }),
        },
        {
          label: 'Kiểm tra cập nhật',
          click: () => initAutoUpdater(true),
        },
        {
          label: 'Mở thư mục dữ liệu',
          click: () => shell.openPath(app.getPath('userData')),
        },
        {
          label: 'Mở log',
          click: () => shell.openPath(log.transports.file.getFile().path),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Role-specific first-run dialogs ───────────────────────────────
// Both fire exactly ONCE per install (gated by store.firstRunCompleted).
// Server build: tell the operator which IP to give to client machines.
// Client build: ask the operator to type the server URL + test it live.

async function showServerFirstRunDialog() {
  // Wait briefly for embedded server port to be set so we can show the
  // exact URL clients should use. embeddedPort is filled in by
  // startEmbeddedServer() — by the time we reach here it's already set.
  const port = embeddedPort || 3100;
  const ips = getLanIPv4Addresses();
  const ipLines =
    ips.length === 0
      ? '(không tìm thấy network adapter — kiểm tra Ethernet/WiFi)'
      : ips.map(({ iface, address }) => `   • ${address}   (${iface})`).join('\n');
  const detail = `Máy này đã được cấu hình làm SERVER. Server local đang chạy port ${port}.

Đưa MỘT trong các URL dưới đây cho người cài máy nhân viên (Client):

${ipLines
  .split('\n')
  .map((l) => l.replace('   • ', '   • http://') + ':' + port)
  .join('\n')}

Lưu ý:
  • Chọn IP của Ethernet (ưu tiên) — bền hơn WiFi
  • Cài máy nhân viên: dùng "Ops Control CLIENT Setup 1.5.10.exe" → app sẽ tự hỏi URL này
  • Để cố định IP máy chủ, vào Network Settings → Static IP (hướng dẫn ở Go-Live Guide §2.4)
  • Để app server tự chạy 24/7 không cần login, cài NSSM service (Go-Live Guide §2.3)`;

  dialog.showMessageBoxSync(null, {
    type: 'info',
    title: 'Ops Control SERVER — cài đặt thành công',
    message: 'Đây là URL server của anh',
    detail,
    buttons: ['Đã ghi lại — tiếp tục'],
    defaultId: 0,
    noLink: true,
  });
}

async function showClientFirstRunDialog() {
  // Tiny BrowserWindow with an inline HTML form — Electron's `dialog`
  // module has no input field, so we hand-roll one. The window posts
  // the result back via IPC and closes itself. Blocking await via Promise
  // so app boot doesn't continue until the operator confirms.
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 540,
      height: 460,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Ops Control CLIENT — kết nối server',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    win.setMenu(null);

    // Inline HTML — Vietnamese, IBM Carbon-ish styling to match the rest
    // of the app. Posts to the parent via window.postMessage emulated
    // through an IPC channel registered just for this dialog.
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f4;color:#161616}
  h1{font-size:18px;margin:0 0 6px;font-weight:600}
  p{font-size:13px;color:#525252;margin:0 0 16px;line-height:1.5}
  label{display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:#161616}
  input{width:100%;height:36px;padding:0 12px;font-size:14px;border:1px solid #c6c6c6;background:#fff;box-sizing:border-box;font-family:inherit}
  input:focus{outline:none;border-color:#0f62fe;border-bottom-width:2px}
  .row{display:flex;gap:8px;margin-top:8px}
  .row input{flex:1}
  button{height:36px;padding:0 16px;border:1px solid transparent;font-size:13px;cursor:pointer;font-family:inherit}
  .btn-test{background:#fff;border-color:#c6c6c6;color:#161616}
  .btn-test:hover{background:#e8e8e8}
  .btn-skip{background:transparent;color:#525252;border:none}
  .btn-save{background:#0f62fe;color:#fff;border-color:#0f62fe}
  .btn-save:hover{background:#0353e0}
  .btn-save:disabled{background:#c6c6c6;border-color:#c6c6c6;cursor:not-allowed}
  .footer{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:16px;border-top:1px solid #e0e0e0}
  .status{font-size:12px;margin-top:8px;min-height:18px;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace}
  .status.ok{color:#0e6027}
  .status.err{color:#a2191f}
</style></head><body>
<h1>Kết nối tới server Ops Control</h1>
<p>Máy này được cài làm <b>Client</b>. Nhập URL server (lấy từ người cài máy chủ).</p>
<label>URL server</label>
<div class="row">
  <input id="url" type="text" placeholder="http://192.168.1.16:3100" autofocus />
  <button class="btn-test" id="test">Test kết nối</button>
</div>
<div class="status" id="status"></div>
<div class="footer">
  <button class="btn-skip" id="skip">Bỏ qua, để mặc định embedded</button>
  <button class="btn-save" id="save" disabled>Lưu &amp; tiếp tục →</button>
</div>
<script>
  const $url=document.getElementById('url');
  const $test=document.getElementById('test');
  const $save=document.getElementById('save');
  const $skip=document.getElementById('skip');
  const $status=document.getElementById('status');
  let lastTestOk=false;
  function setStatus(msg, cls){ $status.textContent=msg; $status.className='status '+(cls||''); }
  $url.addEventListener('input', ()=>{ $save.disabled=true; lastTestOk=false; setStatus(''); });
  $test.addEventListener('click', async ()=>{
    let url = $url.value.trim();
    if(!url) { setStatus('Nhập URL trước', 'err'); return; }
    if(!/^https?:\\/\\//i.test(url)) url = 'http://' + url;
    if(!/:\\d+/.test(url)) url = url + ':3100';
    setStatus('Đang test ' + url + ' ...');
    $test.disabled=true;
    try {
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(), 4000);
      const res=await fetch(url + '/api/health', { signal: ctrl.signal });
      clearTimeout(t);
      if(res.ok){ setStatus('✓ Server OK — bấm "Lưu & tiếp tục"', 'ok'); $save.disabled=false; lastTestOk=true; $url.value=url; }
      else { setStatus('✗ Server trả ' + res.status, 'err'); }
    } catch(err){ setStatus('✗ Không kết nối được: ' + err.message, 'err'); }
    finally { $test.disabled=false; }
  });
  $save.addEventListener('click', ()=>{
    if(!lastTestOk) return;
    fetch('/__firstrun__?url='+encodeURIComponent($url.value.trim())+'&action=save');
  });
  $skip.addEventListener('click', ()=>{
    fetch('/__firstrun__?action=skip');
  });
  $url.addEventListener('keydown', (e)=>{ if(e.key==='Enter') $test.click(); });
</script>
</body></html>`;

    // Intercept the dummy /__firstrun__ "fetch" calls (they target the
    // page's own origin = data: URL → no real network) by listening to
    // beforeRequest events on the session.
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*/__firstrun__*'] },
      (details, callback) => {
        try {
          const u = new URL(details.url);
          const action = u.searchParams.get('action');
          const url = u.searchParams.get('url') || '';
          if (action === 'save' && url) {
            store.set('mode', 'thin');
            store.set('remoteUrl', url);
            log.info('[main] first-run: client saved remoteUrl=' + url);
          } else if (action === 'skip') {
            store.set('mode', 'embedded');
            store.set('remoteUrl', '');
            log.info('[main] first-run: client skipped, fell back to embedded');
          }
        } catch (e) {
          log.warn('[main] first-run intercept error:', e.message);
        }
        callback({ cancel: true });
        if (!win.isDestroyed()) win.close();
      }
    );
    win.on('closed', () => resolve());
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// v1.3 — new comprehensive setup wizard. Runs once per install per
// BUILD_ROLE (server / client). Falls back to legacy first-run dialogs
// below if the wizard hasn't been activated yet (`OPS_USE_LEGACY_FIRSTRUN=1`).
const setupWizard = require('./setupWizard');

app.whenReady().then(async () => {
  buildAppMenu();
  registerNativeBridges(ipcMain, log);
  license.register(ipcMain);

  // Electron 41 + blob: URLs triggered via `a.download = filename` don't
  // always finalize the rename from Chromium's temp file
  // ("<appBundleId>.<random>", leading-dot hidden) to the suggested
  // filename. Force-apply the suggested filename + drop into ~/Downloads
  // so quote-export xlsx/zip files land where operators expect.
  const { session } = require('electron');
  session.defaultSession.on('will-download', (_event, item) => {
    try {
      const suggested = item.getFilename();
      if (!suggested) return;
      const downloadsDir = app.getPath('downloads');
      let target = path.join(downloadsDir, suggested);
      // Avoid overwriting an existing file — suffix with timestamp.
      if (fs.existsSync(target)) {
        const ext = path.extname(suggested);
        const stem = suggested.slice(0, suggested.length - ext.length);
        const ts = new Date()
          .toISOString()
          .replace(/[-:T.]/g, '')
          .slice(0, 14);
        target = path.join(downloadsDir, `${stem}_${ts}${ext}`);
      }
      item.setSavePath(target);
      log.info('[main] will-download →', path.basename(target));
    } catch (err) {
      log.warn('[main] will-download handler failed:', err.message);
    }
  });

  // License boot probe — chỉ enforce khi packaged (dev mode bỏ qua
  // để dev không bị chặn). Trong PoC chạy local cho phép trial.
  if (app.isPackaged) {
    const lic = license.checkOnBoot({ allowTrial: true });
    if (!lic.ok) {
      await license.showLicenseDialog(lic.reason, lic.installationId);
      app.quit();
      return;
    }
    log.info('[main] License OK:', lic.license?.customer, 'expires:', lic.license?.expires_at);
  }

  // v1.3 P4 — run the new 4-step (server) / 2-step (client) setup
  // wizard if first run AND not opted out. Skips automatically when
  // OPS_USE_LEGACY_FIRSTRUN=1 so existing v1.2 behaviour can be
  // re-enabled by ops if the new wizard regresses in the field.
  const useLegacyFirstRun = process.env.OPS_USE_LEGACY_FIRSTRUN === '1';
  if (
    !useLegacyFirstRun &&
    (BUILD_ROLE === 'server' || BUILD_ROLE === 'client') &&
    setupWizard.isFirstRun(BUILD_ROLE)
  ) {
    try {
      const result = await setupWizard.showWizard(BUILD_ROLE, {
        onSetDataPath: async (dp) => store.set('dataDir', dp),
        onSetNet: async ({ port, bind }) => {
          store.set('embeddedPort', port);
          store.set('embeddedBind', bind);
          process.env.OPS_PORT = String(port);
          process.env.OPS_BIND = String(bind);
        },
        onSetRemoteUrl: async (url) => {
          store.set('mode', 'thin');
          store.set('remoteUrl', url);
          log.info('[main] setup wizard (client) saved remoteUrl=' + url);
        },
        // Phase A.1 — mirror server identity into electron-store so the
        // admin dashboard (Phase A.2) reads it without re-parsing
        // setup-done.json. Identity also lives in setup-done.json as
        // the source-of-truth for re-runs (immutable serverId).
        onSetIdentity: async (identity) => store.set('serverIdentity', identity),
        onCreateAdmin: async ({ username, password }) => {
          // Defer to server's authService — must run after embedded
          // server boot. We persist the request and the server reads
          // it on first boot via scripts/seed-admin.js.
          const seedPath = path.join(app.getPath('userData'), 'pending-admin-seed.json');
          fs.writeFileSync(seedPath, JSON.stringify({ username, password }, null, 2));
        },
      });
      if (result.ok) {
        store.set('firstRunCompleted', true);
        log.info(`[main] setup wizard (${BUILD_ROLE}) completed`);
      } else {
        log.warn(`[main] setup wizard (${BUILD_ROLE}) closed without completion — exiting`);
        app.quit();
        return;
      }
    } catch (err) {
      log.error('[main] setup wizard error:', err);
    }
  }

  try {
    // Both 'embedded' AND 'smart' need a local Express running:
    // embedded = local-only; smart = local cache that syncs to remote.
    // Only 'thin' skips it (renderer points straight at the remote URL).
    const mode = store.get('mode');

    // Thin-mode "self-loop" guard: if the user picked thin but pointed
    // remoteUrl at this machine's own IP (loopback or any local NIC),
    // there's no remote server to connect to — `ERR_CONNECTION_REFUSED`
    // would render. Auto-start the embedded server so the URL resolves
    // locally. This is the realistic case where one Mac is BOTH the
    // server AND a client desktop.
    let needsEmbedded = mode === 'embedded' || mode === 'smart';
    if (mode === 'thin') {
      const remote = String(store.get('remoteUrl') || '');
      const m = remote.match(/^https?:\/\/([^:/]+)(?::(\d+))?/i);
      const remoteHost = m?.[1] || '';
      const isLoopback = /^(localhost|127\.|::1$)/.test(remoteHost);
      const isThisMachine = isLoopback || isOwnLanAddress(remoteHost);
      if (isThisMachine) {
        log.info(
          `[main] thin mode → remoteUrl ${remote} resolves to this machine — auto-starting embedded server`
        );
        needsEmbedded = true;
      }
    }
    if (needsEmbedded) {
      await startEmbeddedServer();
    }

    // Role-specific first-run UX: only fires once per install (firstRunCompleted
    // flag in electron-store). Server build → "here's your IP" dialog;
    // client build → "enter server URL + test" dialog. If client user picks
    // "Skip", mode flips to embedded → we may need to start the local server
    // post-dialog. Server dialog is pure info, no follow-up needed.
    if (BUILD_ROLE !== 'generic' && !store.get('firstRunCompleted')) {
      try {
        if (BUILD_ROLE === 'server') {
          await showServerFirstRunDialog();
        } else if (BUILD_ROLE === 'client') {
          await showClientFirstRunDialog();
          // Client may have flipped to embedded via Skip — honour it now
          // so getAppUrl() doesn't see embeddedPort=0.
          if (store.get('mode') === 'embedded' && embeddedPort === 0) {
            log.info('[main] client first-run skipped → starting embedded server');
            await startEmbeddedServer();
          }
        }
        store.set('firstRunCompleted', true);
      } catch (err) {
        log.error('[main] first-run dialog failed:', err);
      }
    }

    createMainWindow();
    createTray();

    // Smart-client engine chỉ start khi mode = 'smart' (Sprint 3)
    if (mode === 'smart') {
      smartClient.start({ remoteUrl: store.get('remoteUrl') });
    }

    // Init auto-update sau khi window đã sẵn sàng (silent check)
    if (app.isPackaged) {
      setTimeout(() => initAutoUpdater(false), 5000);
    }
  } catch (err) {
    log.error('[main] Startup failed:', err);
    dialog.showErrorBox(
      'Ops Control — lỗi khởi động',
      `${err.message}\n\nXem log: ${log.transports.file.getFile().path}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  smartClient.stop();
  if (embeddedServer) {
    log.info('[main] Stopping embedded server...');
    embeddedServer.kill('SIGTERM');
    setTimeout(() => embeddedServer?.kill('SIGKILL'), 3000).unref();
  }
});

// ─── IPC handlers (config) ─────────────────────────────────────────
ipcMain.handle('ops:get-config', () => ({
  mode: store.get('mode'),
  remoteUrl: store.get('remoteUrl'),
  embeddedPort,
  version: app.getVersion(),
  // Surface server's LAN addresses + build role so the Settings → Mode
  // tab can show "share this URL with client machines" inline (server
  // role) instead of relying on the once-per-install first-run dialog.
  buildRole: BUILD_ROLE,
  lanAddresses: getLanIPv4Addresses(),
}));

ipcMain.handle('ops:set-config', (_evt, patch) => {
  const oldMode = store.get('mode');
  const oldUrl = store.get('remoteUrl');
  if (patch.mode) store.set('mode', patch.mode);
  if (patch.remoteUrl) store.set('remoteUrl', patch.remoteUrl);
  const newMode = store.get('mode');
  const newUrl = store.get('remoteUrl');

  // v1.2 — Dynamic smart-client engine kick-on/off without full restart.
  // Embedded ↔ Thin still requires restart (server boot is heavy).
  // But Thin ↔ Smart can swap engine on the fly (smart adds local cache
  // + sync poller; stopping/starting these doesn't touch the server).
  let needsRestart = true;
  try {
    const swapsSmart = (oldMode === 'smart') !== (newMode === 'smart');
    const wentSmart = oldMode !== 'smart' && newMode === 'smart';
    const leftSmart = oldMode === 'smart' && newMode !== 'smart';
    const stayedThin = oldMode === 'thin' && newMode === 'thin';

    if (swapsSmart && oldMode !== 'embedded' && newMode !== 'embedded') {
      // Thin → Smart: start engine without restart
      // Smart → Thin: stop engine without restart
      if (wentSmart) {
        smartClient.start({ remoteUrl: newUrl });
        log.info('[main] smart-client started (dynamic, no restart)');
      } else if (leftSmart) {
        smartClient.stop();
        log.info('[main] smart-client stopped (dynamic, no restart)');
      }
      needsRestart = false;
    } else if (stayedThin && oldUrl !== newUrl) {
      // URL change in thin mode — needs renderer reload but not full restart
      // (frontend will pick up new URL on next API call, but cookie/session
      // tied to old URL → safer to ask user to relaunch)
      needsRestart = true;
    }
  } catch (err) {
    log.warn('[main] dynamic mode swap failed:', err.message);
    needsRestart = true;
  }

  return { needsRestart, applied: { mode: newMode, remoteUrl: newUrl } };
});

ipcMain.handle('ops:relaunch', () => {
  app.relaunch();
  app.quit();
});

// Sprint 1.5 — SAP/IFS handover. Re-arm the role-specific first-run dialog
// so the operator can re-onboard a machine without uninstalling.
// Resets `firstRunCompleted`, clears mode/remoteUrl so the dialog has a
// clean slate on next boot, then relaunches. Does NOT touch user data —
// only the connection-mode + first-run state.
ipcMain.handle('ops:rerun-first-run', () => {
  log.info('[main] rerun-first-run requested via Settings');
  store.delete('firstRunCompleted');
  store.delete('mode');
  store.delete('remoteUrl');
  app.relaunch();
  app.quit();
});

// Phase A.3a — general-purpose server reachability probe.
// Used by ModeSection's "Test Connection" button. The setup wizard
// keeps its own 'ops:setup.testServer' channel (alias) so existing
// renderer code there doesn't need to change.
ipcMain.handle('ops:net.testServer', async (_e, { url } = {}) => probeServer(url));

// Open a base64-encoded file with the OS default handler (Adobe Acrobat,
// Preview, browser, etc.). Used by FileUploadZone "Open in new window" so
// operators get a real native PDF reader instead of an embedded Electron
// child window. Blob URLs can't cross processes — we reify to a temp file.
ipcMain.handle('ops:shell.openExternalFile', async (_e, { b64Data, ext } = {}) => {
  if (typeof b64Data !== 'string' || b64Data.length === 0) {
    throw new Error('openExternalFile: b64Data is required');
  }
  const safeExt = typeof ext === 'string' && /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '.bin';
  const tmpPath = path.join(app.getPath('temp'), `ops-preview-${Date.now()}${safeExt}`);
  fs.writeFileSync(tmpPath, Buffer.from(b64Data, 'base64'));
  const errMsg = await shell.openPath(tmpPath);
  if (errMsg) throw new Error(`shell.openPath: ${errMsg}`);
  return { path: tmpPath };
});
