/**
 * connectionHealth.js — singleton health monitor + offline awareness.
 *
 * Why: in 6/20-user LAN deployment, server can become unreachable
 * (Wi-Fi drop, server restart, switch reboot). The app should:
 *   - Detect outage within 15 seconds
 *   - Show user-visible banner
 *   - Retry with exponential backoff (avoid hammering)
 *   - Auto-recover when back online + offer "refresh data" prompt
 *
 * Architecture:
 *   - Singleton state (one instance per app, observed by hooks)
 *   - Polls /health every 15s when online; backoff to 30s/60s/300s when offline
 *   - Pauses polling when tab hidden (no point waking idle tabs)
 *   - Listens to navigator.onLine for OS-level network change
 *
 * Public API:
 *   subscribeConnection(listener)  → returns unsubscribe()
 *   getConnectionStatus()           → { online, lastCheckAt, downSince }
 *   forceProbeConnection()          → manual ping, returns Promise
 *
 * React hook (separate file uses these):
 *   useConnectionStatus()           → returns status + auto re-renders
 */

const POLL_INTERVAL_MS = 15000;
const BACKOFF_LADDER_MS = [15000, 30000, 60000, 300000];
const PROBE_TIMEOUT_MS = 5000;

const state = {
  online: true,
  lastCheckAt: null,
  downSince: null,
  consecutiveFails: 0,
  serverVersion: null,
};

const listeners = new Set();
let timer = null;
let healthEndpoint = '/health';

function notify() {
  for (const fn of listeners) {
    try {
      fn({ ...state });
    } catch {
      /* swallow: subscriber callback errors must not break the broadcast loop */
    }
  }
}

function setOnline(serverInfo) {
  const wasOffline = !state.online;
  state.online = true;
  state.consecutiveFails = 0;
  state.lastCheckAt = new Date();
  state.serverVersion = serverInfo?.version || null;
  if (wasOffline) {
    state.downSince = null;
  }
  notify();
  return wasOffline;
}

function setOffline(reason) {
  const wasOnline = state.online;
  state.online = false;
  state.lastCheckAt = new Date();
  state.consecutiveFails += 1;
  if (wasOnline && !state.downSince) {
    state.downSince = new Date();
  }
  state.lastError = reason;
  notify();
  return wasOnline;
}

async function probe() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(healthEndpoint, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      // Server might require auth on most paths but /health is public
    });
    clearTimeout(t);
    if (!r.ok) {
      setOffline(`HTTP ${r.status}`);
      return false;
    }
    const j = await r.json().catch(() => null);
    setOnline(j);
    return true;
  } catch (err) {
    clearTimeout(t);
    setOffline(err.name === 'AbortError' ? 'timeout' : err.message);
    return false;
  }
}

function nextDelay() {
  if (state.online) return POLL_INTERVAL_MS;
  const idx = Math.min(state.consecutiveFails, BACKOFF_LADDER_MS.length - 1);
  return BACKOFF_LADDER_MS[idx];
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (typeof document !== 'undefined' && document.hidden) {
    // Wait until visible to resume
    return;
  }
  timer = setTimeout(async () => {
    await probe();
    scheduleNext();
  }, nextDelay());
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (!document.hidden) {
    // Tab visible — probe immediately + resume polling
    probe().then(scheduleNext);
  } else {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

function onOnline() {
  probe().then(scheduleNext);
}
function onOffline() {
  setOffline('navigator.offline');
}

let started = false;
export function startConnectionMonitor(opts = {}) {
  if (started) return;
  if (opts.endpoint) healthEndpoint = opts.endpoint;
  started = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }
  // Initial probe + first scheduled tick
  probe().then(scheduleNext);
}

export function stopConnectionMonitor() {
  started = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  }
}

export function getConnectionStatus() {
  return { ...state };
}

export function subscribeConnection(fn) {
  listeners.add(fn);
  // Send current state immediately so subscriber doesn't wait for first poll
  try {
    fn({ ...state });
  } catch {
    /* swallow: initial snapshot callback errors must not block subscription */
  }
  return () => listeners.delete(fn);
}

export async function forceProbeConnection() {
  return probe();
}

/**
 * Helper: API fetch with retry + backoff. Use for READ requests only.
 * Save / mutation endpoints should NOT retry (would create dups + bypass
 * optimistic-lock 409 handling).
 *
 * Retries: 3 attempts with delays 200/500/1500ms.
 * Aborts on: 4xx (client error — retrying won't help), abort signal.
 * Retries on: 5xx, network error, timeout.
 */
export async function fetchWithRetry(url, init = {}, opts = {}) {
  const { maxAttempts = 3, baseDelayMs = 200, maxDelayMs = 1500 } = opts;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(url, init);
      // 4xx → don't retry (client error). Auth failure handled by caller.
      if (r.status >= 400 && r.status < 500) return r;
      if (r.ok) return r;
      // 5xx → retry
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (err) {
      // network error or abort
      if (err.name === 'AbortError') throw err;
      lastErr = err;
    }
    if (attempt < maxAttempts) {
      const delay = Math.min(baseDelayMs * Math.pow(2.5, attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error('fetchWithRetry exhausted');
}
