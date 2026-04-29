/**
 * recover-sys-user.js — emergency console-only recovery.
 *
 * Sprint 1.7 audit §3 (Disaster Recovery — "all admin users lose access").
 *
 * Scenario this fixes:
 *   - All sys + admin users are deactivated, deleted, or have lost their
 *     passwords (& 2FA, if applicable). The web UI has no way to mint a
 *     new sys user without an existing sys session — chicken-and-egg.
 *   - Required: physical/console access to the server (this script
 *     refuses to run unless the operator types CONFIRM-RECOVER on stdin).
 *
 * What it does:
 *   1. Loads server/data/Library/Users/users.json
 *   2. Either creates a fresh `recovery-sys` user OR resets the password
 *      for an existing user (interactive prompt)
 *   3. Sets role = sys, must_change_password = true, clears any 2FA
 *      (forcing re-enroll on first login)
 *   4. Writes an audit row marking the recovery action
 *
 * Run from the server's working directory:
 *   $ node scripts/recover-sys-user.js
 *
 * SECURITY: this script bypasses every API check. Anyone with shell
 * access to the server data dir can mint a sys user — the only defence
 * is filesystem permissions on users.json (chmod 600) plus the audit
 * row this script writes for forensic trace.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'server', 'data');
const USERS_PATH = path.join(DATA_DIR, 'Library', 'Users', 'users.json');
const AUDIT_PATH = path.join(DATA_DIR, 'Library', 'Users', 'audit_log.json');

function ask(rl, q) {
  return new Promise(resolve => rl.question(q, a => resolve(a.trim())));
}

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return fallback; }
}

function saveJsonAtomic(p, data) {
  const tmp = p + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
  try { fs.chmodSync(p, 0o600); } catch { /* non-POSIX FS */ }
}

function appendAudit(event, actor, detail) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    user: actor,
    ip: 'console',
    detail,
  };
  const log = loadJson(AUDIT_PATH, []);
  log.push(entry);
  // Keep audit log bounded — last 5000 entries.
  while (log.length > 5000) log.shift();
  saveJsonAtomic(AUDIT_PATH, log);
}

function genTempPwd() {
  // 16 chars, no ambiguous glyphs — same alphabet as the in-app
  // Provisioning Card flow so operators get familiar formatting.
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (const b of bytes) out += A[b % A.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

async function main() {
  if (!fs.existsSync(USERS_PATH)) {
    console.error(`✘ users.json not found at ${USERS_PATH}`);
    console.error('  Set DATA_DIR env var if your data lives elsewhere.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Ops Control — Emergency Sys-User Recovery');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Use this ONLY when the web UI cannot mint a sys user');
  console.log('  (eg. all admin/sys accounts are deactivated or lost).');
  console.log('  Every run writes an audit row for forensic trace.');
  console.log('───────────────────────────────────────────────────────────');
  console.log('');

  const confirm = await ask(rl, 'Type CONFIRM-RECOVER to proceed: ');
  if (confirm !== 'CONFIRM-RECOVER') {
    console.log('Aborted (no confirmation token).');
    rl.close();
    process.exit(0);
  }

  const users = loadJson(USERS_PATH, []);
  if (!Array.isArray(users)) {
    console.error('✘ users.json is corrupt (not an array). Restore from backup before proceeding.');
    rl.close();
    process.exit(1);
  }

  const mode = await ask(rl, '\n[1] Reset existing user pwd  [2] Create new "recovery-sys" user\nChoose 1 or 2: ');
  let target;

  if (mode === '1') {
    const username = await ask(rl, 'Existing username to reset: ');
    target = users.find(u => String(u.username).toLowerCase() === username.toLowerCase());
    if (!target) {
      console.error(`✘ User "${username}" not found.`);
      rl.close();
      process.exit(1);
    }
    console.log(`  → Found user id=${target.id}, role=${target.role}`);
    target.role = 'sys';
    if (target.active === false) target.active = true;
    delete target.totp_required; // force re-enroll
  } else if (mode === '2') {
    const baseName = 'recovery-sys';
    let name = baseName;
    let suffix = 1;
    while (users.some(u => u.username.toLowerCase() === name.toLowerCase())) {
      name = `${baseName}-${suffix++}`;
    }
    const newId = (users.reduce((m, u) => Math.max(m, u.id || 0), 0) || 0) + 1;
    target = {
      id: newId,
      username: name,
      role: 'sys',
      lastPwdChange: new Date().toISOString(),
      permissions: { canDeleteQuote: true },
      full_name: 'Emergency Recovery',
      english_name: 'Emergency Recovery',
      id_no: '',
      email: '',
      phone: '',
      modules: { cost: true },
    };
    users.push(target);
    console.log(`  → Created new user "${name}" (id=${newId}, role=sys)`);
  } else {
    console.error('Aborted (invalid choice).');
    rl.close();
    process.exit(1);
  }

  const tempPwd = genTempPwd();
  target.pwd_bcrypt = await bcrypt.hash(tempPwd, 12);
  delete target.pwd; // nuke any legacy reversible hash
  target.lastPwdChange = new Date().toISOString();
  target.must_change_password = true; // SAP/IFS pattern — forced change on login

  saveJsonAtomic(USERS_PATH, users);
  appendAudit('SYS_RECOVERY', target.username, `console recovery; mode=${mode === '1' ? 'reset' : 'create'}`);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RECOVERY COMPLETE — credentials below shown ONCE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Username    : ${target.username}`);
  console.log(`  Temp pwd    : ${tempPwd}`);
  console.log(`  Role        : sys`);
  console.log(`  Force change: yes (must_change_password=true)`);
  console.log(`  2FA         : cleared (will re-enroll on first login)`);
  console.log('───────────────────────────────────────────────────────────');
  console.log('  1. Log in via the web UI with the credentials above');
  console.log('  2. The login screen will FORCE a password change');
  console.log('  3. After login, immediately rotate any compromised');
  console.log('     accounts via Settings → Account Control');
  console.log('  4. Audit row "SYS_RECOVERY" recorded — review weekly');
  console.log('═══════════════════════════════════════════════════════════');

  rl.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
