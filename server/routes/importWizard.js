/**
 * Import Wizard routes — modern, dataset-registry-driven endpoints.
 *
 *   POST /api/import-wizard/preview   → parse + simulate (no write)
 *   POST /api/import-wizard/commit    → final write using preview token
 *   GET  /api/import-wizard/template/:dataset    → blank XLSX template
 *   GET  /api/import-wizard/export/:dataset      → current data as XLSX/CSV
 *   GET  /api/import-wizard/history?dataset=...  → recent import audit rows
 *   GET  /api/import-wizard/backups/:dataset     → list backup files
 *   POST /api/import-wizard/restore   → restore a chosen backup
 *   GET  /api/import-wizard/datasets              → registry listing (UI bootstrap)
 *
 * The legacy /api/import/* routes still work; this is purely additive.
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { requireRole } from '../middleware/auth.js';
import { redactErrorMessage, logErr } from '../utils/safeError.js';
import { audit } from '../services/authService.js';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import { toCsvDocument } from '../utils/csvSafe.js';
import { uploadSingle } from '../utils/uploadGuard.js';

import { parseUploadedFile } from '../services/importParse.js';
import { getDataset, listDatasets } from '../services/importDatasets.js';
import {
  mapHeaders,
  applyMappingOverrides,
  coerceRows,
  buildCanonical,
  diffRows,
  readExisting,
  writeDataset,
  backupDataset,
  listBackups,
  dispatchShadowWrite,
  dispatchShadowClear,
  createPreviewToken,
  consumePreviewToken,
  rowsAsObjects,
  mergeRows,
  datasetFilePath,
  notifyCacheClear,
  configureStageDir,
} from '../services/importPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Per-process import history ring buffer (mirrors audit_log, but
// pre-filtered for the History panel). Kept small — UI never asks
// for more than 50 entries.
const HISTORY_MAX = 200;
const _history = [];
function pushHistory(entry) {
  _history.unshift({ ...entry, ts: new Date().toISOString() });
  if (_history.length > HISTORY_MAX) _history.length = HISTORY_MAX;
}

// ─── multer config (same hardening as legacy import.js) ───
const UPLOAD_TMP_DIR = path.join(
  process.env.OPS_UPLOAD_TMPDIR || os.tmpdir(),
  'ops-control-uploads'
);
try {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(UPLOAD_TMP_DIR, 0o700);
  } catch {
    /* windows: no-op */
  }
} catch {
  /* ignore */
}

// Stage directory holds the parsed/canonicalised wizard payload between
// preview and commit. Created once at module load + registered with the
// pipeline so its janitor can sweep orphans every 5 min.
const WIZARD_STAGE_DIR = path.join(UPLOAD_TMP_DIR, 'wizard-stage');
try {
  fs.mkdirSync(WIZARD_STAGE_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(WIZARD_STAGE_DIR, 0o700);
  } catch {
    /* windows */
  }
} catch {
  /* ignore */
}
configureStageDir(WIZARD_STAGE_DIR);

// 50 MB default: a full BOM "Export Current Data" (≈19.5K rows) is ~24 MB as
// xlsx, and the app must be able to re-import what it exports. Overridable via
// OPS_IMPORT_MAX_MB. Routes are requireRole(4)-gated so the upload surface is
// trusted admins only. (Prefer the CSV export — much smaller for re-import.)
const IMPORT_MAX_MB = Number(process.env.OPS_IMPORT_MAX_MB) || 50;
const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: { fileSize: IMPORT_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls', '.txt'].includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and Excel files are accepted'));
  },
});

// Magic-byte sniff (kept consistent with legacy)
function verifyMagic(filePath, ext) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    if (ext === '.xlsx')
      return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    if (ext === '.xls')
      return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    if (ext === '.csv' || ext === '.txt') {
      let nul = 0;
      for (let i = 0; i < 8; i++) if (buf[i] === 0) nul++;
      return nul <= 2;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd)
      try {
        fs.closeSync(fd);
      } catch {}
  }
}

// Common upload pre-flight
function requireValidUpload(req, res, next) {
  const f = req.file;
  if (!f) return res.status(400).json({ ok: false, error: 'no_file' });
  const ext = path.extname(f.originalname).toLowerCase();
  if (!verifyMagic(f.path, ext)) {
    try {
      fs.unlinkSync(f.path);
    } catch {}
    return res.status(400).json({ ok: false, error: 'file_content_mismatch' });
  }
  next();
}

