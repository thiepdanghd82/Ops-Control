/**
 * Smart-client sync endpoints — Tier 2 ↔ Tier 1.
 *
 * Phía Electron (smart-client.js) gọi:
 *   GET  /api/sync/pull?table=<name>&since=<unix_ms>
 *        → trả delta rows mà `_saved_at > since`
 *   POST /api/sync/push   (single op, idempotent)
 *        → relay 1 mutation từ outbox vào endpoint thật
 *
 * Hai endpoint này KHÔNG implement business logic mới — chỉ proxy
 * vào các store/repo hiện hữu. Đây là design nguyên tắc của smart
 * client SAP/IFS: server chỉ expose "what changed since X", client
 * tự ráp vào view.
 *
 * Pull strategy:
 *   - Mỗi bảng có 1 file/folder JSON riêng (Library/<Name>/...).
 *   - Đọc full file, filter `_saved_at > since`, trả về.
 *   - Trong tương lai có thể optimize bằng index hoặc CDC log,
 *     nhưng với volume hiện tại (~MB) full-scan là chấp nhận được.
 *
 * Conflict resolution:
 *   - Push relay vẫn đi qua endpoint thật (vd /api/quotes) nên
 *     optimistic-lock check ở quotesStore.upsertQuote vẫn áp dụng.
 *   - Server trả 409 → client mark done (không retry vô hạn) và
 *     kéo bản mới về ở pull kế.
 *
 * Mounted at /api/sync trong server/index.js (xem block dưới của
 * file đó). Auth giống các route khác — qua authMiddleware +
 * enforceSiteAccess.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Whitelist các bảng cho phép sync. KHÔNG expose toàn bộ Library/*
// vì có thể chứa data nhạy cảm (audit_log, secrets.json) hoặc
// bảng quá lớn (QuoteHistory).
const SYNC_TABLES = {
  customers: {
    file: 'server/data/Library/IFS_Inventory/customers.json',
    idField: 'code',
  },
  products: {
    file: 'server/data/Library/IFS_Inventory/products.json',
    idField: 'code',
  },
  machine_profiles: {
    file: 'server/data/Library/MachineProfiles/profiles.json',
    idField: 'id',
  },
  rate_tables: {
    file: 'server/data/Library/Rate/rate.json',
    idField: 'site',
  },
  permission_groups: {
    file: 'server/data/Library/PermissionGroups/groups.json',
    idField: 'id',
  },
  library_inks: {
    file: 'server/data/Library/InkCalc/inks.json',
    idField: 'code',
  },
  library_materials: {
    file: 'server/data/Library/MaterialCost/materials.json',
    idField: 'code',
  },
};

// Resolve path tương đối từ project root (server/ ở 1 cấp dưới root).
function resolveProjectFile(rel) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  return path.join(projectRoot, rel);
}

function readJsonSafe(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const txt = fs.readFileSync(absPath, 'utf8');
    if (!txt.trim()) return null;
    return JSON.parse(txt);
  } catch (err) {
    return { __error: err.message };
  }
}

// Normalize: Library file có thể là Array trực tiếp hoặc Object
// có { rows: [...] } / { data: [...] }. Trả về Array.
function toRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    // Object dạng { code1: {...}, code2: {...} } → convert
    const vals = Object.values(payload);
    if (vals.length > 0 && vals.every((v) => v && typeof v === 'object')) {
      return vals;
    }
  }
  return [];
}

// Mỗi row có thể có _saved_at (ISO string hoặc unix ms) hoặc không.
// Nếu không có, ta dùng mtime của file → coi như tất cả row được
// "save" tại thời điểm file được mod cuối. Không hoàn hảo nhưng đủ
// dùng cho master data ít đổi.
function rowSavedAt(row, fileMtimeMs) {
  const s = row?._saved_at || row?.saved_at;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    const n = Date.parse(s);
    if (!Number.isNaN(n)) return n;
  }
  return fileMtimeMs;
}

router.get('/pull', (req, res) => {
  const tableName = String(req.query.table || '').trim();
  const since = Number(req.query.since || 0);

  const cfg = SYNC_TABLES[tableName];
  if (!cfg) {
    return res.status(400).json({
      ok: false,
      error: 'unknown_table',
      allowed: Object.keys(SYNC_TABLES),
    });
  }

  const absPath = resolveProjectFile(cfg.file);
  const data = readJsonSafe(absPath);
  if (data === null) {
    // File chưa tồn tại — trả empty (không phải lỗi)
    return res.json({ ok: true, table: tableName, rows: [], maxSavedAt: since });
  }
  if (data.__error) {
    return res.status(500).json({ ok: false, error: 'file_read_failed', detail: data.__error });
  }

  let mtimeMs = since;
  try { mtimeMs = fs.statSync(absPath).mtimeMs; } catch (_) { /* swallow */ }

  const allRows = toRows(data);
  let maxSavedAt = since;
  const rows = allRows.filter((row) => {
    const sa = rowSavedAt(row, mtimeMs);
    if (sa > since) {
      if (sa > maxSavedAt) maxSavedAt = sa;
      return true;
    }
    return false;
  });

  res.json({
    ok: true,
    table: tableName,
    rows,
    maxSavedAt,
    serverTime: Date.now(),
    full: since === 0, // hint: client biết đây có phải initial pull không
  });
});

