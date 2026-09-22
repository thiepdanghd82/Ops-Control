/**
 * Fetch everything a pending quote needs, in ONE await.
 *
 * The first cut nested the rate lookup inside the quote-list `.then()` and
 * called `clearPendingQuote()` immediately after launching it. That clear
 * changes the effect's dependency, so React tears the effect down and its
 * cleanup sets `cancelled = true` — and the nested promise, resolving a
 * measured ~50 ms later, then hit `if (cancelled) return;` and never called
 * `loadQuote` at all. A copy silently kept the source's rate.
 *
 * Nothing was red: the reducer seeds correctly (proved directly), the
 * endpoint was called (17 times in the server log), and the only broken part
 * was WHEN the answer came back relative to a teardown the same handler had
 * triggered. Lesson 45's shape — correct code that does not run — one layer
 * down, in promise ordering rather than component mounting.
 *
 * So both fetches start together and resolve together, leaving the caller a
 * single cancellation check and a synchronous block in which to load the
 * quote and clear the pending handoff. There is no window between them.
 *
 * The rate is fetched ONLY for a copy. Opening a saved quote must keep the
 * rate it was quoted at, and not asking is stronger than asking and
 * discarding.
 *
 * A failed rate lookup yields `seed: null` rather than rejecting: the rate is
 * a convenience and the quote must still open without it.
 *
 * @param {string} action 'copy' | 'load' | undefined
 * @param {{getQuotes: Function, getLatestUsdRate: Function}} deps
 * @returns {Promise<{quotes: Array, seed: object|null}>}
 */
export async function fetchPendingQuote(action, deps) {
  const [quotes, seed] = await Promise.all([
    deps.getQuotes(),
    action === 'copy' ? deps.getLatestUsdRate().catch(() => null) : Promise.resolve(null),
  ]);
  return { quotes: quotes || [], seed };
}
