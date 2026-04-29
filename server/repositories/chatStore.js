/**
 * chatStore — Phase 10A.1 Ops Control internal chat data layer.
 *
 * Three tables — all created on first access (idempotent):
 *   chat_rooms           — one row per conversation surface
 *   chat_room_members    — (room, user) pairs + per-user last_seen_id
 *   chat_messages        — append-only message log
 *
 * Design principles:
 *   - Append-only. No UPDATE/DELETE on messages for v1. Edit/delete
 *     would need audit trail + compliance review; defer to later sprint.
 *   - Room membership is explicit per-user, NOT derived from role at
 *     read time. Faster unread queries (one JOIN) and immune to role
 *     changes retroactively purging user from history.
 *   - Rooms are keyed by a deterministic string ('dm:12-34',
 *     'team:sales_mgr', 'quote:42'). Lets the REST layer "find or
 *     create" atomically without race conditions.
 *   - `updated_at` on rooms is bumped on every message so the UI can
 *     sort "recent" without touching messages table.
 *
 * Concurrency: SQLite WAL mode (set globally in db/connection.js)
 * handles concurrent readers + single writer. better-sqlite3's
 * synchronous API serializes writes per-connection — no explicit
 * lock needed for this workload volume.
 */
import { getDb } from '../db/connection.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS chat_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                          -- 'dm' | 'team' | 'quote'
    key TEXT NOT NULL UNIQUE,                    -- dedup key ('dm:12-34', 'team:sales_mgr', 'quote:42')
    title TEXT,                                  -- display name ('#sales', 'Quote RFQ-001', null for DM — client renders from members)
    site TEXT,                                   -- for quote rooms: inherits quote.state.site; null for DM/team
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL                     -- bumped on each new message; indexes 'recent' sort
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_rooms_kind_updated
    ON chat_rooms(kind, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS chat_room_members (
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL,
    last_seen_id INTEGER NOT NULL DEFAULT 0,     -- unread = COUNT(messages.id > last_seen_id)
    muted INTEGER NOT NULL DEFAULT 0,            -- 0|1 — suppress notifications, not membership
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_room_members_user
    ON chat_room_members(user_id, room_id)`,

  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    mentions TEXT,                               -- JSON array of user_ids (may be null)
    created_at TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
  )`,
  // (room_id, id DESC) — fastest "latest N messages in this room".
  // (id) is implicit (primary key). No need for a created_at index
  // because id is monotonic and a tighter proxy.
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_room
    ON chat_messages(room_id, id DESC)`,

  // Phase 10C — denormalized mention rows. One row per (mentioned
  // user, message) pair. Trade a little write amplification for O(1)
  // "my unread mentions" queries + a clean per-mention read-state.
  // We could have scanned chat_messages.mentions JSON but a LIKE
  // search on a JSON column doesn't use indexes and degrades as
  // history grows.
  `CREATE TABLE IF NOT EXISTS chat_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,              -- the mentioned user
    message_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,              -- denormalized; faster lookup + enables ON DELETE CASCADE per room
    author_id INTEGER NOT NULL,            -- who did the mentioning; avoids extra JOIN for inbox
    created_at TEXT NOT NULL,
    read_at TEXT,                          -- null = unread
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
  )`,
  // Fastest "newest unread first for user X".
  `CREATE INDEX IF NOT EXISTS idx_chat_mentions_user_unread
    ON chat_mentions(user_id, read_at, id DESC)`,

  // Phase 10E — add edit/delete columns idempotently. Adding via
  // ALTER TABLE means existing deployments upgrade cleanly; new
  // deployments get the same shape via a fresh CREATE. SQLite lets
  // us add nullable columns without rewriting the table.
  // Each `ALTER ... ADD COLUMN` is wrapped in a one-off PRAGMA check
  // because SQLite has no "IF NOT EXISTS" for column-adds — if the
  // column already exists the statement throws and we swallow.
];

const COLUMN_ADDS = [
  `ALTER TABLE chat_messages ADD COLUMN edited_at TEXT`,
  `ALTER TABLE chat_messages ADD COLUMN original_body TEXT`,
  `ALTER TABLE chat_messages ADD COLUMN deleted_at TEXT`,
  // Phase 11 — Messages Inbox. `delivered_at` is set when the outgoing
  // fan-out reaches at least one non-author subscriber. Null means the
  // message was queued while every recipient was offline; the client
  // renders it as a single tick until a later SSE push marks it delivered
  // (see markDelivered). Additive, nullable column — existing deploys
  // upgrade cleanly.
  `ALTER TABLE chat_messages ADD COLUMN delivered_at TEXT`,
];

let _schemaReady = false;
function ensureSchema() {
  if (_schemaReady) return;
  const db = getDb();
  for (const stmt of SCHEMA) db.exec(stmt);
  // Idempotent column-adds. Existing deploys upgrade in place; fresh
  // DBs get the additions after the initial CREATE. SQLite throws
  // "duplicate column" when the column already exists — swallow.
  for (const stmt of COLUMN_ADDS) {
    try { db.exec(stmt); } catch (e) {
      if (!/duplicate column/i.test(String(e?.message || ''))) throw e;
    }
  }
  _schemaReady = true;
}

// ── Room helpers ──────────────────────────────────────────────────────

/**
 * Canonical DM key: sorted user ids joined by '-'. Guarantees
 * `dmKey(5, 12) === dmKey(12, 5)` so "find or create" is symmetrical.
 */
export function dmKey(userA, userB) {
  const [a, b] = [Number(userA), Number(userB)].sort((x, y) => x - y);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('dmKey: invalid user ids');
  return `dm:${a}-${b}`;
}

export function teamKey(role) {
  if (!role || typeof role !== 'string') throw new Error('teamKey: role required');
  return `team:${role}`;
}

export function quoteKey(quoteId) {
  const n = Number(quoteId);
  if (!Number.isFinite(n)) throw new Error('quoteKey: invalid quote id');
  return `quote:${n}`;
}

/**
 * Get-or-create room. Returns the row (existing or new).
 * Caller adds members separately via addMember().
 * Not a transaction — create-then-add is safe because the key uniquely
 * identifies the room and addMember is idempotent via PRIMARY KEY.
 */
export function getOrCreateRoom({ kind, key, title = null, site = null }) {
  ensureSchema();
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM chat_rooms WHERE key = ?`).get(key);
  if (existing) return existing;

  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO chat_rooms (kind, key, title, site, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at
     RETURNING id`,
  ).get(kind, key, title, site, now, now);
  return db.prepare(`SELECT * FROM chat_rooms WHERE id = ?`).get(info.id);
}

export function getRoom(roomId) {
  ensureSchema();
  return getDb().prepare(`SELECT * FROM chat_rooms WHERE id = ?`).get(Number(roomId)) || null;
}

export function getRoomByKey(key) {
  ensureSchema();
  return getDb().prepare(`SELECT * FROM chat_rooms WHERE key = ?`).get(key) || null;
}

// ── Membership ────────────────────────────────────────────────────────

export function addMember({ roomId, userId }) {
  ensureSchema();
  const now = new Date().toISOString();
  getDb().prepare(
    `INSERT OR IGNORE INTO chat_room_members (room_id, user_id, joined_at)
     VALUES (?, ?, ?)`,
  ).run(Number(roomId), Number(userId), now);
}

export function removeMember({ roomId, userId }) {
  ensureSchema();
  getDb().prepare(
    `DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?`,
  ).run(Number(roomId), Number(userId));
}

export function isMember({ roomId, userId }) {
  ensureSchema();
  const row = getDb().prepare(
    `SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1`,
  ).get(Number(roomId), Number(userId));
  return !!row;
}

export function listMembers(roomId) {
  ensureSchema();
  return getDb().prepare(
    `SELECT user_id, joined_at, last_seen_id, muted
     FROM chat_room_members WHERE room_id = ? ORDER BY joined_at ASC`,
  ).all(Number(roomId));
}

// ── Listing rooms for a user ──────────────────────────────────────────

/**
 * List rooms the user is a member of, with unread count and last
 * message preview. Ordered by most-recent activity first.
 *
 * Returns: [{
 *   id, kind, key, title, site, updated_at,
 *   last_seen_id, muted,
 *   unread_count,           — messages > last_seen_id
 *   last_message: { id, author_id, body, created_at } | null
 * }]
 */
export function listRoomsForUser(userId) {
  ensureSchema();
  const db = getDb();
  // ORDER tiebreaker on id DESC — ISO timestamps have millisecond
  // precision, so three inserts within 1 ms all share the same
  // updated_at. Without the id tiebreaker, SQLite falls back to
  // arbitrary b-tree order and the "recent" sort flickers. Higher
  // id = later-created room, matching the user's intuitive sort.
  const rooms = db.prepare(
    `SELECT r.*, m.last_seen_id, m.muted
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id
     WHERE m.user_id = ?
     ORDER BY r.updated_at DESC, r.id DESC`,
  ).all(Number(userId));

  if (rooms.length === 0) return [];

  // Bulk fetch unread counts + last messages per room in one query each.
  // For 100 rooms that's 2 queries instead of 200.
  const ids = rooms.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');

  const unreadRows = db.prepare(
    `SELECT msg.room_id, COUNT(*) AS unread
     FROM chat_messages msg
     JOIN chat_room_members m ON m.room_id = msg.room_id
     WHERE m.user_id = ? AND msg.room_id IN (${placeholders}) AND msg.id > m.last_seen_id
     GROUP BY msg.room_id`,
  ).all(Number(userId), ...ids);
  const unreadByRoom = new Map(unreadRows.map(r => [r.room_id, r.unread]));

  const lastRows = db.prepare(
    `SELECT msg.room_id, msg.id, msg.author_id, msg.body, msg.created_at,
            msg.deleted_at, msg.delivered_at
     FROM chat_messages msg
     WHERE msg.id IN (
       SELECT MAX(id) FROM chat_messages WHERE room_id IN (${placeholders}) GROUP BY room_id
     )`,
  ).all(...ids);
  // Scrub bodies on the preview shown in the rooms list — the list
  // is a broadcast surface shown beside each room title, and leaking
  // the content of a just-deleted message there would be a visible
  // regression of the delete promise.
  const lastByRoom = new Map(lastRows.map(r => [r.room_id, sanitizeDeletedRow(r)]));

  return rooms.map(r => ({
    ...r,
    unread_count: unreadByRoom.get(r.id) || 0,
    last_message: lastByRoom.get(r.id) || null,
  }));
}

// ── Messages ──────────────────────────────────────────────────────────

/**
 * Insert a message. Caller MUST have already verified the author is
 * a member of the room — this function doesn't re-check (the REST
 * layer enforces it).
 *
 * Also bumps room.updated_at so "recent" sort picks it up.
 *
 * mentions: array of user ids referenced via @username. Stored as
 * JSON text; null when empty. The REST layer parses @usernames into
 * ids before calling.
 */
export function insertMessage({ roomId, authorId, body, mentions = null }) {
  ensureSchema();
  const db = getDb();
  const now = new Date().toISOString();
  const mentionsJson = Array.isArray(mentions) && mentions.length > 0
    ? JSON.stringify(mentions) : null;

  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO chat_messages (room_id, author_id, body, mentions, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(Number(roomId), Number(authorId), String(body), mentionsJson, now);
    db.prepare(`UPDATE chat_rooms SET updated_at = ? WHERE id = ?`)
      .run(now, Number(roomId));
    // Phase 10C — fan out mention rows. Skip self-mentions (no point
    // in filling your own inbox). Dedup via a Set in case the client
    // somehow sends duplicate ids.
    if (Array.isArray(mentions) && mentions.length > 0) {
      const ins = db.prepare(
        `INSERT INTO chat_mentions (user_id, message_id, room_id, author_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const seen = new Set();
      for (const uid of mentions) {
        const n = Number(uid);
        if (!Number.isFinite(n) || n === Number(authorId) || seen.has(n)) continue;
        seen.add(n);
        ins.run(n, Number(info.lastInsertRowid), Number(roomId), Number(authorId), now);
      }
    }
    return Number(info.lastInsertRowid);
  });
  const id = tx();
  return db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(id);
}

