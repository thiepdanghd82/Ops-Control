/**
 * Ops Control — API Client
 * All data reads from /api/shared (Node.js reads files directly)
 *
 * Phase 9H — cookie-based auth with CSRF double-submit.
 *
 * Migration strategy (zero-downtime):
 *   1. Every fetch now sets `credentials: 'include'` so browser attaches
 *      the httpOnly `ops_session` cookie the server sets on login.
 *   2. State-changing methods (POST/PUT/PATCH/DELETE) echo the
 *      `ops_csrf` cookie's value into `X-CSRF-Token`. Server's CSRF
 *      middleware verifies header === cookie before routing.
 *   3. The legacy Authorization: Bearer token fallback is kept for
 *      clients still holding a localStorage token from before 9H.
 *      Once the server logs zero bearer-only calls for a full business
 *      week, the setToken/clearToken paths can be removed.
 *
 * Why both: during rollout, existing users have valid localStorage
 * tokens and shouldn't be forced to re-login. New logins get cookies
 * AND (temporarily) a token in the response body. Either auth source
 * works server-side; the server prefers cookies when both are present.
 */

const BASE_URL = '/api';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'ops_csrf';

// Sprint 1.6 — "Remember me" routes the token through one of two stores:
//   localStorage   — survives browser restart (default; matches existing
//                    behaviour so users with a stored token don't lose it)
//   sessionStorage — cleared on browser close, so unchecking the box
//                    actually means "don't keep me logged in past today"
// getToken checks BOTH so a token issued in either path keeps working.
function getToken() {
  try {
    const fromSession = sessionStorage.getItem('ops_token');
    if (fromSession) return fromSession;
  } catch {
    /* private mode / quota — fall through */
  }
  return localStorage.getItem('ops_token');
}

export function setToken(token, { persistent = true } = {}) {
  // Always wipe the OTHER store so we don't end up with two stale
  // copies after a "remember me" flip mid-session.
  try {
    localStorage.removeItem('ops_token');
  } catch {
    /* noop */
  }
  try {
    sessionStorage.removeItem('ops_token');
  } catch {
    /* noop */
  }
  if (persistent) {
    try {
      localStorage.setItem('ops_token', token);
    } catch {
      /* quota */
    }
  } else {
    try {
      sessionStorage.setItem('ops_token', token);
    } catch {
      /* quota */
    }
  }
}

export function clearToken() {
  try {
    localStorage.removeItem('ops_token');
  } catch {
    /* noop */
  }
  try {
    sessionStorage.removeItem('ops_token');
  } catch {
    /* noop */
  }
}

/**
 * Read the CSRF cookie value. Non-httpOnly by design — the server
 * sets this cookie to a random per-session token; JS reads it here
 * and echoes into the X-CSRF-Token header. A cross-origin page can't
 * read the cookie (SameSite=Strict) so it can't forge the header.
 */
function readCsrfCookie() {
  if (typeof document === 'undefined') return '';
  const raw = document.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return '';
}

async function request(path, options = {}) {
  const token = getToken();
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = UNSAFE_METHODS.has(method);
  const csrf = needsCsrf ? readCsrfCookie() : '';

  const headers = {
    'Content-Type': 'application/json',
    // Legacy token path — kept for transition period.
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // CSRF double-submit on state-changing verbs.
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...options.headers,
  };

  // `options.signal` is forwarded to fetch so callers can abort an
  // in-flight request on component unmount / input change. AbortError
  // bubbles up unchanged — callers inspect `err.name === 'AbortError'`
  // to distinguish "user navigated away" from "server failed".
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    // Send httpOnly ops_session cookie on same-origin requests.
    credentials: 'include',
  });

  if (res.status === 401) {
    clearToken();
    // Phase 9L.3 — broadcast so the app can show a re-login modal
    // instead of blanking tabs. A custom window event is intercepted
    // by AuthContext (singleton owner of login UI state). Dispatched
    // before the throw so the modal opens even if the caller's catch
    // handler swallows the error.
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ops:session-expired', {
            detail: { path, method: (options.method || 'GET').toUpperCase() },
          })
        );
      }
    } catch {
      /* window missing in SSR/test envs */
    }
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error || body.detail || body.message || 'Request failed');
    err.status = res.status;
    err.body = body;
    // Preserve server-returned payload for surgical callers (e.g. 409
    // optimistic-locking conflicts return `current` so the UI can show
    // a reload-vs-overwrite dialog without a round-trip).
    throw err;
  }

  return res.json();
}