function fileSha256(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

// ─────────────────────────────────────────────────────────────────
// GET /datasets — bootstrap for the wizard UI
// ─────────────────────────────────────────────────────────────────
router.get('/datasets', (req, res) => {
  res.json({ ok: true, datasets: listDatasets() });
});

// ─────────────────────────────────────────────────────────────────
// POST /preview
//
// Body (multipart): file, dataset, sheet (optional), overrides (JSON, optional)
// Response: { ok, token, dataset, headers, rows (sample), mapping, diff }
// ─────────────────────────────────────────────────────────────────
router.post(
  '/preview',
  requireRole(4),
  uploadSingle(upload, 'file', IMPORT_MAX_MB),
  requireValidUpload,
  async (req, res) => {
    const cleanup = () => {
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
    };
    try {
      const datasetKey = req.body.dataset;
      const dataset = getDataset(datasetKey);
      if (!dataset) {
        cleanup();
        return res.status(400).json({ ok: false, error: 'unknown_dataset' });
      }

      const sheet = req.body.sheet || null;
      const overrides = req.body.overrides ? safeJSON(req.body.overrides) : null;

      // When the operator hasn't picked a sheet, auto-select the sheet whose
      // header row best matches THIS dataset — fixes grabbing the first sheet
      // (e.g. a Dashboard/title sheet) instead of the data sheet; the Lesson 32
      // tolerant matcher never saw the right sheet otherwise. Explicit sheet
      // still wins. `meta.sheetScores` (below) explains the choice to the UI.
      const scoreHeaders = (headers) => Object.keys(mapHeaders(headers, dataset).mapping).length;
      const parsed = await parseUploadedFile(req.file, sheet ? { sheet } : { scoreHeaders });
      if (!parsed.headers || parsed.headers.length === 0) {
        cleanup();
        return res.status(400).json({ ok: false, error: 'empty_file' });
      }
      if (parsed.rows.length === 0) {
        cleanup();
        return res.status(400).json({ ok: false, error: 'no_data_rows' });
      }

      // Pass the parsed rows so the matcher can disambiguate number-typed
      // canonicals by data (e.g. a real "Price" column vs a boolean "Use
      // Price Incl Tax" column) — title + data mapping per Lesson 32.
      const headerMappingRaw = mapHeaders(parsed.headers, dataset, parsed.rows);
      const headerMapping = overrides
        ? applyMappingOverrides(headerMappingRaw, overrides, dataset)
        : headerMappingRaw;

      if (headerMapping.missing.length > 0) {
        cleanup();
        return res.status(400).json({
          ok: false,
          error: 'missing_required_headers',
          missing: headerMapping.missing,
          headers: parsed.headers,
          meta: parsed.meta,
          hint: `This file does not look like a ${dataset.label} export. Missing required columns: ${headerMapping.missing.join(', ')}`,
        });
      }

      // Coerce types using ORIGINAL row indexing — coerce per canonical
      // column, then build the canonical-shape rows.
      const canonical = buildCanonical({
        headers: parsed.headers,
        rows: parsed.rows,
        dataset,
        headerMapping,
        includeUnmapped: true,
      });

      const { rows: coercedRows, issues } = coerceRows(canonical.headers, canonical.rows, dataset);
      canonical.rows = coercedRows;

      // Diff against existing
      const existing = readExisting(dataset);
      const existingHeaders = Array.isArray(existing)
        ? dataset.canonicalHeaders
        : existing.headers || [];
      const existingRows = Array.isArray(existing)
        ? existing.map((o) => dataset.canonicalHeaders.map((h) => o[h] ?? ''))
        : existing.rows || [];
      const diff = diffRows({
        existingRows,
        existingHeaders: Array.isArray(existing) ? dataset.canonicalHeaders : existingHeaders,
        newRows: canonical.rows,
        newHeaders: canonical.headers,
        naturalKey: dataset.naturalKey,
      });

      // Persist to a wizard-staging file so commit can re-read without
      // depending on the original tmp upload (which we delete now).
      const stageFile = path.join(
        WIZARD_STAGE_DIR,
        `${crypto.randomBytes(12).toString('hex')}.json`
      );
      atomicWriteFileSync(
        stageFile,
        JSON.stringify({
          datasetKey,
          headers: canonical.headers,
          rows: canonical.rows,
          meta: parsed.meta,
          sourceSha256: fileSha256(req.file.path),
          filename: req.file.originalname,
        })
      );

      const token = createPreviewToken({ stageFile, datasetKey, by: currentUser(req) });

      res.json({
        ok: true,
        token,
        dataset: {
          key: dataset.key,
          label: dataset.label,
          canonicalHeaders: dataset.canonicalHeaders,
          naturalKey: dataset.naturalKey,
          requiredHeaders: dataset.requiredHeaders,
          storageKind: dataset.storage.kind,
        },
        file: {
          name: req.file.originalname,
          size: req.file.size,
          sha256: fileSha256(req.file.path),
        },
        meta: parsed.meta,
        headers: {
          raw: parsed.headers,
          normalised: headerMapping.normalisedHeaders,
          unmapped: headerMapping.unmapped,
          mapping: headerMapping.mapping,
          // Per-source-column report (matched/low/unmatched/duplicate +
          // confidence + suggestions) so the wizard never silent-drops.
          columns: headerMapping.columns || [],
        },
        sample: {
          headers: canonical.headers,
          rows: canonical.rows.slice(0, 10),
          totalRows: canonical.rows.length,
        },
        coercion: { issues: issues.slice(0, 50), totalIssues: issues.length },
        diff,
        modes: ['upsert', 'replace', 'append'],
        defaultMode: 'upsert',
      });
    } catch (err) {
      logErr(req, 'wizard_preview', err);
      res.status(err.status || 500).json({ ok: false, error: redactErrorMessage(err) });
    } finally {
      cleanup();
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// POST /commit
//
// Body (JSON): { token, mode: 'upsert'|'replace'|'append', reason?: string }
// ─────────────────────────────────────────────────────────────────
router.post('/commit', requireRole(4), async (req, res) => {
  try {
    const { token, mode = 'upsert', reason = '' } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });
    if (!['upsert', 'replace', 'append'].includes(mode)) {
      return res.status(400).json({ ok: false, error: 'invalid_mode' });
    }
    const entry = consumePreviewToken(token);
    if (!entry) return res.status(410).json({ ok: false, error: 'token_expired_or_used' });

    // Defensive read: stage file lives in OPS-owned 0700 dir, but a parallel
    // disk corruption / TOCTOU swap could land malformed JSON here. Refuse
    // anything that doesn't match the shape we wrote in /preview.
    let stage;
    try {
      stage = JSON.parse(fs.readFileSync(entry.stageFile, 'utf-8'));
    } catch {
      return res.status(400).json({ ok: false, error: 'corrupted_stage_file' });
    }
    if (
      !stage ||
      typeof stage !== 'object' ||
      typeof stage.datasetKey !== 'string' ||
      !Array.isArray(stage.headers) ||
      !Array.isArray(stage.rows)
    ) {
      return res.status(400).json({ ok: false, error: 'invalid_stage_shape' });
    }
    // Hard cap: a 1M-row commit is far above legitimate usage and would OOM
    // the node process. Real IFS dumps run 10K-100K rows; 1M is the sanity rail.
    if (stage.rows.length > 1_000_000) {
      return res.status(413).json({ ok: false, error: 'stage_file_too_large' });
    }
    const dataset = getDataset(stage.datasetKey);
    if (!dataset) return res.status(400).json({ ok: false, error: 'unknown_dataset' });

    const existing = readExisting(dataset);
    const merged = mergeRows({
      existing,
      newCanonical: { headers: stage.headers, rows: stage.rows },
      dataset,
      mode,
    });

    const backupPath = backupDataset(dataset);

    if (dataset.storage.kind === 'js-array-of-arrays') {
      writeDataset(dataset, { headers: merged.headers, rows: merged.rows });
      dispatchShadowWrite(dataset, rowsAsObjects(merged.headers, merged.rows));
    } else {
      writeDataset(dataset, merged);
      dispatchShadowWrite(dataset, merged);
    }

    notifyCacheClear();

    // Cleanup stage file
    try {
      fs.unlinkSync(entry.stageFile);
    } catch {}

    const stats = {
      datasetKey: dataset.key,
      datasetLabel: dataset.label,
      mode,
      rowsImported: stage.rows.length,
      totalAfter:
        dataset.storage.kind === 'js-array-of-arrays' ? merged.rows.length : merged.length,
      backup: backupPath ? path.basename(backupPath) : null,
      file: stage.filename,
      sha256: stage.sourceSha256,
      reason: reason ? String(reason).slice(0, 500) : '',
    };

    pushHistory({ ...stats, by: currentUser(req) });
    audit(
      'IMPORT_COMMIT',
      currentUser(req),
      req.ip || '-',
      `${dataset.key} mode=${mode} rows=${stats.rowsImported} total=${stats.totalAfter} backup=${stats.backup} sha=${stats.sha256?.slice(0, 12)} reason=${stats.reason || '-'}`
    );

    res.json({ ok: true, stats });
  } catch (err) {
    logErr(req, 'wizard_commit', err);
    res.status(err.status || 500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /template/:dataset — blank XLSX template (admin only)
// ─────────────────────────────────────────────────────────────────
router.get('/template/:dataset', requireRole(4), async (req, res) => {
  try {
    const dataset = getDataset(req.params.dataset);
    if (!dataset) return res.status(404).json({ ok: false, error: 'unknown_dataset' });
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Data: header row + one example row of empty cells
    const headers =
      dataset.storage.kind === 'json-array-of-objects'
        ? dataset.canonicalHeaders.map((k) => dataset.prettyLabels?.[k] || k)
        : dataset.canonicalHeaders;
    const dataAoa = [headers, headers.map(() => '')];
    const wsData = XLSX.utils.aoa_to_sheet(dataAoa);
    XLSX.utils.book_append_sheet(wb, wsData, 'Data');

    // Sheet 2 — Instructions
    const instructions = [
      [`${dataset.label} — Import Template`],
      [],
      [`Required columns: ${dataset.requiredHeaders.join(', ')}`],
      [`Natural key (used for upsert): ${dataset.naturalKey.join(' + ')}`],
      [],
      ['Tips:'],
      ['• Do not rename column headers in the Data sheet.'],
      ['• You can remove unused optional columns; required columns must remain.'],
      ['• Numbers may include thousand separators (1,234.56 or 1.234,56) — both are accepted.'],
      ['• Dates may be in dd/mm/yyyy, yyyy-mm-dd, or Excel date format.'],
      ['• Leave a cell blank to keep the existing value (with upsert mode).'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `${dataset.key}_template.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (err) {
    logErr(req, 'wizard_template', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /export/:dataset — current data download (XLSX or CSV)
//
// Query: format=xlsx|csv (default xlsx)
// ─────────────────────────────────────────────────────────────────
router.get('/export/:dataset', requireRole(4), async (req, res) => {
  try {
    const dataset = getDataset(req.params.dataset);
    if (!dataset) return res.status(404).json({ ok: false, error: 'unknown_dataset' });
    const format = (req.query.format || 'xlsx').toString().toLowerCase();

    const existing = readExisting(dataset);
    let headers = [];
    let rows = [];
    if (Array.isArray(existing)) {
      const canon = dataset.canonicalHeaders;
      headers = canon.map((k) => dataset.prettyLabels?.[k] || k);
      rows = existing.map((obj) => canon.map((k) => obj[k] ?? ''));
    } else {
      headers = existing.headers || [];
      rows = existing.rows || [];
    }

    if (format === 'csv') {
      // Reuse the shared CSV writer (BOM + CRLF + injection guard) so wizard
      // exports follow the same rules as Dashboard / quote-history mirrors.
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${dataset.key}_export.csv"`);
      res.send(toCsvDocument([headers, ...rows]));
      return;
    }
    // XLSX export: same formula-injection guard. xlsx writes string cells as
    // type 's' but Excel may still interpret `=...` strings on cell-edit; prefix
    // the leading char with ' so the cell never resolves to a formula.
    const safeRows = rows.map((r) => r.map(safeXlsxCell));
    const safeHeaders = headers.map(safeXlsxCell);
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([safeHeaders, ...safeRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.key}_export.xlsx"`);
    res.send(buf);
  } catch (err) {
    logErr(req, 'wizard_export', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// XLSX export injection guard — mirrors the policy in utils/csvSafe.js
// (which handles the CSV path), but tailored to xlsx's data model. xlsx
// auto-types numbers / null / dates; only string values starting with a
// formula trigger get the text-mode prefix so typed cells survive intact.
function safeXlsxCell(v) {
  if (v == null) return '';
  if (typeof v !== 'string') return v;
  // eslint-disable-next-line no-irregular-whitespace -- pre-existing tech debt: vietnamese whitespace intentional
  if (/^[\s \t\r\n]*[=+\-@]/.test(v)) return "'" + v;
  return v;
}

// ─────────────────────────────────────────────────────────────────
// GET /history?dataset=...&limit=50
// ─────────────────────────────────────────────────────────────────
router.get('/history', requireRole(4), (req, res) => {
  const dataset = req.query.dataset || null;
  const limit = Math.min(Number(req.query.limit) || 50, HISTORY_MAX);
  let items = _history;
  if (dataset) items = items.filter((h) => h.datasetKey === dataset);
  res.json({ ok: true, items: items.slice(0, limit) });
});

// ─────────────────────────────────────────────────────────────────
// GET /backups/:dataset — list backup files
// ─────────────────────────────────────────────────────────────────
router.get('/backups/:dataset', requireRole(4), (req, res) => {
  try {
    const dataset = getDataset(req.params.dataset);
    if (!dataset) return res.status(404).json({ ok: false, error: 'unknown_dataset' });
    const backups = listBackups(dataset);
    res.json({ ok: true, dataset: dataset.key, backups });
  } catch (err) {
    logErr(req, 'wizard_backups', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /restore { dataset, file }
// ─────────────────────────────────────────────────────────────────
router.post('/restore', requireRole(4), (req, res) => {
  try {
    const { dataset: datasetKey, file } = req.body || {};
    if (!datasetKey || !file) return res.status(400).json({ ok: false, error: 'missing_params' });
    const dataset = getDataset(datasetKey);
    if (!dataset) return res.status(404).json({ ok: false, error: 'unknown_dataset' });
    // Path traversal guard: backup must live in dataset's folder, must
    // match the backup naming pattern.
    if (path.basename(file) !== file)
      return res.status(400).json({ ok: false, error: 'invalid_file' });
    const target = datasetFilePath(dataset);
    const ext = path.extname(target);
    const base = path.basename(target, ext);
    const re = new RegExp(`^${base}_backup_\\d{15}${ext.replace('.', '\\.')}$`);
    if (!re.test(file)) return res.status(400).json({ ok: false, error: 'invalid_file_pattern' });
    const backupFull = path.join(path.dirname(target), file);
    if (!fs.existsSync(backupFull))
      return res.status(404).json({ ok: false, error: 'backup_not_found' });

    // Backup CURRENT before overwriting (safety net for accidental restore)
    const safeBackup = backupDataset(dataset);
    fs.copyFileSync(backupFull, target);
    notifyCacheClear();

    // Refresh shadow store from the restored file
    const restored = readExisting(dataset);
    if (Array.isArray(restored)) {
      dispatchShadowClear(dataset);
      dispatchShadowWrite(dataset, restored);
    } else {
      dispatchShadowClear(dataset);
      dispatchShadowWrite(dataset, rowsAsObjects(restored.headers, restored.rows));
    }

    pushHistory({
      datasetKey: dataset.key,
      datasetLabel: dataset.label,
      mode: 'restore',
      restoredFrom: file,
      backup: safeBackup ? path.basename(safeBackup) : null,
      by: currentUser(req),
    });
    audit(
      'IMPORT_RESTORE',
      currentUser(req),
      req.ip || '-',
      `${dataset.key} from=${file} pre-backup=${safeBackup ? path.basename(safeBackup) : '-'}`
    );

    res.json({
      ok: true,
      restoredFrom: file,
      preBackup: safeBackup ? path.basename(safeBackup) : null,
    });
  } catch (err) {
    logErr(req, 'wizard_restore', err);
    res.status(500).json({ ok: false, error: redactErrorMessage(err) });
  }
});

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

function safeJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function currentUser(req) {
  return req.user?.user?.username || req.user?.username || '-';
}

export default router;
