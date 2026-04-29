#!/usr/bin/env node
/**
 * backfill-audit-log.js — one-time import of existing audit_log.json
 * into the SQLite audit_log table added in Sprint 30.
 *
 * Pre-Sprint-30 the audit tail was a 500-row in-memory ring buffer
 * persisted to JSON. This script replays every row from the file
 * into SQLite so the migration preserves the full historical tail
 * that existed at cutover time.
 *
 * Idempotent: checks if audit_log table is already populated and
 * bails with a dry-run diff instead of double-inserting. Force with
 * --force-reimport to explicitly ignore + re-append (rare — only
 * if a test env wiped the DB but kept the file).
 *
 * Usage:
 *   node scripts/backfill-audit-log.js                # apply (dry-run if DB has rows)
 *   node scripts/backfill-audit-log.js --dry-run      # preview only
 *   node scripts/backfill-audit-log.js --force-reimport
 *   node scripts/backfill-audit-log.js --file path/to/audit_log.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initSchema } from '../server/db/init.js';
import { bulkAppendAudit, auditRowCount } from '../server/repositories/auditStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(
  __dirname, '..',
  'server', 'data', 'Library', 'Users', 'audit_log.json',
);

function parseArgs(argv) {
  const args = { dryRun: false, forceReimport: false, file: DEFAULT_FILE };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force-reimport') args.forceReimport = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: backfill-audit-log.js [--dry-run] [--force-reimport] [--file path.json]');
      process.exit(0);
    }
  }
  return args;
}

export function readAuditFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error(`Failed to parse ${filePath}: ${err.message}`);
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv);
  // Ensure schema exists before we touch the table.
  initSchema();

  const rows = readAuditFile(args.file);
  const existingCount = auditRowCount();
  console.log(`Audit backfill`);
  console.log(`  Source file:    ${args.file}`);
  console.log(`  File rows:      ${rows.length}`);
  console.log(`  DB existing:    ${existingCount == null ? '(DB unavailable)' : existingCount}`);

  if (rows.length === 0) {
    console.log('\nNothing to backfill — source file empty or missing.');
    return;
  }

  if (existingCount && existingCount > 0 && !args.forceReimport) {
    console.log('\nDB already populated — skipping to avoid duplicates.');
    console.log('Re-run with --force-reimport to ignore this check.');
    return;
  }

  if (args.dryRun) {
    console.log('\n[DRY-RUN] Would insert', rows.length, 'rows. Sample:');
    for (const r of rows.slice(0, 3)) {
      console.log(`  ${r.ts} ${r.event} user=${r.user || '-'} ip=${r.ip || '-'}`);
    }
    return;
  }

  const inserted = bulkAppendAudit(rows);
  console.log(`\nInserted ${inserted} of ${rows.length} rows into audit_log.`);
  const finalCount = auditRowCount();
  console.log(`DB total now: ${finalCount}`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) main().catch(err => { console.error(err); process.exit(1); });
