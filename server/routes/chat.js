/**
 * Chat routes — Phase 10A MVP.
 *
 * Mounted under /api/chat by server/index.js. Auth is handled by the
 * authMiddleware on the parent mount; every handler resolves the
 * caller via getSessionUser(). CSRF middleware (global) catches
 * state-changing verbs except for the SSE GET which is exempt by
 * method anyway.
 *
 * Feature-gated by OPS_CHAT_ENABLED env var. When off, all endpoints
 * return 503 with a clear message so ops can turn the feature on/off
 * without removing the route.
 */
import { Router } from 'express';
import {
  getOrCreateRoom, getRoom, getRoomByKey, addMember, isMember, listMembers,
  listRoomsForUser, insertMessage, listMessages, listMessagesSince, markSeen,
  markDelivered,
  listMentionsForUser, countUnreadMentions, markMentionsRead,
  searchMessages, editMessage, deleteMessage, purgeMessage,
  dmKey, teamKey, quoteKey,
} from '../repositories/chatStore.js';
import { getQuoteById } from '../repositories/quotesStore.js';
import { loadUsers, getSessionUser, getTokenFromHeader } from '../services/authService.js';
import { parseMentions, sanitizeChatBody } from '../utils/chatMentions.js';
import { normalizeApprovalRoles, MAX_DEFAULT_ROOMS_PER_USER } from '../utils/chatDefaults.js';
import { validateBody } from '../middleware/validate.js';
import { chatSendRateLimit, chatEditRateLimit } from '../middleware/rateLimit.js';
import {
  subscribe, publish, onPresenceChange, onlineUserIds, getLastSeenAt,
} from '../services/chatBus.js';
import { inc } from '../utils/metrics.js';

const router = Router();

// Phase 11 — chat defaults to ENABLED. Users shipping the Messages
// inbox + compose UI shouldn't have to remember to flip an env var
// for their own feature to work. Kill-switch is still available: set
// OPS_CHAT_ENABLED=0 to hard-disable (returns 503 from gated routes).
const chatEnabled = () => String(process.env.OPS_CHAT_ENABLED || '').trim() !== '0';

// ── Helpers ───────────────────────────────────────────────────────────

function requireChatEnabled(req, res, next) {
  if (!chatEnabled()) {
    return res.status(503).json({
      ok: false,
      error: 'chat_disabled',
      message: 'Chat feature is not enabled on this server. Set OPS_CHAT_ENABLED=1 to turn on.',
    });
  }
  next();
}

function requireUser(req) {
  return getSessionUser(getTokenFromHeader(req));
}

/**
 * Ensure default team channels exist for the current user's approval
 * roles + the general "all" room. Called lazily on first rooms-list
 * fetch so new users see something without manual provisioning.
 *
 * Normalization (dedupe + cap + type-filter) lives in
 * utils/chatDefaults.js so it's unit-tested without HTTP mounting.
 */
function ensureDefaultMemberships(user) {
  const { roles, truncated } = normalizeApprovalRoles(user.approval_roles);
  if (truncated) {
    console.warn(`[chat] user ${user.id} has too many approval_roles — truncated to ${MAX_DEFAULT_ROOMS_PER_USER} for default room provisioning`);
  }
  const keys = roles.map(r => ({ kind: 'team', key: teamKey(r), title: `#${r}` }));
  keys.push({ kind: 'team', key: 'team:everyone', title: '#everyone' });
  for (const k of keys) {
    const room = getOrCreateRoom(k);
    addMember({ roomId: room.id, userId: user.id });
  }
}

/**
 * Enrich user info into a room for the client. DMs need the OTHER
 * user's username as title; team rooms already have one.
 */
function enrichRoom(room, caller, usersById) {
  if (room.kind !== 'dm') return room;
  const members = listMembers(room.id);
  const other = members.find(m => m.user_id !== caller.id);
  const otherName = other && usersById.get(other.user_id)?.username;
  return { ...room, title: otherName ? `@${otherName}` : room.title };
}

