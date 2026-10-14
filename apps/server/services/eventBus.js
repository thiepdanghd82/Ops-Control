/**
 * eventBus.js — in-process event bus for real-time data change push.
 *
 * Why: with 6-20 users on LAN, polling /api/quotes every 30s wastes
 * CPU + bandwidth + creates 30s lag. SSE event stream emits per-change
 * events to clients → instant push, < 50ms latency.
 *
 * Architecture:
 *   - Server emits events when data changes:
 *       emitDataChange('quote', { id: 5, action: 'saved' })
 *       emitDataChange('rfq', { id: 'RFQ-001', action: 'updated' })
 *       emitDataChange('library', { dataset: 'materials', action: 'imported' })
 *   - SSE endpoint /api/events streams events to subscribed clients
 *   - Client subscribes via EventSource, gets push immediately
 *   - Client invalidates relevant cache + refetches affected tab
 *
 * Drop-in replacement for polling — Đợt 2 deliverable cho 20-user readiness.
 *
 * Public API:
 *   emitDataChange(type, payload, opts?) — emit event to all subscribers
 *   subscribeEvents(fn)                  — register listener (returns unsub)
 *   getSubscriberCount()                  — for diagnostics
 *
 * Channels (event types):
 *   - quote.saved       { id, version, savedBy }
 *   - quote.deleted     { id, savedBy }
 *   - rfq.updated       { id, savedBy }
 *   - sample.updated    { id, savedBy }
 *   - library.imported  { dataset }
 *   - approval.transition { quoteId, from, to, by }
 */

const subscribers = new Set();
let _seq = 0;

/**
 * Emit data change event to all SSE subscribers.
 *
 * @param {string} type — dot-notation channel (e.g. 'quote.saved')
 * @param {object} payload — event-specific data
 * @param {object} [opts] — { audience: 'all'|'admins'|... }
 */
export function emitDataChange(type, payload = {}, opts = {}) {
  const event = {
    seq: ++_seq,
    type,
    ts: new Date().toISOString(),
    payload,
    audience: opts.audience || 'all',
  };
  for (const sub of subscribers) {
    try {
      // Filter by audience if subscriber registered with criteria
      if (sub.audienceFilter && !sub.audienceFilter(event)) continue;
      sub.send(event);
    } catch (err) {
      // Silently drop dead subscribers — they'll be removed on next ping
    }
  }
  return event;
}

/**
 * Subscribe to data change events. Returns unsub function.
 *
 * @param {(event) => void} send — callback invoked per event
 * @param {object} [opts] — { audienceFilter: (event) => boolean }
 */
export function subscribeEvents(send, opts = {}) {
  const sub = { send, audienceFilter: opts.audienceFilter };
  subscribers.add(sub);
  return () => subscribers.delete(sub);
}

export function getSubscriberCount() {
  return subscribers.size;
}

export function getStatus() {
  return {
    subscribers: subscribers.size,
    eventsEmitted: _seq,
  };
}
