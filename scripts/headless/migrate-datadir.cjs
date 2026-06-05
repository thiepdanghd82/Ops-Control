/*
 * migrate-datadir.cjs — copy the embedded-app DATA_DIR into the headless
 * SERVER's system DATA_DIR, then VERIFY the copy is faithful. Run via the
 * installed app's Electron in ELECTRON_RUN_AS_NODE mode (cross-OS):
 *
 *   set/export ELECTRON_RUN_AS_NODE=1
 *   "<app electron>" migrate-datadir.cjs <oldDataDir> <newDataDir> [appDir]
 *
 * PRE-CONDITION: the old app SERVER must be fully STOPPED (no open SQLite
 * handle) — the caller confirms this with the operator first.
 *
 * Safety:
 *   • Refuses to clobber a destination that already has ops.db (would destroy
 *     daemon data) → exit 3.
 *   • Copies the WHOLE dir (incl ops.db-wal / -shm) so WAL state is preserved.
 *   • Verifies every source file has a byte-identical (sha256) copy → exit 4 on
 *     any mismatch. A faithful byte copy guarantees row counts match.
 *   • Bonus: if better-sqlite3 loads from the app, prints + checks headline
 *     table row counts (old == new) → exit 5 on mismatch.
 *   • Prints "MIGRATE-OK" + exit 0 only when copy + verify both pass.
 */
'use strict';
/* global process, console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const oldDir = process.argv[2];
const newDir = process.argv[3];
const appDir = process.argv[4] || '';

if (!oldDir || !newDir) {
  console.error('usage: migrate-datadir.cjs <oldDataDir> <newDataDir> [appDir]');
  process.exit(1);
}
if (!fs.existsSync(path.join(oldDir, 'ops.db'))) {
  console.error('OLD DATA_DIR khong co ops.db: ' + oldDir);
  process.exit(2);
}
if (fs.existsSync(path.join(newDir, 'ops.db'))) {
  console.error('DICH da co ops.db: ' + newDir);
  console.error('Khong ghi de de tranh mat du lieu daemon hien co. Di chuyen/xoa dich roi chay lai.');
  process.exit(3);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// 1) Copy recursively (preserves ops.db + -wal + -shm + Library/ + Backup/).
fs.mkdirSync(newDir, { recursive: true });
console.log('-> Copy ' + oldDir + '  ->  ' + newDir);
fs.cpSync(oldDir, newDir, { recursive: true });

// 2) Verify faithful copy (authoritative).
const files = walk(oldDir);
let mismatch = 0;
let bytes = 0;
for (const f of files) {
  const rel = path.relative(oldDir, f);
  const dst = path.join(newDir, rel);
  if (!fs.existsSync(dst)) {
    console.error('  THIEU: ' + rel);
    mismatch++;
    continue;
  }
  bytes += fs.statSync(f).size;
  if (sha256(f) !== sha256(dst)) {
    console.error('  KHAC noi dung: ' + rel);
    mismatch++;
  }
}
console.log('   ' + files.length + ' file, ' + (bytes / 1048576).toFixed(1) + ' MB; sai khac: ' + mismatch);
if (mismatch > 0) {
  console.error('VERIFY FAIL: copy khong khop. KHONG dung lam authoritative.');
  process.exit(4);
}

// 3) Bonus: sqlite headline row counts (best-effort, không bắt buộc).
try {
  let Database = null;
  if (appDir) {
    // better-sqlite3 lives under different layouts: Windows = <app>/resources/
    // app/node_modules; macOS = <App.app>/Contents/Resources/app/node_modules.
    const cands = [
      path.join(appDir, 'resources', 'app', 'node_modules', 'better-sqlite3'),
      path.join(appDir, 'Contents', 'Resources', 'app', 'node_modules', 'better-sqlite3'),
      path.join(appDir, 'app', 'node_modules', 'better-sqlite3'),
      path.join(appDir, 'node_modules', 'better-sqlite3'),
    ];
    for (const c of cands) {
      try {
        Database = require(c);
        break;
      } catch {
        /* try next layout */
      }
    }
  }
  if (Database) {
    const open = (d) => new Database(path.join(d, 'ops.db'), { readonly: true, fileMustExist: true });
    const a = open(oldDir);
    const b = open(newDir);
    const tabs = a
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
    let allOk = true;
    for (const t of tabs) {
      const ca = a.prepare('SELECT COUNT(*) c FROM "' + t + '"').get().c;
      let cb = -1;
      try {
        cb = b.prepare('SELECT COUNT(*) c FROM "' + t + '"').get().c;
      } catch {
        /* table missing in copy → mismatch below */
      }
      const ok = ca === cb;
      if (!ok) allOk = false;
      if (!ok || ['quotes', 'users', 'audit_log'].includes(t)) {
        console.log('   row ' + t + ': ' + ca + (ok ? ' == ' : ' != ') + cb);
      }
    }
    a.close();
    b.close();
    if (!allOk) {
      console.error('VERIFY FAIL: row counts khong khop.');
      process.exit(5);
    }
    console.log('   row-count verify OK (' + tabs.length + ' bang).');
  } else {
    console.log('   (bo qua row-count: khong nap duoc better-sqlite3 — checksum da chung minh copy faithful)');
  }
} catch (e) {
  console.log('   (row-count optional loi: ' + e.message + ' — checksum verify da PASS)');
}

console.log('MIGRATE-OK');
