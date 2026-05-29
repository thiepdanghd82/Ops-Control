#!/usr/bin/env node
/**
 * reset-totp — Safely reset the TOTP secrets file when the encryption
 * key is lost or the file is corrupt. Designed for the incident where
 * OPS_TOTP_KEY changes and totp_secrets.enc becomes undecryptable.
 *
 * What it does:
 *   1. Resolves DATA_DIR (same logic as server/index.js).
 *   2. Prints current file status: exists? version? key fingerprint?
 *   3. Quarantines totp_secrets.enc → totp_secrets.enc.broken-<stamp>
 *      (never deletes — forensics path always preserved).
 *   4. Writes a fresh audit log entry.
 *   5. Prints next-step instructions for re-enrollment.
 *
 * What it does NOT do:
 *   - It never prompts for the old key, never attempts to brute-force
 *     decrypt, never touches users.json (per-user TOTP enrollment flags
 *     live inside the encrypted blob, which is gone after this runs).
 *
 * Usage:
 *   npm run reset-totp              (interactive: confirms before action)
 *   npm run reset-totp -- --force   (non-interactive, CI / runbook)
 *
 * Safety: needs the server to be STOPPED (fresh reads from disk). Running
 *   while the server is live is harmless — next server boot picks up the
 *   reset — but the incident window is cleaner if service is stopped
 *   first. The banner warns you.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env (same path as server/index.js)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ── Resolve DATA_DIR (must mirror server/index.js resolution) ────────
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'server', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname, '..'), DATA_DIR);
}

const SECRETS_PATH = path.join(DATA_DIR, 'Library', 'Users', 'totp_secrets.enc');
const AUDIT_PATH = path.join(DATA_DIR, 'Library', 'audit.log');

function fingerprintHex() {
  const envKey = process.env.OPS_TOTP_KEY || '';
  if (envKey.length < 64) return null;
  const key = Buffer.from(envKey.slice(0, 64), 'hex');
  if (key.length !== 32) return null;
  return crypto
    .createHmac('sha256', key)
    .update('ops-totp-fp-v1')
    .digest()
    .subarray(0, 16)
    .toString('hex');
}

function bold(s) {
  return `\x1b[1m${s}\x1b[0m`;
}
function red(s) {
  return `\x1b[31m${s}\x1b[0m`;
}
function green(s) {
  return `\x1b[32m${s}\x1b[0m`;
}
function dim(s) {
  return `\x1b[90m${s}\x1b[0m`;
}

function ask(question) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      res(ans);
    });
  });
}

async function main() {
  const force = process.argv.includes('--force');

  console.log('');
  console.log(bold('══════════════════════════════════════════════════════════════'));
  console.log(bold('  TOTP SECRETS RESET — Ops Control'));
  console.log(bold('══════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(`  Data dir:       ${dim(DATA_DIR)}`);
  console.log(`  Secrets file:   ${dim(SECRETS_PATH)}`);

  const fp = fingerprintHex();
  console.log(
    `  Key fingerprint:${fp ? ' ' + green(fp.slice(0, 16) + '…') : ' ' + red('(OPS_TOTP_KEY not set or invalid)')}`
  );

  if (!fs.existsSync(SECRETS_PATH)) {
    console.log('');
    console.log(green('  ✓ No totp_secrets.enc present — nothing to reset.'));
    console.log(`    Users with 2FA enabled will re-enroll on next login as usual.`);
    return 0;
  }

  // Read header (safe — metadata only, never decrypts).
  let header = null;
  try {
    const raw = fs.readFileSync(SECRETS_PATH, 'utf-8');
    header = JSON.parse(raw);
  } catch (e) {
    console.log(red(`  ✗ Cannot even parse the file as JSON: ${e.message}`));
  }

  if (header) {
    console.log(`  File version:   ${dim('v' + (header.v || '?'))}`);
    console.log(
      `  File fp:        ${dim(header.fp ? Buffer.from(header.fp, 'base64').toString('hex').slice(0, 16) + '…' : '(v<3, no fp)')}`
    );
    if (header.fp && fp) {
      const fpMatches = Buffer.from(header.fp, 'base64').toString('hex') === fp;
      console.log(`  Key matches:    ${fpMatches ? green('✓ yes') : red('✗ NO — wrong key')}`);
    }
  }

  console.log('');
  console.log(red(bold("  ⚠  Quarantining this file will DESTROY all users' 2FA enrollment.")));
  console.log(
    red(bold('     Every user who had 2FA must re-scan the QR with Google Authenticator.'))
  );
  console.log('');

  if (!force) {
    console.log(`  To proceed without prompting, re-run with ${bold('--force')}.`);
    const ans = await ask(`  Type ${bold('"reset 2fa"')} exactly to confirm: `);
    if (ans.trim().toLowerCase() !== 'reset 2fa') {
      console.log(red('  ✗ Aborted — confirmation not received.'));
      return 1;
    }
  }

  // ── Quarantine (never delete — forensics always recoverable) ─────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = SECRETS_PATH + '.broken-' + stamp;
  fs.renameSync(SECRETS_PATH, quarantinePath);

  // ── Audit log ────────────────────────────────────────────────────
  try {
    const line = `${new Date().toISOString()}\tTOTP_SECRETS_RESET\t-\t-\tcli\tquarantined=${quarantinePath}\tfp=${fp || 'none'}\n`;
    fs.appendFileSync(AUDIT_PATH, line);
  } catch {
    /* audit file might not be initialized; that's fine */
  }

  console.log('');
  console.log(green('  ✓ File quarantined:'));
  console.log(`    ${dim(quarantinePath)}`);
  console.log('');
  console.log(bold('  Next steps:'));
  console.log(
    '   1. Verify .env has a stable OPS_TOTP_KEY (so the NEXT save uses a persistent key).'
  );
  console.log('   2. Restart the server.');
  console.log('   3. Tell admins + sys users to log in (now password-only, no TOTP gate) and');
  console.log('      Settings → Account Control → Setup 2FA → scan new QR.');
  console.log('   4. Enforce 2FA for sys/admin roles in your ops policy.');
  console.log('');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('reset-totp failed:', err);
    process.exit(1);
  });