export const api = {
  // Second optional arg accepts `{ signal }` so callers can abort an
  // in-flight request — important for useEffect cleanup + tab switches.
  get: (path, opts = {}) => request(path, { signal: opts.signal }),
  post: (path, body, opts = {}) =>
    request(path, { method: 'POST', body: JSON.stringify(body), signal: opts.signal }),
  put: (path, body, opts = {}) =>
    request(path, { method: 'PUT', body: JSON.stringify(body), signal: opts.signal }),
  patch: (path, body, opts = {}) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body), signal: opts.signal }),
  delete: (path, opts = {}) => request(path, { method: 'DELETE', signal: opts.signal }),
};

// Multipart upload — used for CSV/XLSX imports. We can't pass through the
// JSON `request` helper because it forces Content-Type: application/json.
// Phase 9H — same cookie + CSRF contract as request(): send cookies
// via credentials:'include' and include the CSRF header on POST so
// the upload doesn't hit the 403 csrf_failed gate.
async function uploadFile(path, file, fieldName = 'file') {
  const token = getToken();
  const csrf = readCsrfCookie();
  const fd = new FormData();
  fd.append(fieldName, file);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: fd,
    credentials: 'include',
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || 'Upload failed');
  }
  return res.json();
}

// ─── Auth API (Node.js native — no Python dependency) ───
export const authApi = {
  // Sprint 1.6 — `remember` (boolean) toggles the 30-day vs 8h session.
  // Defaults to false so existing call sites that pass only (user, pwd)
  // get the original short-TTL behaviour.
  login: (username, password, remember = false) =>
    api.post('/auth/login', { username, password, remember: !!remember }),
  logout: () => api.post('/auth/logout', {}),
  me: (opts = {}) => api.get('/auth/me', opts),
  getUsers: () => api.get('/auth/users'),
  updateProfile: (data) => api.post('/auth/update-profile', data),
  verifyTotp: (username, code) => api.post('/totp/verify', { username, code }),
  saveTotpSecret: (username, secret) => api.post('/totp/secret', { username, secret }),
  enrollTotp: (username, secret, code) => api.post('/totp/enroll', { username, secret, code }),
  heartbeat: (opts = {}) => api.post('/heartbeat', {}, opts),
};

// ─── IFS Data Import API (multipart CSV/XLSX upload) ───
// Backend endpoints are defined in server/routes/import.js and mounted at
// /api/import. Each upload backs up the current data file, rewrites it from
// the uploaded headers+rows, then clears the server cache so subsequent
// reads via sharedApi return the new data immediately.
export const importApi = {
  uploadBom: (file) => uploadFile('/import/bom', file),
  uploadRouting: (file) => uploadFile('/import/routing', file),
  uploadInventory: (file) => uploadFile('/import/inventory', file),
  uploadFinishedGoods: (file) => uploadFile('/import/finished-goods', file),
  uploadRawMaterials: (file) => uploadFile('/import/raw-materials', file),
  // Material Cost tab → NPI Materials + Sourcing DB. Server does the
  // CSV/XLSX parsing and writes the mapped rows to the corresponding
  // JSON file under Library/MaterialCost/.
  uploadNpiMaterials: (file) => uploadFile('/import/npi-materials', file),
  uploadSourcingDb: (file) => uploadFile('/import/sourcing-db', file),
  // Rate Table import — ?site=<name>&mode=<replace|append>. Writes into
  // rate_sites.json[site] on the server; client refreshes the lib afterward.
  uploadRate: (file, site, mode = 'replace') =>
    uploadFile(
      `/import/rate?site=${encodeURIComponent(site)}&mode=${encodeURIComponent(mode)}`,
      file
    ),
  // Clear-data — each endpoint wipes only its own dataset and backs up the
  // previous contents. Keeps tabs independent.
  clearBom: () => api.delete('/import/bom'),
  clearRouting: () => api.delete('/import/routing'),
  clearInventory: () => api.delete('/import/inventory'),
  clearFinishedGoods: () => api.delete('/import/finished-goods'),
  clearRawMaterials: () => api.delete('/import/raw-materials'),
  status: () => api.get('/import/status'),
  // Server-side backup — copies the dataset's data file to destPath
  // (or an auto-named sibling if destPath is omitted). Admins only.
  backup: (key, destPath) => api.post('/import/backup', { key, destPath }),
};

