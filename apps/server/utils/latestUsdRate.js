/**
 * The USD rate a new quote should start from: the one on the most recently
 * saved quote that actually carries a usable rate.
 *
 * "Most recently saved" is not the same as "most recent that has a rate", and
 * the difference is not academic here: of the 149 live quotes, **59 carry no
 * usable rate at all**. Taking the newest quote unconditionally would hand a
 * new RFQ a zero about 40% of the time, which is the blank field this seeding
 * exists to remove.
 *
 * Trashed quotes are skipped. They are still in the store — Quote History's
 * Trash reads them — but a rate from a quote somebody deleted is not a rate
 * anybody wants inherited.
 *
 * Deliberately NOT filtered by site. Every one of the 149 is `VN`, so a site
 * filter would be a rule with no cases to exercise it; if a second site ever
 * lands, the rate is per-site and this needs revisiting rather than silently
 * carrying VN's rate across.
 *
 * This lives on the server because the alternative is the client reading the
 * whole quote list to take one number, and that list is **26.6 MB**.
 */

/** Positive finite number, or 0. Strings are what the store actually holds. */
function rateOf(q) {
  const raw = q && q.state ? q.state.usd_rate : undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sort key. A missing/unparsable saved_at sorts oldest rather than throwing. */
function savedAtMs(q) {
  const t = Date.parse((q && q.saved_at) || '');
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * @param {Array<object>} quotes rows as `loadQuotes()` returns them
 * @returns {{rate:number, quote_id:(number|null), rfq_number:string, saved_at:string}|null}
 */
export function pickLatestUsdRate(quotes) {
  if (!Array.isArray(quotes)) return null;
  let best = null;
  for (const q of quotes) {
    if (!q || q.deleted_at) continue;
    const rate = rateOf(q);
    if (!rate) continue;
    if (!best || savedAtMs(q) > savedAtMs(best)) best = q;
  }
  if (!best) return null;
  return {
    rate: rateOf(best),
    quote_id: best.id ?? null,
    rfq_number: (best.state && best.state.rfq_number) || '',
    saved_at: best.saved_at || '',
  };
}
