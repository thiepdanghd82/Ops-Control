/**
 * IFS Data Import Routes
 * Handles CSV/Excel file upload and sync to IFS data files
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { clearCache } from '../services/dataSync.js';
import { checkPassword, audit } from '../services/authService.js';
import { redactErrorMessage, logErr } from '../utils/safeError.js';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import { shadowWriteMaterials, shadowClearMaterials } from '../repositories/shadowWrite.js';
import { resolveHeaderClaims } from '../services/importPipeline.js';
import { uploadSingle } from '../utils/uploadGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Sprint-harden — upload tmp dir resolved from env → OS tmpdir, with
// mode 0700 so another user on the host can't read half-parsed Excel
// uploads. Cleaned on server boot (sweepStaleUploads below) to cover
// crashes that skip the per-request unlink.
const UPLOAD_TMP_DIR = path.join(
  process.env.OPS_UPLOAD_TMPDIR || os.tmpdir(),
  'ops-control-uploads'
);
try {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true, mode: 0o700 });
  // mkdirSync honors mode only on create — force on existing dirs too.
  try {
    fs.chmodSync(UPLOAD_TMP_DIR, 0o700);
  } catch {
    /* windows: no-op */
  }
} catch (err) {
  console.warn('[import] failed to prepare upload tmp dir:', err?.message || err);
}

// On boot, sweep files older than 1h — they're orphaned by a crash
// since every successful request unlinks in a finally. Any write that's
// still in flight finishes well under 1h.
function sweepStaleUploads() {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const name of fs.readdirSync(UPLOAD_TMP_DIR)) {
      const p = path.join(UPLOAD_TMP_DIR, name);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {
        /* ignore individual failures */
      }
    }
  } catch {
    /* dir missing — nothing to sweep */
  }
}
sweepStaleUploads();

// Configure multer for file uploads
// 50 MB default: a full BOM/inventory "Export Current Data" now runs ~24 MB as
// xlsx (≈19.5K rows), and the app must re-import what it exports. The earlier
// 10 MB cap broke that round-trip. Routes are requireRole(4)-gated (trusted
// admins only), and CSV export (much smaller) is the recommended path.
// Override with OPS_IMPORT_MAX_MB.
const IMPORT_MAX_MB = Number(process.env.OPS_IMPORT_MAX_MB) || 50;
const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: { fileSize: IMPORT_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are accepted'));
    }
  },
});

/**
 * Phase 10H — magic-number validation. Multer's fileFilter only
 * inspects the declared filename extension, which an attacker
 * controls. After upload, peek at the first bytes and confirm they
 * match the claimed type. CSV is text, so we accept any printable
 * opener; XLSX is a zip archive (`PK\x03\x04`); XLS is a compound
 * binary (`D0 CF 11 E0 A1 B1 1A E1`). Anything else → reject + unlink.
 */
function verifyMagicBytes(filePath, ext) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    if (ext === '.xlsx') {
      return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    }
    if (ext === '.xls') {
      return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    }
    if (ext === '.csv') {
      // CSV has no magic. Reject NUL-heavy binaries (obvious non-text).
      // If >2 NULs in the first 8 bytes, it's almost certainly binary.
      let nulCount = 0;
      for (let i = 0; i < 8; i++) if (buf[i] === 0) nulCount++;
      return nulCount <= 2;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd)
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
  }
}

function requireValidUpload(req, res, next) {
  const f = req.file;
  if (!f) return res.status(400).json({ ok: false, error: 'no_file' });
  const ext = path.extname(f.originalname).toLowerCase();
  if (!verifyMagicBytes(f.path, ext)) {
    try {
      fs.unlinkSync(f.path);
    } catch {
      /* ignore */
    }
    return res.status(400).json({
      ok: false,
      error: 'file_content_mismatch',
      message: `Uploaded file contents don't match the declared ${ext} format`,
    });
  }
  next();
}

// Resolve DATA_DIR with the same logic as server/index.js so this module
// works whether loaded before or after the env var is populated.
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname, '..', '..'), DATA_DIR);
}
const LIBRARY_DIR = path.join(DATA_DIR, 'Library');

/**
 * Parse CSV content into {headers, rows} format
 */
function parseCSV(content) {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length === 0) throw new Error('Empty CSV file');

  // Handle both comma and semicolon delimiters
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';

  const headers = parseCSVLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

  return { headers, rows };
}