// ─── Import Wizard API ────────────────────────────────────────────────
// Two-phase import: preview returns a token + simulated diff (no write);
// commit applies the staged data using that token. Templates and current-
// data exports cover the round-trip workflow operators expect from
// IFS / SAP migration tools.
export const importWizardApi = {
  datasets: () => api.get('/import-wizard/datasets'),

  preview: async (file, datasetKey, { sheet = null, overrides = null } = {}) => {
    const token = getToken();
    const csrf = readCsrfCookie();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('dataset', datasetKey);
    if (sheet) fd.append('sheet', sheet);
    if (overrides) fd.append('overrides', JSON.stringify(overrides));
    const res = await fetch(`${BASE_URL}/import-wizard/preview`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: fd,
      credentials: 'include',
    });
    if (res.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || body.hint || 'Preview failed');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  },

  commit: (token, mode, reason = '') => api.post('/import-wizard/commit', { token, mode, reason }),

  // Direct download URLs (used for window.open / <a href>) — needed
  // because fetch() responses can't trigger native download UX without
  // a Blob round-trip.
  templateUrl: (datasetKey) =>
    `${BASE_URL}/import-wizard/template/${encodeURIComponent(datasetKey)}`,
  exportUrl: (datasetKey, format = 'xlsx') =>
    `${BASE_URL}/import-wizard/export/${encodeURIComponent(datasetKey)}?format=${encodeURIComponent(format)}`,

  history: (datasetKey, limit = 50) =>
    api.get(`/import-wizard/history?dataset=${encodeURIComponent(datasetKey)}&limit=${limit}`),
  backups: (datasetKey) => api.get(`/import-wizard/backups/${encodeURIComponent(datasetKey)}`),
  restore: (datasetKey, file) => api.post('/import-wizard/restore', { dataset: datasetKey, file }),
};

