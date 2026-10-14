/**
 * seed-admin.js run as the server runs it: a child process with DATA_DIR in
 * env, in a cwd that is NOT the data dir (the packaged app runs it from inside
 * the .app bundle). Guards the two bugs fixed on 2026-10-14:
 *   - the seed was looked up in ~/Library/Application Support/Ops Control/,
 *     never where the desktop wizard writes it (<userData>/pending-admin-seed.json);
 *   - authService.init() was never called, so users.json was written to cwd.
 *
 * Runner: node --test apps/scripts/seed-admin.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-admin.js');
const PASSWORD = 'Seed-Test-pass-2026';

function makeUserData({ seed = { username: 'newadmin', password: PASSWORD } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-admin-'));
  const userData = path.join(root, 'userData');
  const dataDir = path.join(userData, 'data');
  const usersDir = path.join(dataDir, 'Library', 'Users');
  fs.mkdirSync(usersDir, { recursive: true });
  fs.writeFileSync(
    path.join(usersDir, 'users.json'),
    JSON.stringify([
      { id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: '$argon2id$keep' },
      { id: 2, username: 'Hana', role: 'admin', pwd_bcrypt: '$argon2id$keep' },
    ])
  );
  const seedPath = path.join(userData, 'pending-admin-seed.json');
  if (seed) fs.writeFileSync(seedPath, JSON.stringify(seed));
  const cwd = path.join(root, 'app-bundle');
  fs.mkdirSync(cwd);
  return { root, dataDir, usersDir, seedPath, cwd };
}

function run(cwd, env, args = []) {
  const childEnv = { ...process.env, ...env };
  delete childEnv.OPS_USER_SEED;
  if (env.DATA_DIR === undefined) delete childEnv.DATA_DIR;
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: childEnv, encoding: 'utf8' });
}

const readUsers = (usersDir) =>
  JSON.parse(fs.readFileSync(path.join(usersDir, 'users.json'), 'utf8'));

test('finds the seed next to DATA_DIR and adds the user to DATA_DIR users.json, not cwd', () => {
  const t = makeUserData();
  const r = run(t.cwd, { DATA_DIR: t.dataDir });
  assert.equal(r.status, 0, r.stderr);
  const users = readUsers(t.usersDir);
  assert.deepEqual(
    users.map((u) => [u.username, u.role]),
    [
      ['Administrator', 'sys'],
      ['Hana', 'admin'],
      ['newadmin', 'sys'],
    ]
  );
  assert.match(users[2].pwd_bcrypt, /^\$(argon2|2[aby]\$)/);
  assert.equal(users[1].pwd_bcrypt, '$argon2id$keep', 'existing users untouched');
  assert.ok(!fs.existsSync(t.seedPath), 'seed (plaintext password) removed');
  assert.deepEqual(fs.readdirSync(t.cwd), [], 'nothing written into cwd');
});

test('refuses to run without DATA_DIR and leaves the seed for a later boot', () => {
  const t = makeUserData();
  const r = run(t.cwd, { DATA_DIR: undefined }, [t.seedPath]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DATA_DIR not set/);
  assert.ok(fs.existsSync(t.seedPath));
  assert.deepEqual(fs.readdirSync(t.cwd), []);
  assert.equal(readUsers(t.usersDir).length, 2);
});

test('no seed file is a no-op', () => {
  const t = makeUserData({ seed: null });
  const r = run(t.cwd, { DATA_DIR: t.dataDir });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing to do/);
  assert.equal(readUsers(t.usersDir).length, 2);
  assert.deepEqual(fs.readdirSync(t.cwd), []);
});
