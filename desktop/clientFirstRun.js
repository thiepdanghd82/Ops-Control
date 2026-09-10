/**
 * clientFirstRun — CLIENT build's first-run "connect to server" dialog.
 *
 * Lifted out of main.js so it can be exercised without booting the whole
 * app (embedded server, license, real DATA_DIR); `store` and `log` arrive
 * as deps, mirroring setupWizard.js. Covered by clientFirstRun.test.js.
 *
 * The renderer talks to the main process over ipcRenderer.invoke. It used
 * to fake it with fetch('/__probe__?…') intercepted by session.webRequest,
 * which cannot work here: this page is a `data:` URL, so it has an opaque
 * origin and a non-hierarchical base URL, and a root-relative reference
 * fails URL parsing outright — fetch() rejects, the interceptor never
 * fires, probeServer() is never called. All three buttons were dead; the
 * operator only ever saw "✗ Không kết nối được: probe timeout" after the
 * renderer's own 5 s race gave up, while the server was perfectly healthy.
 * (Diagnosed 2026-09-10 against a server answering /health in 3 ms.)
 */

'use strict';

const { BrowserWindow, ipcMain } = require('electron');
const { probeServer } = require('./utils/netProbe.js');

async function showClientFirstRunDialog({ store, log }) {
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
        // Same posture as setupWizard.js: the page is a fixed inline string
        // with no remote content, and the renderer needs a real bridge to
        // the main process. A `data:` URL page has an opaque origin and a
        // non-hierarchical base URL, so root-relative fetch() — the trick
        // this dialog used to use — cannot even be parsed into a request.
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
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
  const { ipcRenderer } = require('electron');
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
    // The probe runs in the main process (node:http), so CORS never applies
    // and probeServer() carries its own 4 s timeout — no race needed here.
    try {
      const r = await ipcRenderer.invoke('ops:firstrun.testServer', { url });
      if (r.ok) {
        setStatus('✓ Server v' + (r.version || '?') + ' OK (' + r.ms + ' ms) — bấm "Lưu & tiếp tục"', 'ok');
        $save.disabled = false;
        lastTestOk = true;
        $url.value = url;
      } else {
        setStatus('✗ Không kết nối được: ' + (r.error || 'unknown'), 'err');
      }
    } catch(err){ setStatus('✗ Không kết nối được: ' + err.message, 'err'); }
    finally { $test.disabled=false; }
  });
  $save.addEventListener('click', ()=>{
    if(!lastTestOk) return;
    ipcRenderer.invoke('ops:firstrun.save', { url: $url.value.trim() });
  });
  $skip.addEventListener('click', ()=>{
    ipcRenderer.invoke('ops:firstrun.skip');
  });
  $url.addEventListener('keydown', (e)=>{ if(e.key==='Enter') $test.click(); });
</script>
</body></html>`;

    // Renderer → main bridge. Mirrors setupWizard.js: narrow, per-window
    // handlers registered on open and torn down on close, so re-opening the
    // dialog never trips Electron's "second handler for X" guard.
    const handlers = {
      'ops:firstrun.testServer': (_e, { url } = {}) => probeServer(url),
      'ops:firstrun.save': (_e, { url } = {}) => {
        if (!url) return { ok: false };
        store.set('mode', 'thin');
        store.set('remoteUrl', url);
        log.info('[main] first-run: client saved remoteUrl=' + url);
        if (!win.isDestroyed()) win.close();
        return { ok: true };
      },
      'ops:firstrun.skip': () => {
        store.set('mode', 'embedded');
        store.set('remoteUrl', '');
        log.info('[main] first-run: client skipped, fell back to embedded');
        if (!win.isDestroyed()) win.close();
        return { ok: true };
      },
    };
    for (const [ch, h] of Object.entries(handlers)) ipcMain.handle(ch, h);
    win.on('closed', () => {
      for (const ch of Object.keys(handlers)) ipcMain.removeHandler(ch);
      resolve();
    });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

module.exports = { showClientFirstRunDialog };