/**
 * Parse a single CSV line (handling quoted fields)
 */
function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse Excel file using xlsx library
 */
async function parseExcel(filePath) {
  const XLSX = await import('xlsx');
  // xlsx's ESM build (xlsx.mjs — what `import('xlsx')` resolves to in this
  // ESM server) does NOT auto-wire node fs, so XLSX.readFile() throws
  // "Cannot access file" (redacted to internal_error). Read the bytes
  // ourselves + XLSX.read(buffer) so it works regardless of fs-wiring.
  const workbook = XLSX.read(fs.readFileSync(filePath));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (jsonData.length === 0) throw new Error('Empty Excel file');

  const headers = jsonData[0].map((h) => String(h || '').trim());
  const rows = jsonData.slice(1).filter((row) => row.some((cell) => cell != null && cell !== ''));

  return { headers, rows };
}

/**
 * Write data to IFS .js file format: window._VARNAME={headers:[...],rows:[[...],...]}
 */
function writeJsDataFile(filePath, varName, headers, rows) {
  const data = { headers, rows };
  const content = `${varName}=${JSON.stringify(data)};`;
  atomicWriteFileSync(filePath, content);
}

/**
 * Create backup of existing file before overwrite
 */
function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const backupPath = path.join(dir, `${base}_backup_${ts}${ext}`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Clear a target .js data file by writing an empty {headers:[], rows:[]}
 * payload. Keeps the var-name wrapper so the browser loader still succeeds.
 */
function clearJsDataFile(filePath, varName) {
  writeJsDataFile(filePath, varName, [], []);
}

// ─── Clear Data Endpoints ───
// Each tab has its own DELETE endpoint that wipes only that dataset's file.
// Files are backed up first, then replaced with an empty {headers:[],rows:[]}
// payload so the browser keeps rendering an empty table (not a 404).
const CLEAR_TARGETS = {
  'npi-parts': {
    file: ['NpiParts', 'npi_parts_data.js'],
    varName: 'window._CCL_NPIPARTS_DATA',
    label: 'NPI Parts List',
  },
};

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
}

// Best-effort data-row count of a JS-AoA library file (for the audit trail).
function countRowsInJsFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    const m = content.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!m) return 0;
    const parsed = JSON.parse(m[1]);
    return Array.isArray(parsed.rows) ? parsed.rows.length : 0;
  } catch {
    return 0;
  }
}

// Bulk-wipe of an imported dataset requires the caller to re-enter their
// ACCOUNT PASSWORD (step-up), enforced here so a curl user can't bypass the
// client modal. POST (not DELETE) because api.delete carries no body. The
// existing requireRole(4) gate stays; the password check is ADDED on top.
for (const [slug, cfg] of Object.entries(CLEAR_TARGETS)) {
  router.post(
    `/${slug}/clear`,
    requireRole(4),
    // `password` optional at the schema layer so an ABSENT password takes the
    // same "bad password" branch below (uniform failure), not a 400.
    validateBody({ password: { type: 'string', required: false, max: 256 } }),
    async (req, res) => {
      const caller = req.user?.user;
      const ip = clientIp(req);
      // Verify the caller's CURRENT account password BEFORE wiping. Missing or
      // wrong → HTTP 200 { ok:false, code:'bad_password' } (NOT 401 — the
      // client's request() treats any 401 as session-expiry + force-logout).
      // Nothing is touched. Mirrors the S-2FA-RESET step-up precedent.
      const { password } = req.body || {};
      if (!caller || !(await checkPassword(caller, password || ''))) {
        audit(
          'DATASET_CLEAR_DENIED',
          caller?.username || '-',
          ip,
          JSON.stringify({ dataset: slug })
        );
        return res.json({ ok: false, code: 'bad_password', error: 'Account password incorrect' });
      }
      try {
        const targetFile = path.join(LIBRARY_DIR, ...cfg.file);
        const rowsBefore = countRowsInJsFile(targetFile);
        const backupPath = backupFile(targetFile);
        clearJsDataFile(targetFile, cfg.varName);
        clearCache();
        audit(
          'DATASET_CLEAR',
          caller.username,
          ip,
          JSON.stringify({ dataset: slug, user_id: caller.id, rows_before: rowsBefore })
        );
        res.json({
          ok: true,
          message: `${cfg.label} cleared`,
          stats: {
            backup: backupPath ? path.basename(backupPath) : null,
            rows_before: rowsBefore,
          },
        });
      } catch (err) {
        logErr(req, `clear_${slug}`, err);
        res.status(500).json({ error: redactErrorMessage(err) });
      }
    }
  );
}