// ── Routes ────────────────────────────────────────────────────────────

// Phase 11 — directory endpoints are NOT gated by OPS_CHAT_ENABLED.
// They're plain authenticated reads of the user directory + presence
// state; exposing them when chat itself is off is harmless and lets
// the Messages inbox / compose picker stay functional during partial
// rollouts or dev environments that haven't flipped the env yet.
//
// Registered BEFORE the gate middleware below. Everything else
// (rooms, messages, DM upsert, send, edit, delete, stream) stays
// behind the feature flag.

router.get('/users', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const online = new Set(onlineUserIds());
  const users = loadUsers().map(u => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name || u.username,
    role: u.role,
    online: online.has(Number(u.id)),
    last_seen_at: getLastSeenAt(u.id),
  }));
  res.json({ ok: true, users });
});

router.get('/presence', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const online = onlineUserIds();
  const lastSeen = {};
  for (const u of loadUsers()) {
    const ts = getLastSeenAt(u.id);
    if (ts) lastSeen[u.id] = ts;
  }
  res.json({ ok: true, online, last_seen: lastSeen });
});

router.use(requireChatEnabled);

// GET /api/chat/rooms
router.get('/rooms', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  ensureDefaultMemberships(user);
  const rooms = listRoomsForUser(user.id);
  const users = loadUsers();
  const usersById = new Map(users.map(u => [u.id, u]));
  const enriched = rooms.map(r => enrichRoom(r, user, usersById));
  res.json({ ok: true, rooms: enriched });
});

// GET /api/chat/rooms/:id/messages?before=&limit=
router.get('/rooms/:id/messages', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const roomId = Number(req.params.id);
  if (!Number.isFinite(roomId)) return res.status(400).json({ ok: false, error: 'invalid room id' });
  if (!isMember({ roomId, userId: user.id })) {
    return res.status(403).json({ ok: false, error: 'not_a_member' });
  }
  const before = req.query.before ? Number(req.query.before) : null;
  const limit  = req.query.limit  ? Number(req.query.limit)  : 50;
  const messages = listMessages({ roomId, before, limit });
  res.json({ ok: true, messages });
});

// POST /api/chat/rooms/:id/messages
router.post(
  '/rooms/:id/messages',
  chatSendRateLimit,
  validateBody({
    body: { type: 'string', required: true, min: 1, max: 2000 }, // pre-sanitize cap
  }),
  (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const roomId = Number(req.params.id);
    if (!Number.isFinite(roomId)) return res.status(400).json({ ok: false, error: 'invalid room id' });
    if (!isMember({ roomId, userId: user.id })) {
      return res.status(403).json({ ok: false, error: 'not_a_member' });
    }

    const cleaned = sanitizeChatBody(req.body.body);
    if (!cleaned) return res.status(400).json({ ok: false, error: 'empty_body' });

    const users = loadUsers();
    const { mentionIds } = parseMentions(cleaned, users);

    const msg = insertMessage({
      roomId, authorId: user.id, body: cleaned, mentions: mentionIds,
    });
    const room = getRoom(roomId);
    inc('chat_messages_sent_total', { kind: room?.kind || 'unknown' });
    if (mentionIds.length > 0) {
      inc('chat_mentions_sent_total', {}, mentionIds.length);
    }

    // Broadcast to all members (SSE fan-out). Author included — their
    // own client reconciles local echo vs server ack.
    //
    // Track per-user delivery so we can stamp `delivered_at` on the
    // message the moment any non-author recipient's SSE caught it.
    // Messages sent while every recipient is offline stay with
    // delivered_at = null → the client renders a single tick and
    // upgrades to a double tick the next time the recipient connects
    // (via the catch-up replay path below).
    const memberIds = listMembers(roomId).map(m => m.user_id);
    const event = { type: 'message', room_id: roomId, message: msg };
    publish(memberIds, event, { trackPerUser: true });
    const nonAuthorHit = (event._deliveredTo || []).some(id => Number(id) !== Number(user.id));
    if (nonAuthorHit) {
      try {
        markDelivered({ messageId: msg.id });
        msg.delivered_at = new Date().toISOString();
      } catch { /* delivery receipt is best-effort; don't fail the send */ }
    }
    // Internal plumbing never leaves the server.
    delete event._deliveredTo;

    // Phase 10C — mentioned users get a targeted event so their
    // badge updates live without a /mentions poll. Author excluded
    // via mention fan-out logic in insertMessage (self-mentions are
    // already filtered when rows are inserted).
    if (mentionIds.length > 0) {
      const recipients = mentionIds.filter(id => Number(id) !== Number(user.id));
      if (recipients.length > 0) {
        publish(recipients, {
          type: 'mention',
          room_id: roomId,
          message_id: msg.id,
          author_id: user.id,
          created_at: msg.created_at,
        });
      }
    }

    res.json({ ok: true, message: msg });
  },
);

