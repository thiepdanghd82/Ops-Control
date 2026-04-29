/**
 * Smart-client sync engine — Tier 1 ↔ Tier 2 bridge.
 *
 * Lấy cảm hứng từ:
 *   - SAP UI5 Offline Manager (sync delta theo timestamp)
 *   - IFS Cloud Aurena offline-capable apps
 *   - Couchbase Mobile / PouchDB replication pattern
 *
 * Vai trò chính:
 *
 *   1. **Pull** — định kỳ (mặc định 5 phút) gọi
 *      `GET /api/sync/pull?table=<t>&since=<ts>` để kéo delta từ Tier 2
 *      về cache local. Server phía Tier 2 trả về rows mà `_saved_at > ts`.
 *
 *   2. **Push** — flush write-queue (outbox) đã enqueue khi mất mạng.
 *      Mỗi entry là 1 REST call hoàn chỉnh; gọi lại y nguyên.
 *      Conflict resolution: server quyết, client tin server (last-write-wins
 *      đã có sẵn ở Tier 2 qua optimistic locking _version).
 *
 *   3. **Online detection** — ping `/health` mỗi 15 s. State (online/offline,
 *      pending count, last sync time) broadcast qua IPC `ops:cache.syncStatus`.
 *
 * Mode 'embedded' KHÔNG cần chạy file này — Tier 2 là chính máy mình.
 * Mode 'thin' KHÔNG cần — mọi call đi thẳng tới Tier 2.
 * Chỉ mode 'smart' mới start engine.
 */

'use strict';

const { BrowserWindow } = require('electron');
const log = require('electron-log/main');
const cache = require('./native/cache.js');

// Bảng master cần cache offline. Thêm bảng tại đây khi muốn cache.
// Tên bảng phải match với endpoint `/api/sync/pull?table=<name>`
// (xem server/routes/sync.js).
const SYNC_TABLES = [
  'customers',
  'products',
  'machine_profiles',
  'rate_tables',
  'permission_groups',
  'library_inks',
  'library_materials',
];

const PULL_INTERVAL_MS = 5 * 60 * 1000;   // 5 phút
const PING_INTERVAL_MS = 15 * 1000;       // 15 giây
const PUSH_BATCH_SIZE = 25;

let remoteUrl = null;
let authToken = null;             // session token nếu cần (HttpOnly cookie không qua được fetch)
let pullTimer = null;
let pingTimer = null;
let lastOnline = null;            // null = chưa biết, true/false sau lần ping đầu
let lastSyncAt = 0;
let pushInFlight = false;

function broadcastStatus() {
  // pendingCount() touches the native better-sqlite3 binding. If that
  // module didn't load (cross-platform build w/ npmRebuild=false skipped
  // the per-Electron-ABI native rebuild), don't let it eat the broadcast.
  let pending = 0;
  try { pending = cache.pendingCount(); }
  catch (err) { log.warn('[smart-client] cache.pendingCount unavailable:', err.message); }
  const status = {
    online: lastOnline,
    pending,
    lastSyncAt,
    remoteUrl,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send('ops:cache.syncStatus', status); }
      catch { /* window destroyed mid-iteration */ }
    }
  }
}

async function ping() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${remoteUrl}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const wasOnline = lastOnline;
    lastOnline = res.ok;
    if (lastOnline !== wasOnline) {
      log.info(`[smart-client] online=${lastOnline}`);
      // Khi vừa online lại, push queue ngay
      if (lastOnline) push().catch((err) => log.warn('[smart-client] push failed:', err.message));
    }
  } catch (_) {
    lastOnline = false;
  }
  // Broadcast EVERY ping (not only on state change). Renderer might mount
  // after the first ping fired its broadcast; without periodic re-emits the
  // badge would stay stuck on the initial "Connecting…" placeholder until
  // online flipped. Cost is negligible (~1 IPC msg per 15s).
  broadcastStatus();
}

async function pullTable(tableName) {
  const state = cache.getSyncState(tableName);
  const since = state?.last_saved_at || 0;
  const url = `${remoteUrl}/api/sync/pull?table=${encodeURIComponent(tableName)}&since=${since}`;
  const res = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!res.ok) {
    log.warn(`[smart-client] pull ${tableName} failed: ${res.status}`);
    return { tableName, fetched: 0, error: res.status };
  }
  const { rows = [], maxSavedAt = since } = await res.json();
  for (const row of rows) {
    const id = row.id || row._id || row.code || row.name;
    if (!id) continue;
    cache.cacheUpsert(tableName, id, row);
  }
  cache.setSyncState(tableName, maxSavedAt);
  return { tableName, fetched: rows.length };
}

async function pull() {
  if (lastOnline === false) return { skipped: 'offline' };
  const results = [];
  for (const t of SYNC_TABLES) {
    try {
      results.push(await pullTable(t));
    } catch (err) {
      log.warn(`[smart-client] pull ${t} error:`, err.message);
      results.push({ tableName: t, error: err.message });
    }
  }
  lastSyncAt = Date.now();
  broadcastStatus();
  return { ok: true, results, syncedAt: lastSyncAt };
}

async function push() {
  if (lastOnline === false) return { skipped: 'offline' };
  if (pushInFlight) return { skipped: 'in-flight' };
  pushInFlight = true;
  let pushed = 0, failed = 0;
  try {
    const batch = cache.listPending(PUSH_BATCH_SIZE);
    for (const item of batch) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(item.headers ? JSON.parse(item.headers) : {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        };
        const res = await fetch(`${remoteUrl}${item.url}`, {
          method: item.method,
          headers,
          body: item.body || undefined,
        });
        if (res.ok || res.status === 409) {
          // 409 = optimistic lock conflict; server đã có version mới hơn,
          // client coi như done (không retry vô hạn). UI sẽ thấy data
          // mới khi pull lần sau.
          cache.markDone(item.id);
          pushed++;
        } else {
          cache.markFailed(item.id, `HTTP ${res.status}`);
          failed++;
        }
      } catch (err) {
        cache.markFailed(item.id, err.message);
        failed++;
      }
    }
  } finally {
    pushInFlight = false;
  }
  if (pushed > 0 || failed > 0) {
    log.info(`[smart-client] push: ${pushed} ok, ${failed} fail`);
    broadcastStatus();
  }
  return { ok: true, pushed, failed };
}

async function triggerSync() {
  await ping();
  const pushRes = await push();
  const pullRes = await pull();
  return { push: pushRes, pull: pullRes };
}

function start({ remoteUrl: url, authToken: token }) {
  remoteUrl = url;
  authToken = token || null;
  log.info('[smart-client] Starting, remote=', remoteUrl);

  // Ping ngay để biết online status, rồi setInterval
  ping().catch(() => {});
  pingTimer = setInterval(() => { ping().catch(() => {}); }, PING_INTERVAL_MS);
  pullTimer = setInterval(() => { pull().catch((e) => log.warn('[smart-client] pull err:', e.message)); }, PULL_INTERVAL_MS);

  // Pull lần đầu sau 2s (cho server warm up)
  setTimeout(() => pull().catch(() => {}), 2000);
}

function stop() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
  log.info('[smart-client] Stopped');
}

function setAuthToken(token) {
  authToken = token || null;
}

// Snapshot for IPC handlers — renderer's first poll uses this so the
// badge isn't stuck on the placeholder until the next ping cycle.
function getStatus() {
  let pending = 0;
  try { pending = cache.pendingCount(); } catch { /* native lib missing */ }
  return { online: lastOnline, pending, lastSyncAt, remoteUrl };
}

module.exports = { start, stop, triggerSync, push, pull, setAuthToken, getStatus };