// ─── NPI Materials & Sourcing DB import ───
// These datasets live as plain JSON arrays (not .js var files). The import
// endpoint parses the uploaded CSV/XLSX, maps columns to the app's internal
// field keys via fuzzy header matching, then overwrites the JSON file
// (backing up the old one first). Saves the user from manually copying
// hundreds of rows into the in-table editor.

// Header alias → internal field key. Matching is case/space-insensitive.
const NPI_HEADER_MAP = {
  // date
  date: 'date',
  'update date': 'date',
  updated: 'date',
  ngày: 'date',
  // name / material
  name: 'name',
  material: 'name',
  'material name': 'name',
  'tên vật tư': 'name',
  // price
  price: 'price',
  'usd/m²': 'price',
  'usd per m2': 'price',
  'unit price': 'price',
  // type / description
  type: 'type',
  description: 'type',
  desc: 'type',
  'type / description': 'type',
  // thickness
  thick: 'thick',
  thickness: 'thick',
  'độ dày': 'thick',
  // color / surface / adhesive
  color: 'color',
  màu: 'color',
  surface: 'surface',
  finish: 'surface',
  adhesive: 'adhesive',
  glue: 'adhesive',
  // moq / leadtime
  moq: 'moq',
  'min qty': 'moq',
  'min order': 'moq',
  lt: 'lt',
  'lead time': 'lt',
  leadtime: 'lt',
  // supplier / note
  supplier: 'supplier',
  vendor: 'supplier',
  note: 'note',
  notes: 'note',
  remark: 'note',
  remarks: 'note',
};

const SOURCING_HEADER_MAP = {
  // date
  month: 'month',
  'req. date': 'month',
  'req date': 'month',
  'request date': 'month',
  date: 'month',
  // requester
  requester: 'req',
  req: 'req',
  by: 'req',
  // customer
  customer: 'cust',
  cust: 'cust',
  project: 'cust',
  'customer / project': 'cust',
  // material inquiry
  material: 'material',
  'material inquiry': 'material',
  inquiry: 'material',
  // size
  size: 'size',
  spec: 'size',
  'size / spec': 'size',
  // prices
  exw: 'exw',
  'exw price': 'exw',
  'exw price (usd/m²)': 'exw',
  dap: 'dap',
  'dap price': 'dap',
  'dap price (usd/m²)': 'dap',
  // moq / lead time
  moq: 'moq',
  'supplier moq': 'moq',
  'min order': 'moq',
  lt: 'lt',
  'lead time': 'lt',
  leadtime: 'lt',
  // supplier / status
  supplier: 'supplier',
  vendor: 'supplier',
  status: 'status',
  remark: 'status',
  remarks: 'status',
  'status / remark': 'status',
};

function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function mapRowsByHeader(headers, rows, headerMap, numberFields = []) {
  // Tolerant matcher (Lesson 32) + confidence-ranked, data-aware conflict
  // resolution (PR #211) via the shared resolver — so real export headers like
  // "USD / M² PRICE" map instead of being silently dropped, AND when several
  // columns match one field the EXACT header wins over a weak token-subset
  // match regardless of column order (no more "first column in the file"
  // stealing a field). `headerMap` is the same { normKey: canonical } shape.
  const { claims } = resolveHeaderClaims(headers, headerMap, { numberFields, sampleRows: rows });
  const fields = Object.keys(claims);
  if (fields.length === 0) return [];
  return rows
    .map((row) => {
      const obj = {};
      for (const f of fields) {
        const v = row[claims[f]];
        if (v !== undefined && v !== null && v !== '') obj[f] = v;
      }
      return obj;
    })
    .filter((obj) => Object.keys(obj).length > 0);
}

async function parseUploadedFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv') {
    const content = fs.readFileSync(file.path, 'utf-8');
    return parseCSV(content);
  }
  return parseExcel(file.path);
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