// PATCH /api/chat/messages/:id — edit (author, within window, Phase 10E).
// Maps repo-level reason codes to HTTP statuses so the client can
// render a specific message ("You can only edit within 15 min").
router.patch(
  '/messages/:id',
  chatEditRateLimit,
  validateBody({ body: { type: 'string', required: true, min: 1, max: 2000 } }),
  (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const messageId = Number(req.params.id);
    if (!Number.isFinite(messageId)) return res.status(400).json({ ok: false, error: 'invalid_id' });

    const cleaned = sanitizeChatBody(req.body.body);
    if (!cleaned) return res.status(400).json({ ok: false, error: 'empty_body' });

    // Parse @mentions from the new body so the stored mentions JSON
    // + chat_mentions inbox rows stay in sync with the text.
    const users = loadUsers();
    const { mentionIds } = parseMentions(cleaned, users);

    const result = editMessage({
      messageId, userId: user.id, body: cleaned, mentions: mentionIds,
    });
    if (!result.ok) {
      const status =
        result.reason === 'forbidden'       ? 403 :
        result.reason === 'not_found'       ? 404 :
        result.reason === 'window_expired'  ? 409 :
        result.reason === 'deleted'         ? 410 :
        400;
      return res.status(status).json({ ok: false, error: result.reason });
    }

    inc('chat_messages_edited_total');

    // Broadcast the edit to every member so their open drawer updates.
    publish(
      listMembers(result.message.room_id).map(m => m.user_id),
      { type: 'message_edited', room_id: result.message.room_id, message: result.message },
    );

    // Additionally fan out a `mention` event to users who were
    // newly @-tagged by this edit. Pre-existing mention recipients
    // already got notified on the original post — don't re-ping them.
    if (result.newly_mentioned && result.newly_mentioned.length > 0) {
      publish(result.newly_mentioned, {
        type: 'mention',
        room_id: result.message.room_id,
        message_id: result.message.id,
        author_id: user.id,
        created_at: result.message.edited_at || result.message.created_at,
      });
    }

    res.json({ ok: true, message: result.message });
  },
);

// DELETE /api/chat/messages/:id — soft delete (recall, tombstone).
// DELETE /api/chat/messages/:id?hard=1 — hard delete (purge, no trace).
//
// Two semantics under one route keeps the client simple. Both require
// the same authorship + 15-min window guard server-side.
router.delete('/messages/:id', chatEditRateLimit, (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) return res.status(400).json({ ok: false, error: 'invalid_id' });

  const hard = String(req.query.hard || '') === '1';

  if (hard) {
    const result = purgeMessage({ messageId, userId: user.id });
    if (!result.ok) {
      const status =
        result.reason === 'forbidden'      ? 403 :
        result.reason === 'not_found'      ? 404 :
        result.reason === 'window_expired' ? 409 : 400;
      return res.status(status).json({ ok: false, error: result.reason });
    }
    inc('chat_messages_purged_total');
    publish(
      listMembers(result.room_id).map(m => m.user_id),
      { type: 'message_purged', room_id: result.room_id, message_id: messageId },
    );
    return res.json({ ok: true, id: messageId, purged: true });
  }

  const result = deleteMessage({ messageId, userId: user.id });
  if (!result.ok) {
    const status =
      result.reason === 'forbidden'        ? 403 :
      result.reason === 'not_found'        ? 404 :
      result.reason === 'window_expired'   ? 409 :
      result.reason === 'already_deleted'  ? 410 :
      400;
    return res.status(status).json({ ok: false, error: result.reason });
  }

  inc('chat_messages_deleted_total');

  publish(
    listMembers(result.room_id).map(m => m.user_id),
    {
      type: 'message_deleted',
      room_id: result.room_id,
      message_id: messageId,
      deleted_at: result.deleted_at,
    },
  );
  res.json({ ok: true, id: messageId });
});

