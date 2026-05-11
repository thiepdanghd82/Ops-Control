/**
 * Cost API Routes — ported from Python server.py
 * All COST V1.0 endpoints now running on Node.js
 */
import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import XLSX from 'xlsx';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import { redactErrorMessage, logErr, asSafeError } from '../utils/safeError.js';
import { listLanIPv4, pickServerUrl } from '../utils/networkInfo.js';

// Shared upload tmp dir — resolved from env → OS tmpdir, mode 0700.
// Mirrors the logic in routes/import.js so both XLSM and BOM imports
// land in the same sandboxed, permission-hardened location.
const XLSM_UPLOAD_TMP = path.join(
  process.env.OPS_UPLOAD_TMPDIR || os.tmpdir(),
  'ops-control-uploads'
);
try {
  fs.mkdirSync(XLSM_UPLOAD_TMP, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(XLSM_UPLOAD_TMP, 0o700);
  } catch {
    /* windows: no-op */
  }
} catch (err) {
  console.warn('[costApi] failed to prepare upload tmp dir:', err?.message || err);
}

// ESM __dirname polyfill. Without this, `path.join(__dirname, ...)` below
// throws TypeError (undefined arg) and the backup/code routes return 500 —
// which is exactly what was happening for "Create Code Backup".
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Package root = two levels up from this file (server/routes → package/).
// Used for the code-snapshot operation that copies the source tree.
const PKG_ROOT = path.resolve(__dirname, '..', '..');

// Package backups (data + code) used to land at <PKG_ROOT>/Backup & restore/,
// which inside a packaged Electron .app on macOS resolves to the read-only
// signed bundle and produced "unable to open database file" / EROFS errors
// (Day-1 hardware test, 2026-05-08). Resolve lazily off DATA_DIR so the
// backup target is always the writable user-data tree.
function getPkgBackupDir() {
  return path.join(getDataDir(), 'Backup', 'PackageBackups');
}

function ensurePkgBackupDirs() {
  const root = getPkgBackupDir();
  fs.mkdirSync(path.join(root, 'Code'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Data'), { recursive: true });
  return root;
}

// Source tree filter — used by both backup (copy out) and restore (copy back).
// Excludes: node_modules, dist, .git, the backup dir itself, and the mutable
// server/data tree (user data is handled separately by data backups). Paths
// are compared relative to a base directory.
function isExcludedFromCodeBackup(rel) {
  if (!rel) return false;
  const parts = rel.split(path.sep);
  const top = parts[0];
  if (top === 'node_modules' || top === 'dist' || top === '.git') return true;
  if (top === 'Backup & restore') return true;
  if (rel === path.join('server', 'data')) return true;
  if (rel.startsWith(path.join('server', 'data') + path.sep)) return true;
  if (rel === path.join('client', 'node_modules')) return true;
  if (rel.startsWith(path.join('client', 'node_modules') + path.sep)) return true;
  if (rel === path.join('client', 'dist')) return true;
  if (rel.startsWith(path.join('client', 'dist') + path.sep)) return true;
  return false;
}

// Copy the package source tree to a destination directory. We CANNOT use a
// single `fs.cpSync(PKG_ROOT, destDir)` because Node refuses to copy a
// directory into a subdirectory of itself (ERR_FS_CP_EINVAL) — and our
// backup folder lives inside the package. Instead, iterate top-level
// entries and copy each one individually, skipping excluded tops. Any
// cross-directory filter rules (server/data, client/node_modules etc.) are
// applied via fs.cpSync's own filter hook.
//
// Fault-tolerant: if one top-level entry throws (ETIMEDOUT from a cloud-
// backed File Provider placeholder, EACCES, I/O error on a bad block, …),
// we record it in `skipped` and move on. A single bad subtree never kills
// the whole backup. The caller uses `skipped` to surface a partial-success
// message to the user — far more useful than a blank 500 "internal_error".
function copyPackageSource(srcRoot, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const skipped = [];
  let copied = 0;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (isExcludedFromCodeBackup(entry.name)) continue;
    const from = path.join(srcRoot, entry.name);
    const to = path.join(destDir, entry.name);
    try {
      if (entry.isDirectory()) {
        fs.cpSync(from, to, {
          recursive: true,
          force: true,
          errorOnExist: false,
          filter: (src) => {
            // Rebuild the relative-to-PKG_ROOT path so our single filter
            // function works for both the backup (src under PKG_ROOT) and
            // the restore (src under a snapshot dir with the same layout).
            const relToSrc = path.relative(srcRoot, src);
            return !isExcludedFromCodeBackup(relToSrc);
          },
        });
      } else {
        fs.copyFileSync(from, to);
      }
      copied++;
    } catch (e) {
      // Best-effort cleanup of the half-written top-level entry so the
      // backup dir isn't littered with partial copies that confuse dirSize.
      try {
        fs.rmSync(to, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      skipped.push({
        entry: entry.name,
        code: e?.code || 'UNKNOWN',
        reason:
          e?.code === 'ETIMEDOUT'
            ? 'cloud-backed placeholder unreachable (File Provider timeout)'
            : (e?.message || String(e)).slice(0, 160),
      });
    }
  }
  return { copied, skipped };
}

function timestampTag() {
  return new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
}

// Sum file sizes recursively — used when listing code backups so the UI can
// show a meaningful size for a directory (the existing list endpoint returns
// size in bytes for JSON files, this keeps the same contract for dirs).
function dirSize(dir) {
  let total = 0;
  let fileCount = 0;
  try {
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else {
          try {
            total += fs.statSync(full).size;
            fileCount++;
          } catch {
            /* skip */
          }
        }
      }
    }
  } catch {
    /* dir missing */
  }
  return { size: total, files: fileCount };
}
import {
  loadUsers,
  saveUsers,
  updateUsers,
  updateTotpSecrets,
  findUserById,
  userPublic,
  checkPassword,
  bcryptHash,
  upgradeLegacyPasswordIfNeeded,
  equalizeTimingForUnknownUser,
  checkLoginLockout,
  recordLoginFailure,
  clearLoginFailures,
  computePwdAge,
  pwdAgeForUsername,
  createSession,
  getSessionUser,
  getPreauthSession,
  deleteSession,
  persistSessionsNow,
  getTokenFromHeader,
  checkRateLimit,
  audit,
  getAuditLog,
  markOnline,
  markOffline,
  getOnlineStatus,
  loadTotpSecrets,
  isTotpSecretsUnavailable,
  saveTotpSecrets,
  totpVerify,
  persistSessions,
  userMustHaveTotp,
  revokeSessionsForUser,
  listActiveSessions,
  isSys,
  isAdminPlus,
  canWrite,
  roleLevel,
  getLibDir,
  getDataDir,
  safeFn,
  siteToCsvKey,
  toCsvBytes,
  tryNum,
  VALID_ROLES,
} from '../services/authService.js';
import { validateBody } from '../middleware/validate.js';
import { writeRateLimit, saveRateLimit, totpVerifyRateLimit } from '../middleware/rateLimit.js';
import { requireTabAccess, requireBodyTabAccess } from '../services/permissionService.js';
import {
  saveQuotes as saveQuotesStore,
  upsertQuote,
  VersionConflictError,
} from '../repositories/quotesStore.js';
import {
  setAuthCookies,
  clearAuthCookies,
  generateCsrfToken,
  readSessionToken,
} from '../utils/authCookie.js';
import { emitDataChange } from '../services/eventBus.js';
import { inspectLogin } from '../services/loginAnomaly.js';
import { requireSeatAvailable, getLicense } from '../services/licenseService.js'; // v1.3 P5.1

const IS_PROD_AUTH = process.env.NODE_ENV === 'production';

const router = Router();

// ── Helper: get client IP ──
function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
}

// ── Helper: JSON read ──
function readJson(fp, fallback = null) {
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return fallback;
  }
}

// ── Helper: JSON write (atomic: tmp → fsync → rename) ──
function writeJson(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  atomicWriteFileSync(fp, JSON.stringify(data, null, 2));
}

// ── CSV parsing helpers ──
// Case-insensitive header lookup so CSVs with "Workcenter" / "WORKCENTER"
// still parse. Previously code relied on exact case ("workcenter").
function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    map[h.trim().toLowerCase()] = idx;
  });
  return map;
}
function cellByKey(vals, headerMap, ...keys) {
  for (const k of keys) {
    const idx = headerMap[k.toLowerCase()];
    if (idx != null) return (vals[idx] || '').trim();
  }
  return '';
}

// Required columns for each CSV type — parser aborts with a descriptive
// error if any are missing so misconfigured uploads don't silently produce
// empty libraries.
const RATE_REQUIRED = ['workcenter'];
const MAT_REQUIRED = ['code'];

function parseRateCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l);
  if (lines.length < 2) return { rows: [], errors: ['empty file'] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const headerMap = buildHeaderMap(headers);
  const missing = RATE_REQUIRED.filter((k) => headerMap[k] == null);
  if (missing.length) {
    const err = `parseRateCsv: missing required columns: ${missing.join(', ')} (got: ${headers.join(', ')})`;
    console.warn(`  ⚠️  ${err}`);
    return { rows: [], errors: [err] };
  }
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    const wc = cellByKey(vals, headerMap, 'workcenter');
    if (!wc) {
      errors.push(`row ${i + 1}: empty workcenter — skipped`);
      continue;
    }
    const mcRaw = cellByKey(vals, headerMap, 'mc_cost', 'W/C');
    const mcNum = tryNum(mcRaw);
    rows.push({
      workcenter: wc,
      crew: tryNum(cellByKey(vals, headerMap, 'crew'), true) || 1,
      machine_rate: tryNum(cellByKey(vals, headerMap, 'machine_rate')),
      labor_rate: tryNum(cellByKey(vals, headerMap, 'labor_rate')),
      speed_uom: cellByKey(vals, headerMap, 'speed_uom'),
      oh_cost: tryNum(cellByKey(vals, headerMap, 'oh_cost')) || 0,
      mc_cost: mcNum != null ? mcNum : mcRaw && mcRaw !== '-' ? mcRaw : 0,
    });
  }
  if (errors.length) {
    console.warn(
      `  ⚠️  parseRateCsv: ${errors.length} row(s) skipped in ${path.basename(filePath)}`
    );
  }
  return { rows, errors };
}

function parseMatCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l);
  if (lines.length < 2) return { rows: [], errors: ['empty file'] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const headerMap = buildHeaderMap(headers);
  const missing = MAT_REQUIRED.filter((k) => headerMap[k] == null);
  if (missing.length) {
    const err = `parseMatCsv: missing required columns: ${missing.join(', ')} (got: ${headers.join(', ')})`;
    console.warn(`  ⚠️  ${err}`);
    return { rows: [], errors: [err] };
  }
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    const code = cellByKey(vals, headerMap, 'code');
    if (!code) {
      errors.push(`row ${i + 1}: empty code — skipped`);
      continue;
    }
    rows.push({
      code,
      type: cellByKey(vals, headerMap, 'type'),
      s_price: tryNum(cellByKey(vals, headerMap, 's_price')),
      g_price: tryNum(cellByKey(vals, headerMap, 'g_price')),
      thickness: tryNum(cellByKey(vals, headerMap, 'thickness')),
      supplier: cellByKey(vals, headerMap, 'supplier'),
      width: tryNum(cellByKey(vals, headerMap, 'width')),
    });
  }
  if (errors.length) {
    console.warn(
      `  ⚠️  parseMatCsv: ${errors.length} row(s) skipped in ${path.basename(filePath)}`
    );
  }
  return { rows, errors };
}

// DDL CSV helpers
const DDL_SIMPLE_KEYS = [
  'trade_mode',
  'semi_product_code',
  'pre_cut',
  'die_cut',
  'print_type_list',
  'assembly',
  'special_cut',
  'inspection',
  'manual_work',
  'others',
  'print_type',
  'packing_method',
  'tool_type',
  'site',
  'core_size',
  'npi_owner',
  'quoted_status',
  'npi_design_owner',
  'row',
  'process_design',
  'print',
];

function ddlToCsvRows(d) {
  const H = ['section', 'value', 'extra'];
  const rows = [];
  for (const key of DDL_SIMPLE_KEYS) {
    for (const v of d[key] || []) {
      rows.push([key, String(v), '']);
    }
  }
  for (const item of d.coverage || []) {
    rows.push(['coverage', String(item.pt || ''), String(item.cov || '')]);
  }
  for (const [k, v] of Object.entries(d.tool_life || {})) {
    rows.push(['tool_life', String(k), String(v)]);
  }
  for (const [k, v] of Object.entries(d.click_charges || {})) {
    rows.push(['click_charges', String(k), String(v)]);
  }
  for (const [k, v] of Object.entries(d.core_od || {})) {
    rows.push(['core_od', String(k), String(v)]);
  }
  for (const s of d._custom_sections || []) {
    rows.push(['_custom_sections', String(s.name || ''), String(s.key || '')]);
  }
  for (const [k, v] of Object.entries(d._custom_names || {})) {
    rows.push(['_custom_names', String(k), String(v)]);
  }
  for (const [k, v] of Object.entries(d._custom_colors || {})) {
    rows.push(['_custom_colors', String(k), String(v)]);
  }
  const customKeys = (d._custom_sections || []).map((s) => s.key || '');
  for (const key of customKeys) {
    if (key && !DDL_SIMPLE_KEYS.includes(key)) {
      for (const v of d[key] || []) {
        rows.push([key, String(v), '']);
      }
    }
  }
  return [H, rows];
}

function parseDdlCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l);
  if (lines.length < 2) return {};
  const ddl = {};
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    const section = vals[0] || '';
    const value = vals[1] || '';
    const extra = vals[2] || '';
    if (!section) continue;
    if (section === 'coverage') {
      if (!ddl.coverage) ddl.coverage = [];
      ddl.coverage.push({ pt: value, cov: tryNum(extra) || 0 });
    } else if (section === 'tool_life') {
      if (!ddl.tool_life) ddl.tool_life = {};
      ddl.tool_life[value] = tryNum(extra) || 0;
    } else if (section === 'click_charges') {
      if (!ddl.click_charges) ddl.click_charges = {};
      ddl.click_charges[value] = tryNum(extra) || 0;
    } else if (section === 'core_od') {
      if (!ddl.core_od) ddl.core_od = {};
      ddl.core_od[value] = tryNum(extra) || 0;
    } else if (section === '_custom_sections') {
      if (!ddl._custom_sections) ddl._custom_sections = [];
      ddl._custom_sections.push({ name: value, key: extra });
    } else if (section === '_custom_names') {
      if (!ddl._custom_names) ddl._custom_names = {};
      ddl._custom_names[value] = extra;
    } else if (section === '_custom_colors') {
      if (!ddl._custom_colors) ddl._custom_colors = {};
      ddl._custom_colors[value] = extra;
    } else {
      if (!ddl[section]) ddl[section] = [];
      if (value) ddl[section].push(value);
    }
  }
  return ddl;
}

// Quote history CSV helpers
function qhRows(qh) {
  const H = [
    'id',
    'type',
    'saved_at',
    'version',
    'label',
    'ccl_pn',
    'direct_cu_pn',
    'direct_cu',
    'project',
    'moq',
    'selling_price',
    'g_ttl',
    's_ttl',
    'gm_pct',
    'va_pct',
    'contri_pct',
  ];
  const rows = (qh || []).map((q) => {
    const s = q.state || {};
    const r = q.result || {};
    let g_ttl = '',
      s_ttl = '',
      gm_pct = '',
      va_pct = '',
      ct_pct = '';
    try {
      if (r.g_ttl != null && r.g_ttl !== '' && r.g_ttl !== 0) g_ttl = Number(r.g_ttl).toFixed(6);
      if (r.s_ttl != null && r.s_ttl !== '' && r.s_ttl !== 0) s_ttl = Number(r.s_ttl).toFixed(6);
      if (r.gm != null) gm_pct = (Number(r.gm) * 100).toFixed(2);
      if (r.va != null) va_pct = (Number(r.va) * 100).toFixed(2);
      if (r.contribution != null) ct_pct = (Number(r.contribution) * 100).toFixed(2);
    } catch {
      /* ignore */
    }
    return [
      q.id,
      q.type,
      q.saved_at,
      q.version || 1,
      q.label || '',
      s.ccl_pn,
      s.direct_cu_pn,
      s.direct_cu,
      s.project,
      s.moq,
      s.selling_price,
      g_ttl,
      s_ttl,
      gm_pct,
      va_pct,
      ct_pct,
    ];
  });
  return [H, rows];
}

