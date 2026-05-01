// Kiosk service worker — Sprint MES-2.6.
// Hand-rolled (no workbox dep) — Workbox would have been overkill for
// the 3 cache rules below and would have pulled idb + 3 workbox-*
// packages. The decision is documented in the MES-2.6a commit body.
//
// Three cache strategies:
//   - /kiosk/assets/*   → cache-first, immutable (Vite emits hashed filenames)
//   - /api/planning/v2/operations/dispatch → network-first w/ 5-min stale fallback (AC-2.5.4)
//   - everything else (incl. mutations) → network-only, no cache
//
// Skip-waiting + clientsClaim on activate so a new SW takes control
// without a manual reload. main.jsx listens for `controllerchange` and
// reloads the page once so all clients pick up the fresh asset hashes
// (mirrors Sprint 1.6's stale-chunk recovery pattern).

const VERSION = 'kiosk-v1';
const STATIC_CACHE = `${VERSION}-static`;
const DISPATCH_CACHE = `${VERSION}-dispatch`;
const DISPATCH_PATH = '/api/planning/v2/operations/dispatch';
const DISPATCH_MAX_AGE_MS = 5 * 60 * 1000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Drop any caches that don't belong to the current VERSION so a
      // deploy doesn't leave stale entries lying around indefinitely.
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Mutations + non-GET → never cache, always network.
  if (req.method !== 'GET') return;

  // Static assets — cache-first, immutable hash names.
  if (url.pathname.startsWith('/kiosk/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Dispatch list — network-first, 5-min stale fallback.
  if (url.pathname === DISPATCH_PATH) {
    event.respondWith(networkFirstDispatch(req));
    return;
  }

  // Everything else (kiosk shell HTML, manifest, icons, other API): default network.
});

async function networkFirstDispatch(req) {
  const cache = await caches.open(DISPATCH_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      // Stamp the cached entry with `sw-cached-at` so we can age it out.
      const stamped = new Response(fresh.clone().body, {
        status: fresh.status,
        statusText: fresh.statusText,
        headers: new Headers([...fresh.headers, ['sw-cached-at', String(Date.now())]]),
      });
      cache.put(req, stamped);
    }
    return fresh;
  } catch (_e) {
    const stale = await cache.match(req);
    if (!stale) throw _e;
    const ts = Number(stale.headers.get('sw-cached-at') || 0);
    if (Date.now() - ts > DISPATCH_MAX_AGE_MS) {
      // Cache too old — bubble the network error so the kiosk shows
      // an offline state instead of dispatching against stale data.
      throw _e;
    }
    return stale;
  }
}
