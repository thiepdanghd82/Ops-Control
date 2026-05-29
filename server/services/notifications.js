/**
 * notifications — approval-chain notification queue.
 *
 * Sprint 6.6. Scope: persist a pending-notification record each time
 * an approval transition creates work for another user, expose a
 * list/ack API, and render a digest that either logs (dry-run) or
 * POSTs to an `OPS_NOTIFY_WEBHOOK` URL. No nodemailer / SMTP dep —
 * CCL's ops layer can bridge the webhook to email, Slack, or Teams.
 *
 * Data model (one record per recipient, per transition):
 *   {
 *     id: number,                     // monotonically increasing
 *     created_at: ISO string,
 *     quote_id: number,
 *     quote_label: string,            // CCL PN or RFQ number at time of enqueue
 *     action: 'SUBMIT'|'APPROVE_SALES'|'APPROVE_FINANCE'|'REJECT'|'REVOKE',
 *     from_status: string,
 *     to_status: string,
 *     actor: string,                  // who triggered the transition
 *     reason?: string,                // REJECT only
 *     recipient: string,              // target username
 *     recipient_reason: string,       // why they're being notified (role-ish)
 *     delivered_at?: ISO string,      // stamp once the digest ships it
 *   }
 *
 * Persistence: `server/data/Library/Notifications/pending.json`.
 * Atomic writes via `atomicWriteFileSync`. All mutations go through
 * the in-process lock keyed 'notifications' to serialize concurrent
 * enqueues (transition endpoint + manual inspection).
 *
 * Never throws upstream — notify failures must not roll back an
 * approval transition (the approval is authoritative; notifications
 * are best-effort).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteFileSync } from './atomicWrite.js';
import { withLock } from '../utils/asyncLock.js';
import { getDataDir } from './authService.js';

const LOCK_KEY = 'notifications';

function notificationsPath() {
  // Test escape hatch: tests set OPS_NOTIFICATIONS_FILE so they can
  // exercise the real disk I/O against a tmp file instead of
  // touching production data. No harm in prod — env var is unset.
  const override = process.env.OPS_NOTIFICATIONS_FILE;
  if (override) {
    try {
      fs.mkdirSync(path.dirname(override), { recursive: true });
    } catch {
      /* noop */
    }
    return override;
  }
  const dir = path.join(getDataDir(), 'Library', 'Notifications');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* already exists */
  }
  return path.join(dir, 'pending.json');
}