function sdRows(sd) {
  const H = [
    'id',
    'update_date',
    'ccl_pn',
    'direct_cu',
    'project',
    'direct_cu_pn',
    'description',
    'size',
    'moq',
    'annual_qty',
    's_mat_cost',
    'g_mat_cost',
    'overhead',
    'labor_cost',
    'tooling',
    'pack_ship',
    's_ttl_cost',
    'g_ttl_cost',
    'gm_pct',
    'usd_price',
    'trade_mode',
    'delivery_term',
    'remark',
  ];
  const rows = (sd || []).map((r) => H.map((h) => r[h] ?? ''));
  return [H, rows];
}

function matRows(mat) {
  const H = ['code', 'type', 's_price', 'g_price', 'thickness', 'supplier', 'width'];
  const rows = (mat || []).map((r) => H.map((h) => r[h] ?? ''));
  return [H, rows];
}

function rateRows(rate) {
  const H = ['workcenter', 'crew', 'machine_rate', 'labor_rate', 'speed_uom', 'oh_cost', 'W/C'];
  const rows = (rate || []).map((r) => [
    r.workcenter || '',
    r.crew || '',
    r.machine_rate || '',
    r.labor_rate || '',
    r.speed_uom || '',
    r.oh_cost || '',
    r.mc_cost || '',
  ]);
  return [H, rows];
}

// Backup helpers
function buildBackupSnapshot() {
  const LIB_DIR = getLibDir();
  const snap = { _backup_at: new Date().toISOString(), _version: 3 };
  const map = {
    quoteHistory: path.join(LIB_DIR, 'QuoteHistory', 'quote_history.json'),
    summarizeDB: path.join(LIB_DIR, 'SummarizeDB', 'summarize_db.json'),
    matDB: path.join(LIB_DIR, 'MaterialCost', 'materials.json'),
    npiDB: path.join(LIB_DIR, 'MaterialCost', 'npi_materials.json'),
    sourcingDB: path.join(LIB_DIR, 'MaterialCost', 'sourcing_db.json'),
    rateDB: path.join(LIB_DIR, 'Rate', 'rate.json'),
    rateSitesDB: path.join(LIB_DIR, 'Rate', 'rate_sites.json'),
    ddlDB: path.join(LIB_DIR, 'DDL', 'ddl.json'),
    ddlSitesDB: path.join(LIB_DIR, 'DDL', 'ddl_sites.json'),
    rfqTracker: path.join(LIB_DIR, 'RFQTracker', 'rfq_tracker.json'),
    sampleTracker: path.join(LIB_DIR, 'SampleTracking', 'sample_tracking.json'),
    financeWCDB: path.join(LIB_DIR, 'Finance', 'finance_wc.json'),
    financeSumDB: path.join(LIB_DIR, 'Finance', 'finance_sum.json'),
    inkCalcDB: path.join(LIB_DIR, 'InkCalc', 'ink_calc.json'),
  };
  for (const [key, fp] of Object.entries(map)) {
    const data = readJson(fp);
    if (data != null) snap[key] = data;
  }
  return snap;
}

function restoreFromSnapshot(snap) {
  const LIB_DIR = getLibDir();
  const map = {
    quoteHistory: path.join(LIB_DIR, 'QuoteHistory', 'quote_history.json'),
    summarizeDB: path.join(LIB_DIR, 'SummarizeDB', 'summarize_db.json'),
    matDB: path.join(LIB_DIR, 'MaterialCost', 'materials.json'),
    npiDB: path.join(LIB_DIR, 'MaterialCost', 'npi_materials.json'),
    sourcingDB: path.join(LIB_DIR, 'MaterialCost', 'sourcing_db.json'),
    rateDB: path.join(LIB_DIR, 'Rate', 'rate.json'),
    rateSitesDB: path.join(LIB_DIR, 'Rate', 'rate_sites.json'),
    ddlDB: path.join(LIB_DIR, 'DDL', 'ddl.json'),
    ddlSitesDB: path.join(LIB_DIR, 'DDL', 'ddl_sites.json'),
    rfqTracker: path.join(LIB_DIR, 'RFQTracker', 'rfq_tracker.json'),
    sampleTracker: path.join(LIB_DIR, 'SampleTracking', 'sample_tracking.json'),
    financeWCDB: path.join(LIB_DIR, 'Finance', 'finance_wc.json'),
    financeSumDB: path.join(LIB_DIR, 'Finance', 'finance_sum.json'),
    inkCalcDB: path.join(LIB_DIR, 'InkCalc', 'ink_calc.json'),
  };
  const restored = [];
  const failed = [];
  for (const [key, fp] of Object.entries(map)) {
    if (key in snap) {
      try {
        writeJson(fp, snap[key]);
        restored.push(key);
      } catch (e) {
        console.warn(`  ⚠️  Restore ${key}: ${e.message}`);
        failed.push({ key, error: e.message || String(e) });
      }
    }
  }
  return { restored, failed };
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// POST /api/auth/login
router.post(
  '/auth/login',
  validateBody({
    username: { type: 'string', required: true, min: 1, max: 64 },
    password: { type: 'string', required: true, min: 1, max: 256 },
    // Sprint 1.6 — "Remember me" checkbox. When true, server issues a
    // 30-day session + 30-day cookie maxAge instead of the 8h default.
    remember: { type: 'boolean' },
  }),
  async (req, res) => {
    const ip = clientIp(req);
    if (!checkRateLimit(ip)) {
      audit('LOGIN_RATE_LIMITED', '-', ip, 'rate limit exceeded');
      return res
        .status(429)
        .json({ ok: false, msg: '⛔ Too many login attempts. Try again after 60 seconds.' });
    }
    try {
      const { username: rawUser, password, remember: rawRemember } = req.body || {};
      const username = (rawUser || '').trim().toLowerCase();
      // Sprint 1.6 — coerce explicitly: only `true` extends TTL, anything
      // else (undefined / 0 / 'false' string) keeps the 8h default.
      const remember = rawRemember === true;

      // Phase 10H per-username lockout. Cheaper than bcrypt verify, so
      // runs first. Sprint S-P0-FIX-3 (OWASP ASVS V4.0 §6.2.4) — response
      // shape now identical to a credentials failure so the lockout
      // status itself doesn't leak whether the username exists. The
      // Retry-After header is preserved for HTTP-level back-off (RFC 7231
      // §7.1.3); audit log keeps the rich `LOGIN_LOCKED` event with the
      // retry window for forensics.
      const lock = checkLoginLockout(username);
      if (!lock.allowed) {
        audit('LOGIN_LOCKED', username, ip, `retry in ${Math.ceil(lock.retry_after_ms / 1000)}s`);
        res.set('Retry-After', String(Math.ceil(lock.retry_after_ms / 1000)));
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
      }

      const users = loadUsers();
      const user = users.find((u) => u.username.toLowerCase() === username);
      if (!user) {
        // Sprint S-P0-FIX-3 — equalize timing against argon2-migrated users.
        // MUST run BEFORE audit() + return so an attacker can't time the
        // I/O cost of audit-log write to distinguish branches. See
        // authService.equalizeTimingForUnknownUser for the migration-window
        // note (legacy bcrypt cost=12 users = 380ms vs dummy 38ms; gap
        // closes as users auto-upgrade on first login post-v1.3).
        await equalizeTimingForUnknownUser(password || '');
        recordLoginFailure(username);
        audit('LOGIN_FAIL', username, ip, 'user not found');
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
      }
      const valid = await checkPassword(user, password || '');
      if (!valid) {
        recordLoginFailure(username);
        audit('LOGIN_FAIL', username, ip, 'bad password');
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
      }
      clearLoginFailures(username);
      // Check TOTP. Sprint 40 — fail-CLOSED when the secrets file can't
      // be decrypted. Sprint 41 — role-based hard enforcement closes the
      // "file missing → empty dict → bypass" hole: a user whose role
      // demands 2FA but has no secret enrolled yet gets an enrollment-
      // pending session (can hit /api/totp/secret once to set up, but
      // cannot access protected routes until verify).
      const totpSecs = loadTotpSecrets();
      const secretsUnavailable = isTotpSecretsUnavailable(totpSecs);
      const userHasSecret =
        !secretsUnavailable && Object.keys(totpSecs).some((k) => k.toLowerCase() === username);
      const mustHaveTotp = userMustHaveTotp(user);

      let token,
        totpEnrollmentRequired = false;
      if (mustHaveTotp && !userHasSecret && !secretsUnavailable) {
        // First-time enrollment required. Session can ONLY do TOTP setup.
        // Remember flag still honoured — no point forcing the user to retype
        // pwd just to re-enroll if they checked the box.
        token = createSession(user.id, {
          remember,
          totpVerified: false,
          totpEnrollmentPending: true,
        });
        totpEnrollmentRequired = true;
        audit('TOTP_ENROLLMENT_REQUIRED', username, ip, `role=${user.role}`);
      } else {
        const needsTotp = userHasSecret || secretsUnavailable;
        token = createSession(user.id, { remember, totpVerified: !needsTotp });
      }
      audit('LOGIN_OK', username, ip);
      // Anomaly detection — runs AFTER the login is fully authenticated
      // (TOTP-pending sessions still pass since the user proved password).
      // Doesn't block the login; just stamps an audit event + SSE alert
      // so admins see a banner. Returns reasons in the JSON body so the
      // client can show the user themselves "⚠ login từ IP mới" — useful
      // if it wasn't them.
      const anomaly = inspectLogin({
        userId: user.id,
        username: user.username,
        ip,
        role: user.role,
      });
      if (anomaly.reasons.length > 0) {
        audit(
          'LOGIN_ANOMALY',
          username,
          ip,
          `reasons=[${anomaly.reasons.join(',')}] concurrent_ips=[${anomaly.ips.join(',')}]`
        );
      }
      // Update lastLogin
      const idx = users.findIndex((u) => u.id === user.id);
      users[idx].lastLogin = new Date().toISOString();
      saveUsers(users);
      // Lazy upgrade legacy jsHash → bcrypt. Runs AFTER saveUsers
      // writes lastLogin so the two writes don't clobber each other;
      // upgradeLegacyPasswordIfNeeded reloads, updates, and re-saves.
      // Also wipes the legacy `pwd` field so the reversible hash is
      // removed from disk entirely.
      if (!user.pwd_bcrypt) {
        await upgradeLegacyPasswordIfNeeded(user.id, password);
      }
      markOnline(user.id, user.username, user.role);
      console.log(`  🔑  Login: ${user.username} [${user.role}]`);
      // Phase 9H — set auth cookies alongside returning the token in
      // the JSON body. Old clients (localStorage) keep working; new
      // clients that set credentials:'include' pick up the cookies
      // automatically and switch to the CSRF double-submit flow.
      const csrfToken = generateCsrfToken();
      // Sprint 1.6 — match cookie maxAge to the session TTL we just issued.
      // 30 days when the user checked "Remember me", 8h otherwise. Without
      // this, even a 30-day session got a stale 8h cookie and the user was
      // logged out by cookie expiry an hour into day 2.
      const cookieMaxAgeMs = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
      setAuthCookies(res, {
        sessionToken: token,
        csrfToken,
        isProd: IS_PROD_AUTH,
        maxAgeMs: cookieMaxAgeMs,
      });
      // Phase 10L — surface password age so the client can show the
      // days-remaining bar on the post-login transition.
      const pwd_age = computePwdAge(user);
      return res.json({
        ok: true,
        token,
        user: userPublic(user),
        csrf_token: csrfToken,
        pwd_age,
        // Client shows enrollment flow (QR code + scan) instead of OTP
        // entry when this is true. Set by the Sprint 41 hard-enforcement
        // path above — role requires TOTP but user has no secret yet.
        totp_enrollment_required: totpEnrollmentRequired,
        // Đợt 4 — anomaly hint cho user thấy "ai đó vừa login từ IP khác"
        // (concurrent_multi_ip / new_ip / unusual_hour). Empty array
        // means không có gì lạ; non-empty → client show toast cảnh báo.
        login_anomaly:
          anomaly.reasons.length > 0
            ? { reasons: anomaly.reasons, concurrent_ips: anomaly.ips }
            : null,
      });
    } catch (e) {
      console.error('Login error:', e);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
);

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  // Phase 9H — accept token from either cookie or Authorization header
  // so both old and new clients can log out cleanly. readSessionToken
  // encapsulates that precedence.
  const { token: tok } = readSessionToken(req);
  if (tok) {
    const [, u] = getPreauthSession(tok);
    if (u) {
      markOffline(u.id);
      console.log(`  👋  Logout: ${u.username}`);
    }
    deleteSession(tok);
    // Phase 10H — flush sessions file synchronously so a server crash
    // within the 2s debounce window cannot "un-logout" the user by
    // restoring the now-deleted session from disk at boot.
    persistSessionsNow();
  }
  // Always clear cookies — even if the user had no valid token, a
  // stale cookie should go away.
  clearAuthCookies(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/auth/me', (req, res) => {
  const tok = getTokenFromHeader(req);
  const [sess, u] = getPreauthSession(tok);
  if (!sess || !u) return res.status(401).json({ error: 'Unauthorized' });
  // Sprint 40: inverted default. Previously `?? true` meant an
  // undefined `totp_verified` was treated as verified — a fail-OPEN
  // default that would bypass 2FA for any session where the field
  // happened to be missing (e.g. persisted sessions from an older
  // build). Fail-CLOSED: unknown = still pending.
  const totpPending = sess.totp_verified !== true;
  // Sprint 41 — expose enrollment-required so the client can show the
  // QR-setup UI instead of the OTP-entry UI for first-time 2FA setup.
  const totpEnrollmentRequired = sess.totp_enrollment_pending === true;
  const pwd_age = computePwdAge(u);
  res.json({
    ok: true,
    user: userPublic(u),
    totp_pending: totpPending,
    totp_enrollment_required: totpEnrollmentRequired,
    pwd_age,
  });
});

// GET /api/auth/pwd-age/:username — public (no auth) endpoint that
// returns the password age for an existing user. Phase 10L login
// screen uses this to populate the days-remaining bar once the
// user types their username.
//
// Intentional info-leak trade-off: an attacker who scrapes a
// username list can learn password-ages. Acceptable in an internal
// ERP; mitigated by rate-limiting + returning null on unknown name
// (so existence is still inferrable but not confirmed by error).
router.get('/auth/pwd-age/:username', (req, res) => {
  const name = String(req.params.username || '')
    .trim()
    .toLowerCase();
  const pwd_age = pwdAgeForUsername(req.params.username);
  // Sprint 1.5 — also surface the must_change_password flag so the login
  // UI can pre-flip into the change-pwd flow as soon as the user types
  // their username (no need to wait for a failed login attempt).
  let must_change_password = false;
  if (name) {
    try {
      const users = loadUsers();
      const user = users.find((u) => String(u.username).toLowerCase() === name);
      if (user) must_change_password = user.must_change_password === true;
    } catch {
      /* fall through with default false */
    }
  }
  if (!pwd_age && !must_change_password)
    return res.json({ ok: true, pwd_age: null, must_change_password: false });
  res.json({ ok: true, pwd_age, must_change_password });
});

// GET /api/auth/users (admin only)
router.get('/auth/users', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ ok: true, users: loadUsers().map(userPublic) });
});

// GET /api/server-info (admin only) — Phase A.2 connection-info dashboard.
//
// Surfaces the per-server identity captured by setupWizard.js v2 (Phase A.1)
// + auto-detected LAN IPs so the admin UI can render a connection card +
// QR code + .opsconn export for hand-off to the 50 client machines.
//
// Identity resolution chain:
//   1. process.env (OPS_SERVER_NAME / OPS_SERVER_ID / OPS_SERVER_TZ / OPS_SERVER_LANG)
//      — set by the Electron desktop launcher before spawning the embedded server.
//   2. <DATA_DIR>/server-config.json — written by main.js onSetIdentity callback.
//   3. null fallback — dedicated server install without wizard yet (operator
//      may set env vars in .env or run the wizard later).
//
// Rate-limited via writeRateLimit (30 / 10 min) — defence-in-depth against
// a compromised admin session enumerating identity. Audit-logged on every
// hit so a forensic replay can spot anomalous read patterns.
router.get('/server-info', writeRateLimit, (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden' });

  // Identity from env vars OR server-config.json (desktop launcher mirror)
  let identity = null;
  if (process.env.OPS_SERVER_ID) {
    identity = {
      serverName: process.env.OPS_SERVER_NAME || 'Ops Control',
      serverId: process.env.OPS_SERVER_ID,
      timezone: process.env.OPS_SERVER_TZ || 'UTC',
      language: process.env.OPS_SERVER_LANG || 'en',
    };
  } else {
    try {
      const cfgPath = path.join(getDataDir(), 'server-config.json');
      if (fs.existsSync(cfgPath)) {
        const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (raw && raw.serverId) identity = raw;
      }
    } catch (e) {
      logErr('[server-info] failed to read server-config.json', e);
    }
  }

  const port = Number(process.env.OPS_PORT || process.env.PORT || 3000);
  const candidates = listLanIPv4();
  const primaryUrl = pickServerUrl(port);

  // Audit trail (closes Phase A.2 enhancement 3 — forensic replay).
  audit(
    'SERVER_INFO_VIEWED',
    u?.username || '-',
    req.ip || '-',
    `serverId=${identity?.serverId || 'unset'}`
  );

  res.json({
    ok: true,
    serverName: identity?.serverName || 'Ops Control',
    serverId: identity?.serverId || null,
    timezone: identity?.timezone || 'UTC',
    language: identity?.language || 'en',
    port,
    primaryUrl,
    candidates,
    requesterUsername: u?.username || '-',
  });
});

