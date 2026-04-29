/**
 * Regression test — print-area artwork upload survives EXDEV on rename.
 *
 * Context: `fs.renameSync` throws EXDEV when the source path and
 * destination live on different filesystems. On macOS, /tmp is on the
 * system data volume while a dev's repo can be on a separate Data
 * volume, so the original upload handler 500'd ("internal_error") on
 * every real user's first artwork upload. Fix: co-locate tmp dir with
 * the data dir AND keep a copy-then-unlink fallback for admins who
 * override OPS_PRINT_AREA_TMPDIR to a path on another disk.
 *
 * This test monkey-patches `fs.renameSync` to ALWAYS throw EXDEV and
 * asserts the handler still produces a persisted artwork file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-pa-upload-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(seedUsersPath, JSON.stringify([{
  id: 1, username: 'writer', role: 'cost',
  pwd_bcrypt: '$2b$10$dummy', lastPwdChange: new Date().toISOString(),
  permissions: {}, full_name: 'W', english_name: 'W', id_no: '', email: '', phone: '',
}], null, 2));

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession } = await import('../services/authService.js');

let server, baseUrl;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => new Promise((resolve) => server.close(resolve)));

// A minimal valid 1×1 PNG (67 bytes) — passes the magic-byte check
// so the handler proceeds to the rename step where the test bites.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=',
  'base64',
);

async function uploadPng(token) {
  const boundary = '----OpsPATestBoundary' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="artwork"; filename="t.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`,
    'utf-8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
  const body = Buffer.concat([head, PNG_1x1, tail]);
  const res = await fetch(`${baseUrl}/api/shared/print-area/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('upload succeeds under normal conditions (baseline)', async () => {
  const token = createSession(1);
  const r = await uploadPng(token);
  assert.equal(r.status, 200, `body: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.ok, true);
  assert.ok(r.body.artwork_file, 'artwork_file path returned');
  // File actually on disk.
  const finalPath = path.join(tmp, r.body.artwork_file);
  assert.ok(fs.existsSync(finalPath), `expected ${finalPath} to exist`);
});

test('upload falls back to copy+unlink when renameSync throws EXDEV', async () => {
  const token = createSession(1);
  // Patch renameSync ONLY for paths containing our artworks dir —
  // don't break unrelated rename calls the Express stack might make.
  const realRename = fs.renameSync;
  fs.renameSync = function patched(src, dest) {
    if (typeof dest === 'string' && dest.includes('PrintArea/artworks')) {
      const err = new Error('EXDEV: cross-device link not permitted, rename');
      err.code = 'EXDEV';
      throw err;
    }
    return realRename.apply(this, arguments);
  };
  try {
    const r = await uploadPng(token);
    assert.equal(r.status, 200, `EXDEV must be handled transparently; body: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, true);
    const finalPath = path.join(tmp, r.body.artwork_file);
    assert.ok(fs.existsSync(finalPath),
      `fallback copy must land at ${finalPath} after rename refuses`);
  } finally {
    fs.renameSync = realRename;
  }
});

test('safeError surfaces EXDEV via the new `cross_device_move` bucket', async () => {
  const { redactErrorMessage } = await import('../utils/safeError.js');
  const err = new Error('EXDEV: cross-device link not permitted, rename /tmp/a.png -> /vol/b.png');
  assert.equal(redactErrorMessage(err), 'cross_device_move',
    'future EXDEV 500s must surface an actionable bucket, not internal_error');
});
