/**
 * Inheriting the USD rate onto a new or copied quote, and the one
 * acknowledgement that makes it safe.
 *
 * A rate that arrives without anyone setting it is the hazard #345 recorded
 * on the Target price: the operator meets a number already in the box and has
 * no way to tell it apart from one they typed. Here it is wanted — the rate
 * barely moves (27 of the last 30 quotes carry 26,090) and retyping it on
 * every RFQ is the friction being removed — so the safeguard is to say so
 * ONCE, on the way out of the RFQ tab, rather than to leave it silent.
 *
 * WHY THE NAVIGATION GATE IS UNTOUCHED. `usd_rate` stays in
 * HEADER_GATE_FIELDS. After seeding it is only ever blank when there was
 * nothing to inherit — a fresh install, or every prior quote saved without a
 * rate — and that is exactly the case the gate was written for: a blank rate
 * zeroes both VND mirrors silently (#311). So the block still covers the case
 * it protects, and the operator no longer meets it on an ordinary quote,
 * which was the complaint.
 *
 * The notice is deliberately NOT part of the quote state. It is an
 * acknowledgement, not data: persisting it would ride into every saved quote
 * and into the signed `_Schema` payload of every export for something only
 * this screen reads, which is what `target_contr` did for months before
 * anyone noticed it was inert.
 */

const num = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * The notice to show for a seed the server returned, or null.
 *
 * `{ rate: null }` — nothing inheritable — yields null, so nothing is seeded
 * and the blank-field block stays in charge.
 *
 * @param {{rate:(number|null), rfq_number?:string, saved_at?:string}|null} seed
 * @returns {{rate:number, rfq_number:string, saved_at:string}|null}
 */
export function noticeFromSeed(seed) {
  const rate = num(seed && seed.rate);
  if (!(rate > 0)) return null;
  return {
    rate,
    rfq_number: (seed && seed.rfq_number) || '',
    saved_at: (seed && seed.saved_at) || '',
  };
}

/**
 * Whether the notice still describes what is in the box.
 *
 * Once the operator edits the rate they have taken ownership of it, and
 * asking them to confirm a number they just typed is the alarm-with-no-
 * meaning shape — it trains people to click through the one that matters.
 *
 * @param {{rate:number}|null} notice
 * @param {number|string} currentRate  the rate now in state
 */
export function noticeStillApplies(notice, currentRate) {
  if (!notice) return false;
  return num(currentRate) === num(notice.rate);
}