// v1.3 P5.1 — license tier seat enforcement.
// Counts: NOT-deleted users where role !== 'sys' (sys recovery accounts
// don't count against the seat cap). The function reads users.json each
// call so a freshly soft-deleted user instantly frees a seat.
const countActiveUsers = () => {
  try {
    const fp = path.join(__dirname, '..', 'data', 'Library', 'Users', 'users.json');
    if (!fs.existsSync(fp)) return 0;
    const arr = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!Array.isArray(arr)) return 0;
    return arr.filter((u) => u && !u.deleted_at && u.role !== 'sys').length;
  } catch {
    return 0;
  }
};

// v1.3 P5.1 — license status moved to server/domains/security/routes/license.js
// (mounted at /api/license/status by server/index.js). `getLicense` import
// kept because requireSeatAvailable middleware below imports it implicitly
// through licenseService.

// POST /api/auth/users (create user, sys only)
router.post(
  '/auth/users',
  requireSeatAvailable({ countActiveUsers }), // v1.3 P5.1 license tier gate
  validateBody({
    username: { type: 'string', required: true, min: 1, max: 64, pattern: /^[\w.\-@ ]+$/ },
    password: { type: 'string', max: 256 },
    role: { type: 'string', max: 16 },
    full_name: { type: 'string', max: 128 },
    email: { type: 'string', max: 128 },
    // SAP/IFS-style provisioning (Sprint 1.5): admin-created accounts default
    // to forcing a password change on first login. Caller can pass false to
    // opt out (eg. service accounts that don't have an interactive user).
    must_change_password: { type: 'boolean' },
  }),
  async (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isSys(u)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const pl = req.body;
      const users = loadUsers();
      const newId = Math.max(...users.map((x) => x.id), 0) + 1;
      let newRole = pl.role || 'user';
      if (!VALID_ROLES.includes(newRole)) newRole = 'user';
      const plainPwd = pl.password || 'changeme123';
      const newUser = {
        id: newId,
        username: (pl.username || '').trim(),
        role: newRole,
        pwd_bcrypt: await bcryptHash(plainPwd),
        lastPwdChange: new Date().toISOString(),
        // Default true — the temp/default password is meant for handover only.
        // Login screen detects this flag and forces the change-pwd flow.
        must_change_password: pl.must_change_password !== false,
        permissions: pl.permissions || { canDeleteQuote: false },
        full_name: pl.full_name || '',
        english_name: pl.english_name || '',
        id_no: pl.id_no || '',
        email: pl.email || '',
        phone: pl.phone || '',
        modules: pl.modules || { cost: true },
      };
      if (!newUser.username) return res.json({ ok: false, msg: 'Username is required' });
      if (users.some((x) => x.username.toLowerCase() === newUser.username.toLowerCase())) {
        return res.json({ ok: false, msg: 'Username already exists' });
      }
      users.push(newUser);
      saveUsers(users);
      console.log(`  👤  New user: ${newUser.username} [${newUser.role}]`);
      res.json({ ok: true, user: userPublic(newUser) });
    } catch (e) {
      console.error('Create user error:', e);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
);

// PUT /api/auth/users/:id
router.put(
  '/auth/users/:id',
  validateBody({
    full_name: { type: 'string', max: 128 },
    english_name: { type: 'string', max: 128 },
    id_no: { type: 'string', max: 64 },
    email: { type: 'string', max: 128 },
    phone: { type: 'string', max: 32 },
    role: { type: 'string', max: 16 },
    permissions: { type: 'object' },
    modules: { type: 'array', max: 32 },
    // Multi-site support (Sprint 3.6): empty/missing = all sites allowed;
    // non-empty restricts the user to listed sites.
    sites: { type: 'array', max: 16 },
    // Approval chain roles (Sprint 6.1): orthogonal to the hierarchical
    // `role`. Each entry authorizes one gate of the Cost→Sales→Finance
    // workflow. Only sys may grant — handler gates the write.
    approval_roles: { type: 'array', max: 8 },
    // Sprint S2 — SAP-style authorization fields
    department: { type: 'string', max: 40 },
    permission_group_id: { type: 'string', max: 64 },
  }),
  (req, res) => {
    const cu = getSessionUser(getTokenFromHeader(req));
    if (!cu) return res.status(401).json({ error: 'Unauthorized' });
    const uid = parseInt(req.params.id);
    const isAdmin = isAdminPlus(cu);
    if (!isAdmin && cu.id !== uid) return res.status(403).json({ error: 'Forbidden' });
    const pl = req.body;
    const users = loadUsers();
    const idx = users.findIndex((x) => x.id === uid);
    if (idx === -1) return res.json({ ok: false, msg: 'User not found' });
    for (const field of ['full_name', 'english_name', 'id_no', 'email', 'phone']) {
      if (field in pl) users[idx][field] = pl[field];
    }
    if (isAdmin) {
      // Audit any change that elevates privilege or reshapes ACL. Role change
      // in particular is a privilege-escalation vector (admin promoting self
      // or another to sys) — we want a record even if `saveUsers` succeeds.
      const prevRole = users[idx].role;
      if (pl.role && VALID_ROLES.includes(pl.role) && isSys(cu)) {
        users[idx].role = pl.role;
        if (prevRole !== pl.role) {
          audit(
            'ROLE_CHANGE',
            cu.username,
            clientIp(req),
            `${users[idx].username}: ${prevRole} → ${pl.role}`
          );
          // Kill existing sessions of the affected user so a demotion
          // (admin → viewonly) takes effect immediately. The user must
          // re-login; at login time the new role is baked into their session.
          const killed = revokeSessionsForUser(users[idx].id);
          if (killed > 0)
            audit(
              'ROLE_CHANGE_REVOKE',
              cu.username,
              clientIp(req),
              `revoked ${killed} session(s) for ${users[idx].username}`
            );
        }
      }
      if (pl.permissions) {
        users[idx].permissions = pl.permissions;
        audit('PERMISSIONS_CHANGE', cu.username, clientIp(req), `${users[idx].username}`);
      }
      if (pl.modules) {
        users[idx].modules = pl.modules;
        audit('MODULES_CHANGE', cu.username, clientIp(req), `${users[idx].username}`);
      }
      if (pl.sites !== undefined) {
        // Only sys may assign sites (same constraint as role). Admin can
        // see the field but PUT without sys won't flip it.
        if (isSys(cu)) {
          users[idx].sites = Array.isArray(pl.sites)
            ? pl.sites.filter((s) => typeof s === 'string')
            : [];
          audit(
            'SITES_CHANGE',
            cu.username,
            clientIp(req),
            `${users[idx].username}: [${users[idx].sites.join(', ')}]`
          );
        }
      }
      // Sprint S2 — department + permission_group_id (admin+ writes).
      // These fields are INFORMATIONAL on the user record; enforcement
      // happens in Pha 3 middleware (requireTabAccess). Audit every
      // change so ops can trace who widened a user's access.
      if (pl.department !== undefined) {
        const dep = typeof pl.department === 'string' ? pl.department.trim().slice(0, 40) : '';
        if (users[idx].department !== dep) {
          users[idx].department = dep;
          audit(
            'DEPARTMENT_CHANGE',
            cu.username,
            clientIp(req),
            `${users[idx].username}: → ${dep || '(none)'}`
          );
        }
      }
      if (pl.permission_group_id !== undefined) {
        const pg =
          typeof pl.permission_group_id === 'string'
            ? pl.permission_group_id.trim().slice(0, 64)
            : '';
        if (users[idx].permission_group_id !== pg) {
          users[idx].permission_group_id = pg;
          audit(
            'PERMISSION_GROUP_CHANGE',
            cu.username,
            clientIp(req),
            `${users[idx].username}: → ${pg || '(none)'}`
          );
          // Permission changes are privilege-affecting — kill active
          // sessions so the next login picks up the new access map.
          const killed = revokeSessionsForUser(users[idx].id);
          if (killed > 0)
            audit(
              'PG_CHANGE_REVOKE',
              cu.username,
              clientIp(req),
              `revoked ${killed} session(s) for ${users[idx].username}`
            );
        }
      }
      if (pl.approval_roles !== undefined) {
        // Approval-chain grants are privilege elevations — sys-only, audited.
        // Whitelist known roles so typos don't silently grant nothing; also
        // dedupe so the array stays stable shape-wise.
        if (isSys(cu)) {
          const ALLOWED_APPROVAL_ROLES = ['sales_mgr', 'finance_dir'];
          const next = Array.isArray(pl.approval_roles)
            ? Array.from(
                new Set(
                  pl.approval_roles
                    .filter((r) => typeof r === 'string')
                    .filter((r) => ALLOWED_APPROVAL_ROLES.includes(r))
                )
              )
            : [];
          users[idx].approval_roles = next;
          audit(
            'APPROVAL_ROLES_CHANGE',
            cu.username,
            clientIp(req),
            `${users[idx].username}: [${next.join(', ')}]`
          );
        }
      }
    }
    saveUsers(users);
    res.json({ ok: true, user: userPublic(users[idx]) });
  }
);

// DELETE /api/auth/users/:id
router.delete('/auth/users/:id', writeRateLimit, (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!isSys(cu)) return res.status(403).json({ error: 'Forbidden' });
  const uid = parseInt(req.params.id);
  if (uid === cu.id) return res.json({ ok: false, msg: 'Cannot delete your own account' });
  let users = loadUsers();
  const target = users.find((u) => u.id === uid);
  users = users.filter((u) => u.id !== uid);
  saveUsers(users);
  audit(
    'USER_DELETE',
    cu.username,
    clientIp(req),
    target ? `deleted ${target.username} (role=${target.role})` : `uid=${uid} (not found)`
  );
  // Kill any in-flight sessions for the deleted user.
  revokeSessionsForUser(uid);
  res.json({ ok: true });
});

// POST /api/auth/change-pwd
// Sprint 1.7 — writeRateLimit added (audit finding §4: change-pwd had no
// rate-limit, so a stolen session token could iterate old_pwd guesses).
router.post(
  '/auth/change-pwd',
  writeRateLimit,
  validateBody({
    old_pwd: { type: 'string', required: true, min: 1, max: 256 },
    new_pwd: { type: 'string', required: true, min: 6, max: 256 },
  }),
  async (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!u) return res.status(401).json({ error: 'Unauthorized' });
    const { old_pwd, new_pwd } = req.body;
    if (!(await checkPassword(u, old_pwd || ''))) {
      return res.json({ ok: false, msg: '❌ Current password incorrect' });
    }
    if (!new_pwd || new_pwd.length < 6) {
      return res.json({ ok: false, msg: '❌ Password must be at least 6 characters' });
    }
    const newHash = await bcryptHash(new_pwd);
    let found = false;
    await updateUsers((users) => {
      const idx = users.findIndex((x) => x.id === u.id);
      if (idx === -1) return;
      users[idx].pwd_bcrypt = newHash;
      delete users[idx].pwd;
      users[idx].lastPwdChange = new Date().toISOString();
      // Sprint 1.5 — successfully rotating the password clears the
      // forced-change flag set by createUser / reset-pwd.
      delete users[idx].must_change_password;
      found = true;
    });
    if (!found) return res.json({ ok: false, msg: 'User not found' });
    audit('PWD_CHANGE', u.username, clientIp(req));
    // Revoke any OTHER active sessions for this user (preserve current) so
    // stale tokens stop working after the password rotates.
    const killed = revokeSessionsForUser(u.id, getTokenFromHeader(req));
    if (killed > 0)
      audit('PWD_CHANGE_REVOKE', u.username, clientIp(req), `revoked ${killed} other session(s)`);
    res.json({ ok: true });
  }
);

// POST /api/auth/update-profile
router.post('/auth/update-profile', async (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ ok: false, msg: 'Unauthorized' });
  const pl = req.body;
  try {
    let updated = null;
    await updateUsers((users) => {
      const idx = users.findIndex((x) => x.id === u.id);
      if (idx === -1) return; // mutator no-op; res.json below handles
      for (const field of ['full_name', 'english_name', 'email', 'phone']) {
        if (field in pl) users[idx][field] = pl[field];
      }
      updated = users[idx];
    });
    if (!updated) return res.json({ ok: false, msg: 'User not found' });
    res.json({ ok: true, user: userPublic(updated) });
  } catch (err) {
    logErr(req, 'update_profile', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// POST /api/auth/users/:id/reset-pwd
router.post(
  '/auth/users/:id/reset-pwd',
  writeRateLimit,
  validateBody({
    new_pwd: { type: 'string', required: true, min: 6, max: 256 },
  }),
  async (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden' });
    const uid = parseInt(req.params.id);
    const { new_pwd } = req.body;
    if (!new_pwd || new_pwd.length < 6)
      return res.json({ ok: false, msg: '❌ Password must be at least 6 characters' });
    const users = loadUsers();
    const idx = users.findIndex((x) => x.id === uid);
    if (idx === -1) return res.json({ ok: false, msg: 'User not found' });
    users[idx].pwd_bcrypt = await bcryptHash(new_pwd);
    delete users[idx].pwd;
    users[idx].lastPwdChange = new Date().toISOString();
    // Sprint 1.5 — admin reset is always treated as provisioning a temp pwd.
    // The next login will force the user through the change-pwd flow before
    // they can use the app, matching SAP/IFS handover behaviour.
    users[idx].must_change_password = true;
    saveUsers(users);
    audit('PWD_RESET', u.username, clientIp(req), `reset password for ${users[idx].username}`);
    // Admin reset → revoke ALL of target's sessions (no exception), forcing
    // them to sign in with the new password on next request.
    const killed = revokeSessionsForUser(users[idx].id);
    if (killed > 0)
      audit(
        'PWD_RESET_REVOKE',
        u.username,
        clientIp(req),
        `revoked ${killed} session(s) for ${users[idx].username}`
      );
    res.json({ ok: true });
  }
);

// POST /api/auth/users/:id/temp-pwd
//
// Sprint 1.5 — SAP/IFS-style provisioning. Generates a cryptographically
// random temp password, hashes + stores it, sets must_change_password=true,
// and returns the plain password ONCE in the response. The admin shows it
// to the new user (print/copy from a modal) and we never persist or echo
// it again. The next login forces the change-pwd flow.
router.post('/auth/users/:id/temp-pwd', writeRateLimit, async (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden' });
  const uid = parseInt(req.params.id);
  const users = loadUsers();
  const idx = users.findIndex((x) => x.id === uid);
  if (idx === -1) return res.json({ ok: false, msg: 'User not found' });

  // 12 chars, dash-grouped 4-4-4 — readable enough to dictate over the
  // phone if needed, still ~70 bits of entropy. Excludes ambiguous glyphs
  // (0/O, 1/l/I) so a printed handout transcribes cleanly. Modulo bias
  // is acceptable for this length (alphabet=57, 256 mod 57 = 28 — slight
  // skew on 28/256=11% of bytes, still ~6.7 bits/char vs theoretical 5.83).
  const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = crypto.randomBytes(12);
  let raw = '';
  for (const b of buf) raw += SAFE_ALPHABET[b % SAFE_ALPHABET.length];
  const tempPwd = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;

  users[idx].pwd_bcrypt = await bcryptHash(tempPwd);
  delete users[idx].pwd;
  users[idx].lastPwdChange = new Date().toISOString();
  users[idx].must_change_password = true;
  saveUsers(users);
  audit(
    'PWD_TEMP_GENERATED',
    u.username,
    clientIp(req),
    `temp pwd issued for ${users[idx].username}`
  );
  // Same as admin reset: blow away every active session so old creds stop
  // working immediately. Prevents a window where the old session keeps
  // working past the handover.
  const killed = revokeSessionsForUser(users[idx].id);
  if (killed > 0)
    audit(
      'PWD_TEMP_REVOKE',
      u.username,
      clientIp(req),
      `revoked ${killed} session(s) for ${users[idx].username}`
    );
  res.json({
    ok: true,
    username: users[idx].username,
    full_name: users[idx].full_name || '',
    temp_password: tempPwd,
    must_change_password: true,
  });
});

// GET /api/auth/audit-log — sys-only view of recent audit events (in-memory,
// last 500 entries max). Supports query filters:
//   ?limit=N         — return at most N entries (default 200, max 500)
//   ?event=PATTERN   — substring match on event name, case-insensitive
//   ?user=USERNAME   — exact case-insensitive match on actor
//   ?since=ISO       — only entries newer than this ISO timestamp
//
// Sprint 30/31: storage migrated to SQLite. `user` filter pushed down
// to SQL WHERE (indexed), `event` stays substring (case-insensitive
// .includes) for Finance auditors who search partial action names,
// `since` is a post-filter. Limit cap raised to 5000 now that
// SQLite-backed retention isn't bounded by the 500-row ring buffer.
router.get('/auth/audit-log', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'Forbidden' });
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 5000));
  const evFilter = (req.query.event || '').toString().toLowerCase();
  const userFilter = (req.query.user || '').toString();
  const sinceISO = (req.query.since || '').toString();
  // Push user filter to SQL when present (indexed, much cheaper).
  // Pull a larger superset when post-filtering to give substring +
  // `since` enough rows to work from without silently truncating.
  const pullN = evFilter || sinceISO ? Math.max(limit, 5000) : limit;
  let entries = getAuditLog(pullN, userFilter ? { user: userFilter } : {});
  if (evFilter) entries = entries.filter((e) => (e.event || '').toLowerCase().includes(evFilter));
  if (sinceISO) entries = entries.filter((e) => e.ts >= sinceISO);
  res.json({ ok: true, entries: entries.slice(0, limit), total: entries.length });
});

