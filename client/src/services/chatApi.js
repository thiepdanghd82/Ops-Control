/**
 * chatApi — Phase 10A client bindings.
 *
 * Thin wrapper over the fetch-based `api` helper in services/api.js,
 * so every call picks up cookie auth + CSRF + credentials:'include'
 * automatically. EventSource for SSE is separate because `api.get`
 * returns a parsed JSON response — we need the raw connection here.
 */
import { api } from './api';

const CSRF_COOKIE = 'ops_csrf';

export const chatApi = {
  rooms:    () => api.get('/chat/rooms'),
  // Phase 11 — people-first list for the Messages inbox. Same data
  // source as `rooms()` but re-shaped server-side so every DM row
  // carries a `peer` block (id, name, online, last_seen_at) — no
  // client-side joining required.
  conversations: () => api.get('/chat/conversations'),
  // Presence snapshot — compact "who's online" for hydration on tab
  // switch. Live updates arrive through the existing SSE stream as
  // `presence` / `presence_snapshot` events.
  presence: () => api.get('/chat/presence'),
  users:    () => api.get('/chat/users'),
  messages: (roomId, { before, limit = 50, signal } = {}) => {
    const qs = [];
    if (before) qs.push(`before=${encodeURIComponent(before)}`);
    if (limit)  qs.push(`limit=${encodeURIComponent(limit)}`);
    return api.get(`/chat/rooms/${roomId}/messages${qs.length ? '?' + qs.join('&') : ''}`, { signal });
  },
  send: (roomId, body) =>
    api.post(`/chat/rooms/${roomId}/messages`, { body }),
  markSeen: (roomId, messageId) =>
    api.post(`/chat/rooms/${roomId}/seen`, { message_id: messageId }),
  openDm: (username) =>
    api.get(`/chat/dm/${encodeURIComponent(username)}`),
  openQuote: (quoteId) =>
    api.get(`/chat/quote/${encodeURIComponent(quoteId)}`),
  mentions: ({ unread = false, limit = 50 } = {}) => {
    const qs = [];
    if (unread) qs.push('unread=1');
    if (limit)  qs.push(`limit=${encodeURIComponent(limit)}`);
    return api.get(`/chat/mentions${qs.length ? '?' + qs.join('&') : ''}`);
  },
  markMentionsRead: (ids) =>
    api.post('/chat/mentions/mark-read', ids ? { ids } : {}),
  search: (query, { limit = 50, signal } = {}) => {
    const qs = `q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`;
    return api.get(`/chat/search?${qs}`, { signal });
  },
  editMessage: (messageId, body) =>
    api.patch(`/chat/messages/${messageId}`, { body }),
  deleteMessage: (messageId) =>
    api.delete(`/chat/messages/${messageId}`),
  // Hard delete — server purges the row entirely. Use for "delete
  // completely" vs "recall" (soft delete). Client UI gates behind a
  // confirm with a stronger warning.
  purgeMessage: (messageId) =>
    api.delete(`/chat/messages/${messageId}?hard=1`),
};

/**
 * Convenience: open the ChatDrawer and surface a specific room. Fires
 * a window CustomEvent that ChatDrawer listens for. Keeps the contract
 * between "deep-link into chat" callers and the drawer UI loose — any
 * component can trigger without importing drawer internals.
 */
export function openChatRoom(roomId) {
  window.dispatchEvent(new CustomEvent('ops-open-chat', {
    detail: { roomId: Number(roomId) },
  }));
}

/**
 * Open an SSE stream to /api/chat/stream. Browser EventSource
 * automatically sends cookies (since credentials default is
 * 'include' for same-origin); no additional auth wiring needed.
 *
 * Returns `{ close }`. Caller receives parsed events via onEvent.
 * Reconnects automatically via Last-Event-ID (the browser manages
 * this — we just pass id: <msg.id> in each message event server-side
 * so the browser echoes it back on reconnect).
 */
export function openChatStream({ onEvent, onError }) {
  if (typeof EventSource === 'undefined') {
    onError?.(new Error('SSE not supported'));
    return { close: () => {} };
  }

  // EventSource can't set custom headers — no way to send
  // Authorization: Bearer. Two auth paths:
  //   1. Cookie: httpOnly ops_session (9H). Works when same-origin
  //      (production deploy) AND when `withCredentials: true` is set
  //      here (Vite dev cross-origin).
  //   2. Query-param fallback: `?t=<token>` for legacy localStorage
  //      clients that haven't completed cookie migration. Server has
  //      query-param deprecation warning (9F.5) so we'll know when
  //      the last caller is gone. Safe on SSE specifically because
  //      the URL is opened once from JS and never logged elsewhere.
  const token = localStorage.getItem('ops_token');
  const url = token ? `/api/chat/stream?t=${encodeURIComponent(token)}` : '/api/chat/stream';
  const es = new EventSource(url, { withCredentials: true });

  const parse = (e) => {
    try { return JSON.parse(e.data); }
    catch { return null; }
  };
  es.addEventListener('message', (e) => {
    const p = parse(e); if (p) onEvent?.(p);
  });
  es.addEventListener('hello', (e) => {
    const p = parse(e); if (p) onEvent?.(p);
  });
  es.onerror = (e) => { onError?.(e); };

  void CSRF_COOKIE;
  return { close: () => es.close() };
}
