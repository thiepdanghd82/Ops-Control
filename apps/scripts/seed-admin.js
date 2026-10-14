#!/usr/bin/env node
// @ts-check
/**
 * seed-admin.js — picks up `pending-admin-seed.json` written by the
 * v1.3 setup wizard and creates the corresponding sys user via the
 * authService updateUsers() race-safe wrapper.
 *
 * Idempotent: deletes the seed file after success. If the file
 * doesn't exist, exits 0 (nothing to do).
 *
 * Triggered automatically from `server/index.js` boot path (with the
 * server's resolved DATA_DIR); can also be run manually:
 *   DATA_DIR=<data dir> node apps/scripts/seed-admin.js [seed-file-path]
 * The seed defaults to <DATA_DIR>/../pending-admin-seed.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { init, updateUsers, bcryptHash } from '../server/services/authService.js';

// The desktop wizard writes the seed to <userData>/pending-admin-seed.json and
// the embedded server runs with DATA_DIR = <userData>/data, so the seed sits
// next to DATA_DIR. OPS_USER_SEED (or argv[2]) overrides.
function defaultSeedPath() {
  if (process.env.OPS_USER_SEED) return process.env.OPS_USER_SEED;
  if (!process.env.DATA_DIR) return null;
  return path.join(path.dirname(path.resolve(process.env.DATA_DIR)), 'pending-admin-seed.json');
}

async function main() {
  const seedPath = process.argv[2] || defaultSeedPath();
  if (!seedPath || !fs.existsSync(seedPath)) {
    console.log(`[seed-admin] no seed file at ${seedPath} — nothing to do`);
    return;
  }

  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (e) {
    console.error(`[seed-admin] seed file unreadable:`, e.message);
    process.exit(1);
  }

  const username = String(seed.username || '').trim();
  const password = String(seed.password || '');
  if (!username || password.length < 12) {
    console.error('[seed-admin] seed missing username or password (min 12 chars) — skipping');
    return;
  }

  // authService resolves users.json from init(DATA_DIR). Without it the path is
  // relative and users.json lands in the process cwd (inside the app bundle).
  if (!process.env.DATA_DIR) {
    console.error(
      '[seed-admin] DATA_DIR not set — refusing to write users.json outside the data dir'
    );
    process.exit(1);
  }
  init(path.resolve(process.env.DATA_DIR));

  // Hash outside the lock — argon2 is CPU heavy.
  const hash = await bcryptHash(password);
  if (!hash) {
    console.error('[seed-admin] password hash failed — argon2 + bcryptjs both unavailable?');
    process.exit(1);
  }

  let outcome = 'created';
  await updateUsers(async (users) => {
    const exists = users.find((u) => u.username?.toLowerCase() === username.toLowerCase());
    if (exists) {
      // Reset existing record to sys role with the new password.
      Object.assign(exists, {
        role: 'sys',
        pwd_bcrypt: hash,
        must_change_password: false,
      });
      delete exists.pwd;
      delete exists.deleted_at;
      outcome = 'reset';
      return;
    }
    const nextId = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0) + 1;
    users.push({
      id: nextId,
      username,
      role: 'sys',
      pwd_bcrypt: hash,
      created_at: new Date().toISOString(),
      must_change_password: false,
    });
  });

  // Wipe the seed file so the next boot is a no-op.
  try {
    fs.unlinkSync(seedPath);
  } catch {
    /* leave for ops to clean if perms refused */
  }

  console.log(`[seed-admin] sys user "${username}" ${outcome}. Seed file removed.`);
}

main().catch((e) => {
  console.error('[seed-admin] fatal:', e);
  process.exit(1);
});