function handleMaterialsImport(cfg) {
  return async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
      const parsed = await parseUploadedFile(req.file);
      if (!parsed.headers || parsed.headers.length < 2) {
        return res.status(400).json({ ok: false, error: 'File has too few columns' });
      }

      const mappedRows = mapRowsByHeader(
        parsed.headers,
        parsed.rows,
        cfg.headerMap,
        cfg.numberFields || []
      );
      if (mappedRows.length === 0) {
        return res.status(400).json({
          ok: false,
          error: `No recognised columns in the file. Expected headers like: ${cfg.hintHeaders.join(', ')}`,
        });
      }

      const targetFile = path.join(LIBRARY_DIR, 'MaterialCost', cfg.filename);
      const backupPath = backupFile(targetFile);

      // Read-modify-write: parse the existing file with try/catch so a
      // truncated / corrupt JSON doesn't blow up the request. On corruption
      // we REJECT in append mode (silent loss of prior rows would be worse
      // than a 500), but allow replace mode to overwrite.
      const mode = (req.body.mode || req.query.mode || 'replace').toLowerCase();
      let existing = [];
      if (fs.existsSync(targetFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(targetFile, 'utf-8')) || [];
          if (!Array.isArray(existing)) existing = [];
        } catch (e) {
          if (mode === 'append') {
            return res.status(409).json({
              ok: false,
              error: 'existing_file_corrupt',
              message: `Cannot append: existing ${cfg.filename} is unreadable. Restore from backup or use replace mode.`,
            });
          }
          // replace mode: backup already taken; proceed with empty existing
          existing = [];
        }
      }
      const next = mode === 'append' ? existing.concat(mappedRows) : mappedRows;

      writeJsonFile(targetFile, next);
      // Shadow-write: NPI materials → kind='npi'; sourcing_db.json → 'sourcing'.
      if (cfg.filename === 'npi_materials.json') shadowWriteMaterials(next, 'npi');
      else if (cfg.filename === 'sourcing_db.json') shadowWriteMaterials(next, 'sourcing');
      clearCache();

      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore cleanup */
      }

      res.json({
        ok: true,
        stats: {
          rows: mappedRows.length,
          headers: parsed.headers.length,
          mapped: Object.keys(mappedRows[0] || {}),
          total: next.length,
          mode,
          backup: backupPath ? path.basename(backupPath) : null,
        },
      });
    } catch (err) {
      logErr(req, `materials_import_${cfg.label}`, err);
      try {
        if (req.file) fs.unlinkSync(req.file.path);
      } catch {
        /* ignore cleanup */
      }
      const status = err.status || 500;
      res.status(status).json({ ok: false, error: redactErrorMessage(err) });
    }
  };
}

router.post(
  '/npi-materials',
  requireRole(4),
  uploadSingle(upload, 'file', IMPORT_MAX_MB),
  requireValidUpload,
  handleMaterialsImport({
    label: 'NPI Materials',
    filename: 'npi_materials.json',
    headerMap: NPI_HEADER_MAP,
    numberFields: ['price', 'thick', 'moq', 'lt'],
    hintHeaders: ['Date', 'Material Name', 'Price', 'Type', 'Thickness', 'Supplier'],
  })
);

// ─── Rate Table import ───
// Site-keyed write: rate_sites.json is { '<site>': [...rows] } and the
// import targets one site at a time. The ?site= query param selects which
// key to overwrite/append into; if missing we default to VN to match the
// UI's default tab.
const RATE_HEADER_MAP = {
  // Workcenter name — the primary key for rate rows
  workcenter: 'workcenter',
  'work center': 'workcenter',
  'work centre': 'workcenter',
  wc: 'workcenter',
  'wc name': 'workcenter',
  'workcenter name': 'workcenter',
  name: 'workcenter',
  operation: 'workcenter',
  tên: 'workcenter',
  // Crew — operators required
  crew: 'crew',
  'crew size': 'crew',
  operators: 'crew',
  people: 'crew',
  // Machine rate ($/hr)
  machine: 'machine_rate',
  'machine rate': 'machine_rate',
  'machine usd/h': 'machine_rate',
  'machine $/h': 'machine_rate',
  'mach rate': 'machine_rate',
  'mc rate': 'machine_rate',
  // Labor rate ($/hr)
  labor: 'labor_rate',
  labour: 'labor_rate',
  'labor rate': 'labor_rate',
  'labor usd/h': 'labor_rate',
  'labour usd/h': 'labor_rate',
  'labor $/h': 'labor_rate',
  // Speed unit
  'speed uom': 'speed_uom',
  speed: 'speed_uom',
  uom: 'speed_uom',
  unit: 'speed_uom',
  'speed unit': 'speed_uom',
  // Overhead cost
  'oh cost': 'oh_cost',
  overhead: 'oh_cost',
  oh: 'oh_cost',
  'overhead cost': 'oh_cost',
  // Machine center / machine cost reference
  'w/c': 'mc_cost',
  'mc cost': 'mc_cost',
  'machine center': 'mc_cost',
  mc: 'mc_cost',
};

