/**
 * License seat cap counts the users in DATA_DIR (2026-10-15).
 *
 * The seat gate on POST /api/auth/users used to read users.json from
 * server/data beside the code. Inside the packaged app that path is empty,
 * so the count was always 0 and the cap never applied, while
 * /api/license/status (which read DATA_DIR) showed the real number. Both now
 * use authService.countSeatUsers(), and every path that adds a seat-taking
 * user (create, bulk migrate, role change off 'sys') applies the cap — after
 * checking the caller is sys, and never to accounts that take no seat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-seat-gate-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

// Trial license: tier S, 15 seats, no signature needed.
const SEATS = 15;
process.env.OPS_LICENSE_FILE = path.join(tmp, 'license.json');
fs.writeFileSync(
  process.env.OPS_LICENSE_FILE,
  JSON.stringify({
    version: 2,
    isTrial: true,
    tier: 'S',
    max_users: SEATS,
    expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    features: ['costing'],
  })
);

const usersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(usersPath), { recursive: true });
const seedUser = (id, username, role, extra = {}) => ({
  id,
  username,
  role,
  pwd_bcrypt: '$2b$10$dummyBcryptNeverVerified',
  lastPwdChange: new Date().toISOString(),
  permissions: {},
  full_name: username,
  ...extra,
});
// Writes a sys account, `seated` users that take a seat, plus one
// soft-deleted user and one extra sys account that must not count.
function writeUsers(seated) {
  const users = [seedUser(1, 'Administrator', 'sys'), seedUser(2, 'recovery', 'sys')];
  users.push(seedUser(3, 'gone', 'user', { deleted_at: new Date().toISOString() }));
  for (let i = 0; i < seated; i++) users.push(seedUser(10 + i, `seat${i}`, 'user'));
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}
writeUsers(SEATS);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, countSeatUsers, bcryptHash } = await import('../services/authService.js');

let server, baseUrl;
test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));

async function call(method, urlPath, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('countSeatUsers reads DATA_DIR and skips sys and soft-deleted users', () => {
  assert.equal(countSeatUsers(), SEATS);
});

test('creating a user is refused once every seat is taken', async () => {
  writeUsers(SEATS);
  const sys = createSession(1, { totpVerified: true });
  const r = await call('POST', '/api/auth/users', sys, {
    username: 'one-too-many',
    password: 'Seat-Test-Pass-2026!',
  });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'LICENSE_LIMIT_EXCEEDED');
  assert.equal(r.body.active_users, SEATS);
});

test('an anonymous caller is refused as such and learns nothing about seats', async () => {
  writeUsers(SEATS);
  const r = await call('POST', '/api/auth/users', null, {
    username: 'anon',
    password: 'Seat-Test-Pass-2026!',
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.max_users, undefined);
  assert.equal(r.body.active_users, undefined);
});

test('a new sys account takes no seat, so it is allowed when seats are full', async () => {
  writeUsers(SEATS);
  const sys = createSession(1, { totpVerified: true });
  const r = await call('POST', '/api/auth/users', sys, {
    username: 'recovery2',
    password: 'Seat-Test-Pass-2026!',
    role: 'sys',
  });
  assert.equal(r.status, 200);
  assert.equal(countSeatUsers(), SEATS);
});

test('bulk migrate cannot push past the cap and writes nothing when refused', async () => {
  writeUsers(SEATS - 1);
  const sys = createSession(1, { totpVerified: true });
  const before = readUsers().length;
  const r = await call('POST', '/api/auth/migrate-users', sys, {
    users: [
      { username: 'm1', role: 'user' },
      { username: 'm2', role: 'user' },
    ],
  });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'LICENSE_LIMIT_EXCEEDED');
  assert.equal(readUsers().length, before);
  const ok = await call('POST', '/api/auth/migrate-users', sys, {
    users: [
      { username: 'm1', role: 'user' },
      { username: 'm2', role: 'sys' },
    ],
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.added, 2);
  assert.equal(countSeatUsers(), SEATS);
});

test('bulk migrate may fill the last seats exactly', async () => {
  writeUsers(SEATS - 2);
  const sys = createSession(1, { totpVerified: true });
  const r = await call('POST', '/api/auth/migrate-users', sys, {
    users: [
      { username: 'last1', role: 'user' },
      { username: 'last2', role: 'user' },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(countSeatUsers(), SEATS);
});

test('a migrated deleted_at account takes no seat because it cannot sign in', async () => {
  writeUsers(SEATS - 1);
  const sys = createSession(1, { totpVerified: true });
  const password = 'Ghost-Pass-2026!';
  const pwd_bcrypt = await bcryptHash(password);
  const r = await call('POST', '/api/auth/migrate-users', sys, {
    users: [
      { username: 'live', role: 'user', pwd_bcrypt },
      { username: 'ghost', role: 'admin', pwd_bcrypt, deleted_at: '2026-01-01T00:00:00Z' },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(countSeatUsers(), SEATS);
  const live = await call('POST', '/api/auth/login', null, { username: 'live', password });
  assert.equal(live.status, 200, 'control: a migrated active account signs in');
  const ghost = await call('POST', '/api/auth/login', null, { username: 'ghost', password });
  assert.equal(ghost.status, 401);
});

test('a session cannot act as a deleted_at account', async () => {
  writeUsers(SEATS);
  const asGone = createSession(3, { totpVerified: true }); // id 3 is deleted_at
  assert.equal((await call('GET', '/api/auth/me', asGone)).status, 401);
});

test('turning a sys account into a seat-taking role needs a free seat', async () => {
  writeUsers(SEATS);
  const sys = createSession(1, { totpVerified: true });
  const r = await call('PUT', '/api/auth/users/2', sys, { role: 'user' });
  assert.equal(r.status, 402);
  assert.equal(readUsers().find((u) => u.id === 2).role, 'sys');
  writeUsers(SEATS - 1);
  const ok = await call('PUT', '/api/auth/users/2', sys, { role: 'user' });
  assert.equal(ok.status, 200);
  assert.equal(readUsers().find((u) => u.id === 2).role, 'user');
});

test('a free seat lets the user through', async () => {
  writeUsers(SEATS - 1);
  const sys = createSession(1, { totpVerified: true });
  const r = await call('POST', '/api/auth/users', sys, {
    username: 'fits',
    password: 'Seat-Test-Pass-2026!',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});
