/**
 * Legacy data import bridge — copy data từ Ops Control v1.0 sang v1.1.
 *
 * Use case (v1.1 deployment):
 *   User cài fresh DMG → app rỗng. Họ đã có folder data từ Ops Control
 *   v1.0 cũ trên cùng máy (hoặc trên mạng nội bộ). Settings → Import
 *   Legacy Data → chọn folder → tự copy → app sẵn sàng.
 *
 * IPC API:
 *   ops:import.pickFolder()     → mở folder picker, return {path, canceled}
 *   ops:import.scanFolder(path) → scan, return {ok, summary: [{name, files, sizeMB}, ...]}
 *   ops:import.execute(path, options) → copy, return {ok, copied, skipped, errors}
 *
 * Safety:
 *   - Skip Users/ + totp/ + audit_log* (giữ session login + 2FA hiện tại)
 *   - Skip nếu source path KHÔNG phải là folder data hợp lệ
 *     (phải có ít nhất Library/ subfolder)
 *   - Backup userData/ops.db trước khi overwrite
 *   - Yêu cầu app đang KHÔNG có session DB write trong lúc import
 *     (frontend tự lock UI, nhưng backend không enforce)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, dialog, BrowserWindow } = require('electron');

// Subfolders trong Library/ user thường có. Dùng để verify folder pick
// trông GIỐNG data folder thật, tránh user pick nhầm folder bừa.
const EXPECTED_LIBRARY_FOLDERS = [
  'IFS_Inventory', 'MaterialCost', 'MachineProfiles', 'PermissionGroups',
  'QuoteHistory', 'Manufacturing_Structures', 'Routing_Operations',
  'InkCalc', 'Rate', 'PrintArea',
];

// Folder/file KHÔNG copy (để giữ login admin hiện tại + tránh conflict)
const SKIP_PATTERNS = [
  'Users',           // user accounts — current login bị mất nếu overwrite
  'totp',            // TOTP secrets — encrypted với key của system khác
  'audit_log.json',  // audit log — append-only, KHÔNG overwrite
  '.DS_Store',
];

function dirSizeBytes(p) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) total += dirSizeBytes(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  } catch (_) { /* swallow */ }
  return total;
}

function dirFileCount(p) {
  let n = 0;
  try {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      if (entry.isDirectory()) n += dirFileCount(path.join(p, entry.name));
      else if (entry.isFile()) n++;
    }
  } catch (_) { /* swallow */ }
  return n;
}

/**
 * Validate: source path phải là folder, có Library/ subfolder, có ≥3
 * trong số các expected library folder names. Tránh user pick nhầm
 * /Users/Documents hoặc folder khác.
 */
function validateSource(srcPath) {
  if (!srcPath || typeof srcPath !== 'string') {
    return { ok: false, reason: 'no_path' };
  }
  if (!fs.existsSync(srcPath)) {
    return { ok: false, reason: 'path_not_exist' };
  }
  const stat = fs.statSync(srcPath);
  if (!stat.isDirectory()) {
    return { ok: false, reason: 'not_a_directory' };
  }
  const libDir = path.join(srcPath, 'Library');
  if (!fs.existsSync(libDir)) {
    return { ok: false, reason: 'missing_library_subfolder' };
  }
  const found = EXPECTED_LIBRARY_FOLDERS.filter((f) =>
    fs.existsSync(path.join(libDir, f)),
  );
  if (found.length < 3) {
    return {
      ok: false,
      reason: 'unrecognized_data_folder',
      detail: `Expected ≥3 of [${EXPECTED_LIBRARY_FOLDERS.join(', ')}]; found ${found.length}: [${found.join(', ')}]`,
    };
  }
  return { ok: true, libraryFoldersFound: found };
}

/**
 * Scan: liệt kê các folder trong Library/ + ops.db, trả size + file count.
 * Cho UI hiển thị preview trước khi user confirm import.
 */
function scanFolder(srcPath) {
  const v = validateSource(srcPath);
  if (!v.ok) return { ok: false, error: v.reason, detail: v.detail };

  const libDir = path.join(srcPath, 'Library');
  const summary = [];

  for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_PATTERNS.includes(entry.name)) {
      summary.push({
        name: entry.name,
        skip: true,
        reason: 'preserves your current login/2FA',
      });
      continue;
    }
    const fullPath = path.join(libDir, entry.name);
    const sizeBytes = dirSizeBytes(fullPath);
    const files = dirFileCount(fullPath);
    summary.push({
      name: entry.name,
      files,
      sizeBytes,
      sizeMB: +(sizeBytes / 1024 / 1024).toFixed(2),
    });
  }

  // ops.db ở root data/. Quan trọng: verify schema có table `quotes` —
  // nếu thiếu, dashboard sẽ báo "database_shape_mismatch". User pick
  // sai folder (vd backup chỉ chứa chat) thì ta cảnh báo trước import.
  const opsDbPath = path.join(srcPath, 'ops.db');
  let opsDbInfo = null;
  if (fs.existsSync(opsDbPath)) {
    const sz = fs.statSync(opsDbPath).size;
    opsDbInfo = {
      name: 'ops.db',
      sizeBytes: sz,
      sizeMB: +(sz / 1024 / 1024).toFixed(2),
    };

    // Schema validation: peek vào sqlite_master xem có những bảng cốt lõi
    // không. Dùng better-sqlite3 (đã có sẵn trong app).
    try {
      const Database = require('better-sqlite3');
      const db = new Database(opsDbPath, { readonly: true, fileMustExist: true });
      const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
      db.close();
      const tableNames = rows.map((r) => r.name);
      const REQUIRED_TABLES = ['quotes', 'materials', 'ifs_inventory', 'bom', 'routing_operations'];
      const missing = REQUIRED_TABLES.filter((t) => !tableNames.includes(t));
      opsDbInfo.tableCount = tableNames.length;
      opsDbInfo.tables = tableNames;
      opsDbInfo.missingCoreTables = missing;
      opsDbInfo.schemaValid = missing.length === 0;
    } catch (err) {
      opsDbInfo.schemaValid = false;
      opsDbInfo.schemaError = err.message;
    }
  }

  const totalImportBytes = summary.filter((s) => !s.skip).reduce((acc, s) => acc + (s.sizeBytes || 0), 0)
    + (opsDbInfo?.sizeBytes || 0);

  return {
    ok: true,
    sourcePath: srcPath,
    summary,
    opsDbInfo,
    totalImportMB: +(totalImportBytes / 1024 / 1024).toFixed(2),
  };
}

