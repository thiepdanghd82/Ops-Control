/**
 * Setup wizards — Sprint v1.3 P4.
 *
 * Two wizards, picked by `mode`:
 *   - SERVER: 4 steps — License → DB init → Network/port → Create admin
 *   - CLIENT: 2 steps — Server URL + test connection → Login (handled by SPA)
 *
 * The wizard is rendered in a stand-alone BrowserWindow with an inline
 * HTML form (no React import — boots before the SPA bundle is loaded).
 * Once complete, `userData/setup-done.json` is written and the main
 * window opens normally.
 */

'use strict';

const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const license = require('./license.js');
const serverIdentity = require('./utils/serverIdentity.js');
const { probeServer } = require('./utils/netProbe.js');

const SETUP_DONE_PATH = () => path.join(app.getPath('userData'), 'setup-done.json');
const SCHEMA_VERSION = 2;

function isFirstRun(mode) {
  const p = SETUP_DONE_PATH();
  if (!fs.existsSync(p)) return true;
  try {
    const done = JSON.parse(fs.readFileSync(p, 'utf8'));
    return done.mode !== mode;
  } catch {
    return true;
  }
}

// Read setup-done.json with lazy v1 → v2 migration in memory.
// v1: { mode, completed_at }
// v2: { schemaVersion: 2, mode, completed_at, serverIdentity?: {...} }
// Writes always emit v2 via markComplete().
function loadSetup() {
  const p = SETUP_DONE_PATH();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (raw.schemaVersion === SCHEMA_VERSION) return raw;
    return { schemaVersion: SCHEMA_VERSION, ...raw };
  } catch {
    return null;
  }
}

function markComplete(mode, payload) {
  fs.writeFileSync(
    SETUP_DONE_PATH(),
    JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, mode, completed_at: new Date().toISOString(), ...payload },
      null,
      2
    ),
    'utf8'
  );
}

