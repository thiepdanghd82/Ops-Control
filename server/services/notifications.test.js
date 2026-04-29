/**
 * notifications — queue + digest tests. Exercises real disk IO via a
 * per-test tmp file (OPS_NOTIFICATIONS_FILE override) so enqueue /
 * listPending / markDelivered / buildDigest / runDigest are all
 * tested end-to-end, not just in-memory.
 *   node --test server/services/notifications.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function setupTmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-notifs-'));
  process.env.OPS_NOTIFICATIONS_FILE = path.join(dir, 'pending.json');
  return process.env.OPS_NOTIFICATIONS_FILE;
}

// Dynamically import after env is set so the module doesn't cache an
// earlier path. Each test imports fresh via a cache-bust query.
async function loadModule() {
  return await import(
    './notifications.js?t=' + Date.now() + '_' + Math.random()
  );
}

test('enqueue: stamps id + created_at, persists list', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([]);

  const written = await mod.enqueue([
    { quote_id: 1, quote_label: 'CP-A', action: 'SUBMIT',
      from_status: 'draft', to_status: 'pending_sales',
      actor: 'hana', recipient: 'sonia', recipient_reason: 'sales_mgr' },
  ]);
  assert.equal(written.length, 1);
  assert.equal(written[0].id, 1);
  assert.ok(written[0].created_at);
  const pending = mod.listPendingFor('sonia');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].quote_id, 1);
});

test('enqueue: ids monotonic across calls', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([]);
  await mod.enqueue([{ quote_id: 1, action: 'SUBMIT',
    from_status: 'draft', to_status: 'pending_sales',
    actor: 'hana', recipient: 'sonia' }]);
  const second = await mod.enqueue([
    { quote_id: 2, action: 'SUBMIT', from_status: 'draft',
      to_status: 'pending_sales', actor: 'hana', recipient: 'sonia' },
    { quote_id: 3, action: 'SUBMIT', from_status: 'draft',
      to_status: 'pending_sales', actor: 'hana', recipient: 'sonia' },
  ]);
  assert.deepEqual(second.map(r => r.id), [2, 3]);
});

test('enqueue: empty / invalid input is a no-op', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([]);
  assert.deepEqual(await mod.enqueue(null), []);
  assert.deepEqual(await mod.enqueue([]), []);
  assert.deepEqual(await mod.enqueue([null, undefined]), []);
  assert.equal(mod.listAllPending().length, 0);
});

test('listPendingFor: filters by recipient and excludes delivered', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
    { id: 2, quote_id: 11, recipient: 'felix', created_at: '2026-04-18T09:01:00Z' },
    { id: 3, quote_id: 12, recipient: 'sonia', created_at: '2026-04-18T09:02:00Z',
      delivered_at: '2026-04-18T12:00:00Z' },
  ]);
  assert.equal(mod.listPendingFor('sonia').length, 1);
  assert.equal(mod.listPendingFor('sonia')[0].quote_id, 10);
  assert.equal(mod.listPendingFor('felix').length, 1);
  assert.equal(mod.listPendingFor('unknown').length, 0);
});

test('markDelivered: flips delivered_at, returns update count', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
    { id: 2, quote_id: 11, recipient: 'sonia', created_at: '2026-04-18T09:01:00Z' },
    { id: 3, quote_id: 12, recipient: 'felix', created_at: '2026-04-18T09:02:00Z' },
  ]);
  const n = await mod.markDelivered([1, 3, 999]);
  assert.equal(n, 2);
  assert.equal(mod.listAllPending().length, 1);
  assert.equal(mod.listAllPending()[0].id, 2);
});

test('markDelivered: idempotent — already-delivered entries not double-counted', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia',
      created_at: '2026-04-18T09:00:00Z',
      delivered_at: '2026-04-18T12:00:00Z' },
  ]);
  const n = await mod.markDelivered([1]);
  assert.equal(n, 0);
});

test('buildDigest: groups by recipient, sorted by oldest pending', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T11:00:00Z' },
    { id: 2, quote_id: 11, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
    { id: 3, quote_id: 12, recipient: 'felix', created_at: '2026-04-18T10:00:00Z' },
  ]);
  const d = mod.buildDigest();
  assert.equal(d.length, 2);
  // Oldest recipient first → sonia (09:00 < felix 10:00)
  assert.equal(d[0].recipient, 'sonia');
  assert.equal(d[0].item_count, 2);
  assert.equal(d[0].oldest_created_at, '2026-04-18T09:00:00Z');
  assert.equal(d[1].recipient, 'felix');
});

test('runDigest (dry-run): no webhook → logs + returns delivered_ids=[]', async () => {
  setupTmpFile();
  delete process.env.OPS_NOTIFY_WEBHOOK;
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
  ]);
  const r = await mod.runDigest();
  assert.equal(r.mode, 'dry-run');
  assert.equal(r.digests.length, 1);
  assert.deepEqual(r.delivered_ids, []);
  // Queue must NOT auto-clear in dry-run — nothing was delivered.
  assert.equal(mod.listAllPending().length, 1);
});

test('runDigest: empty queue → mode=empty, no-op', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([]);
  const r = await mod.runDigest();
  assert.equal(r.mode, 'empty');
  assert.equal(r.digests.length, 0);
  assert.deepEqual(r.delivered_ids, []);
});

test('runDigest (webhook): POSTs + reports delivered_ids when 200', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
    { id: 2, quote_id: 11, recipient: 'felix', created_at: '2026-04-18T09:01:00Z' },
  ]);
  // Stub fetch — node --test doesn't have sinon, so replace the global.
  const origFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200 };
  };
  process.env.OPS_NOTIFY_WEBHOOK = 'https://hooks.example/ops-digest';
  try {
    const r = await mod.runDigest();
    assert.equal(r.mode, 'webhook');
    assert.deepEqual(r.delivered_ids.sort((a, b) => a - b), [1, 2]);
    assert.ok(captured);
    assert.equal(captured.url, 'https://hooks.example/ops-digest');
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.type, 'ops-control/approval-digest');
    assert.equal(body.digests.length, 2);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.OPS_NOTIFY_WEBHOOK;
  }
});

test('runDigest (webhook): non-2xx → mode=webhook-failed, no delivered_ids', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
  ]);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  process.env.OPS_NOTIFY_WEBHOOK = 'https://hooks.example/broken';
  try {
    const r = await mod.runDigest();
    assert.equal(r.mode, 'webhook-failed');
    assert.deepEqual(r.delivered_ids, []);
    assert.equal(r.status, 503);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.OPS_NOTIFY_WEBHOOK;
  }
});

test('runDigest (webhook): fetch throws → mode=webhook-failed with error', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
  ]);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ENETDOWN'); };
  process.env.OPS_NOTIFY_WEBHOOK = 'https://hooks.example/network-down';
  try {
    const r = await mod.runDigest();
    assert.equal(r.mode, 'webhook-failed');
    assert.match(r.error, /ENETDOWN/);
    assert.deepEqual(r.delivered_ids, []);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.OPS_NOTIFY_WEBHOOK;
  }
});

// ── Sprint pre-8.3: HMAC webhook signing ──
test('runDigest (webhook, signed): adds X-Ops-Timestamp + X-Ops-Signature headers', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
  ]);
  const origFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200 };
  };
  process.env.OPS_NOTIFY_WEBHOOK = 'https://hooks.example/digest';
  process.env.OPS_NOTIFY_WEBHOOK_SECRET = 'super-secret-key-123';
  try {
    const r = await mod.runDigest();
    assert.equal(r.mode, 'webhook');
    assert.equal(r.signed, true);
    const headers = captured.opts.headers;
    assert.ok(headers['X-Ops-Timestamp']);
    assert.match(headers['X-Ops-Signature'], /^sha256=[0-9a-f]{64}$/);
    // Signature is deterministic given body + secret + timestamp.
    const crypto = await import('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', 'super-secret-key-123')
      .update(headers['X-Ops-Timestamp'] + '.' + captured.opts.body)
      .digest('hex');
    assert.equal(headers['X-Ops-Signature'], expected);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.OPS_NOTIFY_WEBHOOK;
    delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  }
});

test('runDigest (webhook, unsigned): no signature headers when secret unset', async () => {
  setupTmpFile();
  const mod = await loadModule();
  await mod._resetForTests([
    { id: 1, quote_id: 10, recipient: 'sonia', created_at: '2026-04-18T09:00:00Z' },
  ]);
  const origFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200 };
  };
  process.env.OPS_NOTIFY_WEBHOOK = 'https://hooks.example/digest';
  delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  try {
    const r = await mod.runDigest();
    assert.equal(r.mode, 'webhook');
    assert.ok(!r.signed, 'signed flag absent / false');
    const headers = captured.opts.headers;
    assert.equal(headers['X-Ops-Signature'], undefined);
    assert.equal(headers['X-Ops-Timestamp'], undefined);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.OPS_NOTIFY_WEBHOOK;
  }
});

test('verifyWebhookSignature: accepts a freshly signed payload', async () => {
  const mod = await loadModule();
  process.env.OPS_NOTIFY_WEBHOOK_SECRET = 'verify-secret';
  try {
    const body = '{"hello":"world"}';
    const ts = String(Date.now());
    const crypto = await import('crypto');
    const sig = 'sha256=' + crypto.createHmac('sha256', 'verify-secret')
      .update(ts + '.' + body).digest('hex');
    const r = mod.verifyWebhookSignature({ body, timestamp: ts, signature: sig });
    assert.equal(r.ok, true);
  } finally {
    delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  }
});

test('verifyWebhookSignature: rejects wrong signature', async () => {
  const mod = await loadModule();
  process.env.OPS_NOTIFY_WEBHOOK_SECRET = 'verify-secret';
  try {
    const body = '{"hello":"world"}';
    const ts = String(Date.now());
    const r = mod.verifyWebhookSignature({
      body, timestamp: ts, signature: 'sha256=' + '0'.repeat(64),
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /signature-mismatch/);
  } finally {
    delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  }
});

test('verifyWebhookSignature: rejects replay > 5min', async () => {
  const mod = await loadModule();
  process.env.OPS_NOTIFY_WEBHOOK_SECRET = 'verify-secret';
  try {
    const body = '{"hello":"world"}';
    const oldTs = String(Date.now() - 10 * 60 * 1000); // 10min ago
    const crypto = await import('crypto');
    const sig = 'sha256=' + crypto.createHmac('sha256', 'verify-secret')
      .update(oldTs + '.' + body).digest('hex');
    const r = mod.verifyWebhookSignature({ body, timestamp: oldTs, signature: sig });
    assert.equal(r.ok, false);
    assert.match(r.reason, /timestamp/);
  } finally {
    delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  }
});

test('verifyWebhookSignature: rejects when secret unset', async () => {
  const mod = await loadModule();
  delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  const r = mod.verifyWebhookSignature({
    body: '{}', timestamp: String(Date.now()), signature: 'sha256=abc',
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not-configured/);
});

test('verifyWebhookSignature: rejects missing headers', async () => {
  const mod = await loadModule();
  process.env.OPS_NOTIFY_WEBHOOK_SECRET = 'verify-secret';
  try {
    assert.match(mod.verifyWebhookSignature({ body: '{}' }).reason, /missing-headers/);
    assert.match(mod.verifyWebhookSignature({
      body: '{}', timestamp: String(Date.now()),
    }).reason, /missing-headers/);
  } finally {
    delete process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  }
});

test('cap: queue trimmed to OPS_NOTIFICATIONS_CAP after enqueue', async () => {
  setupTmpFile();
  process.env.OPS_NOTIFICATIONS_CAP = '5';
  try {
    const mod = await loadModule();
    await mod._resetForTests([]);
    // Enqueue 8 items — only the last 5 should remain.
    await mod.enqueue(
      Array.from({ length: 8 }, (_, i) => ({
        quote_id: i + 1, action: 'SUBMIT',
        from_status: 'draft', to_status: 'pending_sales',
        actor: 'hana', recipient: 'sonia',
      }))
    );
    assert.equal(mod.listAllPending().length, 5);
    // Oldest 3 evicted.
    assert.deepEqual(
      mod.listAllPending().map(n => n.quote_id).sort((a, b) => a - b),
      [4, 5, 6, 7, 8]
    );
  } finally {
    delete process.env.OPS_NOTIFICATIONS_CAP;
  }
});