// Normalise a parsed value into the typed field the UI expects. Numeric
// fields get Number() coercion (falling back to 0 / 1 defaults), string
// fields get trimmed. Rows without a workcenter name are filtered out by
// the caller so the user doesn't end up with blank anchor rows.
function normaliseRateRow(raw) {
  const num = (v, d = 0) => {
    if (v == null || v === '') return d;
    const n = Number(String(v).replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : d;
  };
  const str = (v) => (v == null ? '' : String(v).trim());
  return {
    workcenter: str(raw.workcenter),
    crew: num(raw.crew, 1),
    machine_rate: num(raw.machine_rate, 0),
    labor_rate: num(raw.labor_rate, 0),
    speed_uom: str(raw.speed_uom),
    oh_cost: num(raw.oh_cost, 0),
    mc_cost: raw.mc_cost == null ? '' : str(raw.mc_cost),
  };
}

router.post(
  '/rate',
  requireRole(4),
  uploadSingle(upload, 'file', IMPORT_MAX_MB),
  requireValidUpload,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
      const site = (req.query.site || req.body.site || 'VN').toString();
      const mode = (req.query.mode || req.body.mode || 'replace').toString().toLowerCase();

      const parsed = await parseUploadedFile(req.file);
      if (!parsed.headers || parsed.headers.length < 2) {
        return res.status(400).json({ ok: false, error: 'File has too few columns' });
      }

      // Map raw rows to internal field keys via fuzzy header matching, then
      // filter out rows without a workcenter name (blank separator rows in
      // the CSV, totals rows, etc.).
      const mapped = mapRowsByHeader(parsed.headers, parsed.rows, RATE_HEADER_MAP, [
        'crew',
        'machine_rate',
        'labor_rate',
        'mc_cost',
        'oh_cost',
      ])
        .map(normaliseRateRow)
        .filter((r) => r.workcenter && r.workcenter.length > 0);

      if (mapped.length === 0) {
        return res.status(400).json({
          ok: false,
          error:
            'No rate rows recognised. Expected headers like: Workcenter, Crew, Machine USD/H, Labor USD/H, Speed UOM, OH Cost',
        });
      }

      const targetFile = path.join(LIBRARY_DIR, 'Rate', 'rate_sites.json');
      const backupPath = backupFile(targetFile);

      const existing = fs.existsSync(targetFile)
        ? JSON.parse(fs.readFileSync(targetFile, 'utf-8')) || {}
        : {};

      const prevRows = Array.isArray(existing[site]) ? existing[site] : [];
      existing[site] = mode === 'append' ? prevRows.concat(mapped) : mapped;

      writeJsonFile(targetFile, existing);
      clearCache();
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore cleanup */
      }

      res.json({
        ok: true,
        stats: {
          site,
          mode,
          rows: mapped.length,
          headers: parsed.headers.length,
          mapped: Object.keys(mapped[0] || {}),
          total: existing[site].length,
          backup: backupPath ? path.basename(backupPath) : null,
        },
      });
    } catch (err) {
      logErr(req, 'rate_import', err);
      try {
        if (req.file) fs.unlinkSync(req.file.path);
      } catch {
        /* ignore cleanup */
      }
      const status = err.status || 500;
      res.status(status).json({ ok: false, error: redactErrorMessage(err) });
    }
  }
);

router.post(
  '/sourcing-db',
  requireRole(4),
  uploadSingle(upload, 'file', IMPORT_MAX_MB),
  requireValidUpload,
  handleMaterialsImport({
    label: 'Sourcing DB',
    filename: 'sourcing_db.json',
    headerMap: SOURCING_HEADER_MAP,
    numberFields: ['exw', 'dap', 'moq', 'lt'],
    hintHeaders: ['Req. Date', 'Customer', 'Material', 'EXW Price', 'DAP Price', 'Supplier'],
  })
);

export default router;
