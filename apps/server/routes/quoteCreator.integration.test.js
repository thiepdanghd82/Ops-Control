/**
 * Who created a quote (2026-10-02), through the real routes:
 *
 *   - POST  /api/quotes          stamps the session user as created_by, whatever the body says
 *   - PATCH /api/quotes/:id      cannot change it
 *   - GET   /api/shared/quotes   fills it for a quote saved before the field existed, from
 *                                the QUOTE_SAVE row POST wrote when that quote was created
 *
 * Harness mirrors costApi.audit.integration.test.js: temp DATA_DIR + ephemeral
 * port + a Bearer session that skips the TOTP flow.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-quote-creator-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_EXPORT_HMAC_KEY ||= 'a'.repeat(64);

fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  JSON.stringify(
    [
      {
        id: 1,
        username: 'tester',
        role: 'cost',
        pwd: 'x',
        pwd_bcrypt: '$2b$10$test',
        approval_roles: [],
      },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { createSession } = await import('../services/authService.js');
const { upsertQuote, getQuoteById } = await import('../repositories/quotesStore.js');
const { appendAudit } = await import('../repositories/auditStore.js');

let server, baseUrl;
const token = createSession(1, { totpVerified: true });

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

function h() {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function postQuote(body) {
  const r = await fetch(`${baseUrl}/api/quotes`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200, `POST /api/quotes: ${r.status} ${await r.clone().text()}`);
  return (await r.json()).quote;
}

async function listed(id) {
  const r = await fetch(`${baseUrl}/api/shared/quotes`, { headers: h() });
  assert.equal(r.status, 200);
  return (await r.json()).find((q) => q.id === id);
}

test('POST stamps the session user as the creator, whatever the body says', async () => {
  const quote = await postQuote({
    type: 'standard',
    label: 'C-1',
    state: { rfq_number: 'C-1', site: 'VN' },
    result: {},
    created_by: 'mallory',
  });
  assert.equal(quote.created_by, 'tester');
  assert.equal((await listed(quote.id)).created_by, 'tester');
});

test('PATCH cannot change the creator', async () => {
  const quote = await postQuote({
    type: 'standard',
    label: 'C-2',
    state: { rfq_number: 'C-2', site: 'VN' },
    result: {},
  });
  const r = await fetch(`${baseUrl}/api/quotes/${quote.id}`, {
    method: 'PATCH',
    headers: h(),
    body: JSON.stringify({
      type: 'standard',
      state: { rfq_number: 'C-2b', site: 'VN' },
      result: {},
      created_by: 'mallory',
    }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  const saved = (await r.json()).quote;
  assert.equal(saved.state.rfq_number, 'C-2b', 'the update itself went through');
  assert.equal(saved.created_by, 'tester');
  assert.equal((await listed(quote.id)).created_by, 'tester');
});

test('a quote saved before created_by existed takes its creator from the audit log', async () => {
  // Written straight through the store, the way every quote was saved before 2026-10-02.
  const legacy = await upsertQuote({
    type: 'standard',
    state: { rfq_number: 'OLD-1', site: 'VN' },
  });
  assert.equal(legacy.created_by, undefined);
  appendAudit({
    ts: new Date().toISOString(),
    event: 'QUOTE_SAVE',
    user: 'olduser',
    ip: '-',
    detail: JSON.stringify({ id: legacy.id, version: 1, type: 'standard', is_new: true }),
  });

  assert.equal((await listed(legacy.id)).created_by, 'olduser');
  const one = await fetch(`${baseUrl}/api/shared/quotes/${legacy.id}`, { headers: h() });
  assert.equal((await one.json()).created_by, 'olduser');
  // Derived on read; the stored row is left as it was saved.
  assert.equal(getQuoteById(legacy.id).created_by, undefined);
});

test('a quote with no creation record stays without a creator', async () => {
  const legacy = await upsertQuote({
    type: 'standard',
    state: { rfq_number: 'OLD-2', site: 'VN' },
  });
  assert.equal((await listed(legacy.id)).created_by, undefined);
});