// ─── HTML templates ──────────────────────────────────────────────
const STYLE = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'IBM Plex Sans', Segoe UI, sans-serif;
    margin: 0; padding: 28px 32px;
    background: #f8fafc; color: #1f2937;
  }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
  .sub { color: #475569; font-size: 13px; margin-bottom: 20px; }
  .step {
    display: none; background: #fff;
    border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 20px; margin-bottom: 16px;
  }
  .step.active { display: block; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  label { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.4px; }
  input, select, textarea {
    padding: 8px 12px; font-size: 14px;
    border: 1px solid #cbd5e1; border-radius: 4px;
    font-family: inherit;
  }
  input:focus, select:focus, textarea:focus { outline: 2px solid #0f62fe; outline-offset: -1px; border-color: #0f62fe; }
  .row { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
  button {
    padding: 8px 18px; font-size: 14px; font-weight: 600;
    border-radius: 4px; cursor: pointer; border: 1px solid transparent;
  }
  .btn-primary { background: #0f62fe; color: #fff; border-color: #0f62fe; }
  .btn-primary:hover { background: #0050e6; }
  .btn-primary:disabled { opacity: 0.5; cursor: wait; }
  .btn-secondary { background: #fff; color: #475569; border-color: #cbd5e1; }
  .btn-secondary:hover { background: #f1f5f9; }
  .progress { display: flex; gap: 8px; margin-bottom: 24px; }
  .pill {
    flex: 1; height: 6px; border-radius: 3px; background: #e2e8f0;
  }
  .pill.done { background: #16a34a; }
  .pill.curr { background: #0f62fe; }
  .alert { padding: 10px 14px; border-radius: 4px; font-size: 13px; margin-bottom: 12px; }
  .alert-ok   { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .alert-bad  { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .alert-info { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
  pre { background: #f1f5f9; padding: 8px 10px; font-size: 12px; border-radius: 3px; overflow-x: auto; }
`;

const SCRIPT_BASE = `
  function go(idx) {
    document.querySelectorAll('.step').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    document.querySelectorAll('.pill').forEach((el, i) => {
      el.classList.toggle('done', i < idx);
      el.classList.toggle('curr', i === idx);
    });
  }
  function setAlert(zone, kind, msg) {
    const el = document.getElementById(zone);
    if (!el) return;
    el.innerHTML = msg ? '<div class="alert alert-' + kind + '">' + msg + '</div>' : '';
  }
`;

// ─── Server wizard (5 steps — v2 adds Server Identity between Network and Admin) ──
function renderServerWizard(installationId, existingIdentity) {
  // Identity decision at render time:
  //   - Existing identity present (re-run): preserve serverId + createdAt;
  //     pre-fill name / tz / lang for editing.
  //   - Fresh install: generate one-shot UUID; auto-detect tz + lang;
  //     leave name blank for operator entry.
  const identity = existingIdentity || {
    serverName: '',
    serverId: serverIdentity.generateServerId(),
    timezone: serverIdentity.detectTimezone(),
    language: serverIdentity.detectLanguage(),
  };
  const isReRun = Boolean(existingIdentity);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ops Control · Setup (Server)</title>
<style>${STYLE}</style></head><body>
  <h1>Ops Control — Server Setup</h1>
  <p class="sub">Lần đầu khởi động — vui lòng hoàn tất 5 bước cấu hình.</p>
  <div class="progress">
    <div class="pill curr"></div><div class="pill"></div><div class="pill"></div><div class="pill"></div><div class="pill"></div>
  </div>

  <div class="step active">
    <h2>Bước 1 / 5 — License</h2>
    <p class="sub">Dán license JSON do CCL HQ cấp, hoặc bỏ qua để dùng <b>trial 14 ngày</b>.</p>
    <div id="alert-license"></div>
    <div class="field">
      <label>Installation ID (gửi cho CCL HQ qua email)</label>
      <pre id="iid">${installationId}</pre>
    </div>
    <div class="field">
      <label>License JSON (dán hoặc bỏ trống)</label>
      <textarea id="license-input" rows="5" placeholder='{"version":2,...}'></textarea>
    </div>
    <div class="row">
      <button class="btn-secondary" onclick="useTrialAndNext()">Dùng trial 14 ngày</button>
      <button class="btn-primary"   onclick="applyLicenseAndNext()">Áp dụng license & tiếp tục</button>
    </div>
  </div>

  <div class="step">
    <h2>Bước 2 / 5 — Khởi tạo dữ liệu</h2>
    <p class="sub">Chọn nơi lưu dữ liệu (SQLite + JSON Library). Mặc định là thư mục userData của ứng dụng.</p>
    <div id="alert-db"></div>
    <div class="field">
      <label>Thư mục dữ liệu</label>
      <input id="data-path" value="${app.getPath('userData').replace(/"/g, '&quot;')}/data" />
    </div>
    <div class="row">
      <button class="btn-secondary" onclick="go(0)">← Quay lại</button>
      <button class="btn-primary"   onclick="initDbAndNext()">Khởi tạo & tiếp tục</button>
    </div>
  </div>

  <div class="step">
    <h2>Bước 3 / 5 — Kết nối mạng</h2>
    <p class="sub">Cấu hình port server lắng nghe cho các Client trong LAN.</p>
    <div id="alert-net"></div>
    <div class="field">
      <label>Port (1024–65535)</label>
      <input id="port" type="number" min="1024" max="65535" value="3000" />
    </div>
    <div class="field">
      <label>Bind address</label>
      <select id="bind">
        <option value="0.0.0.0">0.0.0.0 (mọi LAN — production)</option>
        <option value="127.0.0.1">127.0.0.1 (chỉ máy này — testing)</option>
      </select>
    </div>
    <div class="row">
      <button class="btn-secondary" onclick="go(1)">← Quay lại</button>
      <button class="btn-primary"   onclick="setNetAndNext()">Lưu & tiếp tục</button>
    </div>
  </div>

  <div class="step">
    <h2>Bước 4 / 5 — Định danh server</h2>
    <p class="sub">
      ${
        isReRun
          ? 'Tên / múi giờ / ngôn ngữ có thể chỉnh. Server ID giữ nguyên (50 client đã cache).'
          : 'Server cần một tên + ID duy nhất. ID được tạo MỘT LẦN và lưu vĩnh viễn.'
      }
    </p>
    <div id="alert-identity"></div>

    <div class="field">
      <label>Tên server (3-50 ký tự, chữ/số/khoảng trắng)</label>
      <input id="server-name" placeholder="vd: CCL Design VN" value="${(identity.serverName || '').replace(/"/g, '&quot;')}" />
    </div>

    <div class="field">
      <label>Server ID 🔒 (tự động sinh, không thể đổi)</label>
      <pre id="server-id" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span id="server-id-value">${identity.serverId}</span>
        <button type="button" onclick="copyServerId()" class="btn-secondary"
                style="font-size:11px;padding:4px 10px;">Copy</button>
      </pre>
      <small style="color:#94a3b8;font-size:11px;">
        50 client cache ID này. Đổi = mất kết nối toàn bộ. Chỉ regenerate
        bằng cách gỡ cài đặt + cài lại từ đầu.
      </small>
    </div>

    <div class="field">
      <label>Múi giờ (tự động phát hiện, có thể chỉnh)</label>
      <input id="server-tz" value="${identity.timezone}" />
    </div>

    <div class="field">
      <label>Ngôn ngữ (tự động phát hiện, có thể chỉnh)</label>
      <select id="server-lang">
        <option value="vi" ${identity.language === 'vi' ? 'selected' : ''}>Tiếng Việt</option>
        <option value="en" ${identity.language === 'en' ? 'selected' : ''}>English</option>
      </select>
    </div>

    <div class="row">
      <button class="btn-secondary" onclick="go(2)">← Quay lại</button>
      <button class="btn-primary"   onclick="setIdentityAndNext()">Lưu & tiếp tục</button>
    </div>
  </div>

  <div class="step">
    <h2>Bước 5 / 5 — Tạo tài khoản admin</h2>
    <p class="sub">Tài khoản này sẽ có vai trò <b>sys</b> (god mode). Lưu mật khẩu cẩn thận — không thể recover.</p>
    <div id="alert-admin"></div>
    <div class="field">
      <label>Username</label>
      <input id="admin-username" placeholder="vd: thiepdt" />
    </div>
    <div class="field">
      <label>Mật khẩu (tối thiểu 12 ký tự, có chữ + số + ký tự đặc biệt)</label>
      <input id="admin-password" type="password" />
    </div>
    <div class="field">
      <label>Xác nhận mật khẩu</label>
      <input id="admin-password2" type="password" />
    </div>
    <div class="row">
      <button class="btn-secondary" onclick="go(3)">← Quay lại</button>
      <button class="btn-primary"   onclick="createAdminAndDone()">Hoàn tất setup</button>
    </div>
  </div>

<script>
${SCRIPT_BASE}
const { ipcRenderer } = require('electron');

async function applyLicenseAndNext() {
  setAlert('alert-license', 'info', 'Đang verify license...');
  const raw = document.getElementById('license-input').value.trim();
  if (!raw) { setAlert('alert-license', 'bad', 'Vui lòng dán license hoặc bấm "Dùng trial".'); return; }
  let lic;
  try { lic = JSON.parse(raw); }
  catch { setAlert('alert-license', 'bad', 'License không phải JSON hợp lệ.'); return; }
  const r = await ipcRenderer.invoke('ops:setup.applyLicense', lic);
  if (!r.ok) { setAlert('alert-license', 'bad', 'Không hợp lệ: ' + r.reason + (r.detail ? ' — ' + r.detail : '')); return; }
  setAlert('alert-license', 'ok', 'License OK · tier ' + r.license.tier + ' · ' + r.license.max_users + ' users · hết hạn ' + r.license.expires_at.slice(0, 10));
  setTimeout(() => go(1), 700);
}
async function useTrialAndNext() {
  setAlert('alert-license', 'ok', 'Trial 14 ngày được kích hoạt. Liên hệ CCL HQ để cấp license chính thức trước khi hết hạn.');
  setTimeout(() => go(1), 800);
}
async function initDbAndNext() {
  const dataPath = document.getElementById('data-path').value.trim();
  if (!dataPath) { setAlert('alert-db', 'bad', 'Đường dẫn dữ liệu không được trống.'); return; }
  const r = await ipcRenderer.invoke('ops:setup.initDb', { dataPath });
  if (!r.ok) { setAlert('alert-db', 'bad', r.error); return; }
  setAlert('alert-db', 'ok', 'Khởi tạo DB thành công.');
  setTimeout(() => go(2), 600);
}
async function setNetAndNext() {
  const port = Number(document.getElementById('port').value);
  const bind = document.getElementById('bind').value;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { setAlert('alert-net', 'bad', 'Port phải nằm trong [1024, 65535].'); return; }
  const r = await ipcRenderer.invoke('ops:setup.setNet', { port, bind });
  if (!r.ok) { setAlert('alert-net', 'bad', r.error); return; }
  setAlert('alert-net', 'ok', 'Cấu hình mạng đã lưu. Server sẽ lắng nghe ' + bind + ':' + port + ' khi khởi động.');
  setTimeout(() => go(3), 600);
}
async function setIdentityAndNext() {
  const serverName = document.getElementById('server-name').value.trim();
  const timezone = document.getElementById('server-tz').value.trim();
  const language = document.getElementById('server-lang').value;
  const r = await ipcRenderer.invoke('ops:setup.setIdentity', { serverName, timezone, language });
  if (!r.ok) { setAlert('alert-identity', 'bad', r.error); return; }
  setAlert('alert-identity', 'ok', 'Định danh server đã lưu.');
  setTimeout(() => go(4), 600);
}
function copyServerId() {
  const v = document.getElementById('server-id-value').textContent;
  navigator.clipboard.writeText(v).then(() => {
    setAlert('alert-identity', 'ok', '✓ Đã copy Server ID');
    setTimeout(() => {
      const el = document.getElementById('alert-identity');
      if (el) el.innerHTML = '';
    }, 2000);
  }).catch((err) => {
    setAlert('alert-identity', 'bad', 'Không copy được: ' + err.message);
  });
}
async function createAdminAndDone() {
  const username = document.getElementById('admin-username').value.trim();
  const p1 = document.getElementById('admin-password').value;
  const p2 = document.getElementById('admin-password2').value;
  if (!username || username.length < 2) { setAlert('alert-admin', 'bad', 'Username tối thiểu 2 ký tự.'); return; }
  if (p1.length < 12) { setAlert('alert-admin', 'bad', 'Mật khẩu tối thiểu 12 ký tự.'); return; }
  if (!/[A-Za-z]/.test(p1) || !/[0-9]/.test(p1)) { setAlert('alert-admin', 'bad', 'Mật khẩu phải có cả chữ và số.'); return; }
  if (p1 !== p2) { setAlert('alert-admin', 'bad', 'Xác nhận mật khẩu không khớp.'); return; }
  const r = await ipcRenderer.invoke('ops:setup.createAdmin', { username, password: p1 });
  if (!r.ok) { setAlert('alert-admin', 'bad', r.error); return; }
  setAlert('alert-admin', 'ok', 'Tạo tài khoản sys "' + username + '" thành công. Khởi động ứng dụng...');
  setTimeout(() => ipcRenderer.invoke('ops:setup.complete'), 800);
}
</script>
</body></html>`;
}

// ─── Client wizard (2 steps) ──────────────────────────────────────
function renderClientWizard() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ops Control · Setup (Client)</title>
<style>${STYLE}</style></head><body>
  <h1>Ops Control — Client Setup</h1>
  <p class="sub">Nhập địa chỉ server LAN do quản trị viên cung cấp.</p>
  <div class="progress">
    <div class="pill curr"></div><div class="pill"></div>
  </div>

  <div class="step active">
    <h2>Bước 1 / 2 — Địa chỉ server</h2>
    <p class="sub">Định dạng <code>http://&lt;ip&gt;:&lt;port&gt;</code>. Test kết nối trước khi tiếp tục.</p>
    <div id="alert-conn"></div>
    <div class="field">
      <label>Server URL</label>
      <input id="server-url" placeholder="http://10.102.3.61:3000" />
    </div>
    <div class="row">
      <button class="btn-primary" onclick="testAndNext()">Test connection</button>
    </div>
  </div>

  <div class="step">
    <h2>Bước 2 / 2 — Hoàn tất</h2>
    <div id="alert-done" class="alert alert-ok">Sẵn sàng. Click "Mở Ops Control" để vào màn hình đăng nhập.</div>
    <div class="row">
      <button class="btn-secondary" onclick="go(0)">← Sửa địa chỉ</button>
      <button class="btn-primary"   onclick="finish()">Mở Ops Control</button>
    </div>
  </div>

<script>
${SCRIPT_BASE}
const { ipcRenderer } = require('electron');

async function testAndNext() {
  setAlert('alert-conn', 'info', 'Đang kiểm tra kết nối...');
  const url = document.getElementById('server-url').value.trim();
  if (!/^https?:\\/\\/.+/.test(url)) { setAlert('alert-conn', 'bad', 'URL không hợp lệ.'); return; }
  const r = await ipcRenderer.invoke('ops:setup.testServer', { url });
  if (!r.ok) { setAlert('alert-conn', 'bad', 'Kết nối thất bại: ' + r.error); return; }
  setAlert('alert-conn', 'ok', 'Server v' + (r.version || '?') + ' phản hồi OK (' + r.ms + ' ms).');
  setTimeout(() => go(1), 800);
}
async function finish() {
  await ipcRenderer.invoke('ops:setup.complete');
}
</script>
</body></html>`;
}

// ─── Window factory ───────────────────────────────────────────────
function showWizard(mode, deps = {}) {
  return new Promise((resolve) => {
    const installationId = license.getHardwareFingerprint();
    // Pre-load existing identity (if any) so re-runs preserve serverId.
    const existing = mode === 'server' ? loadSetup() : null;
    const existingIdentity = existing?.serverIdentity || null;
    // Pending state — accumulated by the new identity step, written by complete handler.
    let pendingIdentity = null;

    const win = new BrowserWindow({
      width: 720,
      height: 700,
      title: 'Ops Control — Setup',
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    const html =
      mode === 'server'
        ? renderServerWizard(installationId, existingIdentity)
        : renderClientWizard();
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Per-wizard IPC handlers — narrow scope, tied to this window's lifecycle.
    const handlers = {
      'ops:setup.applyLicense': (_e, lic) => license.applyLicense(lic),
      'ops:setup.initDb': async (_e, { dataPath }) => {
        try {
          fs.mkdirSync(dataPath, { recursive: true });
          fs.mkdirSync(path.join(dataPath, 'Library'), { recursive: true });
          if (deps.onSetDataPath) await deps.onSetDataPath(dataPath);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      'ops:setup.setNet': async (_e, { port, bind }) => {
        if (deps.onSetNet) await deps.onSetNet({ port, bind });
        return { ok: true };
      },
      'ops:setup.setIdentity': async (_e, { serverName, timezone, language }) => {
        const v = serverIdentity.validateServerName(serverName);
        if (!v.ok) return { ok: false, error: v.error };
        // Re-run path: merge into existing identity (preserves serverId + createdAt).
        // Fresh path: build new identity, then override tz/lang with operator picks.
        const next = existingIdentity
          ? serverIdentity.mergeIdentity(existingIdentity, {
              serverName: v.value,
              timezone,
              language,
            })
          : { ...serverIdentity.buildFreshIdentity(v.value), timezone, language };
        pendingIdentity = next;
        if (deps.onSetIdentity) await deps.onSetIdentity(next);
        return { ok: true };
      },
      'ops:setup.createAdmin': async (_e, { username, password }) => {
        try {
          if (!deps.onCreateAdmin) return { ok: false, error: 'admin creator not wired' };
          await deps.onCreateAdmin({ username, password });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      'ops:setup.testServer': async (_e, { url }) => probeServer(url),
      'ops:setup.complete': async () => {
        // Server mode: persist identity (fresh or preserved-from-re-run).
        // Client mode: pendingIdentity stays null — markComplete writes
        // schemaVersion + mode + completed_at only.
        const payload = pendingIdentity ? { serverIdentity: pendingIdentity } : {};
        // Re-run with no edits to identity step: keep prior identity intact.
        if (!pendingIdentity && existingIdentity) payload.serverIdentity = existingIdentity;
        markComplete(mode, payload);
        win.close();
        resolve({ ok: true });
        return { ok: true };
      },
    };
    for (const [ch, h] of Object.entries(handlers)) ipcMain.handle(ch, h);

    win.on('closed', () => {
      for (const ch of Object.keys(handlers)) ipcMain.removeHandler(ch);
      resolve({ ok: false, reason: 'closed-by-user' });
    });
  });
}

module.exports = {
  isFirstRun,
  showWizard,
  markComplete,
};
