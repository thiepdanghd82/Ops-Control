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
import {
  getBackupRoot,
  resolveBackupTarget,
  checkQuota,
  writeBackupChecksum,
  pruneOldBackups,
  getRetentionSettings,
  verifyBackupChecksum,
} from '../utils/backupPath.js';
import { redactErrorMessage, logErr } from '../utils/safeError.js';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import {
  shadowWriteBom,
  shadowWriteRouting,
  shadowWriteInventory,
  shadowWriteMaterials,
  shadowClearBom,
  shadowClearRouting,
  shadowClearInventory,
  shadowClearMaterials,
} from '../repositories/shadowWrite.js';
import { matchHeader } from '../services/importPipeline.js';

// Convert {headers, rows[]} to array-of-objects for shadow-write mappers.
function rowsAsObjects(headers, rows) {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

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
const upload = multer({
  dest: UPLOAD_TMP_DIR,
  // Phase 10H — tightened from 50MB to 10MB. Legitimate BOM/routing
  // imports have never hit 5MB in production; the old cap was a DoS
  // vector (upload a 50MB zip-bomb Excel and bloat the parser).
  // Override with OPS_IMPORT_MAX_MB for edge cases.
  limits: { fileSize: (Number(process.env.OPS_IMPORT_MAX_MB) || 10) * 1024 * 1024 },
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
 * Validate that the uploaded file's headers are compatible with the target
 * dataset. Accepts the file only if ALL required headers are present — this
 * is what keeps Mfg Structures and Routing Operations independent: if the
 * user accidentally picks the wrong CSV on the wrong tab, we refuse it
 * instead of silently clobbering the target file with the other dataset.
 */
function validateHeaders(headers, required, label) {
  const set = new Set(
    headers.map((h) =>
      String(h || '')
        .trim()
        .toLowerCase()
    )
  );
  const missing = required.filter((r) => !set.has(r.toLowerCase()));
  if (missing.length > 0) {
    const err = new Error(
      `This file does not look like a ${label} export. Missing required columns: ${missing.join(', ')}`
    );
    err.status = 400;
    throw err;
  }
}

const REQUIRED_HEADERS = {
  bom: ['Parent Part No', 'Component Part'],
  routing: ['Part No', 'Operation No', 'Work Centre No'],
  inventory: ['Part No'],
  finishedGoods: ['Part No'],
  rawMaterials: ['Part No'],
};

/**
 * Clear a target .js data file by writing an empty {headers:[], rows:[]}
 * payload. Keeps the var-name wrapper so the browser loader still succeeds.
 */
function clearJsDataFile(filePath, varName) {
  writeJsDataFile(filePath, varName, [], []);
}

// ─── Import Endpoints ───

// POST /api/import/inventory - Import full IFS inventory
router.post(
  '/inventory',
  requireRole(4),
  upload.single('file'),
  requireValidUpload,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      let parsed;

      if (ext === '.csv') {
        const content = fs.readFileSync(req.file.path, 'utf-8');
        parsed = parseCSV(content);
      } else {
        parsed = await parseExcel(req.file.path);
      }

      // Validate we got meaningful data
      if (!parsed.headers || parsed.headers.length < 3) {
        return res.status(400).json({ error: 'File has too few columns' });
      }
      if (parsed.rows.length === 0) {
        return res.status(400).json({ error: 'File has no data rows' });
      }

      // Refuse wrong-dataset uploads — keeps tabs independent
      validateHeaders(parsed.headers, REQUIRED_HEADERS.inventory, 'IFS Inventory');

      // Backup existing file
      const targetFile = path.join(LIBRARY_DIR, 'IFS_Inventory', 'inventory_data.js');
      const backupPath = backupFile(targetFile);

      // Write new data
      writeJsDataFile(targetFile, 'window._CCL_INV_DATA', parsed.headers, parsed.rows);

      // Shadow-write to SQLite. Non-blocking: file write is source of truth.
      // A failure here logs but doesn't fail the request.
      shadowWriteInventory(rowsAsObjects(parsed.headers, parsed.rows), 'inventory');

      // Clear cache so new data is served immediately
      clearCache();

      // Cleanup temp file
      fs.unlinkSync(req.file.path);

      res.json({
        ok: true,
        message: 'Inventory data imported successfully',
        stats: {
          headers: parsed.headers.length,
          rows: parsed.rows.length,
          backup: backupPath ? path.basename(backupPath) : null,
        },
      });
    } catch (err) {
      logErr(req, 'import_inventory', err);
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      res.status(err.status || 500).json({ error: redactErrorMessage(err) });
    }
  }
);

// POST /api/import/finished-goods - Import finished goods
router.post(
  '/finished-goods',
  requireRole(4),
  upload.single('file'),
  requireValidUpload,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      let parsed;

      if (ext === '.csv') {
        parsed = parseCSV(fs.readFileSync(req.file.path, 'utf-8'));
      } else {
        parsed = await parseExcel(req.file.path);
      }

      if (parsed.rows.length === 0) return res.status(400).json({ error: 'No data rows' });
      validateHeaders(parsed.headers, REQUIRED_HEADERS.finishedGoods, 'Finished Goods');

      const targetFile = path.join(LIBRARY_DIR, 'IFS_Inventory', 'finished_good_data.js');
      backupFile(targetFile);
      writeJsDataFile(targetFile, 'window._CCL_FG_DATA', parsed.headers, parsed.rows);
      shadowWriteInventory(rowsAsObjects(parsed.headers, parsed.rows), 'finished_goods');
      clearCache();
      fs.unlinkSync(req.file.path);

      res.json({ ok: true, stats: { headers: parsed.headers.length, rows: parsed.rows.length } });
    } catch (err) {
      console.error('Import finished-goods error:', err);
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/import/raw-materials - Import raw materials
router.post(
  '/raw-materials',
  requireRole(4),
  upload.single('file'),
  requireValidUpload,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      let parsed;

      if (ext === '.csv') {
        parsed = parseCSV(fs.readFileSync(req.file.path, 'utf-8'));
      } else {
        parsed = await parseExcel(req.file.path);
      }

      if (parsed.rows.length === 0) return res.status(400).json({ error: 'No data rows' });
      validateHeaders(parsed.headers, REQUIRED_HEADERS.rawMaterials, 'Raw Materials');

      const targetFile = path.join(LIBRARY_DIR, 'IFS_Inventory', 'raw_materials_data.js');
      backupFile(targetFile);
      writeJsDataFile(targetFile, 'window._CCL_RM_DATA', parsed.headers, parsed.rows);
      shadowWriteInventory(rowsAsObjects(parsed.headers, parsed.rows), 'raw_materials');
      clearCache();
      fs.unlinkSync(req.file.path);

      res.json({ ok: true, stats: { headers: parsed.headers.length, rows: parsed.rows.length } });
    } catch (err) {
      console.error('Import raw-materials error:', err);
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// POST /api/import/bom - Import manufacturing structures (BOM)
router.post('/bom', requireRole(4), upload.single('file'), requireValidUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let parsed;

    if (ext === '.csv') {
      parsed = parseCSV(fs.readFileSync(req.file.path, 'utf-8'));
    } else {
      parsed = await parseExcel(req.file.path);
    }

    if (parsed.rows.length === 0) return res.status(400).json({ error: 'No data rows' });
    validateHeaders(parsed.headers, REQUIRED_HEADERS.bom, 'Manufacturing Structures (BOM)');

    const targetFile = path.join(LIBRARY_DIR, 'Manufacturing_Structures', 'mfg_structures_data.js');
    backupFile(targetFile);
    writeJsDataFile(targetFile, 'window._CCL_MFG_DATA', parsed.headers, parsed.rows);
    shadowWriteBom(rowsAsObjects(parsed.headers, parsed.rows));
    clearCache();
    fs.unlinkSync(req.file.path);

    res.json({ ok: true, stats: { headers: parsed.headers.length, rows: parsed.rows.length } });
  } catch (err) {
    console.error('Import bom error:', err);
    if (req.file?.path)
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/import/routing - Import routing operations
router.post(
  '/routing',
  requireRole(4),
  upload.single('file'),
  requireValidUpload,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      let parsed;

      if (ext === '.csv') {
        parsed = parseCSV(fs.readFileSync(req.file.path, 'utf-8'));
      } else {
        parsed = await parseExcel(req.file.path);
      }

      if (parsed.rows.length === 0) return res.status(400).json({ error: 'No data rows' });
      validateHeaders(parsed.headers, REQUIRED_HEADERS.routing, 'Routing Operations');

      const targetFile = path.join(LIBRARY_DIR, 'Routing_Operations', 'routing_ops_data.js');
      backupFile(targetFile);
      writeJsDataFile(targetFile, 'window._CCL_ROP_DATA', parsed.headers, parsed.rows);
      shadowWriteRouting(rowsAsObjects(parsed.headers, parsed.rows));
      clearCache();
      fs.unlinkSync(req.file.path);

      res.json({ ok: true, stats: { headers: parsed.headers.length, rows: parsed.rows.length } });
    } catch (err) {
      console.error('Import routing error:', err);
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// ─── Clear Data Endpoints ───
// Each tab has its own DELETE endpoint that wipes only that dataset's file.
// Files are backed up first, then replaced with an empty {headers:[],rows:[]}
// payload so the browser keeps rendering an empty table (not a 404).
const CLEAR_TARGETS = {
  bom: {
    file: ['Manufacturing_Structures', 'mfg_structures_data.js'],
    varName: 'window._CCL_MFG_DATA',
    label: 'Manufacturing Structures',
  },
  routing: {
    file: ['Routing_Operations', 'routing_ops_data.js'],
    varName: 'window._CCL_ROP_DATA',
    label: 'Routing Operations',
  },
  inventory: {
    file: ['IFS_Inventory', 'inventory_data.js'],
    varName: 'window._CCL_INV_DATA',
    label: 'Full Inventory',
  },
  'finished-goods': {
    file: ['IFS_Inventory', 'finished_good_data.js'],
    varName: 'window._CCL_FG_DATA',
    label: 'Finished Goods',
  },
  'raw-materials': {
    file: ['IFS_Inventory', 'raw_materials_data.js'],
    varName: 'window._CCL_RM_DATA',
    label: 'Raw Materials',
  },
};

// Map slug → shadow-clear function so DELETE /:slug also truncates the
// corresponding SQLite slice. Keeps ops.db in sync with the JS files.
const SHADOW_CLEAR_FNS = {
  bom: () => shadowClearBom(),
  routing: () => shadowClearRouting(),
  inventory: () => shadowClearInventory('inventory'),
  'finished-goods': () => shadowClearInventory('finished_goods'),
  'raw-materials': () => shadowClearInventory('raw_materials'),
};

for (const [slug, cfg] of Object.entries(CLEAR_TARGETS)) {
  router.delete(`/${slug}`, requireRole(4), (req, res) => {
    try {
      const targetFile = path.join(LIBRARY_DIR, ...cfg.file);
      const backupPath = backupFile(targetFile);
      clearJsDataFile(targetFile, cfg.varName);
      const shadowFn = SHADOW_CLEAR_FNS[slug];
      if (shadowFn) shadowFn();
      clearCache();
      res.json({
        ok: true,
        message: `${cfg.label} cleared`,
        stats: { backup: backupPath ? path.basename(backupPath) : null },
      });
    } catch (err) {
      logErr(req, `clear_${slug}`, err);
      res.status(500).json({ error: redactErrorMessage(err) });
    }
  });
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

function mapRowsByHeader(headers, rows, headerMap) {
  // Build column-index → field-key lookup once. Uses the tolerant matcher
  // (Lesson 32) so real export headers like "USD / M² PRICE" / "MM THICKNESS"
  // / "M² MOQ" / "DAYS LEAD TIME" / "NOTES / REMARKS" map instead of being
  // silently dropped — headerMap is the same { normKey: canonical } shape the
  // matcher expects.
  const colToField = {};
  headers.forEach((h, i) => {
    const key = matchHeader(h, headerMap).canonical;
    if (key && !(key in colToField)) colToField[key] = i;
  });
  const fields = Object.keys(colToField);
  if (fields.length === 0) return [];
  return rows
    .map((row) => {
      const obj = {};
      for (const f of fields) {
        const v = row[colToField[f]];
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

      const mappedRows = mapRowsByHeader(parsed.headers, parsed.rows, cfg.headerMap);
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
  upload.single('file'),
  requireValidUpload,
  handleMaterialsImport({
    label: 'NPI Materials',
    filename: 'npi_materials.json',
    headerMap: NPI_HEADER_MAP,
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
  upload.single('file'),
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
      const mapped = mapRowsByHeader(parsed.headers, parsed.rows, RATE_HEADER_MAP)
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
  upload.single('file'),
  requireValidUpload,
  handleMaterialsImport({
    label: 'Sourcing DB',
    filename: 'sourcing_db.json',
    headerMap: SOURCING_HEADER_MAP,
    hintHeaders: ['Req. Date', 'Customer', 'Material', 'EXW Price', 'DAP Price', 'Supplier'],
  })
);

// Shared registry of dataset → source file. Used by /status and /backup.
const DATASET_FILES = {
  inventory: { file: ['IFS_Inventory', 'inventory_data.js'], label: 'IFS Inventory' },
  finishedGoods: { file: ['IFS_Inventory', 'finished_good_data.js'], label: 'Finished Goods' },
  rawMaterials: { file: ['IFS_Inventory', 'raw_materials_data.js'], label: 'Raw Materials' },
  bom: {
    file: ['Manufacturing_Structures', 'mfg_structures_data.js'],
    label: 'BOM / Mfg Structures',
  },
  routing: { file: ['Routing_Operations', 'routing_ops_data.js'], label: 'Routing Operations' },
};

// POST /api/import/backup { key, destPath? } — copy a dataset's data
// file to a user-chosen location on disk. When destPath is omitted the
// server falls back to `<originalFolder>/<name>.backup_<timestamp>.js`.
// If destPath ends with a path separator the file is written under
// that directory using the default filename. Admins only.
router.post(
  '/backup',
  requireRole(4),
  validateBody({
    // key is restricted to the five known datasets — anything else would
    // fail the cfg lookup below anyway, but rejecting early gives a
    // uniform 400 shape instead of a bespoke error string.
    key: {
      type: 'enum',
      required: true,
      values: Object.keys({
        inventory: 1,
        finishedGoods: 1,
        rawMaterials: 1,
        bom: 1,
        routing: 1,
      }),
    },
    // destPath — a RELATIVE path under <DATA_DIR>/Backup/Data/. Absolute
    // paths and `..` escapes are rejected by resolveBackupTarget below.
    destPath: { type: 'string', max: 1024 },
  }),
  (req, res) => {
    try {
      const { key, destPath } = req.body;
      const cfg = DATASET_FILES[key];
      if (!cfg) return res.status(400).json({ ok: false, error: 'Unknown dataset key' });

      const src = path.join(LIBRARY_DIR, ...cfg.file);
      if (!fs.existsSync(src))
        return res.status(404).json({ ok: false, error: 'Source data file not found' });

      const base = path.basename(src, path.extname(src));
      const ext = path.extname(src) || '.js';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultName = `${base}.backup_${ts}${ext}`;

      // Phase 9F.1 — whitelist + quota enforcement. Previously the client
      // could pass any absolute path and the server would mkdir/copy
      // there. Now destPath is resolved INSIDE <DATA_DIR>/Backup/Data/
      // and `..` escape attempts fail the startsWith check in resolveBackupTarget.
      const backupRoot = getBackupRoot(DATA_DIR);
      fs.mkdirSync(backupRoot, { recursive: true });

      const resolve = resolveBackupTarget({ backupRoot, defaultFileName: defaultName, destPath });
      if (!resolve.ok) {
        return res.status(400).json({ ok: false, error: resolve.error });
      }
      const target = resolve.target;

      // Quota check: stat the source so we know the incoming size; if
      // adding it would exceed OPS_BACKUP_QUOTA_MB, refuse with 507.
      const srcStat = fs.statSync(src);
      const quota = checkQuota(backupRoot, srcStat.size);
      if (!quota.ok) {
        return res.status(507).json({
          ok: false,
          error: quota.error,
          used_mb: Number((quota.used / 1024 / 1024).toFixed(1)),
          quota_mb: Number((quota.quota / 1024 / 1024).toFixed(0)),
        });
      }

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
      const stat = fs.statSync(target);

      // Integrity sidecar + retention pruning. Failures here are
      // non-fatal for the backup itself — we log them and still report
      // success so a checksum/prune hiccup doesn't break data recovery.
      const checksum = writeBackupChecksum(target);
      if (!checksum.ok) {
        console.warn('[backup] checksum write failed for', target, '-', checksum.error);
      }
      const retention = getRetentionSettings();
      const prune = pruneOldBackups({ backupRoot, ...retention });
      if (prune.errors.length) {
        console.warn('[backup] retention prune reported errors:', prune.errors);
      }

      res.json({
        ok: true,
        path: target,
        size: stat.size,
        sizeHuman: (stat.size / 1024).toFixed(1) + ' KB',
        sha256: checksum.ok ? checksum.hex : null,
        retention: {
          keepDays: retention.keepDays,
          keepMin: retention.keepMin,
          deleted: prune.deleted,
          kept: prune.kept,
        },
      });
    } catch (err) {
      logErr(req, 'backup_create', err);
      res.status(500).json({ ok: false, error: redactErrorMessage(err) });
    }
  }
);

// POST /api/import/backup/verify { file } — verify a backup file
// against its `.sha256` sidecar. Admin-only; the `file` is a name
// inside the backup root (no path traversal). Returns ok+hex on match,
// ok:false with a specific reason otherwise so the client can surface
// "mismatch" distinctly from "sidecar missing".
router.post(
  '/backup/verify',
  requireRole(4),
  validateBody({
    file: { type: 'string', required: true, min: 1, max: 1024 },
  }),
  (req, res) => {
    try {
      const backupRoot = getBackupRoot(DATA_DIR);
      const resolve = resolveBackupTarget({
        backupRoot,
        defaultFileName: 'verify.tmp', // unused; file is provided
        destPath: req.body.file,
      });
      if (!resolve.ok) return res.status(400).json({ ok: false, error: resolve.error });
      const target = resolve.target;
      if (!fs.existsSync(target)) {
        return res.status(404).json({ ok: false, error: 'backup_not_found' });
      }
      const r = verifyBackupChecksum(target);
      // 200 on success, 422 on mismatch so ops monitors can distinguish
      // "integrity OK" from "file corrupted — do NOT restore from this".
      const status = r.ok ? 200 : r.reason === 'mismatch' ? 422 : 400;
      res.status(status).json(r);
    } catch (err) {
      logErr(req, 'backup_verify', err);
      res.status(500).json({ ok: false, error: redactErrorMessage(err) });
    }
  }
);

// GET /api/import/status - Check current data file stats
router.get('/status', (req, res) => {
  const files = {
    inventory: path.join(LIBRARY_DIR, 'IFS_Inventory', 'inventory_data.js'),
    finishedGoods: path.join(LIBRARY_DIR, 'IFS_Inventory', 'finished_good_data.js'),
    rawMaterials: path.join(LIBRARY_DIR, 'IFS_Inventory', 'raw_materials_data.js'),
    bom: path.join(LIBRARY_DIR, 'Manufacturing_Structures', 'mfg_structures_data.js'),
    routing: path.join(LIBRARY_DIR, 'Routing_Operations', 'routing_ops_data.js'),
  };

  const stats = {};
  for (const [key, filePath] of Object.entries(files)) {
    // Expose the path relative to the server's data dir so the UI can
    // show users exactly where the dataset lives on disk.
    const relPath = path.relative(path.resolve(DATA_DIR, '..'), filePath);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      stats[key] = {
        exists: true,
        size: stat.size,
        sizeHuman: (stat.size / 1024 / 1024).toFixed(2) + ' MB',
        modified: stat.mtime.toISOString(),
        path: relPath,
        absPath: filePath,
      };
    } else {
      stats[key] = { exists: false, path: relPath, absPath: filePath };
    }
  }

  res.json(stats);
});

export default router;
