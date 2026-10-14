#!/usr/bin/env node
/**
 * cleanup-legacy-passwords.js — one-time sweep to drop the plaintext
 * `pwd` field from users.json for every user that already has a
 * `pwd_bcrypt` value. Sprint 8 audit flagged that the legacy
 * `upgradeLegacyPasswordIfNeeded` path only clears `pwd` on the next
 * successful login — users who never log in keep plaintext at rest.
 *
 * Safety:
 *   - Default mode = dry-run (preview only). Apply with --apply.
 *   - NEVER drops `pwd` from a user that lacks `pwd_bcrypt` — that
 *     would lock them out. Such rows are reported separately so the
 *     operator can chase them (disable / force password reset).
 *   - Makes a timestamped backup before writing.
 *
 * Usage:
 *   node scripts/cleanup-legacy-passwords.js              # dry-run
 *   node scripts/cleanup-legacy-passwords.js --apply      # write
 *   node scripts/cleanup-legacy-passwords.js --file path.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '..', 'server', 'data', 'Library', 'Users', 'users.json');

function parseArgs(argv) {
  const args = { apply: false, file: DEFAULT_FILE };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: cleanup-legacy-passwords.js [--apply] [--file path.json]');
      process.exit(0);
    }
  }
  return args;
}

/**
 * Classify each user row. Returns { next, report }.
 *   - cleaned: `pwd` removed (row had both `pwd` + `pwd_bcrypt`)
 *   - clean:   already no `pwd` (nothing to do)
 *   - atRisk:  has plaintext `pwd` but NO `pwd_bcrypt` — we leave
 *              them alone, log as "needs operator action".
 */
export function cleanupUsers(users) {
  if (!Array.isArray(users)) return { next: users, report: { cleaned: [], clean: [], atRisk: [] } };
  const report = { cleaned: [], clean: [], atRisk: [] };
  const next = users.map((u) => {
    if (!u || typeof u !== 'object') return u;
    const hasPwd = typeof u.pwd === 'string' && u.pwd.length > 0;
    const hasBcrypt = typeof u.pwd_bcrypt === 'string' && u.pwd_bcrypt.length > 0;
    if (!hasPwd) {
      report.clean.push(u.username);
      return u;
    }
    if (!hasBcrypt) {
      report.atRisk.push(u.username);
      return u; // leave untouched — don't lock them out
    }
    // Both set: safe to drop plaintext. Preserve everything else.
    const { pwd, ...cleaned } = u; // eslint-disable-line no-unused-vars
    report.cleaned.push(u.username);
    return cleaned;
  });
  return { next, report };
}

function printReport(report, apply) {
  console.log(`${apply ? '' : '[DRY-RUN] '}Legacy password cleanup`);
  console.log(`  Cleaned (had bcrypt, dropped pwd):  ${report.cleaned.length}`);
  console.log(`  Already clean (no pwd field):       ${report.clean.length}`);
  console.log(`  At-risk (pwd only, no bcrypt):      ${report.atRisk.length}`);
  if (report.cleaned.length) {
    console.log(`\n  Cleaned users:`);
    for (const u of report.cleaned) console.log(`    - ${u}`);
  }
  if (report.atRisk.length) {
    console.log(`\n  ⚠️  At-risk users — plaintext pwd but no bcrypt hash. Left untouched.`);
    console.log(`     Action: force password reset OR disable the account.`);
    for (const u of report.atRisk) console.log(`    - ${u}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = fs.readFileSync(args.file, 'utf-8');
  const users = JSON.parse(raw);
  const { next, report } = cleanupUsers(users);
  printReport(report, args.apply);

  if (!args.apply) {
    console.log('\n[DRY-RUN] no file written. Re-run with --apply to persist.');
    return;
  }
  if (report.cleaned.length === 0) {
    console.log('\nNothing to clean. Exit.');
    return;
  }
  const backup = args.file + '.pre-pwd-cleanup-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(args.file, backup);
  console.log(`\nBackup: ${backup}`);
  fs.writeFileSync(args.file + '.tmp', JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(args.file + '.tmp', args.file);
  console.log(`Wrote: ${args.file}`);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli)
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