/**
 * Strip content fields from soft-deleted rows before handing them
 * back to an API caller. Keeps `id`, `created_at`, `deleted_at` and
 * other metadata so the client still renders the (deleted) slot in
 * the right spot, but ensures the original body never leaks through
 * the API, SSE catch-up, or search.
 *
 * `original_body` is wiped for the same reason — it would otherwise
 * be a trivial "undelete" for anyone with DevTools. Admin audit
 * tooling that legitimately needs access should query the DB
 * directly rather than going through the public API.
 */
export function sanitizeDeletedRow(row) {
  if (!row || !row.deleted_at) return row;
  return { ...row, body: null, original_body: null, mentions: null };
}

// ── Edit / Delete (Phase 10E) ────────────────────────────────────────

// Edit window in ms. After this, the author loses the right to edit
// or delete — protects audit integrity (no late revisions) while
// leaving room for typo fixes and "oops, wrong channel".
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

function ageMs(createdAt) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return Infinity;
  return Date.now() - t;
}

/**
 * Edit a message. Returns `{ ok: true, message }` on success or
 * `{ ok: false, reason }` for the caller to surface. The reason
 * codes are stable — the REST layer maps them 1:1 to HTTP statuses.
 *
 * Audit: on the FIRST edit we capture original_body. Subsequent
 * edits overwrite `body` but leave `original_body` intact — still
 * tells "what did it originally say?" without storing every
 * revision. edited_at reflects the LATEST edit timestamp.
 */