// GET /api/auth/sessions — sys-only list of currently active sessions with
// a token prefix (not the full token). Supports ?username=X filter to see
// all sessions for a given user.
router.get('/auth/sessions', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'Forbidden' });
  let sessions = listActiveSessions();
  const userFilter = (req.query.username || '').toString().toLowerCase();
  if (userFilter) sessions = sessions.filter((s) => s.username.toLowerCase() === userFilter);
  res.json({ ok: true, sessions });
});

// POST /api/auth/sessions/revoke — sys-only: force-revoke all sessions for
// a given user. Useful when a token leak is suspected. Body: { username }
router.post(
  '/auth/sessions/revoke',
  validateBody({
    username: { type: 'string', required: true, max: 64 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isSys(u)) return res.status(403).json({ error: 'Forbidden' });
    const { username } = req.body;
    const users = loadUsers();
    const target = users.find((x) => x.username.toLowerCase() === username.toLowerCase());
    if (!target) return res.status(404).json({ ok: false, error: 'User not found' });
    const killed = revokeSessionsForUser(target.id);
    audit(
      'SESSION_REVOKE_ADMIN',
      u.username,
      clientIp(req),
      `revoked ${killed} session(s) for ${target.username}`
    );
    res.json({ ok: true, revoked: killed });
  }
);

// POST /api/auth/verify-pwd
router.post('/auth/verify-pwd', async (req, res) => {
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) return res.status(429).json({ ok: false, msg: '⛔ Too many requests' });
  const { password, role, username: userFilter } = req.body;
  const users = loadUsers();
  let matched = users;
  if (role) matched = users.filter((u) => u.role === role);
  else if (userFilter)
    matched = users.filter((u) => u.username.toLowerCase() === userFilter.toLowerCase());
  let ok = false;
  for (const u of matched) {
    if (await checkPassword(u, password || '')) {
      ok = true;
      break;
    }
  }
  res.json({ ok });
});

// POST /api/auth/migrate-users
router.post('/auth/migrate-users', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'Forbidden' });
  const imported = req.body.users || [];
  const existing = loadUsers();
  const exNames = new Set(existing.map((x) => x.username.toLowerCase()));
  let added = 0;
  for (const nu of imported) {
    if (nu.username && !exNames.has(nu.username.toLowerCase())) {
      nu.id = Math.max(...existing.map((x) => x.id), 0) + 1;
      existing.push(nu);
      exNames.add(nu.username.toLowerCase());
      added++;
    }
  }
  saveUsers(existing);
  res.json({ ok: true, added });
});

// ═══════════════════════════════════════════════════════════════
// TOTP ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/totp/secret/:username', (req, res) => {
  const tok = getTokenFromHeader(req);
  const [, caller] = getPreauthSession(tok);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const usernameReq = decodeURIComponent(req.params.username);
  if (roleLevel(caller) < 4 && caller.username.toLowerCase() !== usernameReq.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const secs = loadTotpSecrets();
  const sec =
    Object.entries(secs).find(([k]) => k.toLowerCase() === usernameReq.toLowerCase())?.[1] || null;
  res.json({ ok: true, secret: sec });
});