// ─── Shared Data API (Node.js reads files directly — no Python dependency) ───
export const sharedApi = {
  // IFS data
  getInventory: (opts = {}) => api.get('/shared/inventory', opts),
  getProducts: (opts = {}) => api.get('/shared/products', opts),
  getBOM: (partNo, opts = {}) =>
    partNo ? api.get(`/shared/bom/${partNo}`, opts) : api.get('/shared/bom', opts),
  getRouting: (partNo, opts = {}) =>
    partNo ? api.get(`/shared/routing/${partNo}`, opts) : api.get('/shared/routing', opts),
  getWorkCenters: (opts = {}) => api.get('/shared/work-centers', opts),

  // Cost data (read directly from JSON files)
  getMaterials: (opts = {}) => api.get('/shared/materials', opts),
  getQuotes: (opts = {}) => api.get('/shared/quotes', opts),
  // Sprint 6.2 atomic approval transition. Server reads the quote, applies
  // the state machine, writes the file, appends a version, and audits — all
  // under a per-quote lock. Callers MUST re-fetch quotes after resolve; the
  // response includes the authoritative new approval object.
  transitionApproval: (quoteId, action, reason) =>
    api.post(`/shared/approvals/${quoteId}/transition`, { action, ...(reason ? { reason } : {}) }),
  // Sprint 6.5: lightweight poll for the Sidebar badge. Returns
  // `{ ok, count }` where count = quotes awaiting this user's action.
  getMyApprovalCount: (opts = {}) => api.get('/shared/approvals/my-count', opts),
  getRates: (opts = {}) => api.get('/shared/rates', opts),

  // ── Design Tools (Sprint 14e) ──
  // List + create the per-press design library used by the Gallus
  // (and future Letter Press / Brotech / etc.) calculators. Records
  // are keyed by End CU PN + saved_at; the operator can pull a past
  // design back into the editor or push it across into Pricing
  // (Std/Cpx) via the existing pendingQuote handoff.
  listDesigns: ({ press } = {}, opts = {}) =>
    api.get(`/shared/design-tools${press ? '?press=' + encodeURIComponent(press) : ''}`, opts),
  saveDesign: (payload) => api.post('/shared/design-tools', payload),
  // Sprint 14k — overwrite an existing record in place (bumps version).
  // Used by the Save Choice dialog's "Update existing" path.
  updateDesign: (id, payload) => api.put(`/shared/design-tools/${id}`, payload),
  deleteDesign: (id) => api.delete(`/shared/design-tools/${id}`),
  getDDL: (opts = {}) => api.get('/shared/ddl', opts),
  getSummarize: (opts = {}) => api.get('/shared/summarize', opts),
  getRFQTracker: (opts = {}) => api.get('/shared/rfq-tracker', opts),
  // RFQ audit log — append-only, server stamps user + ts
  getRFQAudit: (rfqId, opts = {}) =>
    api.get(`/shared/rfq-tracker/audit/${encodeURIComponent(rfqId)}`, opts),
  appendRFQAudit: (rfqId, entry) =>
    api.post(`/shared/rfq-tracker/audit/${encodeURIComponent(rfqId)}`, entry),
  // RFQ attachments
  listRFQAttachments: (rfqId, opts = {}) =>
    api.get(`/shared/rfq-tracker/attachments/${encodeURIComponent(rfqId)}`, opts),
  uploadRFQAttachment: (rfqId, file) =>
    uploadFile(`/shared/rfq-tracker/attachments/${encodeURIComponent(rfqId)}`, file, 'file'),
  deleteRFQAttachment: (rfqId, attId) =>
    api.delete(
      `/shared/rfq-tracker/attachments/${encodeURIComponent(rfqId)}/${encodeURIComponent(attId)}`
    ),
  // Download URL — caller can put this in an <a href>
  rfqAttachmentUrl: (rfqId, attId) =>
    `/api/shared/rfq-tracker/attachments/${encodeURIComponent(rfqId)}/${encodeURIComponent(attId)}/download`,
  getSampleTracking: (opts = {}) => api.get('/shared/sample-tracking', opts),
  // Machine profiles — press library for Layout optimizer
  getMachineProfiles: (opts = {}) => api.get('/shared/machine-profiles', opts),
  createMachineProfile: (profile) => api.post('/shared/machine-profiles', profile),
  updateMachineProfile: (id, profile) =>
    api.put(`/shared/machine-profiles/${encodeURIComponent(id)}`, profile),
  deleteMachineProfile: (id) => api.delete(`/shared/machine-profiles/${encodeURIComponent(id)}`),
  // Permission groups — SAP-style authorization profiles (Sprint S1)
  getPermissionGroups: (opts = {}) => api.get('/shared/permission-groups', opts),
  createPermissionGroup: (group) => api.post('/shared/permission-groups', group),
  updatePermissionGroup: (id, group) =>
    api.put(`/shared/permission-groups/${encodeURIComponent(id)}`, group),
  deletePermissionGroup: (id) => api.delete(`/shared/permission-groups/${encodeURIComponent(id)}`),
  // Machine Technical — equipment capability library (Sprint S-MTECH)
  getMachineTechnicalMeta: (opts = {}) => api.get('/shared/machine-technical', opts),
  getMachineTechnical: (kind, opts = {}) =>
    api.get(`/shared/machine-technical?kind=${encodeURIComponent(kind)}`, opts),
  createMachineTechnical: (kind, rec) =>
    api.post(`/shared/machine-technical/${encodeURIComponent(kind)}`, rec),
  updateMachineTechnical: (kind, id, rec) =>
    api.put(`/shared/machine-technical/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, rec),
  deleteMachineTechnical: (kind, id) =>
    api.delete(`/shared/machine-technical/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`),
  machineTechnicalExportUrl: (kind) =>
    `/api/shared/machine-technical/${encodeURIComponent(kind)}/export`,
  importMachineTechnical: (kind, file) =>
    uploadFile(`/shared/machine-technical/${encodeURIComponent(kind)}/import`, file, 'file'),
  updateMachineTechnicalEnum: (key, values) =>
    api.put(`/shared/machine-technical/enums/${encodeURIComponent(key)}`, { values }),
  // Sample Tracking audit + attachments (SAP parity with RFQ Tracker)
  getSampleAudit: (id, opts = {}) =>
    api.get(`/shared/sample-tracking/audit/${encodeURIComponent(id)}`, opts),
  appendSampleAudit: (id, entry) =>
    api.post(`/shared/sample-tracking/audit/${encodeURIComponent(id)}`, entry),
  listSampleAttachments: (id, opts = {}) =>
    api.get(`/shared/sample-tracking/attachments/${encodeURIComponent(id)}`, opts),
  uploadSampleAttachment: (id, file) =>
    uploadFile(`/shared/sample-tracking/attachments/${encodeURIComponent(id)}`, file, 'file'),
  deleteSampleAttachment: (id, attId) =>
    api.delete(
      `/shared/sample-tracking/attachments/${encodeURIComponent(id)}/${encodeURIComponent(attId)}`
    ),
  sampleAttachmentUrl: (id, attId) =>
    `/api/shared/sample-tracking/attachments/${encodeURIComponent(id)}/${encodeURIComponent(attId)}/download`,
  getInkCalc: (opts = {}) => api.get('/shared/ink-calc', opts),
  getFinance: (opts = {}) => api.get('/shared/finance', opts),

  // ─── Print Area Calculator — Phase 11 ───
  // Jobs are keyed by SKU (mã sản phẩm). POST upserts; DELETE takes
  // the SKU in the URL so cross-tab links keep working even if the
  // job's internal `id` changes. Upload endpoint is multipart and
  // shares the same cookie+CSRF contract as importApi (see uploadFile).
  getPrintAreaJobs: (opts = {}) => api.get('/shared/print-area', opts),
  savePrintAreaJob: (job) => api.post('/shared/print-area', job),
  deletePrintAreaJob: (sku) => api.delete(`/shared/print-area/${encodeURIComponent(sku)}`),
  uploadPrintAreaArtwork: (file) => uploadFile('/shared/print-area/upload', file, 'artwork'),
  // Binary fetch for files under server/data/ (e.g. saved print-area
  // artworks). Uses the same session cookie + optional Bearer header
  // as JSON calls but returns a Blob. Used by Library → Open to
  // rehydrate the artwork file so the user can re-analyze without
  // re-uploading.
  getDataFile: async (dataRelPath, opts = {}) => {
    const safeRel = String(dataRelPath || '').replace(/^\/+/, '');
    const url = '/data/' + safeRel.split('/').map(encodeURIComponent).join('/');
    let token = '';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        token = window.localStorage.getItem('ops_token') || '';
      }
    } catch {
      /* storage disabled — rely on cookie */
    }
    const res = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: opts.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.detail || `Fetch failed: ${res.status}`);
    }
    return res.blob();
  },

  refreshCache: () => api.post('/shared/refresh-cache', {}),
};

// Helper: server returns { ok: false, msg: '...' } on 200 for auth errors.
// Throw on ok:false so callers can use try/catch uniformly.
async function authCall(method, path, body) {
  const r = await api[method](path, body);
  if (r && r.ok === false) throw new Error(r.msg || r.error || 'Request failed');
  return r;
}

// ─── Cost API (legacy endpoints now on Node.js — mounted at /api/) ───
export const costApi = {
  // Password — server expects {old_pwd, new_pwd} and {new_pwd}
  changePwd: (oldPwd, newPwd) =>
    authCall('post', '/auth/change-pwd', { old_pwd: oldPwd, new_pwd: newPwd }),
  resetPwd: (userId, newPwd) =>
    authCall('post', `/auth/users/${userId}/reset-pwd`, { new_pwd: newPwd }),
  // Sprint 1.5 — server generates a random temp pwd, sets must_change_password=true,
  // returns it ONCE so the admin can hand it over (print/copy from a modal).
  generateTempPwd: (userId) => authCall('post', `/auth/users/${userId}/temp-pwd`, {}),

  // Sprint 1.7b — admin-editable backup schedule. Persists to a JSON
  // config file on the server; setSchedule restarts the in-process timer.
  getBackupSchedule: () => api.get('/admin/backup-schedule'),
  setBackupSchedule: (patch) => authCall('put', '/admin/backup-schedule', patch),
  runBackupNow: () => authCall('post', '/admin/backup-schedule/run-now', {}),

  // Sprint 1.7j — admin-managed Master Cylinder catalog (Gallus print
  // cylinders Z=60..220). Read open to all logged-in users (Design Tools
  // tab needs the list); writes restricted to admin/sys.
  getMasterCylinders: () => api.get('/admin/master-cylinders'),
  updateMasterCylinder: (z, patch) => authCall('put', `/admin/master-cylinders/${z}`, patch),
  addMasterCylinder: (data) => authCall('post', '/admin/master-cylinders', data),
  deleteMasterCylinder: (z) => authCall('delete', `/admin/master-cylinders/${z}`),

  // Phase A.2 — server connection-info dashboard (admin-only)
  getServerInfo: () => api.get('/server-info'),

  // User management
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => authCall('post', '/auth/users', data),
  updateUser: (id, data) => authCall('put', `/auth/users/${id}`, data),
  deleteUser: (id) => authCall('delete', `/auth/users/${id}`),
  setSessionTtl: (id, ttlHours) =>
    authCall('post', `/auth/users/${id}/session-ttl`, { ttl_hours: ttlHours }),

  // Rate — v1.3 N6 — migrated from legacy `/rate/*` to canonical
  // `/library/rate/*` (router lives at server/domains/library/routes/rate.js).
  // POST /backups creates a snapshot (was /backup singular at legacy path).
  getRateBackups: (site) => api.get(`/library/rate/backups?site=${encodeURIComponent(site || '')}`),
  backupRate: (site, data) => api.post('/library/rate/backups', { site, data }),
  restoreRate: (filename, site) => api.post('/library/rate/restore', { filename, site }),
  exportRateCsv: (site, data) => api.post('/library/rate/export-csv', { site, data }),

  // DDL — v1.3 O1 — migrated from legacy `/ddl/*` to canonical
  // `/library/ddl/*` (same router shape as Rate, see N6 cutover).
  // POST /backups creates a snapshot (was /backup singular at legacy path).
  getDdlBackups: (site) => api.get(`/library/ddl/backups?site=${encodeURIComponent(site || '')}`),
  backupDdl: (site, data) => api.post('/library/ddl/backups', { site, data }),
  restoreDdl: (filename, site) => api.post('/library/ddl/restore', { filename, site }),
  exportDdlCsv: (site, data) => api.post('/library/ddl/export-csv', { site, data }),

  // Finance
  getFinance: () => api.get('/shared/finance'),

  // Backup/Restore
  getBackupList: () => api.get('/backup/list'),
  getCodeBackupList: () => api.get('/backup/code-list'),
  createDataBackup: () => api.post('/backup/data', {}),
  createCodeBackup: () => api.post('/backup/code-server', {}),
  restoreBackup: (filename) => api.post('/backup/restore', { filename }),
  deleteBackup: (filename, type) => api.post('/backup/delete', { filename, type }),
  // Upload a backup snapshot file from disk into Backup & restore/Data/.
  // Sys-only on the server; returns { ok, filename, size }. Caller can
  // immediately call restoreBackup(filename) afterward if desired.
  uploadBackup: async (file) => {
    const token = getToken();
    const csrf = readCsrfCookie();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE_URL}/backup/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: fd,
      credentials: 'include',
    });
    if (res.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || 'Upload failed');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  },
  downloadBackup: (name) => `/api/backup/download/${encodeURIComponent(name)}`,
  downloadCodeBackup: (name) => `/api/backup/code-download/${encodeURIComponent(name)}`,
  restoreCode: (filename) => api.post('/backup/code-restore', { filename }),

  // Load/Save all
  loadAll: () => api.get('/load-all'),
  saveAll: (data) => api.post('/save-all', data),

  // Layout/drawing files — persisted to server's data/Products layout/ folder
  // Matches COST V1.0's saveLayoutToDisk + /api/layout/:name pattern
  saveLayout: ({ ccl_pn, ext, data, quote_id }) =>
    api.post('/save-layout', { ccl_pn: ccl_pn || 'unknown', ext, data, quote_id }),
  getLayout: (filename) => api.get(`/layout/${encodeURIComponent(filename)}`),
  listLayouts: () => api.get('/layouts'),

  // Quote save: delegates to the server's /api/quotes endpoint which
  // atomically read-modify-writes under an async lock. Previously this
  // did GET /shared/quotes → mutate array → POST /save-all, a classic
  // lost-update race: two admins saving concurrently would each POST
  // the full N+1 array, and the second POST silently clobbered the
  // first admin's new quote. Sprint 11 moved the merge server-side.
  saveQuote: async (quoteData) => {
    const payload = { ...quoteData, saved_at: quoteData.saved_at || new Date().toISOString() };
    const { quote } = await api.post('/quotes', payload);
    return quote;
  },

  // Overwrite an existing quote by id. Same race-free server-side merge
  // as saveQuote — upsertQuote() will append if the id doesn't exist,
  // so the "user's edits are never silently dropped" contract holds.
  //
  // Sprint 11 P0-2: if `quoteData._version` is present, the server
  // enforces optimistic locking. Stale versions return HTTP 409 with
  // the server's current quote; callers should catch `err.status === 409`
  // and decide: reload server state, force-overwrite, or show a merge UI.
  updateQuote: async (id, quoteData) => {
    const { quote } = await api.patch(`/quotes/${id}`, quoteData);
    return quote;
  },

  // Sprint 13 — soft-delete / restore / purge.
  // trashQuote: moves to Trash (deleted_at stamped). Reversible via restoreQuote.
  // restoreQuote: clears deleted_at, returns the quote to active list.
  // purgeQuote: sys-only permanent delete. Audit log retains the trace.
  trashQuote: (id) => api.delete(`/quotes/${id}`),
  restoreQuote: (id) => api.post(`/quotes/${id}/restore`, {}),
  purgeQuote: (id) => api.delete(`/quotes/${id}?purge=1`),
  // Sprint 13 UI — list ONLY soft-deleted quotes (the Trash bin).
  // Reuses the same `/api/shared/quotes` endpoint with the `?trashed=1`
  // query param the server added during the soft-delete sprint.
  getTrashedQuotes: (opts = {}) => api.get('/shared/quotes?trashed=1', opts),

  // Formal quotation save — hits the dedicated /save-quotation route which
  // writes a file-per-revision to Library/ReleasedQuotation/. Previously
  // this went through /save-all with a { formalQuotation } wrapper, but
  // that key isn't in SAVE_ALL_KNOWN_KEYS so the server returned 400 and
  // "Release Quotation" failed on every click.
  saveQuotation: (fqData) => api.post('/save-quotation', fqData),

  // Online users
  getUsersStatus: (opts = {}) => api.get('/users/status', opts),
  // Đợt 6 — sys-only active sessions admin
  getActiveSessions: (opts = {}) => api.get('/auth/sessions', opts),
  revokeUserSessions: (username) => api.post('/auth/sessions/revoke', { username }),
};

// ─── Planning API (Node.js native) ───
export const planningApi = {
  getOrders: () => api.get('/planning/orders'),
  createOrder: (order) => api.post('/planning/orders', order),
  updateOrder: (id, data) => api.put(`/planning/orders/${id}`, data),
  deleteOrder: (id) => api.delete(`/planning/orders/${id}`),

  getWorkOrders: () => api.get('/planning/work-orders'),
  createWorkOrder: (wo) => api.post('/planning/work-orders', wo),
  updateWorkOrder: (id, data) => api.put(`/planning/work-orders/${id}`, data),

  getWIP: () => api.get('/planning/wip'),
  updateWIP: (woId, data) => api.put(`/planning/wip/${woId}`, data),

  getCapacity: () => api.get('/planning/capacity'),
  getMeta: () => api.get('/planning/meta'),
};
