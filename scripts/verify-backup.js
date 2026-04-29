#!/usr/bin/env node
/**
 * verify-backup.js — Sprint 13 backup integrity check
 *
 * Audits a backup snapshot to confirm it's actually restorable. Run
 * before every prod-replace operation, and on a cron after every
 * scheduled backup so silent corruption shows up before you need the
 * backup for real.
 *
 * Usage:
 *   node scripts/verify-backup.js                       # Verify the
 *                                                       # default
 *                                                       # backup root
 *   node scripts/verify-backup.js path/to/backup.tar.gz # Specific file
 *   node scripts/verify-backup.js --strict              # Schema-validate
 *                                                       # critical Library
 *                                                       # files inside the
 *                                                       # snapshot
 *
 * Exits 0 = backup OK, 1 = warnings (recoverable), 2 = errors (DO NOT
 * trust this backup). Prints a one-line summary so cron output stays
 * readable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const strictMode = args.includes('--strict');
const target = args.find(a => !a.startsWith('--'));

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); console.error('  ✗ ' + msg); }
function warn(msg) { warnings.push(msg); console.warn('  ⚠ ' + msg); }
function ok(msg)  { console.log('  ✓ ' + msg); }

console.log('');
console.log('  ╔══════════════════════════════════════════════════╗');
console.log('  ║         Ops Control — Backup Verifier            ║');
console.log('  ╚══════════════════════════════════════════════════╝');
console.log('');

// ── 1. Locate backup root ──────────────────────────────────────
let backupRoot = target;
if (!backupRoot) {
  const candidates = [
    path.join(REPO_ROOT, 'Backup & restore'),
    path.join(REPO_ROOT, 'server', 'data', 'Library'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) { backupRoot = c; break; }
  }
}
if (!backupRoot || !fs.existsSync(backupRoot)) {
  err(`Backup root not found. Tried "${target || '(none)'}", default candidates`);
  process.exit(2);
}
ok(`Backup root: ${backupRoot}`);

// ── 2. Detect backup format ──────────────────────────────────
// Two supported shapes:
//   (a) Directory-style — Library/PermissionGroups/groups.json,
//       Library/Rate/rate_sites.json, etc. Used by ./deploy.sh
//       and full-disk snapshots.
//   (b) Single-file snapshot — { _backup_at, quoteHistory, users,
//       permissionGroups, machineProfiles, ... }. Produced by the
//       in-app "Backup now" button and stored under
//       `Backup & restore/Data/manual_<timestamp>.json`.
function findSnapshotFile(root) {
  // Look for a single .json file in `Data/` subfolder (the in-app
  // backup convention) or directly under root.
  const dataDir = path.join(root, 'Data');
  if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      // Newest by mtime — operators care about the most recent snapshot.
      const newest = files
        .map(f => ({ f, m: fs.statSync(path.join(dataDir, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m)[0];
      return path.join(dataDir, newest.f);
    }
  }
  return null;
}

const snapshotFile = findSnapshotFile(backupRoot);
let snapshot = null;
if (snapshotFile) {
  ok(`Snapshot file: ${path.relative(REPO_ROOT, snapshotFile)}`);
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
    if (snapshot._backup_at) {
      const age = (Date.now() - new Date(snapshot._backup_at).getTime()) / 86400000;
      ok(`Snapshot age: ${age.toFixed(1)} day(s) (created ${snapshot._backup_at})`);
      if (age > 30) warn(`Snapshot is older than 30 days — consider taking a fresh one.`);
    }
  } catch (e) {
    err(`Snapshot parse failed: ${e.message}`);
  }
}

const CRITICAL_FILES = [
  'PermissionGroups/groups.json',
  'Users/users.json',
  'Rate/rate_sites.json',
  'MachineProfiles/profiles.json',
  'QuoteHistory/quote_history.json',
];

const SNAPSHOT_KEYS = {
  'quoteHistory':     'QuoteHistory',
  'users':            'Users',
  'permissionGroups': 'PermissionGroups',
  'machineProfiles':  'MachineProfiles',
  'rate':             'Rate',
};

let missing = 0;
if (snapshot) {
  // Snapshot format — verify required top-level keys + non-empty arrays
  for (const [key, label] of Object.entries(SNAPSHOT_KEYS)) {
    const v = snapshot[key];
    if (v == null) {
      warn(`Snapshot missing key: ${key} (${label}) — restore will use defaults`);
    } else if (Array.isArray(v) && v.length === 0) {
      warn(`Snapshot key "${key}" is an empty array`);
    } else if (typeof v === 'object') {
      const count = Array.isArray(v) ? v.length : Object.keys(v).length;
      ok(`${key}: ${count} record(s)`);
    } else {
      ok(`${key}: present (${typeof v})`);
    }
  }
} else {
  // Directory-style backup
  for (const rel of CRITICAL_FILES) {
    const candidates = [
      path.join(backupRoot, rel),
      path.join(backupRoot, 'Library', rel),
      path.join(backupRoot, 'Data', 'Library', rel),
    ];
    const found = candidates.find(p => fs.existsSync(p));
    if (!found) {
      err(`Missing critical file: ${rel}`);
      missing++;
    } else {
      const sz = fs.statSync(found).size;
      if (sz === 0) {
        err(`Critical file is EMPTY: ${rel}`);
        missing++;
      } else {
        ok(`${rel} — ${sz.toLocaleString()} bytes`);
      }
    }
  }
}

// ── 3. JSON parse-ability ─────────────────────────────────────
const JSON_FILES = CRITICAL_FILES.filter(f => f.endsWith('.json'));
for (const rel of JSON_FILES) {
  const candidates = [
    path.join(backupRoot, rel),
    path.join(backupRoot, 'Library', rel),
    path.join(backupRoot, 'Data', 'Library', rel),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) continue;
  try {
    const txt = fs.readFileSync(found, 'utf-8');
    JSON.parse(txt);
  } catch (e) {
    err(`JSON parse failed: ${rel} — ${e.message}`);
  }
}

// ── 4. Strict schema check (--strict only) ────────────────────
if (strictMode) {
  console.log('\n  Strict schema validation:');
  try {
    const { validateRows, permissionGroupSchema, machineProfileSchema, rateRowSchema, safeParseJson } =
      await import('../server/services/librarySchema.js');

    const checks = [
      { rel: 'PermissionGroups/groups.json', schema: permissionGroupSchema, getter: (j) => Array.isArray(j?.groups) ? j.groups : [] },
      { rel: 'MachineProfiles/profiles.json', schema: machineProfileSchema, getter: (j) => Array.isArray(j?.profiles) ? j.profiles : [] },
    ];

    for (const c of checks) {
      const candidates = [
        path.join(backupRoot, c.rel),
        path.join(backupRoot, 'Library', c.rel),
        path.join(backupRoot, 'Data', 'Library', c.rel),
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (!found) continue;
      const raw = safeParseJson(fs.readFileSync(found, 'utf-8'), c.rel);
      const rows = c.getter(raw);
      const result = validateRows(rows, c.schema, { source: c.rel, silent: true });
      if (result.errors.length > 0) {
        warn(`${c.rel}: ${result.errors.length} schema warnings, ${result.dropped} row(s) would be dropped`);
      } else {
        ok(`${c.rel}: ${rows.length} row(s) validate clean`);
      }
    }
  } catch (e) {
    warn(`Schema validation skipped: ${e.message}`);
  }
}

// ── 5. Summary ────────────────────────────────────────────────
console.log('');
console.log('  ══════════════════════════════════════════════');
if (errors.length > 0) {
  console.error(`  ❌  Backup verification FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`);
  console.error(`     DO NOT use this backup for restore.`);
  process.exit(2);
}
if (warnings.length > 0) {
  console.warn(`  ⚠   Backup verification passed with ${warnings.length} warning(s) — review before restore`);
  process.exit(1);
}
ok(`Backup verification PASSED`);
console.log('  ══════════════════════════════════════════════');