/**
 * Recursive copy. fs.cp() đã có trong Node 16.7+ — bundled trong Electron 33.
 */
async function copyRecursive(src, dest) {
  await fs.promises.cp(src, dest, { recursive: true, force: true, errorOnExist: false });
}

/**
 * Execute import:
 *   1. Re-validate source
 *   2. Backup current userData/ops.db → userData/ops.db.before-import-<ts>
 *   3. Copy Library/* → userData/Library/ (skip SKIP_PATTERNS)
 *   4. Copy ops.db → userData/ops.db (replace)
 *   5. Return summary
 */
async function executeImport(srcPath, _opts = {}) {
  const v = validateSource(srcPath);
  if (!v.ok) return { ok: false, error: v.reason, detail: v.detail };

  const userData = app.getPath('userData');
  const targetData = path.join(userData, 'data');
  const targetLibrary = path.join(targetData, 'Library');
  if (!fs.existsSync(targetData)) fs.mkdirSync(targetData, { recursive: true });
  if (!fs.existsSync(targetLibrary)) fs.mkdirSync(targetLibrary, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = { ok: true, copied: [], skipped: [], errors: [], backupTaken: null };

  // 1. Backup ops.db nếu có
  const targetOpsDb = path.join(targetData, 'ops.db');
  if (fs.existsSync(targetOpsDb)) {
    const bak = path.join(targetData, `ops.db.before-import-${ts}`);
    try {
      fs.copyFileSync(targetOpsDb, bak);
      result.backupTaken = bak;
    } catch (err) {
      result.errors.push({ step: 'backup_ops_db', error: err.message });
    }
  }

  // 2. Copy each Library subfolder (skip SKIP_PATTERNS)
  const srcLibrary = path.join(srcPath, 'Library');
  for (const entry of fs.readdirSync(srcLibrary, { withFileTypes: true })) {
    if (SKIP_PATTERNS.includes(entry.name)) {
      result.skipped.push({ name: entry.name, reason: 'preserve_login' });
      continue;
    }
    const srcSub = path.join(srcLibrary, entry.name);
    const dstSub = path.join(targetLibrary, entry.name);
    try {
      if (entry.isDirectory()) {
        await copyRecursive(srcSub, dstSub);
      } else if (entry.isFile()) {
        await fs.promises.copyFile(srcSub, dstSub);
      }
      result.copied.push({ name: entry.name, type: entry.isDirectory() ? 'folder' : 'file' });
    } catch (err) {
      result.errors.push({ step: `copy_${entry.name}`, error: err.message });
    }
  }

  // 3. Copy ops.db nếu source có
  const srcOpsDb = path.join(srcPath, 'ops.db');
  if (fs.existsSync(srcOpsDb)) {
    try {
      await fs.promises.copyFile(srcOpsDb, targetOpsDb);
      result.copied.push({ name: 'ops.db', type: 'file', sizeBytes: fs.statSync(srcOpsDb).size });
    } catch (err) {
      result.errors.push({ step: 'copy_ops_db', error: err.message });
    }
  }

  result.ok = result.errors.length === 0;
  result.note = 'App restart needed to reload ops.db.';
  return result;
}

function register(ipcMain, log) {
  ipcMain.handle('ops:import.pickFolder', async (evt, opts = {}) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Chọn folder data từ Ops Control v1.0',
      defaultPath: opts.defaultPath || app.getPath('home'),
      properties: ['openDirectory'],
      message: 'Pick folder server/data của bản v1.0 (chứa Library/ + ops.db).',
    });
    if (r.canceled || r.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: r.filePaths[0] };
  });

  ipcMain.handle('ops:import.scanFolder', async (_e, srcPath) => {
    return scanFolder(srcPath);
  });

  ipcMain.handle('ops:import.execute', async (_e, srcPath, opts) => {
    log.info('[import] Executing import from:', srcPath);
    const r = await executeImport(srcPath, opts);
    log.info('[import] Result:', JSON.stringify({
      ok: r.ok, copiedCount: r.copied.length, errors: r.errors.length,
    }));
    return r;
  });
}

module.exports = { register, scanFolder, executeImport, validateSource };
