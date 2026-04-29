/**
 * webVitals — zero-dep reporter for Core Web Vitals.
 *
 * Uses native PerformanceObserver to capture:
 *   - LCP  (Largest Contentful Paint)
 *   - CLS  (Cumulative Layout Shift)
 *   - INP  (Interaction to Next Paint)
 *   - FCP  (First Contentful Paint)
 *   - TTFB (Time to First Byte)
 *
 * Each metric is beaconed to `/api/telemetry/web-vitals` once it
 * stabilizes (LCP: final value at page hide; CLS: final shift score
 * at hide; INP: worst interaction at hide). sendBeacon is fire-and-
 * forget + survives the unload, fetch{keepalive} is the fallback for
 * browsers without sendBeacon.
 *
 * Why not the `web-vitals` npm package: ~3 kB gz but another dep to
 * pin. We only care about the 5 core metrics and already tolerate
 * the polyfill gap (Safari < 14.1 lacks `layout-shift` entries) —
 * unsupported browsers silently skip. Production parity with Chromium.
 */

const ENDPOINT = '/api/telemetry/web-vitals';

// Buffer one reading per metric; final values land at page-hide time.
// Per-page, not per-session — each navigation starts fresh.
const buffered = new Map();

function route() {
  // Path-only, no query/hash — keeps label cardinality bounded.
  try { return String(window.location?.pathname || '/').slice(0, 80); }
  catch { return '/'; }
}

function send(name, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const payload = JSON.stringify({ name, value, route: route() });
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined'
        && typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(ENDPOINT, blob)) return;
    if (typeof fetch === 'function') {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => { /* telemetry best-effort */ });
    }
  } catch { /* browser refused — swallow */ }
}

function flushAll() {
  for (const [name, value] of buffered) send(name, value);
  buffered.clear();
}

/**
 * Start observing web-vitals. Safe to call multiple times — second
 * call no-ops. Returns a cleanup function for tests; prod callers
 * ignore the return value.
 */
export function startWebVitals() {
  if (typeof window === 'undefined') return () => {};
  if (window.__webVitalsStarted) return () => {};
  window.__webVitalsStarted = true;

  const observers = [];

  function observe(type, handler) {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const po = new PerformanceObserver(handler);
      po.observe({ type, buffered: true });
      observers.push(po);
    } catch { /* entry type not supported in this browser */ }
  }

  // LCP — take the LAST observed entry before page hide (per-spec).
  observe('largest-contentful-paint', (list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) buffered.set('LCP', last.renderTime || last.loadTime || last.startTime);
  });

  // CLS — sum session layout-shift scores excluding user-initiated.
  let clsValue = 0;
  observe('layout-shift', (list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) clsValue += entry.value || 0;
    }
    buffered.set('CLS', clsValue);
  });

  // INP — worst interaction delay so far. PerformanceEventTiming has
  // a `duration` field representing total end-to-end interaction time.
  let worstInp = 0;
  observe('event', (list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > worstInp) worstInp = entry.duration;
    }
    if (worstInp > 0) buffered.set('INP', worstInp);
  });

  // FCP — first "First Contentful Paint" entry.
  observe('paint', (list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') {
        buffered.set('FCP', entry.startTime);
      }
    }
  });

  // TTFB from navigation timing — responseStart - requestStart.
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.responseStart > 0) {
      buffered.set('TTFB', nav.responseStart - nav.requestStart);
    }
  } catch { /* ignore */ }

  // Flush on hide — pagehide is more reliable than beforeunload
  // (mobile Safari fires pagehide when app goes to background).
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushAll();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flushAll);

  return () => {
    observers.forEach(po => { try { po.disconnect(); } catch { /* noop */ } });
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushAll);
    window.__webVitalsStarted = false;
  };
}