router.post(
  '/totp/secret',
  totpVerifyRateLimit,
  validateBody({
    username: { type: 'string', required: true, max: 64 },
    secret: { type: 'string', required: true, min: 16, max: 128, pattern: /^[A-Z2-7]+=*$/ },
  }),
  (req, res) => {
    // Rotation / admin edit only — requires a FULLY-verified session.
    // First-time enrollment must go through /totp/enroll (atomic verify-then-
    // save). The old "enrollment-pending can save here" path was removed
    // because it let a bad code leave a persisted secret on disk that the
    // user's phone couldn't match, locking them out until CLI reset.
    const tok = getTokenFromHeader(req);
    const caller = getSessionUser(tok);
    if (!caller) return res.status(401).json({ error: 'Unauthorized — verify TOTP first' });
    const { username, secret } = req.body;
    if (!username || !secret) return res.json({ ok: false, msg: 'username and secret required' });
    if (roleLevel(caller) < 4 && caller.username.toLowerCase() !== username.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const secs = loadTotpSecrets();
    secs[username] = secret;
    saveTotpSecrets(secs);
    audit('TOTP_ROTATED', username, req.ip || '-');
    console.log(`  🔐  TOTP secret rotated for: ${username}`);
    res.json({ ok: true });
  }
);

router.post(
  '/totp/verify',
  totpVerifyRateLimit,
  validateBody({
    username: { type: 'string', required: true, max: 64 },
    code: { type: 'string', required: true, min: 6, max: 8, pattern: /^\d{6,8}$/ },
  }),
  (req, res) => {
    const tok = getTokenFromHeader(req);
    const [sess, caller] = getPreauthSession(tok);
    if (!sess || !caller) return res.status(401).json({ error: 'Unauthorized' });
    const { username, code } = req.body;
    if (roleLevel(caller) < 4 && caller.username.toLowerCase() !== (username || '').toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const secs = loadTotpSecrets();
    const sec =
      Object.entries(secs).find(([k]) => k.toLowerCase() === (username || '').toLowerCase())?.[1] ||
      null;
    const ok = totpVerify(sec, code);
    if (ok) {
      sess.totp_verified = true;
      // Enrollment finalized — clear pending flag so subsequent requests
      // pass getSessionUser() and the user can access the app.
      if (sess.totp_enrollment_pending) {
        sess.totp_enrollment_pending = false;
        audit('TOTP_ENROLLMENT_COMPLETE', caller.username, req.ip || '-');
      }
      persistSessions();
      console.log(`  🔐  TOTP verified: ${caller.username}`);
    } else {
      audit(
        'TOTP_VERIFY_FAIL',
        caller.username,
        req.ip || '-',
        sec ? 'code_mismatch' : 'no_secret'
      );
    }
    res.json({ ok });
  }
);

// Atomic first-enrollment: verify-then-save, all-or-nothing.
//
// Why this exists: the legacy flow was client → POST /totp/secret (save) →
// POST /totp/verify (check). If the user's phone had a stale secret (old
// QR from a previous page mount), the save succeeded but verify failed —
// leaving a persisted secret on disk that the user's phone couldn't match,
// and no way to re-enroll without a CLI reset-totp. This endpoint verifies
// the code against the proposed secret FIRST, in-memory, and only persists
// if it matches. A bad code is a no-op: user retries on the same page.
router.post(
  '/totp/enroll',
  totpVerifyRateLimit,
  validateBody({
    username: { type: 'string', required: true, max: 64 },
    secret: { type: 'string', required: true, min: 16, max: 128, pattern: /^[A-Z2-7]+=*$/ },
    code: { type: 'string', required: true, min: 6, max: 8, pattern: /^\d{6,8}$/ },
  }),
  (req, res) => {
    const tok = getTokenFromHeader(req);
    const [sess, caller] = getPreauthSession(tok);
    if (!sess || !caller) return res.status(401).json({ error: 'Unauthorized' });
    const { username, secret, code } = req.body;
    if (caller.username.toLowerCase() !== String(username || '').toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden — can only enroll your own account' });
    }
    if (sess.totp_enrollment_pending !== true) {
      return res.status(403).json({ error: 'Session is not in enrollment state' });
    }
    const secs = loadTotpSecrets();
    if (isTotpSecretsUnavailable(secs)) {
      return res.status(503).json({ error: 'TOTP secrets unavailable — contact admin' });
    }
    if (Object.keys(secs).some((k) => k.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Already enrolled — use rotation flow from settings' });
    }
    // CRITICAL: verify BEFORE writing. A failed code must not persist state.
    if (!totpVerify(secret, code)) {
      audit('TOTP_ENROLL_REJECT', caller.username, req.ip || '-', 'code_mismatch');
      return res.json({
        ok: false,
        msg: 'Code did not match. Scan the QR on this screen, then enter the current 6-digit code.',
      });
    }
    secs[username] = secret;
    saveTotpSecrets(secs);
    sess.totp_verified = true;
    sess.totp_enrollment_pending = false;
    persistSessions();
    audit('TOTP_ENROLLED', username, req.ip || '-');
    audit('TOTP_ENROLLMENT_COMPLETE', caller.username, req.ip || '-');
    console.log(`  🔐  TOTP enrolled atomically: ${username}`);
    res.json({ ok: true });
  }
);

router.delete('/totp/secret/:username', (req, res) => {
  const caller = getSessionUser(getTokenFromHeader(req));
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const usernameReq = decodeURIComponent(req.params.username);
  if (roleLevel(caller) < 4 && caller.username.toLowerCase() !== usernameReq.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const secs = loadTotpSecrets();
  const keyDel = Object.keys(secs).find((k) => k.toLowerCase() === usernameReq.toLowerCase());
  if (keyDel) {
    delete secs[keyDel];
    saveTotpSecrets(secs);
    console.log(`  🗑️  TOTP secret removed for: ${usernameReq}`);
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// DATA ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /api/ping — lightweight liveness + a small set of observability
// counters so ops can spot file growth / session leaks without SSHing.
router.get('/ping', (req, res) => {
  const DATA = getDataDir();
  const layoutDir = path.join(DATA, 'Products layout');
  let lc = 0;
  try {
    lc = fs.readdirSync(layoutDir).filter((f) => !f.startsWith('.')).length;
  } catch {}

  // Library dir footprint (bytes + top-level subdirs). Uses a single
  // shallow readdir per dir — cheap enough for a /ping hit.
  const LIB = getLibDir();
  const librarySizes = {};
  try {
    for (const sub of fs.readdirSync(LIB)) {
      const p = path.join(LIB, sub);
      try {
        const st = fs.statSync(p);
        if (!st.isDirectory()) continue;
        let total = 0;
        for (const f of fs.readdirSync(p)) {
          try {
            total += fs.statSync(path.join(p, f)).size;
          } catch {
            /* skip */
          }
        }
        librarySizes[sub] = total;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  res.json({
    ok: true,
    data_dir: DATA,
    layouts: lc,
    version: '3.0-node',
    uptime_sec: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    library_sizes: librarySizes,
  });
});

// GET /api/users/status
router.get('/users/status', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, users: getOnlineStatus(), server_time: new Date().toISOString() });
});

// POST /api/heartbeat
router.post('/heartbeat', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  markOnline(u.id, u.username, u.role);
  res.json({ ok: true });
});

// GET /api/load-all
router.get('/load-all', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const LIB = getLibDir();
  const result = { ok: true };

  // Rate DB
  const rateJson = path.join(LIB, 'Rate', 'rate.json');
  const rateCsv = path.join(LIB, 'Rate', 'rate.csv');
  try {
    if (fs.existsSync(rateJson)) {
      result.rateDB = readJson(rateJson);
    } else if (fs.existsSync(rateCsv)) {
      const { rows, errors } = parseRateCsv(rateCsv);
      writeJson(rateJson, rows);
      result.rateDB = rows;
      if (errors && errors.length) result.rateDBErrors = errors;
    }
  } catch (e) {
    console.warn(`  ⚠️  rate load: ${e.message}`);
  }

  // Rate sites
  const rateSitesJson = path.join(LIB, 'Rate', 'rate_sites.json');
  if (fs.existsSync(rateSitesJson)) {
    try {
      result.rateSitesDB = readJson(rateSitesJson);
    } catch {}
  }

  // Mat DB
  const matJson = path.join(LIB, 'MaterialCost', 'materials.json');
  const matCsv = path.join(LIB, 'MaterialCost', 'materials.csv');
  try {
    if (fs.existsSync(matJson)) {
      result.matDB = readJson(matJson);
    } else if (fs.existsSync(matCsv)) {
      const { rows, errors } = parseMatCsv(matCsv);
      writeJson(matJson, rows);
      result.matDB = rows;
      if (errors && errors.length) result.matDBErrors = errors;
    }
  } catch (e) {
    console.warn(`  ⚠️  mat load: ${e.message}`);
  }

  // DDL sites
  const ddlSitesJson = path.join(LIB, 'DDL', 'ddl_sites.json');
  if (fs.existsSync(ddlSitesJson)) {
    try {
      result.ddlSitesDB = readJson(ddlSitesJson);
    } catch {}
  }

  // JSON-only keys
  const jsonMap = {
    quoteHistory: path.join(LIB, 'QuoteHistory', 'quote_history.json'),
    summarizeDB: path.join(LIB, 'SummarizeDB', 'summarize_db.json'),
    ddlDB: path.join(LIB, 'DDL', 'ddl.json'),
    rfqTracker: path.join(LIB, 'RFQTracker', 'rfq_tracker.json'),
    sampleTracker: path.join(LIB, 'SampleTracking', 'sample_tracking.json'),
    financeWCDB: path.join(LIB, 'Finance', 'finance_wc.json'),
    financeSumDB: path.join(LIB, 'Finance', 'finance_sum.json'),
    inkCalcDB: path.join(LIB, 'InkCalc', 'ink_calc.json'),
    npiDB: path.join(LIB, 'MaterialCost', 'npi_materials.json'),
    sourcingDB: path.join(LIB, 'MaterialCost', 'sourcing_db.json'),
  };
  for (const [key, fp] of Object.entries(jsonMap)) {
    const data = readJson(fp);
    if (data != null) result[key] = data;
  }

  res.json(result);
});

// POST /api/save-all
// Known payload keys. Any key NOT in this set is an unknown field — in the
// past, callers sending e.g. `ddlSites` instead of `ddlSitesDB` would get a
// silent `{ok:true}` back while nothing was actually written to disk, and
// users would lose their edits on reload. We now surface unknown keys in
// the response so mismatches are caught immediately.
const SAVE_ALL_KNOWN_KEYS = new Set([
  'quoteHistory',
  'summarizeDB',
  'matDB',
  'rateDB',
  'rateSitesDB',
  'ddlDB',
  'ddlSitesDB',
  'rfqTracker',
  'sampleTracker',
  'financeWCDB',
  'financeSumDB',
  'inkCalcDB',
  'npiDB',
  'sourcingDB',
]);

// Sprint S3 — body-key → tab-id map for permission enforcement. Keys
// not listed here aren't guarded per-tab (they're either legacy admin
// scopes or aggregate data that any writer with role ≥ user may save).
const SAVE_ALL_TAB_MAP = {
  rfqTracker: 'rfq-tracker',
  sampleTracker: 'sample-tracking',
  quoteHistory: 'quote-history',
  summarizeDB: 'summarize',
  matDB: 'lib-mat',
  rateDB: 'lib-rate',
  rateSitesDB: 'lib-rate',
  ddlDB: 'lib-ddl',
  ddlSitesDB: 'lib-ddl',
  financeWCDB: 'lib-finance',
  financeSumDB: 'lib-finance',
  inkCalcDB: 'ink-calc',
};

router.post(
  '/save-all',
  saveRateLimit,
  requireBodyTabAccess(SAVE_ALL_TAB_MAP),
  async (req, res) => {
    const cu = getSessionUser(getTokenFromHeader(req));
    if (!cu) return res.status(401).json({ error: 'Unauthorized' });
    if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
    const LIB = getLibDir();
    const pl = req.body;
    // Body must be a plain object — reject arrays, strings, null early so we
    // don't crash halfway through writing some files and leave partial state.
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) {
      return res.status(400).json({ ok: false, error: 'Payload must be a JSON object' });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);

    // Reject payloads where every key is unknown — that's a sure sign of a
    // client/server key mismatch and would otherwise silently no-op.
    const plKeys = Object.keys(pl || {});
    const unknownKeys = plKeys.filter((k) => !SAVE_ALL_KNOWN_KEYS.has(k));
    const knownKeys = plKeys.filter((k) => SAVE_ALL_KNOWN_KEYS.has(k));
    if (plKeys.length > 0 && knownKeys.length === 0) {
      console.warn(`  ⚠️  /save-all: payload had only unknown keys [${unknownKeys.join(', ')}]`);
      return res.status(400).json({
        ok: false,
        error: 'No known fields in payload',
        unknown_keys: unknownKeys,
        known_keys: Array.from(SAVE_ALL_KNOWN_KEYS),
      });
    }
    if (unknownKeys.length > 0) {
      console.warn(`  ⚠️  /save-all: ignoring unknown keys [${unknownKeys.join(', ')}]`);
    }

    // Sprint 13: per-dataset isolation. Each write runs in its own try/
    // catch so one failing dataset no longer short-circuits /save-all and
    // leaves the client guessing which of the N requested writes landed.
    // On any failure the response now carries `saved_keys` + `failed_datasets`
    // so the client can retry just the failed slice instead of re-posting
    // the whole batch and risk clobbering someone else's concurrent work.
    const saveResults = [];
    const runWrite = (key, fn) => {
      try {
        fn();
        saveResults.push({ key, ok: true });
      } catch (err) {
        const msg = err?.message || String(err);
        console.error(`  ❌  /save-all: ${key} write failed: ${msg}`);
        saveResults.push({ key, ok: false, error: msg });
      }
    };

    try {
      if (pl.quoteHistory) {
        // Phase 9M.1 — drop malformed quote entries before persistence.
        // Previously a single `{state: "garbage"}` in the array would
        // write to disk + boobytrap the NEXT /save-all read for everyone.
        // Valid entries still save; dropped ones are logged + surfaced.
        const { filterQuoteHistory } = await import('../utils/quoteShape.js');
        const { valid: validQuotes, dropped } = filterQuoteHistory(pl.quoteHistory);
        if (dropped.length > 0) {
          console.warn(
            `  ⚠️  /save-all: dropped ${dropped.length} malformed quote(s): ${JSON.stringify(dropped.slice(0, 5))}`
          );
        }
        pl.quoteHistory = validQuotes;

        // Sprint 7.2: route the write through quotesStore so the JSON
        // file + SQLite mirror are updated in one call with a single
        // source of truth. CSV export and version append still run
        // alongside — they're independent side-effects.
        let quoteJsonOk = false;
        runWrite('quoteHistory', () => {
          saveQuotesStore(pl.quoteHistory);
          quoteJsonOk = true;
        });
        if (quoteJsonOk) {
          // CSV mirror is a secondary export — a failure here means JSON
          // restore succeeded but the CSV on disk is stale. Log so ops
          // can detect drift; do NOT fail the restore over a CSV write.
          try {
            const [h, r] = qhRows(pl.quoteHistory);
            atomicWriteFileSync(
              path.join(LIB, 'QuoteHistory', 'quote_history.csv'),
              toCsvBytes(h, r)
            );
          } catch (e) {
            console.warn(
              '  ⚠️  quote_history.csv mirror write failed (JSON ok, CSV stale):',
              e.message
            );
          }
          // Append to quote_versions for every quote that has an id + state.
          // Dedup happens inside appendQuoteVersion (hash compare). Non-fatal.
          try {
            const { appendQuoteVersion } = await import('../repositories/quoteVersions.js');
            for (const q of pl.quoteHistory) {
              if (q && typeof q.id === 'number' && q.state) {
                appendQuoteVersion(q.id, q.state, { savedAt: q.saved_at, savedBy: cu.username });
              }
            }
          } catch (e) {
            console.warn('  ⚠️  quote_versions append:', e.message);
          }
        }
      }
      if (pl.summarizeDB) {
        runWrite('summarizeDB', () => {
          writeJson(path.join(LIB, 'SummarizeDB', 'summarize_db.json'), pl.summarizeDB);
          try {
            const [h, r] = sdRows(pl.summarizeDB);
            atomicWriteFileSync(
              path.join(LIB, 'SummarizeDB', 'summarize_db.csv'),
              toCsvBytes(h, r)
            );
          } catch (e) {
            console.warn(
              '  ⚠️  summarize_db.csv mirror write failed (JSON ok, CSV stale):',
              e.message
            );
          }
        });
      }
      if (pl.matDB) {
        runWrite('matDB', () => {
          writeJson(path.join(LIB, 'MaterialCost', 'materials.json'), pl.matDB);
          try {
            const [h, r] = matRows(pl.matDB);
            atomicWriteFileSync(path.join(LIB, 'MaterialCost', 'materials.csv'), toCsvBytes(h, r));
          } catch (e) {
            console.warn(
              '  ⚠️  materials.csv mirror write failed (JSON ok, CSV stale):',
              e.message
            );
          }
        });
      }
      if (pl.rateDB)
        runWrite('rateDB', () => writeJson(path.join(LIB, 'Rate', 'rate.json'), pl.rateDB));
      if (pl.rateSitesDB)
        runWrite('rateSitesDB', () =>
          writeJson(path.join(LIB, 'Rate', 'rate_sites.json'), pl.rateSitesDB)
        );
      if (pl.ddlDB) runWrite('ddlDB', () => writeJson(path.join(LIB, 'DDL', 'ddl.json'), pl.ddlDB));
      if (pl.ddlSitesDB)
        runWrite('ddlSitesDB', () =>
          writeJson(path.join(LIB, 'DDL', 'ddl_sites.json'), pl.ddlSitesDB)
        );
      if (pl.rfqTracker)
        runWrite('rfqTracker', () =>
          writeJson(path.join(LIB, 'RFQTracker', 'rfq_tracker.json'), pl.rfqTracker)
        );
      if (pl.sampleTracker)
        runWrite('sampleTracker', () =>
          writeJson(path.join(LIB, 'SampleTracking', 'sample_tracking.json'), pl.sampleTracker)
        );
      if (pl.financeWCDB)
        runWrite('financeWCDB', () =>
          writeJson(path.join(LIB, 'Finance', 'finance_wc.json'), pl.financeWCDB)
        );
      if (pl.financeSumDB) {
        // Phase 9F.4 — optimistic lock on Finance summary. When two admins
        // edit SGA rates concurrently, the second write would silently
        // clobber the first. We check the incoming `version` against the
        // current on-disk version; mismatch returns 409 + the server copy
        // so the client can merge.
        //
        // Phase 9L.1 — FIELD-LEVEL MERGE on successful version match.
        // Previously we wrote `{...incoming, version: +1}` which dropped
        // any on-disk field the client didn't know about. The version
        // check still protects against stale overwrites — merge guards
        // against a different, schema-evolution data-loss scenario.
        //
        // 409 conflict is special: it MUST short-circuit because the
        // lock is the whole point of this dataset. Other datasets
        // succeed/fail independently via runWrite.
        const sumPath = path.join(LIB, 'Finance', 'finance_sum.json');
        const current = readJson(sumPath) || {};
        const currentVersion = Number(current.version) || 0;
        const incoming = pl.financeSumDB;
        const incomingVersion =
          incoming && Object.prototype.hasOwnProperty.call(incoming, 'version')
            ? Number(incoming.version)
            : null;
        if (incomingVersion != null && incomingVersion !== currentVersion) {
          return res.status(409).json({
            ok: false,
            error: 'finance_sum_conflict',
            message: `Finance summary was modified by another user (server v${currentVersion} vs submitted v${incomingVersion}). Refresh and re-apply your change.`,
            current_version: currentVersion,
            current_summary: current,
            saved_keys: saveResults.filter((r) => r.ok).map((r) => r.key),
          });
        }
        runWrite('financeSumDB', () => {
          const toWrite = { ...current, ...(incoming || {}), version: currentVersion + 1 };
          writeJson(sumPath, toWrite);
        });
      }
      if (pl.inkCalcDB)
        runWrite('inkCalcDB', () =>
          writeJson(path.join(LIB, 'InkCalc', 'ink_calc.json'), pl.inkCalcDB)
        );
      if (pl.npiDB)
        runWrite('npiDB', () =>
          writeJson(path.join(LIB, 'MaterialCost', 'npi_materials.json'), pl.npiDB)
        );
      if (pl.sourcingDB)
        runWrite('sourcingDB', () =>
          writeJson(path.join(LIB, 'MaterialCost', 'sourcing_db.json'), pl.sourcingDB)
        );

      // Auto daily backup + retention prune. Without retention old auto_*.json
      // files pile up and eat disk (each snapshot can be 10-20 MB). Keep the
      // last N days configurable via OPS_BACKUP_RETENTION_DAYS (default 30).
      try {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const autoDir = path.join(getDataDir(), 'Backup', 'Data');
        const existing = fs
          .readdirSync(autoDir)
          .filter((f) => f.startsWith(`auto_${today}`) && f.endsWith('.json'));
        if (existing.length === 0) {
          const snap = buildBackupSnapshot();
          const bfname = `auto_${today}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.json`;
          atomicWriteFileSync(path.join(autoDir, bfname), JSON.stringify(snap));
          console.log(`  📦  Auto daily backup → ${bfname}`);
          // Prune auto backups older than retention window (manual_ prefixed
          // backups are preserved regardless — they were explicit user actions).
          const retentionDays = Number(process.env.OPS_BACKUP_RETENTION_DAYS || 30);
          const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
          let pruned = 0;
          for (const f of fs.readdirSync(autoDir)) {
            if (!f.startsWith('auto_') || !f.endsWith('.json')) continue;
            const fp = path.join(autoDir, f);
            try {
              if (fs.statSync(fp).mtimeMs < cutoff) {
                fs.unlinkSync(fp);
                pruned++;
              }
            } catch {
              /* best-effort */
            }
          }
          if (pruned > 0)
            console.log(`  🧹  Pruned ${pruned} auto-backup(s) older than ${retentionDays}d`);
        }
      } catch (e) {
        console.warn(`  ⚠️  Auto backup: ${e.message}`);
      }

      // Auto daily SQLite backup (runs in parallel with the JSON snapshot
      // above). Separate try so a SQLite issue doesn't block the JSON
      // backup path and vice-versa.
      try {
        const { backupOpsDb } = await import('../db/backup.js');
        const result = await backupOpsDb();
        if (result.ok && !result.skipped) {
          console.log(
            `  🗄️   SQLite backup → ${result.file} (${result.size_mb} MB, pruned ${result.pruned_old})`
          );
        } else if (!result.ok) {
          console.warn(`  ⚠️  SQLite backup: ${result.error}`);
        }
      } catch (e) {
        console.warn(`  ⚠️  SQLite backup: ${e.message}`);
      }

      const succeeded = saveResults.filter((r) => r.ok).map((r) => r.key);
      const failed = saveResults.filter((r) => !r.ok);
      if (failed.length > 0) {
        console.error(
          `  ❌  /save-all PARTIAL: ${failed.length} of ${saveResults.length} failed. succeeded=[${succeeded.join(', ')}] failed=[${failed.map((f) => f.key).join(', ')}]`
        );
        return res.status(500).json({
          ok: false,
          timestamp: ts,
          error: 'Partial failure — see failed_datasets for retry guidance',
          data_dir: getDataDir(),
          saved_keys: succeeded,
          failed_datasets: failed.map((f) => ({ key: f.key, error: f.error })),
          ignored_keys: unknownKeys,
        });
      }
      console.log(`  💾  Saved [${ts}] keys=[${succeeded.join(', ')}]`);
      // SSE push: tell every connected client which datasets changed so
      // their open tabs can refetch immediately instead of waiting for
      // the next 30/60s poll.
      const SAVE_ALL_EVENT_MAP = {
        quoteHistory: 'quote.saved',
        rfqTracker: 'rfq.updated',
        sampleTracker: 'sample.updated',
        matDB: 'library.imported',
        rateDB: 'library.imported',
        ddlDB: 'library.imported',
        summarizeDB: 'library.imported',
        financeWCDB: 'library.imported',
        financeSumDB: 'library.imported',
        inkCalcDB: 'library.imported',
        npiDB: 'library.imported',
        sourcingDB: 'library.imported',
      };
      const emittedTypes = new Set();
      for (const k of succeeded) {
        const t = SAVE_ALL_EVENT_MAP[k];
        if (!t || emittedTypes.has(t)) continue;
        emittedTypes.add(t);
        try {
          emitDataChange(t, { dataset: k, savedBy: cu.username, batch: true });
        } catch {
          /* event bus is best-effort */
        }
      }
      res.json({
        ok: true,
        timestamp: ts,
        data_dir: getDataDir(),
        saved_keys: succeeded,
        ignored_keys: unknownKeys,
      });
    } catch (e) {
      // This catch only runs on non-write failures now (payload parsing,
      // quote filter import, etc.). Per-dataset write errors are handled
      // by runWrite + the `failed.length > 0` branch above.
      console.error(`  ❌  /api/save-all error: ${e.message}`);
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// QUOTE CRUD — single-quote endpoints (Sprint 11)
// ═══════════════════════════════════════════════════════════════
// Why: the original client saveQuote/updateQuote did
//   GET /shared/quotes → mutate array → POST /save-all { quoteHistory }
// which is a lost-update race. Two admins saving different quotes
// concurrently each read N-row history, each posted N+1, and the
// second POST silently overwrote the first admin's new quote.
//
// These endpoints delegate the read-modify-write to upsertQuote() in
// quotesStore — serialized under the `quotes` async lock so concurrent
// callers see consistent state. The client still sends only the
// single quote it's creating/updating; the server does the merge.

// Alt-materials feature (Sprint S-ALT-MAT, PR #A) — emit audit events
// when an operator switches the active set or copies between main/alt,
// then strip the ephemeral _alt_materials_op signal so it never lands on
// disk. Returns the cleansed `state` for upsertQuote. The caller passes
// `prevQuote` (null on POST/new) so we can diff materials_active.
function emitAltMaterialsAuditAndStrip(body, prevQuote, cu, ipAddr) {
  const state = body?.state;
  if (!state || typeof state !== 'object') return body;
  const cleaned = { ...state };
  const op = cleaned._alt_materials_op;
  // Always strip before persist regardless of validity.
  delete cleaned._alt_materials_op;
  const quoteId = body?.id ?? prevQuote?.id ?? null;
  // MATERIALS_COPY — fires whenever the client signals a copy op. Detail
  // is JSON.stringify per Lesson MES-3-FIX-3 (uniform audit detail shape).
  if (
    op &&
    op.type === 'copy' &&
    (op.direction === 'main_to_alt' || op.direction === 'alt_to_main')
  ) {
    try {
      audit(
        'MATERIALS_COPY',
        cu?.username || '-',
        ipAddr || '-',
        JSON.stringify({
          quote_id: quoteId,
          direction: op.direction,
          source_count: Number(op.source_count) || 0,
          dest_count_before: Number(op.dest_count_before) || 0,
          user_id: cu?.id ?? null,
        })
      );
    } catch {
      /* audit failures must never block save */
    }
  }
  // MATERIALS_ACTIVE_SWITCH — diff against prev. POSTs have no prev so
  // only fire on PATCH. A new quote that starts on 'alt' is rare but
  // captured indirectly via the COPY event when applicable.
  const prevActive = prevQuote?.state?.materials_active || 'main';
  const newActive = cleaned.materials_active || 'main';
  if (prevQuote && prevActive !== newActive) {
    try {
      audit(
        'MATERIALS_ACTIVE_SWITCH',
        cu?.username || '-',
        ipAddr || '-',
        JSON.stringify({
          quote_id: quoteId,
          from: prevActive,
          to: newActive,
          user_id: cu?.id ?? null,
        })
      );
    } catch {
      /* swallow */
    }
  }
  // PR #B (Sprint S-ALT-MAT) — per-SP alt-materials events for Complex.
  // cplxState.subproducts each carry their own materials_active +
  // optional _alt_materials_op signal. Loop, emit MATERIALS_COPY +
  // MATERIALS_ACTIVE_SWITCH per-SP with sp_index + sp_code in detail,
  // strip _alt_materials_op from each SP before persist.
  if (Array.isArray(cleaned.subproducts)) {
    const prevSps = Array.isArray(prevQuote?.state?.subproducts) ? prevQuote.state.subproducts : [];
    cleaned.subproducts = cleaned.subproducts.map((sp, spi) => {
      if (!sp || typeof sp !== 'object') return sp;
      const cleanedSp = { ...sp };
      const spOp = cleanedSp._alt_materials_op;
      delete cleanedSp._alt_materials_op;
      // MATERIALS_COPY per-SP
      if (
        spOp &&
        spOp.type === 'copy' &&
        (spOp.direction === 'main_to_alt' || spOp.direction === 'alt_to_main')
      ) {
        try {
          audit(
            'MATERIALS_COPY',
            cu?.username || '-',
            ipAddr || '-',
            JSON.stringify({
              quote_id: quoteId,
              sp_index: spi,
              sp_code: cleanedSp.code || '',
              direction: spOp.direction,
              source_count: Number(spOp.source_count) || 0,
              dest_count_before: Number(spOp.dest_count_before) || 0,
              user_id: cu?.id ?? null,
            })
          );
        } catch {
          /* audit failures must never block save */
        }
      }
      // MATERIALS_ACTIVE_SWITCH per-SP — diff against prev SP at same idx
      const prevSp = prevSps[spi] || null;
      const prevSpActive = prevSp?.materials_active || 'main';
      const newSpActive = cleanedSp.materials_active || 'main';
      if (prevSp && prevSpActive !== newSpActive) {
        try {
          audit(
            'MATERIALS_ACTIVE_SWITCH',
            cu?.username || '-',
            ipAddr || '-',
            JSON.stringify({
              quote_id: quoteId,
              sp_index: spi,
              sp_code: cleanedSp.code || '',
              from: prevSpActive,
              to: newSpActive,
              user_id: cu?.id ?? null,
            })
          );
        } catch {
          /* swallow */
        }
      }
      return cleanedSp;
    });
  }
  return { ...body, state: cleaned };
}

router.post('/quotes', saveRateLimit, async (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  // Sprint S3 — permission-group check based on quote type. A Sales
  // user whose group hides 'standard' can't POST a new Std quote.
  const { resolveTabAccess } = await import('../services/permissionService.js');
  const quoteType = req.body?.type === 'complex' ? 'complex' : 'standard';
  const access = resolveTabAccess(cu, quoteType);
  if (access !== 'edit') {
    return res.status(403).json({
      error: 'permission_denied',
      tab: quoteType,
      current: access,
    });
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: 'Body must be a quote object' });
  }
  try {
    // Strip + audit alt-materials op (PR #A). No prev quote on POST so
    // MATERIALS_ACTIVE_SWITCH naturally skips; MATERIALS_COPY can still
    // fire if the operator copied before first save.
    const cleansed = emitAltMaterialsAuditAndStrip(body, null, cu, clientIp(req));
    // Drop any client-provided id on POST — the server assigns next-free.
    // Also drop _version: POST is for NEW quotes, so there's nothing
    // to collide with.
    const saved = await upsertQuote({ ...cleansed, id: undefined, _version: undefined });
    emitDataChange('quote.saved', {
      id: saved?.id,
      version: saved?._version,
      type: quoteType,
      savedBy: cu.username,
    });
    res.json({ ok: true, quote: saved });
  } catch (err) {
    logErr(req, 'quotes_post', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ═══════════════════════════════════════════════════════════════
// SOFT-DELETE / TRASH (Sprint 13)
// ═══════════════════════════════════════════════════════════════
//
// DELETE /api/quotes/:id          → soft-delete (sets deleted_at)
// POST   /api/quotes/:id/restore  → unset deleted_at, restore to active
// DELETE /api/quotes/:id?purge=1  → permanent (sys-only)
//
// Audit trail: every soft-delete + restore stamps deleted_by /
// restored_by with the actor's username. An automated purge job (not
// yet wired) can later collect anything `deleted_at < now - 30d`.

router.delete('/quotes/:id', saveRateLimit, async (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'id must be numeric' });

  const purge = req.query.purge === '1' || req.query.purge === 'true';
  if (purge) {
    // Hard delete — sys-only. The audit log entry survives the purge so
    // ops can still trace WHO removed WHAT after the row is gone.
    if (cu.role !== 'sys') {
      return res.status(403).json({ ok: false, error: 'sys role required for permanent delete' });
    }
    try {
      const { loadQuotes, saveQuotes } = await import('../repositories/quotesStore.js');
      const before = loadQuotes();
      const after = before.filter((q) => !(q && q.id === id));
      if (after.length === before.length) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      saveQuotes(after);
      audit(
        'QUOTE_PURGE',
        cu.username,
        clientIp(req),
        `purged quote #${id} (deleted_at=${before.find((q) => q.id === id)?.deleted_at || 'null'})`
      );
      emitDataChange('quote.deleted', { id, purged: true, savedBy: cu.username });
      return res.json({ ok: true, purged: true });
    } catch (err) {
      logErr(req, 'quote_purge', err);
      return res.status(500).json({ ok: false, error: redactErrorMessage(err) });
    }
  }

  // Soft-delete. Verify the quote exists FIRST — otherwise upsertQuote
  // would happily create a brand-new tombstoned row, leaking ghost
  // quotes into the trash list.
  try {
    const { getQuoteById } = await import('../repositories/quotesStore.js');
    const existing = getQuoteById(id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const saved = await upsertQuote({
      id,
      deleted_at: new Date().toISOString(),
      deleted_by: cu.username,
    });
    audit('QUOTE_TRASH', cu.username, clientIp(req), `trashed quote #${id}`);
    emitDataChange('quote.deleted', { id, purged: false, savedBy: cu.username });
    res.json({ ok: true, quote: saved });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return res.status(409).json({
        ok: false,
        error: 'version_conflict',
        actual_version: err.actualVersion,
        current: err.current,
      });
    }
    logErr(req, 'quote_trash', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

router.post('/quotes/:id/restore', saveRateLimit, async (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'id must be numeric' });
  try {
    const { getQuoteById } = await import('../repositories/quotesStore.js');
    const existing = getQuoteById(id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    // Setting these fields to null tombstones the trash markers without
    // losing the audit metadata if the client wants to display "last
    // restored by X at Y" history.
    const saved = await upsertQuote({
      id,
      deleted_at: null,
      deleted_by: null,
      restored_at: new Date().toISOString(),
      restored_by: cu.username,
    });
    audit('QUOTE_RESTORE', cu.username, clientIp(req), `restored quote #${id}`);
    emitDataChange('quote.saved', {
      id,
      version: saved?._version,
      restored: true,
      savedBy: cu.username,
    });
    res.json({ ok: true, quote: saved });
  } catch (err) {
    logErr(req, 'quote_restore', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

router.patch('/quotes/:id', saveRateLimit, async (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'id must be numeric' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: 'Body must be a quote patch object' });
  }
  try {
    // Alt-materials audit + strip (PR #A). Load prev so MATERIALS_ACTIVE_SWITCH
    // can diff old vs new. getQuoteById is cheap (in-memory cache).
    const { getQuoteById } = await import('../repositories/quotesStore.js');
    const prevQuote = getQuoteById(id);
    const cleansed = emitAltMaterialsAuditAndStrip({ ...body, id }, prevQuote, cu, clientIp(req));
    const saved = await upsertQuote({ ...cleansed });
    emitDataChange('quote.saved', {
      id: saved?.id,
      version: saved?._version,
      patch: true,
      savedBy: cu.username,
    });
    res.json({ ok: true, quote: saved });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      // Optimistic-locking conflict: client's cached version is stale.
      // Respond with 409 + the server's current state so the UI can
      // show a "reload vs overwrite" dialog.
      return res.status(409).json({
        ok: false,
        error: 'version_conflict',
        message: err.message,
        expected_version: err.expectedVersion,
        actual_version: err.actualVersion,
        current: err.current,
      });
    }
    logErr(req, 'quotes_patch', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ═══════════════════════════════════════════════════════════════
// LAYOUT ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/layouts', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const layoutDir = path.join(getDataDir(), 'Products layout');
  try {
    const files = fs
      .readdirSync(layoutDir)
      .filter((f) => !f.startsWith('.') && !f.endsWith('.txt'))
      .map((f) => {
        const stat = fs.statSync(path.join(layoutDir, f));
        return { name: f, size: stat.size, modified: stat.mtimeMs / 1000 };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

router.get('/layout/:filename', async (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const fname = decodeURIComponent(req.params.filename);
  // Sprint 1.7 — was `safeFn(fname)` which stripped `(`, `)`, `#`, etc. to
  // `_`. Legacy saves named files like "83000003 (20#).pdf" and Drawing
  // names with customer-supplied punctuation (e.g. "Cust: P/N #42")
  // therefore 404'd silently — the FileUploadZone then showed an empty
  // viewport with no clue why. Fix: preserve the filename exactly, but
  // resolve + assert the absolute path still lives INSIDE the layouts
  // directory (defeats `..` traversal). Also reject path separators in
  // the filename itself for defence-in-depth.
  if (fname.includes('/') || fname.includes('\\') || fname.includes('\0')) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  const layoutsDir = path.resolve(getDataDir(), 'Products layout');
  const fpath = path.resolve(layoutsDir, fname);
  if (!fpath.startsWith(layoutsDir + path.sep) && fpath !== layoutsDir) {
    return res.status(400).json({ error: 'path traversal' });
  }
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'not found', filename: fname });
  // Async read — multi-MB PDFs/images would block the event loop with the
  // sync variant (~50 ms+ stall per request), starving health probes and
  // any other in-flight requests on a single-process server.
  try {
    const buf = await fs.promises.readFile(fpath);
    const ext = path.extname(fname).toLowerCase();
    const mime =
      {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
      }[ext] || 'application/octet-stream';
    res.json({ name: fname, mime, data: buf.toString('base64') });
  } catch (err) {
    res.status(500).json({ error: 'read_failed', message: err?.message || 'unknown' });
  }
});

router.post(
  '/save-layout',
  validateBody({
    ccl_pn: { type: 'string', max: 128 },
    ext: { type: 'string', max: 8 },
    data: { type: 'string', required: true, max: 60 * 1024 * 1024 }, // ≤60MB base64
    quote_id: { type: 'number' },
  }),
  (req, res) => {
    const cu = getSessionUser(getTokenFromHeader(req));
    if (!cu) return res.status(401).json({ error: 'Unauthorized' });
    if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
    const pl = req.body;
    // Sprint 1.7 — keep the basename intact (only strip path separators);
    // the lookup endpoint above asserts traversal containment so we don't
    // need to scrub safe punctuation. Mirrors buildServerBasename in the
    // client which already produces filesystem-friendly names; this server
    // path is the last line of defence, not the primary sanitizer.
    const ccl = String(pl.ccl_pn || 'unknown')
      .replace(/[/\\\0]/g, '_')
      .slice(0, 200);
    const ext = pl.ext || '.png';
    const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.gif', '.webp', '.svg']);
    if (!ALLOWED.has(ext))
      return res.status(400).json({ ok: false, msg: `Format not allowed: ${ext}` });
    let rawD = pl.data || '';
    if (rawD.includes(',')) rawD = rawD.split(',')[1];
    const raw = Buffer.from(rawD, 'base64');
    const qid = pl.quote_id;
    const fname = qid != null ? `${ccl} (${qid}#)${ext}` : `${ccl}${ext}`;
    const layoutsDir = path.resolve(getDataDir(), 'Products layout');
    const fpath = path.resolve(layoutsDir, fname);
    if (!fpath.startsWith(layoutsDir + path.sep)) {
      return res.status(400).json({ ok: false, msg: 'path traversal' });
    }
    fs.mkdirSync(layoutsDir, { recursive: true });
    atomicWriteFileSync(fpath, raw);
    console.log(`  💾  Layout → ${fname}  (${Math.floor(raw.length / 1024)} KB)`);
    res.json({ ok: true, filename: fname });
  }
);

router.delete('/layout/:filename', (req, res) => {
  // Previously public — anyone who knew a filename could delete layouts.
  // Now requires at least write-capable role; additionally we realpath the
  // resolved path and assert it still lives inside Products layout/ to
  // defeat symlink / .. escapes.
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (!canWrite(cu)) return res.status(403).json({ ok: false, msg: 'Write access required' });
  const fname = safeFn(decodeURIComponent(req.params.filename));
  const layoutDir = path.join(getDataDir(), 'Products layout');
  const fpath = path.join(layoutDir, fname);
  let resolved;
  try {
    resolved = fs.realpathSync(fpath);
  } catch {
    return res.status(404).json({ error: 'not found' });
  }
  if (!resolved.startsWith(fs.realpathSync(layoutDir))) {
    audit('LAYOUT_DELETE_DENIED', cu.username, clientIp(req), `escape attempt: ${fname}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  fs.unlinkSync(resolved);
  audit('LAYOUT_DELETE', cu.username, clientIp(req), fname);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
// RATE ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/rate/backups', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const site = req.query.site || '';
  const csvKey = site ? siteToCsvKey(site) : '';
  const backupDir = path.join(getLibDir(), 'Rate', 'backups');
  const prefix = csvKey ? `rate_${csvKey}_` : 'rate_';
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => {
        const stat = fs.statSync(path.join(backupDir, f));
        return {
          filename: f,
          size: stat.size,
          modified: stat.mtimeMs / 1000,
          date: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
        };
      });
    res.json({ ok: true, files });
  } catch {
    res.json({ ok: true, files: [] });
  }
});

router.post(
  '/rate/backup',
  validateBody({
    site: { type: 'string', max: 32 },
    data: { type: 'array', max: 500 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { site = 'VN', data = [] } = req.body;
    const csvKey = siteToCsvKey(site);
    const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
    const fname = `rate_${csvKey}_${ts}.json`;
    writeJson(path.join(getLibDir(), 'Rate', 'backups', fname), {
      site,
      savedAt: new Date().toISOString(),
      data,
    });
    console.log(`  📦  Rate backup [${site}]: ${fname}`);
    res.json({ ok: true, filename: fname, site });
  }
);

router.post(
  '/rate/restore',
  validateBody({
    filename: { type: 'string', required: true, max: 128 },
    site: { type: 'string', max: 32 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { filename, site = '' } = req.body;
    const fpath = path.join(getLibDir(), 'Rate', 'backups', safeFn(filename));
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, error: 'Not found' });
    const bk = readJson(fpath);
    const data = bk?.data || bk;
    res.json({ ok: true, data, site, filename });
  }
);

router.post('/rate/export-csv', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  if (u.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const { site = 'VN', data: clientData } = req.body;
  const csvKey = siteToCsvKey(site);
  let data = clientData;
  if (!data) {
    const rs = readJson(path.join(getLibDir(), 'Rate', 'rate_sites.json'), {});
    data = rs[site] || [];
  }
  const [H, rows] = rateRows(data);
  const csvBytes = toCsvBytes(H, rows);
  atomicWriteFileSync(path.join(getLibDir(), 'Rate', `rate_${csvKey}.csv`), csvBytes);
  res.json({ ok: true, site, rows: data.length, file: `rate_${csvKey}.csv` });
});

// ═══════════════════════════════════════════════════════════════
// DDL ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/ddl/backups', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const site = req.query.site || '';
  const csvKey = site ? siteToCsvKey(site) : '';
  const backupDir = path.join(getLibDir(), 'DDL', 'backups');
  const prefix = csvKey ? `ddl_${csvKey}_` : 'ddl_';
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort()
      .reverse();
    res.json({ ok: true, backups: files });
  } catch {
    res.json({ ok: true, backups: [] });
  }
});

router.post(
  '/ddl/backup',
  validateBody({
    site: { type: 'string', max: 32 },
    data: { type: 'object' },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { site = 'VN', data = {} } = req.body;
    const csvKey = siteToCsvKey(site);
    const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
    const fname = `ddl_${csvKey}_${ts}.json`;
    writeJson(path.join(getLibDir(), 'DDL', 'backups', fname), {
      site,
      savedAt: new Date().toISOString(),
      data,
    });
    res.json({ ok: true, filename: fname, site });
  }
);

router.post(
  '/ddl/restore',
  validateBody({
    filename: { type: 'string', required: true, max: 128 },
    site: { type: 'string', max: 32 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { filename, site = '' } = req.body;
    const fpath = path.join(getLibDir(), 'DDL', 'backups', safeFn(filename));
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, error: 'Not found' });
    const bk = readJson(fpath);
    const data = bk?.data || bk;
    res.json({ ok: true, data, site, filename });
  }
);

router.post('/ddl/export-csv', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  if (u.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const { site = 'VN', data: clientData } = req.body;
  const csvKey = siteToCsvKey(site);
  let data = clientData;
  if (!data) {
    const ds = readJson(path.join(getLibDir(), 'DDL', 'ddl_sites.json'), {});
    data = ds[site] || {};
  }
  const [H, rows] = ddlToCsvRows(data);
  const csvBytes = toCsvBytes(H, rows);
  atomicWriteFileSync(path.join(getLibDir(), 'DDL', `ddl_${csvKey}.csv`), csvBytes);
  const sections = Object.keys(data).filter((k) => k !== '_custom_sections');
  res.json({ ok: true, site, sections: sections.length, file: `ddl_${csvKey}.csv` });
});

// POST /api/sync-csv
router.post('/sync-csv', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
  const { site } = req.body || {};
  const LIB = getLibDir();
  const result = { ok: true, synced: [] };
  if (site) {
    const csvKey = siteToCsvKey(site);
    const rateCsv = path.join(LIB, 'Rate', `rate_${csvKey}.csv`);
    if (!fs.existsSync(rateCsv))
      return res.status(404).json({ ok: false, error: `rate_${csvKey}.csv not found` });
    const { rows, errors } = parseRateCsv(rateCsv);
    if (errors && errors.length) result.rateSiteDataErrors = errors;
    const rateSites = readJson(path.join(LIB, 'Rate', 'rate_sites.json'), {});
    rateSites[site] = rows;
    writeJson(path.join(LIB, 'Rate', 'rate_sites.json'), rateSites);
    result.rateSiteData = rows;
    result.site = site;
    result.rateSitesDB = rateSites;
    result.synced.push(`rate_${csvKey}.csv`);
  } else {
    // Legacy VN sync — optional. A failure is surfaced in `result.syncErrors[]`
    // so the user can see what didn't sync without the whole import 500-ing.
    result.syncErrors = result.syncErrors || [];
    try {
      const rateCsv = path.join(LIB, 'Rate', 'rate.csv');
      if (fs.existsSync(rateCsv)) {
        const { rows, errors } = parseRateCsv(rateCsv);
        writeJson(path.join(LIB, 'Rate', 'rate.json'), rows);
        result.rateDB = rows;
        if (errors && errors.length) result.rateDBErrors = errors;
        result.synced.push('rate.csv');
      }
    } catch (e) {
      console.warn('  ⚠️  legacy rate.csv sync failed:', e.message);
      result.syncErrors.push({ file: 'rate.csv', reason: e.message });
    }
    try {
      const matCsv = path.join(LIB, 'MaterialCost', 'materials.csv');
      if (fs.existsSync(matCsv)) {
        const { rows, errors } = parseMatCsv(matCsv);
        writeJson(path.join(LIB, 'MaterialCost', 'materials.json'), rows);
        result.matDB = rows;
        if (errors && errors.length) result.matDBErrors = errors;
        result.synced.push('materials.csv');
      }
    } catch (e) {
      console.warn('  ⚠️  legacy materials.csv sync failed:', e.message);
      result.syncErrors.push({ file: 'materials.csv', reason: e.message });
    }
  }
  res.json(result);
});

router.post('/ddl/sync-csv', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ ok: false, msg: 'Admin only' });
  const { site = 'VN' } = req.body;
  const LIB = getLibDir();
  const csvKey = siteToCsvKey(site);
  const ddlCsv = path.join(LIB, 'DDL', `ddl_${csvKey}.csv`);
  if (!fs.existsSync(ddlCsv))
    return res.status(404).json({ ok: false, error: `ddl_${csvKey}.csv not found` });
  const data = parseDdlCsv(ddlCsv);
  const ddlSites = readJson(path.join(LIB, 'DDL', 'ddl_sites.json'), {});
  ddlSites[site] = data;
  writeJson(path.join(LIB, 'DDL', 'ddl_sites.json'), ddlSites);
  if (site === 'VN') writeJson(path.join(LIB, 'DDL', 'ddl.json'), data);
  res.json({ ok: true, ddlSiteData: data, site, ddlSitesDB: ddlSites });
});

// ═══════════════════════════════════════════════════════════════
// RELEASED QUOTATIONS
// ═══════════════════════════════════════════════════════════════

router.get('/released-quotations', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const dir = path.join(getLibDir(), 'ReleasedQuotation');
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort()
      .reverse()
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { filename: f, size: stat.size, modified: stat.mtimeMs / 1000 };
      });
    res.json({ ok: true, files });
  } catch {
    res.json({ ok: true, files: [] });
  }
});

router.get('/released-quotation/:name', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const fname = safeFn(decodeURIComponent(req.params.name));
  const fpath = path.join(getLibDir(), 'ReleasedQuotation', fname);
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'not found' });
  res.json(readJson(fpath));
});

router.post('/save-quotation', saveRateLimit, (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });
  const pl = req.body;
  // Body shape guard — reject non-object payloads before filename derivation
  // would crash on null. Quotation shape is too varied for strict field
  // validation, so we just enforce plain-object + ref_no bounds.
  if (!pl || typeof pl !== 'object' || Array.isArray(pl)) {
    return res.status(400).json({ ok: false, error: 'Payload must be a JSON object' });
  }
  if (pl.ref_no != null && (typeof pl.ref_no !== 'string' || pl.ref_no.length > 128)) {
    return res.status(400).json({ ok: false, error: 'ref_no must be a string ≤128 chars' });
  }
  const ref = safeFn((pl.ref_no || 'QUOT').replace(/\//g, '_').replace(/ /g, '-'));
  const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
  const fname = `${ref}_${ts}.json`;
  pl._saved_at = new Date().toISOString();
  pl._filename = fname;
  writeJson(path.join(getLibDir(), 'ReleasedQuotation', fname), pl);
  console.log(`  📄  Released quotation → ${fname}`);
  res.json({ ok: true, filename: fname, saved_at: pl._saved_at });
});

// ═══════════════════════════════════════════════════════════════
// BACKUP ROUTES
// ═══════════════════════════════════════════════════════════════

// Sprint 1.7b — admin-editable backup schedule (Settings → Backup card).
// Three routes: GET status, PUT update, POST run-now. All admin+ only.
router.get('/admin/backup-schedule', async (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
  try {
    const mod = await import('../services/backupScheduler.js');
    res.json({ ok: true, status: mod.getStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put(
  '/admin/backup-schedule',
  validateBody({
    enabled: { type: 'boolean' },
    hour: { type: 'number' },
    retentionDays: { type: 'number' },
  }),
  async (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
    try {
      const mod = await import('../services/backupScheduler.js');
      const r = mod.setSchedule(req.body || {});
      audit(
        'BACKUP_SCHEDULE_UPDATE',
        u.username,
        clientIp(req),
        `enabled=${req.body?.enabled} hour=${req.body?.hour} retentionDays=${req.body?.retentionDays}`
      );
      res.json(r);
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  }
);

router.post('/admin/backup-schedule/run-now', writeRateLimit, async (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
  try {
    const mod = await import('../services/backupScheduler.js');
    const summary = await mod.runBackupCycle({ force: true });
    audit(
      'BACKUP_RUN_NOW',
      u.username,
      clientIp(req),
      `ok=${summary.ok} duration=${summary.durationMs}ms`
    );
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Master Cylinder catalog (Sprint 1.7j) ───────────────────────
//
// Admin-managed Z=60..220 print cylinder availability for the Gallus
// Design Tools press. Defaults seeded from gallusInventory.js on first
// read; subsequent edits persist to JSON. Sys/admin-only writes:
//   - PUT /admin/master-cylinders/:z  → toggle availability or update note
//   - POST /admin/master-cylinders     → add a brand-new Z (eg. press buys
//                                        a non-standard cylinder)
//   - DELETE /admin/master-cylinders/:z → remove (admin-added rows only)
// Reads are open to any logged-in user (the Design Tools tab uses them).
const MASTER_CYL_PATH = () =>
  path.join(getDataDir(), 'Library', 'SystemConfig', 'master-cylinders.json');

function defaultPrintCylinders() {
  // Mirrors gallusInventory.js DEFAULT range; admins customise from here.
  const list = [];
  for (let z = 60; z <= 220; z++) {
    // Z=80..135 + Z=210 are factory-stocked; the rest are 'N' until
    // an admin marks otherwise. Matches the original hardcoded list.
    const stocked = new Set([
      80, 83, 85, 86, 88, 90, 94, 96, 98, 100, 101, 106, 108, 110, 111, 114, 116, 120, 122, 127,
      129, 132, 135, 210,
    ]);
    list.push({ z, available: stocked.has(z), note: '', source: 'default' });
  }
  return list;
}

function loadMasterCylinders() {
  const p = MASTER_CYL_PATH();
  try {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(j?.cylinders)) return j.cylinders;
    }
  } catch (err) {
    console.warn('[master-cylinders] load failed:', err.message);
  }
  return defaultPrintCylinders();
}

function saveMasterCylinders(cylinders, actor) {
  const p = MASTER_CYL_PATH();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    cylinders: cylinders.sort((a, b) => a.z - b.z),
    updatedAt: new Date().toISOString(),
    updatedBy: actor || '-',
  };
  atomicWriteFileSync(p, JSON.stringify(payload, null, 2));
}

router.get('/admin/master-cylinders', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, cylinders: loadMasterCylinders() });
});

router.put(
  '/admin/master-cylinders/:z',
  validateBody({
    available: { type: 'boolean' },
    note: { type: 'string', max: 200 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
    const z = parseInt(req.params.z, 10);
    if (!Number.isFinite(z) || z < 1 || z > 999) {
      return res.status(400).json({ ok: false, error: 'Invalid Z' });
    }
    const list = loadMasterCylinders();
    const idx = list.findIndex((c) => c.z === z);
    if (idx === -1) return res.status(404).json({ ok: false, error: `Cylinder Z=${z} not found` });
    const before = { ...list[idx] };
    if (typeof req.body?.available === 'boolean') list[idx].available = req.body.available;
    if (typeof req.body?.note === 'string') list[idx].note = req.body.note;
    saveMasterCylinders(list, u.username);
    audit(
      'CYLINDER_UPDATE',
      u.username,
      clientIp(req),
      `Z=${z} avail:${before.available}→${list[idx].available}`
    );
    res.json({ ok: true, cylinder: list[idx] });
  }
);

router.post(
  '/admin/master-cylinders',
  validateBody({
    z: { type: 'number', required: true },
    available: { type: 'boolean' },
    note: { type: 'string', max: 200 },
  }),
  (req, res) => {
    const u = getSessionUser(getTokenFromHeader(req));
    if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
    const z = parseInt(req.body.z, 10);
    if (!Number.isFinite(z) || z < 1 || z > 999) {
      return res.status(400).json({ ok: false, error: 'Invalid Z (1-999)' });
    }
    const list = loadMasterCylinders();
    if (list.some((c) => c.z === z)) {
      return res
        .status(409)
        .json({ ok: false, error: `Cylinder Z=${z} already exists — use PUT to edit` });
    }
    const newCyl = {
      z,
      available: req.body.available !== false, // default true for admin-added
      note: String(req.body.note || ''),
      source: 'admin',
      addedBy: u.username,
      addedAt: new Date().toISOString(),
    };
    list.push(newCyl);
    saveMasterCylinders(list, u.username);
    audit('CYLINDER_ADD', u.username, clientIp(req), `Z=${z} avail=${newCyl.available}`);
    res.json({ ok: true, cylinder: newCyl });
  }
);

router.delete('/admin/master-cylinders/:z', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Forbidden — admin only' });
  const z = parseInt(req.params.z, 10);
  const list = loadMasterCylinders();
  const idx = list.findIndex((c) => c.z === z);
  if (idx === -1) return res.status(404).json({ ok: false, error: `Z=${z} not found` });
  if (list[idx].source !== 'admin') {
    // Refuse to delete factory-default cylinders — toggle availability
    // to false instead so the operator never loses the canonical Z range.
    return res.status(400).json({
      ok: false,
      error: `Z=${z} is a factory default; toggle availability instead of deleting`,
    });
  }
  list.splice(idx, 1);
  saveMasterCylinders(list, u.username);
  audit('CYLINDER_DELETE', u.username, clientIp(req), `Z=${z}`);
  res.json({ ok: true });
});

router.get('/backup/list', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  ensurePkgBackupDirs();
  const bdir = path.join(getPkgBackupDir(), 'Data');
  try {
    const files = fs
      .readdirSync(bdir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort()
      .reverse()
      .map((f) => {
        const stat = fs.statSync(path.join(bdir, f));
        return {
          filename: f,
          size: stat.size,
          date: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
        };
      });
    res.json({ ok: true, files, dir: bdir });
  } catch {
    res.json({ ok: true, files: [], dir: bdir });
  }
});

// Code backups are now directory snapshots, not single HTML files.
// Each entry is a folder named code_<timestamp> containing a recursive copy
// of the package source (excluding node_modules, dist, .git, server/data,
// and the Backup & restore folder itself).
router.get('/backup/code-list', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  ensurePkgBackupDirs();
  const bdir = path.join(getPkgBackupDir(), 'Code');
  try {
    const entries = fs
      .readdirSync(bdir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => b.name.localeCompare(a.name));
    const files = entries.map((e) => {
      const full = path.join(bdir, e.name);
      const stat = fs.statSync(full);
      const { size, files: fileCount } = dirSize(full);
      return {
        filename: e.name,
        size,
        files: fileCount,
        date: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
      };
    });
    res.json({ ok: true, files, dir: bdir });
  } catch (e) {
    // Empty list with a diagnostic so the UI can render zero-state and
    // ops can still see what went wrong in the logs (permission,
    // missing-dir, …). Previously swallowed without trace.
    console.warn('  ⚠️  code-list failed, returning empty set:', e.message);
    res.json({ ok: true, files: [], dir: bdir, listError: e.code || 'unknown' });
  }
});

router.get('/backup/download/:name', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const fname = safeFn(decodeURIComponent(req.params.name));
  const fpath = path.join(getPkgBackupDir(), 'Data', fname);
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(fs.readFileSync(fpath));
});

// Code backups are directory snapshots — the browser can't download a folder
// directly, so this endpoint is now a no-op. Restore is the primary flow.
router.get('/backup/code-download/:name', (req, res) => {
  res.status(501).json({ error: 'Code backups are directory snapshots; use restore instead' });
});

router.post('/backup/data', writeRateLimit, (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Admin only' });
  try {
    ensurePkgBackupDirs();
    const snap = buildBackupSnapshot();
    const fname = `manual_${timestampTag()}.json`;
    atomicWriteFileSync(path.join(getPkgBackupDir(), 'Data', fname), JSON.stringify(snap));
    console.log(`  📦  Data backup → Backup & restore/Data/${fname}`);
    res.json({ ok: true, filename: fname });
  } catch (e) {
    logErr(req, 'backup_data', e);
    res.status(500).json({ error: redactErrorMessage(e) });
  }
});

// Snapshot the entire package source tree into Backup & restore/Code/code_<ts>/.
// Uses fs.cpSync (Node 16.7+) with a filter that excludes node_modules, dist,
// .git, server/data, and the Backup & restore dir itself.
//
// Partial-success contract: `copyPackageSource` now returns `{copied, skipped}`.
// If some top-level subtrees fail (cloud placeholder timeout, EACCES, …) we
// STILL return 200 with `ok:true, partial:true, skipped:[...]` so the user
// gets a usable backup and an actionable warning — not the blank
// "internal_error" 500 that replaced the whole operation before.
router.post('/backup/code-server', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isAdminPlus(u)) return res.status(403).json({ error: 'Admin only' });
  try {
    ensurePkgBackupDirs();
    const name = `code_${timestampTag()}`;
    const destDir = path.join(getPkgBackupDir(), 'Code', name);
    const { copied, skipped } = copyPackageSource(PKG_ROOT, destDir);
    if (copied === 0) {
      // Total failure — every single top-level threw. Clean up the empty
      // destDir so the Code Backups list doesn't accumulate empty shells,
      // and surface a specific reason instead of generic internal_error.
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw asSafeError(
        `All ${skipped.length} top-level entries failed to copy. First: ${skipped[0]?.entry} (${skipped[0]?.reason})`
      );
    }
    const { size, files } = dirSize(destDir);
    const tag = skipped.length ? ` PARTIAL — skipped ${skipped.length}` : '';
    console.log(
      `  📦  Code backup → Backup & restore/Code/${name} (${files} files, ${(size / 1024 / 1024).toFixed(1)} MB)${tag}`
    );
    if (skipped.length) {
      for (const s of skipped) console.log(`     ⚠️  skipped ${s.entry}: ${s.reason}`);
      audit(
        'BACKUP_CODE_PARTIAL',
        u.username,
        req.ip || '-',
        `skipped=${skipped.map((s) => s.entry).join(',')}`
      );
    } else {
      audit('BACKUP_CODE', u.username, req.ip || '-');
    }
    res.json({
      ok: true,
      filename: name,
      size,
      files,
      partial: skipped.length > 0,
      skipped, // [{entry, code, reason}]
    });
  } catch (e) {
    logErr(req, 'backup_code', e);
    res.status(500).json({ error: redactErrorMessage(e) });
  }
});

router.get('/backup/code', (req, res) => {
  res
    .status(501)
    .json({ error: 'Legacy code download is no longer supported; use restore instead' });
});

router.post('/backup/restore', writeRateLimit, (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'Admin only' });
  const { filename } = req.body;
  const fpath = path.join(getPkgBackupDir(), 'Data', safeFn(filename));
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'Not found' });
  // Parse + validate the snapshot BEFORE touching any real data file.
  // If the JSON is corrupted or the shape is wrong, we abort cleanly rather
  // than wipe live tables with a half-parsed payload.
  const snap = readJson(fpath);
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    audit('BACKUP_RESTORE_FAIL', u.username, clientIp(req), `${filename}: invalid JSON shape`);
    return res
      .status(400)
      .json({ ok: false, error: 'Backup file is corrupted or not a valid snapshot object' });
  }
  // Pre-backup current state into the same Backup & restore/Data folder so
  // the user can roll back if the restore produces an inconsistent state.
  ensurePkgBackupDirs();
  const preBak = `pre_restore_${timestampTag()}.json`;
  const preSnap = buildBackupSnapshot();
  atomicWriteFileSync(path.join(getPkgBackupDir(), 'Data', preBak), JSON.stringify(preSnap));
  const { restored, failed } = restoreFromSnapshot(snap);
  console.log(
    `  ↩  Restored from ${filename} (${restored.length} datasets, ${failed.length} failed)`
  );
  // If ANY dataset failed to write we must flag this to the client — a
  // partial restore leaves data in an inconsistent state and the user
  // may need to re-run the restore or fall back to pre_backup.
  const status = failed.length > 0 ? 207 : 200;
  res.status(status).json({
    ok: failed.length === 0,
    partial: failed.length > 0,
    restored,
    failed,
    pre_backup: preBak,
  });
});

// Upload a data backup file from disk (e.g. brought from another LAN
// machine or off-site copy) into Backup & restore/Data/. Doesn't restore
// it — the user picks Restore from the list afterward. Sys-only because
// a malformed/hostile snapshot can wipe everything if then restored.
const backupUpload = multer({
  dest: XLSM_UPLOAD_TMP,
  limits: { fileSize: 200 * 1024 * 1024 }, // backups can be large
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.json') cb(null, true);
    else cb(new Error('Only .json backup files are accepted'));
  },
});

router.post('/backup/upload', writeRateLimit, backupUpload.single('file'), (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) {
    if (req.file)
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    return res.status(403).json({ error: 'sys role required to upload backups' });
  }
  if (!req.file) return res.status(400).json({ error: 'no file' });
  try {
    // Validate the JSON is actually a snapshot before persisting.
    const buf = fs.readFileSync(req.file.path);
    let snap;
    try {
      snap = JSON.parse(buf.toString('utf-8'));
    } catch {
      throw new Error('File is not valid JSON');
    }
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
      throw new Error('Backup snapshot must be a JSON object');
    }
    // Heuristic shape check — full schema validation runs at restore time,
    // but we want to reject obvious junk early.
    const KNOWN_KEYS = [
      'quoteHistory',
      'matDB',
      'rateDB',
      'ddlDB',
      'summarizeDB',
      'rfqTracker',
      'sampleTracker',
      'financeWCDB',
      'financeSumDB',
      'inkCalcDB',
      'npiDB',
      'sourcingDB',
    ];
    const hasKnownKey = KNOWN_KEYS.some((k) => Object.prototype.hasOwnProperty.call(snap, k));
    if (!hasKnownKey) {
      throw new Error(
        `File looks like JSON but does not contain any known backup key (${KNOWN_KEYS.slice(0, 3).join(', ')}, …)`
      );
    }
    ensurePkgBackupDirs();
    const original = safeFn(req.file.originalname || 'uploaded.json');
    const tag = timestampTag();
    const fname = `uploaded_${tag}_${original}`;
    const dest = path.join(getPkgBackupDir(), 'Data', fname);
    atomicWriteFileSync(dest, buf);
    audit(
      'BACKUP_UPLOAD',
      u.username,
      clientIp(req),
      `${fname} (${(buf.length / 1024).toFixed(0)} KB, keys=${Object.keys(snap)
        .filter((k) => KNOWN_KEYS.includes(k))
        .join(',')})`
    );
    res.json({ ok: true, filename: fname, size: buf.length });
  } catch (e) {
    logErr(req, 'backup_upload', e);
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    if (req.file)
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
  }
});

router.post('/backup/delete', writeRateLimit, (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'Admin only' });
  try {
    const { filename, type: btype = 'data' } = req.body;
    const subdir = btype === 'code' ? 'Code' : 'Data';
    const fpath = path.join(getPkgBackupDir(), subdir, safeFn(filename));
    if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'Not found' });
    // Data backups are single JSON files → unlink. Code backups are folders → rmSync recursive.
    const stat = fs.statSync(fpath);
    if (stat.isDirectory()) fs.rmSync(fpath, { recursive: true, force: true });
    else fs.unlinkSync(fpath);
    res.json({ ok: true });
  } catch (e) {
    logErr(req, 'backup_delete', e);
    res.status(500).json({ error: redactErrorMessage(e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// LIBRARY FILES (generic read)
// ═══════════════════════════════════════════════════════════════

router.get('/lib/*', (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const rel = req.params[0];
  const parts = rel.split('/').filter((p) => p && p !== '..');
  const fpath = path.join(getLibDir(), ...parts);
  const absPath = path.resolve(fpath);
  if (!absPath.startsWith(path.resolve(getLibDir())))
    return res.status(403).json({ error: 'forbidden' });
  if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'not found' });
  res.json(readJson(fpath));
});

// POST /api/auth/users/:id/session-ttl
//
// Sprint 1.7 — was inline loadUsers/saveUsers, which races with concurrent
// change-pwd / profile edits on the same user (audit finding §6: lost-
// update). Now serialized via updateUsers() like every other user-mutating
// path in the file.
router.post('/auth/users/:id/session-ttl', async (req, res) => {
  const caller = getSessionUser(getTokenFromHeader(req));
  if (!isSys(caller)) return res.status(403).json({ error: 'Forbidden — SYS only' });
  const uid = parseInt(req.params.id);
  const ttlH = Math.max(0, Math.min(168, parseInt(req.body.ttl_hours || 8)));
  const ttlS = ttlH > 0 ? ttlH * 3600 : 28800;
  let found = false;
  await updateUsers((users) => {
    const idx = users.findIndex((u) => u.id === uid);
    if (idx == null || idx === -1) return;
    if (ttlH === 0) delete users[idx].session_ttl;
    else users[idx].session_ttl = ttlS;
    found = true;
  });
  if (!found) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true, ttl_hours: ttlH, ttl_seconds: ttlS });
});

// ═══════════════════════════════════════════════════════════════
// IMPORT XLSM/XLSX — parse Excel calculation file into state
// ═══════════════════════════════════════════════════════════════

const xlsmUpload = multer({
  dest: XLSM_UPLOAD_TMP,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsm', '.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Only XLSM/XLSX files are accepted'));
  },
});

router.post('/import-xlsm', xlsmUpload.single('file'), (req, res) => {
  const cu = getSessionUser(getTokenFromHeader(req));
  if (!cu) return res.status(401).json({ error: 'Unauthorized' });
  if (cu.role === 'viewonly') return res.status(403).json({ ok: false, msg: 'View Only' });

  if (!req.file) return res.status(400).json({ ok: false, msg: 'No file uploaded' });

  try {
    const wb = XLSX.readFile(req.file.path, { type: 'file' });

    // Find main calc sheet: prefer '2.1','1.1','2','1','Simple','Complex'
    const preferredSheets = [
      '2.1',
      '1.1',
      '2',
      '1',
      'Simple',
      'Complex',
      'Flexo sample',
      'SS sample',
    ];
    let sheetName = wb.SheetNames.find((sn) => preferredSheets.includes(sn.trim()));
    if (!sheetName) sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Cell read helpers (1-indexed row, column letter)
    function cv(r, c) {
      const addr = c + r;
      const cell = ws[addr];
      if (!cell || cell.v == null) return null;
      return typeof cell.v === 'string' ? cell.v.trim() : cell.v;
    }
    function n(r, c, d = 0) {
      const v = cv(r, c);
      if (v == null) return d;
      const f = parseFloat(v);
      return isNaN(f) ? d : f;
    }
    function s(r, c, d = '') {
      const v = cv(r, c);
      return v != null ? String(v) : d;
    }

    // ── HEADER (row 2) ──
    const state = {
      direct_cu: s(2, 'B'),
      project: s(2, 'C'),
      end_cu_pn: s(2, 'D'),
      direct_cu_pn: s(2, 'E'),
      description: s(2, 'F'),
      moq: Math.round(n(2, 'H', 0)),
      trade_mode: s(2, 'T', 'USD(Normal)'),
      annual_qty: Math.round(n(2, 'U', 0)),
      selling_price: n(2, 'Z', 0),
      target: cv(2, 'AA') != null ? n(2, 'AA', null) : null,
      currency: 'USD',
      site: 'VN',
    };

    // ── LAYOUT (rows 22-26) ──
    Object.assign(state, {
      part_width: n(22, 'L', 0),
      part_length_md: n(22, 'N', 0),
      web_width_td: n(23, 'L', 0),
      sheet_length: n(23, 'N', 0),
      num_webs: Math.round(n(24, 'L', 1)) || 1,
      parts_in_md: Math.round(n(24, 'N', 1)) || 1,
      parts_web_across: Math.round(n(25, 'L', 1)) || 1,
      min_gap_md: n(26, 'N', 0),
    });

    // ── MATERIALS (rows 11-30) ──
    const materials = [];
    for (let i = 0; i < 20; i++) {
      const row = 11 + i;
      const label = i < 10 ? `Main Mat. ${i + 1}` : `Process Mat. ${i + 11}`;
      materials.push({
        label,
        code: s(row, 'B'),
        desc: s(row, 'C'),
        usage: n(row, 'F'),
        setup_lm: n(row, 'G'),
        free_liner: n(row, 'H'),
        pitch_ovr: n(row, 'I'),
        width: n(row, 'J'),
        cavities: Math.round(n(row, 'K', 0)),
        log_width: 0,
        offcut_yn: s(row, 'M', 'N'),
        slitting_yn: s(row, 'N', 'N'),
        df_yn: s(row, 'O', ''),
        import_duty: n(row, 'P'),
        s_price: n(row, 'Q'),
        g_price: n(row, 'R'),
        latest: n(row, 'S'),
      });
    }
    state.materials = materials;

    // ── INKS (rows 33-42) ──
    const inks = [];
    for (let i = 0; i < 10; i++) {
      const row = 33 + i;
      inks.push({
        label: `Ink ${i + 1}`,
        color: s(row, 'B'),
        print_type: s(row, 'C'),
        base_mat: s(row, 'D'),
        coverage: n(row, 'F'),
        setup_kg: n(row, 'G'),
        area_pct: n(row, 'H'),
        clicks: n(row, 'I'),
        s_price: n(row, 'Q'),
        g_price: 0,
        latest: n(row, 'S'),
      });
    }
    state.inks = inks;

    // ── PROCESSES (rows 45-54) ──
    const processes = [];
    for (let i = 0; i < 10; i++) {
      const row = 45 + i;
      let scrap = n(row, 'L', 0);
      const yld = n(row, 'M', 0);
      if (scrap === 0 && yld > 0 && yld < 1) {
        scrap = Math.round((1.0 - yld) * 10000) / 10000;
      }
      processes.push({
        label: `Process ${i + 1}`,
        process_type: s(row, 'B'),
        workcenter: s(row, 'C'),
        speed: n(row, 'E'),
        layout: Math.round(n(row, 'G', 1)) || 1,
        efficiency: n(row, 'H', 0.85),
        setup_h: n(row, 'K'),
        scrap_pct: scrap,
        manual_uph: n(row, 'J'),
        tool_cost: n(row, 'N'),
        tool_type: s(row, 'O'),
        tool_life: Math.round(n(row, 'P', 0)),
        extra_cost: 0,
        product_life: 1,
        eau_ovr: 0,
        repeat: 1,
      });
    }
    state.processes = processes;

    // ── PACKING (rows 57-64) ──
    Object.assign(state, {
      packing_method: s(58, 'C') || 'Sheet',
      pcs_per_bag: Math.round(n(59, 'C', 50)),
      bags_per_box: Math.round(n(60, 'C', 100)),
      container_cost: n(61, 'C'),
      box_cost: n(62, 'C'),
      other_packing: n(63, 'C'),
    });

    // ── SHIPPING (rows 67-70) ──
    Object.assign(state, {
      delivery_term: s(67, 'C') || 'DAP',
      ship_qty: Math.round(n(68, 'C', 0)),
      shipping_cost: n(69, 'C'),
      other_ship: n(70, 'C'),
    });

    console.log(`  📥  XLSM imported from sheet '${sheetName}'`);
    res.json({ ok: true, state, sheet: sheetName });
  } catch (err) {
    logErr(req, 'xlsm_import', err);
    res.status(500).json({ ok: false, msg: redactErrorMessage(err) });
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════
// CODE RESTORE — copy a Backup & restore/Code/code_<ts>/ snapshot back
// over the package source tree. Creates a safety pre-restore backup first.
// SYS-only because it can replace the running server's own .js files —
// typically the user needs to restart the node process after a code restore.
// ═══════════════════════════════════════════════════════════════

router.post('/backup/code-restore', writeRateLimit, (req, res) => {
  const u = getSessionUser(getTokenFromHeader(req));
  if (!isSys(u)) return res.status(403).json({ error: 'SYS only' });
  try {
    const { filename } = req.body;
    const fname = safeFn(filename || '');
    if (!fname) return res.status(400).json({ error: 'filename required' });

    const srcDir = path.join(getPkgBackupDir(), 'Code', fname);
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      return res.status(404).json({ error: 'Backup snapshot not found' });
    }

    ensurePkgBackupDirs();

    // 1. Safety backup of the current source tree before we overwrite it.
    const preBak = `pre_restore_${timestampTag()}`;
    const preBakDir = path.join(getPkgBackupDir(), 'Code', preBak);
    copyPackageSource(PKG_ROOT, preBakDir);

    // 2. Copy the snapshot back onto the package root. copyPackageSource
    // iterates top-level entries, so node_modules / dist / .git inside a
    // snapshot that happened to include them (shouldn't, but just in case)
    // are filtered out, and the destination (PKG_ROOT) is never a
    // subdirectory of the source (srcDir), so cpSync is happy.
    copyPackageSource(srcDir, PKG_ROOT);

    const { files } = dirSize(srcDir);
    console.log(`  ↩  Code restored from ${fname} (${files} files, safety backup: ${preBak})`);
    res.json({ ok: true, restored_files: files, pre_backup: preBak });
  } catch (e) {
    logErr(req, 'code_restore', e);
    res.status(500).json({ error: redactErrorMessage(e) });
  }
});

export default router;
