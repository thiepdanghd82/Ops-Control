/**
 * dataEventBus.js — client-side singleton subscriber to /api/events/stream.
 *
 * Wraps the browser EventSource so any component can subscribe to
 * server-pushed data-change events ("quote.saved", "rfq.updated", etc.)
 * without each one opening its own SSE connection. One EventSource per
 * tab is enough; the server fans out to all subscribers in-process.
 *
 * Architecture parallels services/connectionHealth.js: module-level
 * singleton kicked off at App load, components subscribe via small
 * pub/sub. Auto-reconnect via EventSource native behaviour (Last-Event-ID
 * round-trips on retry).
 *
 * Usage:
 *   import { subscribeDataEvents, startDataEventStream } from './services/dataEventBus.js';
 *   startDataEventStream();              // App.jsx (idempotent)
 *   const unsub = subscribeDataEvents(['quote.saved'], (evt) => refresh());
 *   // → unsub() to stop listening
 *
 * Wildcard: pass '*' or [] to receive every event (sparingly — most tabs
 * only care about 1-2 channels). Internal _seq tracking surfaces dropped
 * events to debug ("expected #42, got #44").
 */

const listeners = []; // [{ channels: Set|null, fn }]
let _es = null;
let _started = false;
let _lastSeq = 0;
let _connected = false;

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
  const token = (() => {
    try {
      return localStorage.getItem('ops_token') || null;
    } catch {
      return null;
    }
  })();
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
  };
  es.onerror = () => {
    _connected = false;
    // Browser auto-reconnects after `retry:` interval (server default 3s).
    // No explicit retry needed; we just log so it's visible in DevTools.
  };
  return es;
}

export function startDataEventStream() {
  if (_started) return;
  _started = true;
  _es = openStream();
}

export function stopDataEventStream() {
  if (_es) {
    try {
      _es.close();
    } catch {
      /* ignore */
    }
    _es = null;
  }
  _started = false;
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

export function isDataEventConnected() {
  return _connected;
}
