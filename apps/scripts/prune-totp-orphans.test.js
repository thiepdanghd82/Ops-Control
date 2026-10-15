/**
 * prune-totp-orphans — dry run lists, --apply backs up then removes only
 * seeds with no account (case-insensitive), never a live user's seed.
 *
 * Runner: node --test apps/scripts/prune-totp-orphans.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-prune-totp-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const usersDir = path.join(tmp, 'Library', 'Users');
fs.mkdirSync(usersDir, { recursive: true });
fs.writeFileSync(
  path.join(usersDir, 'users.json'),
  JSON.stringify([
    { id: 1, username: 'Administrator', role: 'sys' },
    { id: 2, username: 'Hana', role: 'admin' },
  ])
);

const auth = await import('../server/services/authService.js');
auth.init(tmp);
const SEEDS = { Administrator: 'A'.repeat(32), hana: 'B'.repeat(32), ghost: 'C'.repeat(32) };
auth.saveTotpSecrets(SEEDS);
const { main } = await import('./prune-totp-orphans.js');

const secretsFile = path.join(usersDir, 'totp_secrets.enc');
const quiet = () => {};

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('dry run lists the orphan and changes nothing', async () => {
  const before = fs.readFileSync(secretsFile, 'utf8');
  const lines = [];
  const r = await main([], (l) => lines.push(l));
  assert.deepEqual(r.orphans, ['ghost']);
  assert.deepEqual(r.removed, []);
  assert.equal(fs.readFileSync(secretsFile, 'utf8'), before);
  assert.ok(lines.some((l) => l.includes('orphan') && l.includes('ghost')));
  assert.ok(!lines.join('\n').includes(SEEDS.ghost), 'never prints a seed');
});

test('--apply backs up, then removes only the orphan', async () => {
  const before = fs.readFileSync(secretsFile, 'utf8');
  const r = await main(['--apply'], quiet);
  assert.deepEqual(r.removed, ['ghost']);
  const left = auth.loadTotpSecrets();
  assert.deepEqual(Object.keys(left).sort(), ['Administrator', 'hana']);
  assert.equal(left.hana, SEEDS.hana, 'a case-different live user keeps the seed');
  const backups = fs.readdirSync(usersDir).filter((f) => f.startsWith('totp_secrets.enc.bak-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(usersDir, backups[0]), 'utf8'), before);
  assert.equal(fs.statSync(path.join(usersDir, backups[0])).mode & 0o777, 0o600);
});

test('a second run finds nothing to do', async () => {
  const r = await main(['--apply'], quiet);
  assert.deepEqual(r.orphans, []);
});