// POST /api/chat/rooms/:id/seen
router.post(
  '/rooms/:id/seen',
  validateBody({ message_id: { type: 'number', required: true, min: 0 } }),
  (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const roomId = Number(req.params.id);
    if (!Number.isFinite(roomId)) return res.status(400).json({ ok: false, error: 'invalid room id' });
    if (!isMember({ roomId, userId: user.id })) {
      return res.status(403).json({ ok: false, error: 'not_a_member' });
    }
    markSeen({ roomId, userId: user.id, messageId: Number(req.body.message_id) });
    res.json({ ok: true });
  },
);

// GET /api/chat/dm/:username — get or create DM with that user
router.get('/dm/:username', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const targetName = String(req.params.username).trim().toLowerCase();
  if (!targetName || targetName === user.username.toLowerCase()) {
    return res.status(400).json({ ok: false, error: 'invalid_target' });
  }
  const users = loadUsers();
  const target = users.find(u => String(u.username).toLowerCase() === targetName);
  if (!target) return res.status(404).json({ ok: false, error: 'user_not_found' });

  const room = getOrCreateRoom({
    kind: 'dm',
    key: dmKey(user.id, target.id),
    title: null,
  });
  addMember({ roomId: room.id, userId: user.id });
  addMember({ roomId: room.id, userId: target.id });
  res.json({
    ok: true,
    room: { ...room, title: `@${target.username}` },
  });
});

// GET /api/chat/quote/:id — get or create the quote-scoped room.
// Any authenticated user can open a room for any saved quote (matches
// the "all users can read all quotes" policy). The caller is added as
// a member on first open; subsequent opens are idempotent.
router.get('/quote/:id', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const quoteId = Number(req.params.id);
  if (!Number.isFinite(quoteId)) {
    return res.status(400).json({ ok: false, error: 'invalid_quote_id' });
  }
  const quote = getQuoteById(quoteId);
  if (!quote) return res.status(404).json({ ok: false, error: 'quote_not_found' });

  // Derive title from RFQ number + CCL PN when present; fall back to
  // "Quote #<id>". The state sub-object is the source of truth in
  // quotesStore — fields may also appear at the root for legacy rows.
  const rfq = quote.state?.rfq_number || quote.rfq_number;
  const ccl = quote.state?.ccl_pn    || quote.ccl_pn;
  const parts = [];
  if (rfq) {
    // Avoid "RFQ RFQ-42" when the input already has the prefix.
    parts.push(/^rfq/i.test(String(rfq)) ? String(rfq) : `RFQ ${rfq}`);
  }
  if (ccl) parts.push(ccl);
  const title = parts.length ? parts.join(' · ') : `Quote #${quoteId}`;
  const site  = quote.state?.site || quote.site || null;

  const room = getOrCreateRoom({ kind: 'quote', key: quoteKey(quoteId), title, site });
  addMember({ roomId: room.id, userId: user.id });
  res.json({ ok: true, room });
});

