/**
 * dataEventBus.js — client-side singleton subscriber to /api/events/stream.
 *
 * Wraps the browser EventSource so any component can subscribe to
 * server-pushed data-change events ("quote.saved", "rfq.updated", etc.)
 * without each one opening its own SSE connection. One EventSource per
 * tab is enough; the server fans out to all subscribers in-process.
 *
 * Architecture parallels services/connectionHealth.js: module-level
 * singleton, components subscribe via small pub/sub. App.jsx opens the
 * stream once the user is signed in (the endpoint needs a fully verified
 * session) and closes it on sign-out. A dropped connection reconnects
 * natively (Last-Event-ID round-trips); a refused one (HTTP 401 after a
 * server restart, say) is CLOSED for good by the browser, so it is retried
 * here with a capped backoff while a token is held.
 *
 * Usage:
 *   import { subscribeDataEvents, startDataEventStream } from './services/dataEventBus.js';
 *   startDataEventStream();              // App.jsx on sign-in (idempotent per token)
 *   stopDataEventStream();               // App.jsx on sign-out
 *   const unsub = subscribeDataEvents(['quote.saved'], (evt) => refresh());
 *   // → unsub() to stop listening
 *
 * Wildcard: pass '*' or [] to receive every event (sparingly — most tabs
 * only care about 1-2 channels). Internal _seq tracking surfaces dropped
 * events to debug ("expected #42, got #44").
 */

import { getToken } from './api.js';

const listeners = []; // [{ channels: Set|null, fn }]
let _es = null;
let _started = false;
let _lastSeq = 0;
let _connected = false;
let _token = null; // token the current stream was opened with
let _retryTimer = null;
let _retryAttempt = 0;

const CLOSED = 2; // EventSource.CLOSED — the browser will not reconnect
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 60000;

function notify(event) {
  for (const { channels, fn } of listeners) {
    try {
      if (channels === null || channels.has(event.type)) {
        fn(event);
      }
    } catch (err) {
      // One bad listener doesn't break the others.
      console.warn('[dataEventBus] listener threw:', err);
    }
  }
}

function openStream() {
  if (typeof EventSource === 'undefined') {
    console.warn('[dataEventBus] SSE not supported by this browser');
    return null;
  }
  // Token query-param fallback for non-cookie auth (mirrors chatApi).
  // getToken() also reads sessionStorage, where the token lives when
  // "Remember me" is off.
  const token = getToken() || null;
  _token = token;
  const url = token ? `/api/events/stream?t=${encodeURIComponent(token)}` : '/api/events/stream';
  const es = new EventSource(url, { withCredentials: true });

  const handle = (e) => {
    let p;
    try {
      p = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!p || typeof p !== 'object') return;
    if (typeof p.seq === 'number') {
      if (_lastSeq && p.seq > _lastSeq + 1) {
        console.warn(
          `[dataEventBus] seq gap: ${_lastSeq} → ${p.seq} (events dropped or reconnect)`
        );
      }
      _lastSeq = p.seq;
    }
    notify(p);
  };

  // Subscribe to the channels the server emits. Adding more is cheap;
  // missing one means the listeners never fire for that type.
  const TYPES = [
    'quote.saved',
    'quote.deleted',
    'quote.restored',
    'rfq.updated',
    'sample.updated',
    'library.imported',
    'approval.transition',
    'security.alert',
    'ready',
  ];
  for (const t of TYPES) es.addEventListener(t, handle);

  es.onopen = () => {
    _connected = true;
    _retryAttempt = 0;
  };
  es.onerror = () => {
    _connected = false;
    // A network drop leaves the stream CONNECTING and the browser retries
    // on its own. An HTTP error (401, 5xx) leaves it CLOSED and the browser
    // gives up, so retry here — only while signed in, or it would just
    // collect 401s until the next sign-in restarts the stream anyway.
    if (_es === es && es.readyState === CLOSED && _token) scheduleRetry();
  };
  return es;
}

function closeStream() {
  if (_es) {
    try {
      _es.close();
    } catch {
      /* ignore */
    }
    _es = null;
  }
  _connected = false;
}

function clearRetry() {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

function scheduleRetry() {
  if (_retryTimer || !_started) return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** _retryAttempt);
  _retryAttempt += 1;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    if (!_started) return;
    closeStream();
    _es = openStream();
  }, delay);
}

// Opens the stream, or reopens it when the token changed (another sign-in)
// or the previous one was refused. A no-op while a stream for the same
// token is open or connecting.
export function startDataEventStream() {
  _started = true;
  if (_es && _es.readyState !== CLOSED && (getToken() || null) === _token) return;
  clearRetry();
  _retryAttempt = 0;
  closeStream();
  _es = openStream();
}

export function stopDataEventStream() {
  _started = false;
  clearRetry();
  closeStream();
  _token = null;
}

/**
 * Subscribe to one or more event channels.
 * @param {string[]|string|null} channels — array, single string, '*' or null for all
 * @param {(event) => void} fn
 * @returns unsubscribe()
 */
export function subscribeDataEvents(channels, fn) {
  let set;
  if (channels == null || channels === '*' || (Array.isArray(channels) && channels.length === 0)) {
    set = null;
  } else if (typeof channels === 'string') {
    set = new Set([channels]);
  } else {
    set = new Set(channels);
  }
  const entry = { channels: set, fn };
  listeners.push(entry);
  return () => {
    const idx = listeners.indexOf(entry);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
