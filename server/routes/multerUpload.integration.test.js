/**
 * Regression guard for the multer bump (2.2.0 → 2.4.0, 2026-09-20).
 *
 * The 2026-09 advisories against multer <=2.2.0 are all DoS-shaped:
 *   GHSA-wc9g-mqfw-jrwm  crafted multipart FIELD NAMES
 *   GHSA-535w-7cp7-47q4  oversized array index in field names
 *   GHSA-qfvm-cv95-jqjf  fd leak on aborted uploads
 * so the thing worth asserting is that a hostile body gets ANSWERED rather
 * than wedging the process, and that the size limit still bites.
 *
 * WHY THIS FILE EXISTS AT ALL: MES-3-FIX-59 deferred the bump because it
 * spans EIGHT multer instances and asked for a hand smoke of each on a DMG.
 * Only ONE of the eight had any multipart coverage (print-area). A hand
 * smoke is also a one-shot — it proves nothing about the NEXT bump. The
 * mount sweep below is the automated half: it will not exercise each route's
 * business logic, but it does catch the realistic breakage from a multer
 * upgrade, which is the middleware failing to construct or changing shape.
 * The business logic is not what a patch bump moves.
 *
 * DATA SAFETY (Lesson 33): DATA_DIR is an mkdtemp, never the live userData.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-multer-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(
  seedUsersPath,
  JSON.stringify(
    [
      {
        id: 1,
        username: 'writer',
        role: 'cost',
        pwd_bcrypt: '$2b$10$dummy',
        lastPwdChange: new Date().toISOString(),
        permissions: {},
        full_name: 'W',
        english_name: 'W',
        id_no: '',
        email: '',
        phone: '',
      },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession } = await import('../services/authService.js');

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
test.after(() => new Promise((resolve) => server.close(resolve)));

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=',
  'base64'
);

/** Build a multipart body whose PARTS are given verbatim — lets a test send
 *  field names no browser would ever produce, which is the attack shape. */
function multipart(parts) {
  const boundary = '----OpsMulterTest' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename != null) head += `; filename="${p.filename}"`;
    head += '\r\n';
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf-8'), Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body));
    chunks.push(Buffer.from('\r\n', 'utf-8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return { body: Buffer.concat(chunks), boundary };
}

async function post(routePath, parts, token) {
  const { body, boundary } = multipart(parts);
  const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${routePath}`, { method: 'POST', headers, body });
  return { status: res.status, text: await res.text().catch(() => '') };
}

// The eight multer-fronted routes, by the config each one uses. Every one is
// `.single(...)` over disk storage; five add a fileFilter, three do not.
const UPLOAD_ROUTES = [
  ['/api/shared/rfq-tracker/attachments/1', 'file'],
  ['/api/shared/machine-technical/printing/import', 'file'],
  ['/api/shared/sample-tracking/attachments/1', 'file'],
  ['/api/shared/print-area/upload', 'artwork'],
  ['/api/backup/upload', 'file'],
  ['/api/import-xlsm', 'file'],
  ['/api/import/inventory', 'file'],
  ['/api/import-wizard/preview', 'file'],
];

test('every upload route refuses an anonymous POST BEFORE multer parses it', async () => {
  // Two things at once, because they fail the same way.
  //
  // (a) Wiring: a multer that fails to construct, or whose middleware
  //     signature moved, shows up here as a 404 or as no answer at all.
  //     This is the eight-route sweep MES-3-FIX-59 asked for, minus the DMG.
  //
  // (b) Ordering: MES-3-FIX-59 deferred the multer bump for three months on
  //     the rationale that all eight instances sat behind a gate. Two did
  //     not -- /api/backup/upload and /api/import-xlsm ran multer FIRST and
  //     checked the session inside the handler, so an unauthenticated caller
  //     made the server spool up to 200 MB (and 50 MB with no rate limit at
  //     all) before being refused. That is exactly the surface the advisories
  //     describe, on a server that listens on 0.0.0.0 for LAN clients.
  //
  // An auth refusal here proves the gate ran before the body was consumed:
  // if multer had gone first, the fileFilter on those two would have rejected
  // a .png with a 500 instead. A new ungated upload route therefore cannot be
  // added quietly -- it lands in `parsedAnyway` and this test names it.
  const parsedAnyway = [];
  for (const [routePath, field] of UPLOAD_ROUTES) {
    const r = await post(routePath, [{ name: field, filename: 't.png', body: PNG_1x1 }], null);
    assert.notEqual(r.status, 404, `${routePath} is not mounted -- multer middleware missing?`);
    if (r.status !== 401 && r.status !== 403) parsedAnyway.push(`${routePath} -> ${r.status}`);
  }
  assert.deepEqual(
    parsedAnyway,
    [],
    'these upload routes answered something other than an auth refusal, which means ' +
      'the body was parsed before the caller was gated: ' +
      parsedAnyway.join(', ')
  );
});

test('a body with hostile field names is answered, not left hanging', async () => {
  // GHSA-wc9g-mqfw-jrwm / GHSA-535w-7cp7-47q4 — the pre-2.3 parser burned
  // CPU on names like these. The assertion is liveness: a reply arrives and
  // the server keeps serving afterwards.
  const token = createSession(1);
  const hostile = [
    { name: 'a'.repeat(4000), body: 'x' },
    { name: 'f[' + '9'.repeat(300) + ']', body: 'x' },
    { name: '['.repeat(500) + ']'.repeat(500), body: 'x' },
    { name: 'artwork', filename: 't.png', contentType: 'image/png', body: PNG_1x1 },
  ];
  const started = Date.now();
  const r = await post('/api/shared/print-area/upload', hostile, token);
  const elapsed = Date.now() - started;

  assert.ok(r.status > 0, 'the request must be answered at all');
  assert.ok(elapsed < 10000, `answered in ${elapsed}ms — a hostile body must not wedge the parser`);

  // And the server is still healthy afterwards — an fd leak or a wedged
  // parser would show up on the very next request (GHSA-qfvm-cv95-jqjf).
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200, 'server must still serve after a hostile upload');
});

test('the fileSize limit still rejects an oversized upload', async () => {
  // print-area caps at OPS_PRINT_AREA_MAX_MB (default 30). If a bump ever
  // silently drops `limits`, this is where it shows.
  const token = createSession(1);
  const tooBig = Buffer.alloc(31 * 1024 * 1024, 0x41);
  const r = await post(
    '/api/shared/print-area/upload',
    [{ name: 'artwork', filename: 'big.png', contentType: 'image/png', body: tooBig }],
    token
  );
  assert.notEqual(r.status, 200, 'an over-limit upload must not be accepted');
});