function readSync() {
  const p = notificationsPath();
  try {
    if (!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSync(list) {
  atomicWriteFileSync(notificationsPath(), JSON.stringify(list, null, 2));
}

function nextId(list) {
  let max = 0;
  for (const n of list) {
    if (n && typeof n.id === 'number' && n.id > max) max = n.id;
  }
  return max + 1;
}

/**
 * Append `records` to the queue atomically. `records` is an array of
 * partial notification shapes; this function stamps `id` + `created_at`.
 * Returns the list of records as written (with ids). Empty array input
 * is a no-op.
 */
export async function enqueue(records) {
  if (!Array.isArray(records) || records.length === 0) return [];
  return withLock(LOCK_KEY, async () => {
    const list = readSync();
    const now = new Date().toISOString();
    const written = [];
    let id = nextId(list);
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      const rec = {
        id: id++,
        created_at: now,
        quote_id: r.quote_id,
        quote_label: r.quote_label || '',
        action: r.action,
        from_status: r.from_status,
        to_status: r.to_status,
        actor: r.actor,
        ...(r.reason ? { reason: r.reason } : {}),
        recipient: r.recipient,
        recipient_reason: r.recipient_reason || '',
      };
      list.push(rec);
      written.push(rec);
    }
    // Cap queue to the last 2,000 entries so a runaway producer
    // doesn't balloon the JSON file. Ops team can change cap via env
    // if they need more.
    const CAP = parseInt(process.env.OPS_NOTIFICATIONS_CAP || '2000', 10);
    if (list.length > CAP) list.splice(0, list.length - CAP);
    writeSync(list);
    return written;
  });
}

/**
 * List pending (not yet delivered) notifications for a username.
 * Caller is the UI or the digest runner.
 */
export function listPendingFor(username) {
  const list = readSync();
  return list.filter((n) => n && n.recipient === username && !n.delivered_at);
}

/**
 * List ALL pending notifications (delivered_at missing). Used by
 * digest runner + admin review.
 */
export function listAllPending() {
  const list = readSync();
  return list.filter((n) => n && !n.delivered_at);
}

/**
 * Mark a set of notification ids as delivered and persist. Returns
 * the count actually updated.
 */
export async function markDelivered(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const idSet = new Set(ids);
  return withLock(LOCK_KEY, async () => {
    const list = readSync();
    const now = new Date().toISOString();
    let n = 0;
    for (const rec of list) {
      if (rec && idSet.has(rec.id) && !rec.delivered_at) {
        rec.delivered_at = now;
        n++;
      }
    }
    if (n > 0) writeSync(list);
    return n;
  });
}

/**
 * Group pending notifications by recipient + return a render-ready
 * digest. Does NOT mark delivered — caller decides whether the
 * transport (webhook POST / logging) succeeded before acking.
 */
export function buildDigest() {
  const pending = listAllPending();
  const byRecipient = new Map();
  for (const n of pending) {
    const key = n.recipient || '(unknown)';
    if (!byRecipient.has(key)) byRecipient.set(key, []);
    byRecipient.get(key).push(n);
  }
  const digests = [];
  for (const [recipient, items] of byRecipient.entries()) {
    digests.push({
      recipient,
      item_count: items.length,
      oldest_created_at: items.reduce(
        (acc, it) => (!acc || it.created_at < acc ? it.created_at : acc),
        null
      ),
      items,
    });
  }
  // Sort recipients by oldest pending (FIFO at the digest level too).
  digests.sort((a, b) => {
    const ta = a.oldest_created_at || '';
    const tb = b.oldest_created_at || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  return digests;
}

/**
 * Transport-agnostic send. If `OPS_NOTIFY_WEBHOOK` is a non-empty URL,
 * POST the digest as JSON and expect `{ ok: true }` from the other
 * side; otherwise run in dry-run mode (log to stdout). Returns
 * `{ mode, delivered_ids }` so the caller can decide whether to call
 * markDelivered().
 *
 * HMAC signing (Sprint pre-8.3): when `OPS_NOTIFY_WEBHOOK_SECRET` is
 * set, the POST includes:
 *   X-Ops-Signature: sha256=<hex HMAC of the raw body>
 *   X-Ops-Timestamp: <ms since epoch>
 * The receiver verifies by recomputing HMAC-SHA256(secret, body) and
 * comparing in constant time. This prevents a leaked webhook URL from
 * being used to forge approval-looking payloads into Slack/SMTP.
 *
 * Note: fetch() is native in Node 18+. Timeout defaults to 5s.
 */
export async function runDigest({ timeoutMs = 5000 } = {}) {
  const digests = buildDigest();
  if (digests.length === 0) {
    return { mode: 'empty', digests: [], delivered_ids: [] };
  }
  const allIds = digests.flatMap((d) => d.items.map((it) => it.id));
  const webhook = process.env.OPS_NOTIFY_WEBHOOK;
  if (!webhook) {
    // Dry-run: print a compact summary so the ops log shows activity
    // even without a transport configured.
    console.log(
      `  📨 notifications dry-run: ${digests.length} recipient(s), ${allIds.length} item(s) pending`
    );
    for (const d of digests) {
      console.log(`     └─ ${d.recipient}: ${d.item_count} (oldest ${d.oldest_created_at})`);
    }
    return { mode: 'dry-run', digests, delivered_ids: [] };
  }
  // Real transport. Best-effort; any failure leaves the queue intact.
  try {
    const body = JSON.stringify({
      type: 'ops-control/approval-digest',
      generated_at: new Date().toISOString(),
      digests,
    });
    const headers = { 'Content-Type': 'application/json' };
    const secret = process.env.OPS_NOTIFY_WEBHOOK_SECRET;
    if (secret) {
      const timestamp = Date.now().toString();
      const signature = crypto
        .createHmac('sha256', secret)
        .update(timestamp + '.' + body)
        .digest('hex');
      headers['X-Ops-Timestamp'] = timestamp;
      headers['X-Ops-Signature'] = `sha256=${signature}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(webhook, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { mode: 'webhook-failed', digests, delivered_ids: [], status: res.status };
    }
    return {
      mode: 'webhook',
      digests,
      delivered_ids: allIds,
      signed: !!secret,
    };
  } catch (err) {
    return {
      mode: 'webhook-failed',
      digests,
      delivered_ids: [],
      error: err?.message || String(err),
    };
  }
}

/**
 * Verify an incoming webhook delivery against `OPS_NOTIFY_WEBHOOK_SECRET`.
 * Exposed so downstream receivers (or a future inbound-webhook
 * endpoint) can reuse the same exact verification logic.
 *
 * Rejects if:
 *   - secret is unset on this server (signing wasn't configured)
 *   - timestamp is > `maxAgeMs` old (replay protection; default 5min)
 *   - signature doesn't match in constant time
 *
 * Returns `{ ok: true }` on pass, `{ ok: false, reason }` otherwise.
 */
export function verifyWebhookSignature({ body, timestamp, signature, maxAgeMs = 5 * 60 * 1000 }) {
  const secret = process.env.OPS_NOTIFY_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: 'secret-not-configured' };
  if (!timestamp || !signature) return { ok: false, reason: 'missing-headers' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad-timestamp' };
  const age = Date.now() - ts;
  if (age > maxAgeMs || age < -maxAgeMs) return { ok: false, reason: 'timestamp-out-of-range' };
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', secret)
      .update(ts + '.' + body)
      .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return { ok: false, reason: 'signature-mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature-mismatch' };
  return { ok: true };
}

/**
 * Test-only hook: overwrite the queue. The HTTP layer never calls
 * this — tests use it to seed fixtures. Ignored in production by
 * convention; no enforcement beyond "don't import from routes".
 */
export async function _resetForTests(list = []) {
  return withLock(LOCK_KEY, async () => {
    writeSync(Array.isArray(list) ? list : []);
  });
}
