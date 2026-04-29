/**
 * chatBus — in-process pub/sub for Phase 10A SSE fan-out.
 *
 * Single-instance design: subscribers register with a user id + a
 * `send(event)` callback. When a message is inserted, the router
 * calls `publish()` with the message + affected room id; the bus
 * looks up all online users in that room (via the chatStore room
 * membership) and fans out.
 *
 * NOT a pub/sub server — just an in-memory EventEmitter-shaped thing
 * keyed by user id. When multi-instance (K8s) day arrives, swap this
 * module for a Redis-backed version that listens to `chat:events`
 * channel and pushes to local subscribers. Subscriber contract stays
 * the same; only the module internals change.
 *
 * Per-user list: a user may open multiple tabs; each opens its own
 * SSE connection and registers independently. Broadcast loops over
 * all of them.
 */

const subscribersByUser = new Map();  // user_id → Set<{ id, send }>
let _subId = 0;

// Phase 10H — per-user subscriber cap. A pathological client (tab
// reconnect storm, misbehaving script) shouldn't be able to accumulate
// thousands of SSE subscribers in the in-memory map. When the cap is
// exceeded, we evict the OLDEST subscriber first — it's almost
// certainly a stale one the browser hasn't closed yet. The cap is
// generous enough that a normal user with 5 tabs open is fine.
const MAX_SUBSCRIBERS_PER_USER = Number(process.env.OPS_CHAT_SSE_PER_USER_CAP) || 20;

// Phase 11 — presence listeners. Registered via onPresenceChange() so
// the SSE layer can broadcast "user X came online / went offline" events
// without chatBus needing to know about the SSE framing. We call them
// only on the TRANSITIONS (0 ↔ 1 subscriber), not every tab open, so
// listeners don't get spammed by a user with 5 tabs.
const presenceListeners = new Set();
export function onPresenceChange(fn) {
  presenceListeners.add(fn);
  return () => presenceListeners.delete(fn);
}
function emitPresence(userId, online) {
  for (const fn of presenceListeners) {
    try { fn({ userId, online, at: new Date().toISOString() }); }
    catch { /* listener shouldn't break the fan-out */ }
  }
}

// Last-seen timestamp per user, updated on every disconnect so the UI
// can render "Last seen 5 min ago" for offline users without touching
// users.json on every tab close. Also exported for the /api/chat/users
// directory endpoint to project into the response.
const lastSeenByUser = new Map();  // user_id → ISO timestamp
export function getLastSeenAt(userId) {
  return lastSeenByUser.get(Number(userId)) || null;
}

export function subscribe(userId, send) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) throw new Error('subscribe: invalid user id');
  const entry = { id: ++_subId, send };
  let set = subscribersByUser.get(uid);
  const wasOffline = !set || set.size === 0;
  if (!set) {
    set = new Set();
    subscribersByUser.set(uid, set);
  }
  // Cap enforcement — evict the eldest subscriber when over limit.
  // Set insertion order is preserved, so the first value is the
  // oldest. We ALSO call its send() one last time with a synthetic
  // `session_evicted` event so the client can surface a message
  // before the browser figures out the stream died.
  while (set.size >= MAX_SUBSCRIBERS_PER_USER) {
    const eldest = set.values().next().value;
    set.delete(eldest);
    try { eldest.send({ type: 'session_evicted', reason: 'too_many_connections' }); }
    catch { /* stream already dead */ }
  }
  set.add(entry);
  // Fire the "came online" transition only when this user went from 0
  // to ≥1 subscriber. Additional tab opens from the same user don't
  // broadcast — presence is per-user, not per-connection.
  if (wasOffline) emitPresence(uid, true);
  return () => {
    // unsubscribe
    const s = subscribersByUser.get(uid);
    if (!s) return;
    s.delete(entry);
    if (s.size === 0) {
      subscribersByUser.delete(uid);
      // Stamp last-seen so an offline viewer sees "Last seen HH:MM"
      // instead of a blank slot. Emit the transition AFTER the stamp
      // so any listener that reads lastSeenByUser sees the fresh value.
      lastSeenByUser.set(uid, new Date().toISOString());
      emitPresence(uid, false);
    }
  };
}

/**
 * Broadcast `event` (shape: { type, ...payload }) to every subscriber
 * of each user in `userIds`. Failures in a send() callback don't
 * break the fan-out — one dead stream shouldn't starve the rest.
 *
 * Returns the delivered count (back-compat) AND writes a per-user
 * hit map onto `event._deliveredTo` when an opts.trackPerUser flag is
 * passed. The chat route uses that map to compute `delivered_at`
 * without re-walking the subscriber map itself.
 */
export function publish(userIds, event, opts = {}) {
  if (!Array.isArray(userIds)) return 0;
  let delivered = 0;
  const perUser = opts.trackPerUser ? new Set() : null;
  for (const uid of userIds) {
    const set = subscribersByUser.get(Number(uid));
    if (!set) continue;
    let userHit = false;
    for (const entry of set) {
      try { entry.send(event); delivered++; userHit = true; }
      catch { /* dead stream — cleanup happens when res.on('close') fires */ }
    }
    if (userHit && perUser) perUser.add(Number(uid));
  }
  if (perUser) event._deliveredTo = [...perUser];
  return delivered;
}

export function onlineUserIds() {
  return [...subscribersByUser.keys()];
}

export function _resetBusForTests() {
  subscribersByUser.clear();
  _subId = 0;
}
