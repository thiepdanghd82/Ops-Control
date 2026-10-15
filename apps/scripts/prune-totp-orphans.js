#!/usr/bin/env node
/**
 * prune-totp-orphans — remove TOTP seeds whose account no longer exists.
 *
 * Deleting a user used to leave their seed in totp_secrets.enc (fixed
 * 2026-10-15: DELETE /api/auth/users/:id now removes it). A leftover seed
 * inflates the boot probe's "enrolled" count and would be a ready second
 * factor for anyone who re-creates that username. The server only reports
 * them at boot ("TOTP seed(s) with no account: …"); this script removes them.
 *
 *   npm run prune-totp-orphans               dry run: list orphans, change nothing
 *   npm run prune-totp-orphans -- --apply    back up totp_secrets.enc, then remove
 *
 * Needs the same OPS_TOTP_KEY and DATA_DIR as the server (from the
 * environment or .env — for the desktop app pass its userData .env, e.g.
 * `node --env-file=<userData>/.env`). Run it with the server STOPPED: the
 * server rewrites the file on its own TOTP changes. Matching is
 * case-insensitive, like the server's own seed lookups. Never prints a seed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env beside the package when packaged/deployed; repo root when run from
// apps/scripts. Variables already in the environment win.
const ENV_CANDIDATES = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
];

export async function main(argv = process.argv.slice(2), log = console.log) {
  dotenv.config({
    path: ENV_CANDIDATES.find((p) => fs.existsSync(p)) || ENV_CANDIDATES[0],
    quiet: true,
  });
  let dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'server', 'data');
  if (!path.isAbsolute(dataDir)) dataDir = path.resolve(path.join(__dirname, '..'), dataDir);
  process.env.DATA_DIR = dataDir; // the audit store resolves ops.db from it

  const auth = await import('../server/services/authService.js');
  auth.init(dataDir);
  const apply = argv.includes('--apply');
  const secretsFile = path.join(dataDir, 'Library', 'Users', 'totp_secrets.enc');

  log(`DATA_DIR    ${dataDir}`);
  log(`TOTP key fp ${auth.getTotpKeyFingerprint()?.slice(0, 16) || '(no key configured)'}`);
  if (!fs.existsSync(secretsFile)) {
    log('No totp_secrets.enc — nothing to do.');
    return { orphans: [], removed: [] };
  }
  const secrets = auth.loadTotpSecrets();
  if (auth.isTotpSecretsUnavailable(secrets)) {
    throw new Error('totp_secrets.enc cannot be decrypted with this OPS_TOTP_KEY — wrong .env?');
  }
  const orphans = auth.findOrphanTotpUsernames(secrets);
  log(`Seeds       ${Object.keys(secrets).length} (${orphans.length} with no account)`);
  for (const name of orphans) log(`  orphan    ${name}`);
  if (!orphans.length || !apply) {
    if (orphans.length) log('Dry run — re-run with --apply to remove them.');
    return { orphans, removed: [] };
  }

  const backup = `${secretsFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(secretsFile, backup);
  fs.chmodSync(backup, 0o600);
  log(`Backup      ${backup}`);
  const removed = await auth.removeTotpSecrets(orphans);
  log(`Removed     ${removed.join(', ')}`);
  try {
    // SQLite audit only: authService.audit() would also rewrite the legacy
    // audit_log.json from this process's empty in-memory ring.
    const { appendAudit } = await import('../server/repositories/auditStore.js');
    appendAudit({
      ts: new Date().toISOString(),
      event: 'TOTP_ORPHAN_PRUNE',
      user: 'prune-totp-orphans',
      ip: '-',
      detail: removed.join(', '),
    });
  } catch (e) {
    log(`(audit row not written: ${e.message})`);
  }
  return { orphans, removed };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`prune-totp-orphans: ${e.message}`);
      process.exit(1);
    });
}