export function editMessage({ messageId, userId, body, mentions = null }) {
  ensureSchema();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.deleted_at) return { ok: false, reason: 'deleted' };
  if (Number(row.author_id) !== Number(userId)) return { ok: false, reason: 'forbidden' };
  if (ageMs(row.created_at) > EDIT_WINDOW_MS) return { ok: false, reason: 'window_expired' };
  const newBody = String(body || '').trim();
  if (!newBody) return { ok: false, reason: 'empty_body' };

  const now = new Date().toISOString();
  const mentionsJson = Array.isArray(mentions) && mentions.length > 0
    ? JSON.stringify(mentions) : null;

  // Wrap the UPDATE + mention fan-out in one tx so callers don't
  // observe a half-applied edit (edited body but stale mentions).
  const newlyMentioned = [];
  db.transaction(() => {
    db.prepare(
      `UPDATE chat_messages
       SET body = ?,
           mentions = ?,
           edited_at = ?,
           original_body = COALESCE(original_body, ?)
       WHERE id = ?`,
    ).run(newBody, mentionsJson, now, row.body, Number(messageId));

    // #2 fan out NEW mentions only. Users who were already mentioned
    // before the edit keep their existing row (and its read state) —
    // we don't want to double-notify them on a cosmetic rewording.
    // Users who were mentioned in the pre-edit version but removed in
    // the edit KEEP their inbox row — an author shouldn't be able to
    // silently retract a notification someone may have already acted
    // on.
    if (Array.isArray(mentions) && mentions.length > 0) {
      const existing = new Set(
        db.prepare(
          `SELECT user_id FROM chat_mentions WHERE message_id = ?`,
        ).all(Number(messageId)).map(r => Number(r.user_id)),
      );
      const ins = db.prepare(
        `INSERT INTO chat_mentions (user_id, message_id, room_id, author_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const seen = new Set();
      for (const uid of mentions) {
        const n = Number(uid);
        if (!Number.isFinite(n) || n === Number(userId) || seen.has(n) || existing.has(n)) continue;
        seen.add(n);
        ins.run(n, Number(messageId), Number(row.room_id), Number(userId), now);
        newlyMentioned.push(n);
      }
    }
  })();

  const updated = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  return { ok: true, message: updated, newly_mentioned: newlyMentioned };
}

/**
 * Hard-delete — permanently removes the row (and via FK cascade, its
 * chat_mentions). No tombstone, no audit trace; callers who need the
 * audit path should use the soft-delete (`deleteMessage`) variant
 * that leaves a (deleted) placeholder.
 *
 * Same authorship + 15-min window as soft delete. Returns room_id on
 * success so the REST layer can SSE-fan a `message_purged` event.
 */
export function purgeMessage({ messageId, userId }) {
  ensureSchema();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  if (!row) return { ok: false, reason: 'not_found' };
  if (Number(row.author_id) !== Number(userId)) return { ok: false, reason: 'forbidden' };
  if (ageMs(row.created_at) > EDIT_WINDOW_MS) return { ok: false, reason: 'window_expired' };
  const roomId = row.room_id;
  db.prepare(`DELETE FROM chat_messages WHERE id = ?`).run(Number(messageId));
  return { ok: true, room_id: roomId };
}

/**
 * Soft-delete. Keeps the row for audit continuity (mentions, search
 * indexes, thread IDs all remain valid) but clears the body in the
 * API response layer. The REST handler sets the response body to
 * a sentinel so clients know to render "(deleted)".
 */
export function deleteMessage({ messageId, userId }) {
  ensureSchema();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.deleted_at) return { ok: false, reason: 'already_deleted' };
  if (Number(row.author_id) !== Number(userId)) return { ok: false, reason: 'forbidden' };
  if (ageMs(row.created_at) > EDIT_WINDOW_MS) return { ok: false, reason: 'window_expired' };

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE chat_messages SET deleted_at = ? WHERE id = ?`,
  ).run(now, Number(messageId));
  return { ok: true, room_id: row.room_id, deleted_at: now };
}

// ── Search (Phase 10D) ───────────────────────────────────────────────

/**
 * Full-text-ish search across messages in rooms the user is a member
 * of. LIKE-based — good enough for the current volume; upgrade to
 * FTS5 if per-query latency crosses 50ms against a prod-sized table.
 *
 * Access control is baked into the JOIN: if the user isn't a member
 * of the room, its messages don't appear in results. No separate
 * per-row check required.
 *
 * Results are joined with room metadata so the client can render a
 * "room title · snippet" row without a second round-trip.
 */
export function searchMessages({ userId, query, limit = 50 }) {
  ensureSchema();
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  // Escape LIKE meta-characters (_, %, \). Needed so a search for
  // "50%" doesn't match "50 foo" via pattern-wildcard interpretation.
  const escaped = q.replace(/[\\%_]/g, c => `\\${c}`);
  const pattern = `%${escaped}%`;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  // Phase 10G — exclude soft-deleted messages entirely. Their body
  // is withheld from API responses, so matching them via LIKE would
  // imply their content without returning it (a side-channel leak).
  return getDb().prepare(
    `SELECT msg.id, msg.room_id, msg.author_id, msg.body, msg.created_at,
            r.kind AS room_kind, r.title AS room_title, r.key AS room_key
     FROM chat_messages msg
     JOIN chat_rooms r ON r.id = msg.room_id
     JOIN chat_room_members m ON m.room_id = msg.room_id AND m.user_id = ?
     WHERE msg.deleted_at IS NULL
       AND msg.body LIKE ? ESCAPE '\\'
     ORDER BY msg.id DESC
     LIMIT ?`,
  ).all(Number(userId), pattern, safeLimit);
}

// ── Mentions inbox (Phase 10C) ────────────────────────────────────────

/**
 * List a user's mentions, newest first. Pass `unreadOnly=true` for
 * the badge count / inbox filter. Returns joined snapshot of message
 * + room for the inbox view — the client shouldn't need a second
 * round-trip.
 */
export function listMentionsForUser({ userId, unreadOnly = false, limit = 50 }) {
  ensureSchema();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const where = unreadOnly
    ? `WHERE mn.user_id = ? AND mn.read_at IS NULL`
    : `WHERE mn.user_id = ?`;
  // If the mentioned message was later deleted, return `null` for
  // `message_body` instead of the original text. Mention row stays so
  // the inbox keeps its notification history, but the preview snippet
  // respects the delete.
  return getDb().prepare(
    `SELECT mn.id, mn.message_id, mn.room_id, mn.author_id,
            mn.created_at, mn.read_at,
            CASE WHEN msg.deleted_at IS NULL THEN msg.body ELSE NULL END AS message_body,
            msg.deleted_at AS message_deleted_at,
            r.kind AS room_kind, r.title AS room_title, r.key AS room_key
     FROM chat_mentions mn
     JOIN chat_messages msg ON msg.id = mn.message_id
     JOIN chat_rooms r ON r.id = mn.room_id
     ${where}
     ORDER BY mn.id DESC
     LIMIT ?`,
  ).all(Number(userId), safeLimit);
}

export function countUnreadMentions(userId) {
  ensureSchema();
  const row = getDb().prepare(
    `SELECT COUNT(*) AS n FROM chat_mentions
     WHERE user_id = ? AND read_at IS NULL`,
  ).get(Number(userId));
  return row ? Number(row.n) : 0;
}

/**
 * Mark mentions as read. If `ids` is an array, only those rows are
 * marked; otherwise ALL unread mentions for the user are flipped.
 * Returns the number of rows updated.
 */
export function markMentionsRead({ userId, ids = null }) {
  ensureSchema();
  const db = getDb();
  const now = new Date().toISOString();
  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const info = db.prepare(
      `UPDATE chat_mentions SET read_at = ?
       WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders})`,
    ).run(now, Number(userId), ...ids.map(Number));
    return info.changes;
  }
  const info = db.prepare(
    `UPDATE chat_mentions SET read_at = ?
     WHERE user_id = ? AND read_at IS NULL`,
  ).run(now, Number(userId));
  return info.changes;
}

/**
 * Paginated history. Returns messages OLDER than `before` (or the
 * latest `limit` if `before` is falsy). Oldest-first within the
 * returned page, client appends above existing feed.
 */
export function listMessages({ roomId, before = null, limit = 50 }) {
  ensureSchema();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const db = getDb();
  const rows = before
    ? db.prepare(
        `SELECT * FROM chat_messages WHERE room_id = ? AND id < ?
         ORDER BY id DESC LIMIT ?`,
      ).all(Number(roomId), Number(before), safeLimit)
    : db.prepare(
        `SELECT * FROM chat_messages WHERE room_id = ?
         ORDER BY id DESC LIMIT ?`,
      ).all(Number(roomId), safeLimit);
  return rows.reverse().map(sanitizeDeletedRow); // ascending + scrub deleted bodies
}

/**
 * Fetch messages with id > sinceId. Used by SSE stream catch-up on
 * reconnect via Last-Event-ID. Capped at 500 to prevent a long-
 * disconnected client from blowing out memory.
 */
export function listMessagesSince({ roomIds, sinceId, limit = 500 }) {
  ensureSchema();
  if (!Array.isArray(roomIds) || roomIds.length === 0) return [];
  const safeLimit = Math.min(Math.max(1, Number(limit) || 500), 2000);
  const placeholders = roomIds.map(() => '?').join(',');
  return getDb().prepare(
    `SELECT * FROM chat_messages
     WHERE room_id IN (${placeholders}) AND id > ?
     ORDER BY id ASC LIMIT ?`,
  ).all(...roomIds.map(Number), Number(sinceId) || 0, safeLimit)
  .map(sanitizeDeletedRow);
}

/**
 * Mark messages up to `messageId` as seen for the given user.
 * Non-strict — if `messageId < last_seen_id`, no-op. Never decreases.
 */
export function markSeen({ roomId, userId, messageId }) {
  ensureSchema();
  getDb().prepare(
    `UPDATE chat_room_members
     SET last_seen_id = MAX(last_seen_id, ?)
     WHERE room_id = ? AND user_id = ?`,
  ).run(Number(messageId), Number(roomId), Number(userId));
}

/**
 * Phase 11 — mark a message as delivered to at least one non-author
 * recipient. Idempotent: later callers are no-ops once the timestamp is
 * set. Callers pass the wall-clock time so tests can inject it; in
 * production we use `now`.
 */
export function markDelivered({ messageId, at = new Date().toISOString() }) {
  ensureSchema();
  getDb().prepare(
    `UPDATE chat_messages
     SET delivered_at = COALESCE(delivered_at, ?)
     WHERE id = ?`,
  ).run(String(at), Number(messageId));
}

// ── Test hook ─────────────────────────────────────────────────────────

/**
 * Prune messages older than `ttlDays`. Opt-in via env var
 * `OPS_CHAT_PRUNE_DAYS`; when unset the chat never auto-deletes so
 * nothing surprises a fresh deploy. FK cascade on `chat_mentions`
 * cleans those up too.
 *
 * Returns `{ pruned, cutoff }`. The caller logs + increments a
 * counter so ops can see prune activity without opening the DB.
 */
export function pruneOldMessages({ ttlDays }) {
  ensureSchema();
  const n = Number(ttlDays);
  if (!Number.isFinite(n) || n <= 0) {
    return { pruned: 0, skipped: true, reason: 'invalid_ttl' };
  }
  const cutoff = new Date(Date.now() - n * 86400 * 1000).toISOString();
  const info = getDb().prepare(
    `DELETE FROM chat_messages WHERE created_at < ?`,
  ).run(cutoff);
  return { pruned: info.changes, cutoff };
}

/** Wipe all chat state. For tests only — production never calls this. */
export function _wipeChatForTests() {
  ensureSchema();
  const db = getDb();
  db.exec(
    `DELETE FROM chat_mentions;
     DELETE FROM chat_messages;
     DELETE FROM chat_room_members;
     DELETE FROM chat_rooms;`,
  );
}