/**
 * POST /api/sync/push
 *
 * Body: { method, url, headers?, body? }
 *   - method: POST/PUT/DELETE
 *   - url: bắt đầu bằng /api/... (chỉ relay nội bộ)
 *   - headers: object key/value (sẽ override Authorization từ req)
 *   - body: payload — string hoặc object
 *
 * Endpoint này tự dispatch nội bộ qua app router thay vì re-fetch
 * — tránh extra network hop. Ta dùng `req.app.handle()` để inject
 * 1 sub-request vào Express routing pipeline.
 *
 * Để giữ đơn giản trong PoC, ta dùng node fetch loopback. Nếu sau
 * này cần performance, chuyển sang internal handle().
 */
router.post('/push', async (req, res) => {
  const { method, url, headers, body } = req.body || {};

  if (!method || !url) {
    return res.status(400).json({ ok: false, error: 'missing_method_or_url' });
  }
  if (typeof url !== 'string' || !url.startsWith('/api/')) {
    return res.status(400).json({ ok: false, error: 'url_must_start_with_/api/' });
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return res.status(400).json({ ok: false, error: 'method_not_allowed' });
  }

  // Loopback fetch — Express server tự gọi chính nó qua HTTP.
  // Đơn giản, dễ debug, và đảm bảo middleware chain (auth, CSRF,
  // rate-limit) được apply giống call thật từ client.
  const port = process.env.OPS_PORT || process.env.PORT || 3000;
  const target = `http://127.0.0.1:${port}${url}`;

  try {
    const fwdHeaders = {
      'Content-Type': 'application/json',
      // Forward auth từ original request — smart-client đã chèn token
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      ...(headers || {}),
    };
    const r = await fetch(target, {
      method: method.toUpperCase(),
      headers: fwdHeaders,
      body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });

    let payload = null;
    const ctype = r.headers.get('content-type') || '';
    try {
      payload = ctype.includes('application/json') ? await r.json() : await r.text();
    } catch (_) {
      payload = null;
    }

    res.status(r.status).json({
      ok: r.ok,
      status: r.status,
      relayed: { method, url },
      payload,
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'relay_failed', detail: err.message });
  }
});

/**
 * GET /api/sync/manifest
 * Liệt kê các bảng có thể sync + version (mtime). Cho client biết
 * có gì để pull (UI Settings có thể hiển thị table list).
 */
router.get('/manifest', (req, res) => {
  const tables = Object.entries(SYNC_TABLES).map(([name, cfg]) => {
    const abs = resolveProjectFile(cfg.file);
    let exists = false, mtimeMs = 0, size = 0;
    try {
      const st = fs.statSync(abs);
      exists = true;
      mtimeMs = st.mtimeMs;
      size = st.size;
    } catch (_) { /* swallow */ }
    return { name, exists, mtimeMs, size, idField: cfg.idField };
  });
  res.json({ ok: true, tables, serverTime: Date.now() });
});

export default router;