// GET /api/chat/mentions — inbox for the caller (Phase 10C).
// Returns newest-first. `?unread=1` filters to unread only (used by
// the badge drawer view); default returns a mix for the "history"
// tab. Client can jump to the source message via room_id.
router.get('/mentions', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const unreadOnly = String(req.query.unread || '') === '1';
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const mentions = listMentionsForUser({ userId: user.id, unreadOnly, limit });
  const unreadCount = countUnreadMentions(user.id);
  res.json({ ok: true, mentions, unread_count: unreadCount });
});

// POST /api/chat/mentions/mark-read — pass `{ids: [...]}` for targeted
// marking, or omit to flip every unread row for the caller at once.
router.post(
  '/mentions/mark-read',
  validateBody({ ids: { type: 'array', required: false } }),
  (req, res) => {
    const user = requireUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : null;
    const updated = markMentionsRead({ userId: user.id, ids });
    res.json({ ok: true, updated });
  },
);

// GET /api/chat/search?q=foo — Phase 10D. Searches messages across
// every room the caller is a member of. 2-char minimum to avoid
// expensive full-table scans on single keystrokes.
router.get('/search', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const query = String(req.query.q || '');
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const results = searchMessages({ userId: user.id, query, limit });
  // Only count meaningful queries — a 1-char probe hits the 2-char
  // guard before reaching the DB, so it's not usage worth tracking.
  if (query.trim().length >= 2) inc('chat_search_queries_total');
  res.json({ ok: true, query, results });
});

// /users and /presence are registered ABOVE the requireChatEnabled
// gate (Phase 11) so the directory picker works even when chat itself
// is disabled. See the earlier definition at the top of the route
// section.

