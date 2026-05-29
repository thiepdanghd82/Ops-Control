/**
 * Regression test — updateUsers() is race-safe under concurrent writes.
 *
 * The raw pattern `loadUsers(); mutate; saveUsers(users)` lost updates
 * when two requests raced: both called loadUsers and got snapshot X,
 * each mutated a DIFFERENT field, each called saveUsers with their own
 * copy of X, and whichever wrote last wiped the other's change.
 *
 * With `updateUsers(mutator)` the read-modify-write runs under
 * `withLock('users')`, so parallel calls serialize. This test spins up
 * N concurrent mutators, each writing a distinct field, and asserts
 * every change survives in the final on-disk state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-updateusers-it-'));
process.env.DATA_DIR = tmp;
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
const seedCount = 20;
const seed = Array.from({ length: seedCount }, (_, i) => ({
  id: i + 1,
  username: `user${i + 1}`,
  role: 'cost',
  pwd_bcrypt: '$2b$10$dummy',
  lastPwdChange: new Date().toISOString(),
  permissions: {},
  full_name: '',
  english_name: '',
  id_no: '',
  email: '',
  phone: '',
}));
fs.writeFileSync(seedUsersPath, JSON.stringify(seed, null, 2));

const { init, updateUsers, loadUsers } = await import('./authService.js');
init(tmp);

test('N parallel updateUsers calls each land a distinct field in the final file', async () => {
  // Each call sets `email` on a unique user. Without serialization, the
  // last-writer-wins race would leave only the final writer's change;
  // the others would be clobbered.
  const N = seedCount;
  const writes = Array.from({ length: N }, (_, i) =>
    updateUsers((users) => {
      const u = users.find((x) => x.id === i + 1);
      if (u) u.email = `race-${i + 1}@test`;
    })
  );
  await Promise.all(writes);

  const final = loadUsers();
  for (let i = 0; i < N; i++) {
    const u = final.find((x) => x.id === i + 1);
    assert.equal(
      u?.email,
      `race-${i + 1}@test`,
      `user ${i + 1} lost its concurrent update — race-safety broken`
    );
  }
});

test('updateUsers accepts a mutator that returns a replacement array', async () => {
  // Some mutators find it convenient to swap the whole array (e.g., after
  // filtering). The helper honors a returned array.
  await updateUsers((users) => users.map((u) => ({ ...u, phone: 'replaced' })));
  const after = loadUsers();
  for (const u of after) assert.equal(u.phone, 'replaced');
});

test('updateUsers propagates thrower errors and still releases the lock', async () => {
  await assert.rejects(
    () =>
      updateUsers(() => {
        throw new Error('mutator boom');
      }),
    /mutator boom/
  );
  // Subsequent call must still succeed — lock wasn't left held.
  await updateUsers((users) => {
    users[0].full_name = 'post-boom';
  });
  assert.equal(loadUsers()[0].full_name, 'post-boom');
});