// GET /api/chat/conversations — unified people-first list for the
// Messages inbox. Same source data as /rooms, but re-shaped for the
// new tab: each row carries the "other party" info (name, id, online,
// last_seen_at) for DMs so the UI doesn't need a second lookup.
// Groups/quote rooms stay as-is. Sort: most recent activity first.
router.get('/conversations', (req, res) => {
  const user = requireUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    const rooms = listRoomsForUser(user.id);
    const users = loadUsers();
    const userById = new Map(users.map(u => [Number(u.id), u]));
    const online = new Set(onlineUserIds());

    const conversations = rooms.map(r => {
      const base = {
        id: r.id,
        kind: r.kind,
        key: r.key,
        title: r.title,
        site: r.site,
        updated_at: r.updated_at,
        unread_count: r.unread_count,
        muted: !!r.muted,
        last_seen_id: r.last_seen_id,
        last_message: r.last_message,
        peer: null,
      };
      // Flatten DMs: find the other member and expose them as `peer`
      // so the sidebar can render avatar + name + online without any
      // extra client-side joining.
      if (r.kind === 'dm') {
        const members = listMembers(r.id);
        const other = members.find(m => Number(m.user_id) !== Number(user.id));
        if (other) {
          const u = userById.get(Number(other.user_id));
          base.peer = u ? {
            id: u.id,
            username: u.username,
            full_name: u.full_name || u.username,
            role: u.role,
            online: online.has(Number(u.id)),
            last_seen_at: getLastSeenAt(u.id),
          } : { id: other.user_id, username: 'unknown', online: false, last_seen_at: null };
        }
      }
      return base;
    });
    res.json({ ok: true, conversations });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// GET /api/chat/stream — SSE (Phase 10A.4)
router.get('/stream', (req, res) => {
  // Auth: EventSource can't send Authorization headers. Accept:
  //   - Cookie session (primary, Phase 9H)
  //   - Bearer header (direct calls, e.g. curl/tests)
  //   - ?t=<token> query-param fallback for dev + legacy clients
  // The token source precedence follows getSessionUser → readSessionToken
  // normally, but for SSE we also check `?t=` because getTokenFromHeader
  // doesn't look at query params (by design — reducing credential-leak
  // surface in logs. SSE URL is opened once from JS, not linked-to).
  let user = requireUser(req);
  if (!user && req.query.t) {
    user = getSessionUser(String(req.query.t));
  }
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  // SSE headers. Content-Type locks the wire format; the 'X-Accel-
  // Buffering: no' hint disables nginx proxy buffering (critical for
  // streaming). Cache-Control: no-cache tells the browser to NOT
  // replay cached responses on reconnect.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers so the browser knows the stream is alive.
  res.flushHeaders();

  function send(event) {
    // SSE framing: `event: <type>\ndata: <json>\nid: <optional>\n\n`
    const lines = [];
    if (event.type) lines.push(`event: ${event.type}`);
    if (event.message && event.message.id) lines.push(`id: ${event.message.id}`);
    lines.push(`data: ${JSON.stringify(event)}`);
    lines.push(''); // blank line terminates the event
    lines.push('');
    try { res.write(lines.join('\n')); }
    catch { /* stream closed */ }
  }

  // Catch-up: on reconnect the client sends Last-Event-ID. We replay
  // messages with id > that value across all rooms the user belongs to.
  //
  // Phase 11 — while we're replaying, any message whose delivered_at
  // is still null AND was addressed to this user (i.e. the user is
  // NOT the author) gets stamped delivered. This closes the offline
  // gap: a message sent while Bob was offline now turns into a double
  // tick for the sender the moment Bob reconnects.
  const lastId = Number(req.headers['last-event-id']) || 0;
  if (lastId > 0) {
    try {
      const rooms = listRoomsForUser(user.id).map(r => r.id);
      const missed = listMessagesSince({ roomIds: rooms, sinceId: lastId, limit: 500 });
      const deliveredNow = new Set();
      for (const m of missed) {
        if (!m.delivered_at && Number(m.author_id) !== Number(user.id)) {
          try { markDelivered({ messageId: m.id }); m.delivered_at = new Date().toISOString(); deliveredNow.add(m.id); }
          catch { /* best-effort */ }
        }
        send({ type: 'message', room_id: m.room_id, message: m });
      }
      // Broadcast delivery updates back to the authors so their ticks
      // upgrade live. Only fire for messages we just flipped, not for
      // ones that were already delivered before this reconnect.
      if (deliveredNow.size > 0) {
        const notify = missed.filter(m => deliveredNow.has(m.id));
        const authorIds = [...new Set(notify.map(m => Number(m.author_id)))];
        publish(authorIds, {
          type: 'message_delivered',
          delivered: notify.map(m => ({ id: m.id, room_id: m.room_id, delivered_at: m.delivered_at })),
        });
      }
    } catch { /* swallow */ }
  }

  // Initial "hello" so the client can distinguish a fresh connection
  // from a replay window. Also useful for debugging.
  send({ type: 'hello', user_id: user.id, ts: new Date().toISOString() });
  // Hydrate current online set so the conversation list can paint
  // presence dots without waiting for the first transition event.
  try { send({ type: 'presence_snapshot', online: onlineUserIds() }); } catch { /* ignore */ }

  // Heartbeat every 25s as an SSE comment. Keeps the connection alive
  // through idle-timeout proxies + detects dead sockets (write fails
  // on a closed stream).
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); }
    catch { /* ignore; close handler cleans up */ }
  }, 25000);

  const unsubscribe = subscribe(user.id, send);
  // Phase 11 — broadcast presence transitions (user came online /
  // went offline) to THIS connection. Listener is per-connection and
  // tied to the same lifecycle as the SSE stream, so it's cleaned up
  // on close. This avoids having the bus emit into thousands of dead
  // closures after users quit.
  const unPresence = onPresenceChange((ev) => {
    // Don't echo the current user's own presence events back — the
    // browser already knows whether its own tab is open.
    if (Number(ev.userId) === Number(user.id)) return;
    try { send({ type: 'presence', user_id: ev.userId, online: ev.online, at: ev.at }); }
    catch { /* stream dead; close handler will unsubscribe */ }
  });
  inc('chat_sse_connections_opened_total');

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    unPresence();
    inc('chat_sse_connections_closed_total');
  });
});

export default router;
