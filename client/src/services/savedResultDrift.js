// @ts-check
/**
 * Does the result a quote was SAVED with differ from what the engine computes
 * for it today?
 *
 * Opening a quote recomputes it live — the calculator's screens run the engine
 * against the quote's own persisted pricing snapshot — but every export (xlsx,
 * CSV), Quote History and the Cost Breakdown list read the PERSISTED result.
 * When the engine changes, the two part ways, and nothing said so: the Save
 * button stays disabled because no input was edited, so the only way to bring
 * the files up to date was to edit a field and change it back. That is how
 * ~150 quotes were left after PR 427 and PR 428 (found on hardware 2026-09-25).
 *
 * Compares exactly the numeric fields serializeResultForPersist writes, and
 * only where BOTH sides carry a number: a field a legacy quote was never saved
 * with is not drift, it is schema history.
 *
 * The comparison is against the live DISPLAY result — the saved snapshot — not
 * against what Save would write, because Save re-freezes the pricing snapshot
 * from today's library. Comparing to that would flag every quote whose library
 * prices moved since it was saved and invite re-pricing old quotes wholesale,
 * which is precisely what the snapshot exists to prevent. This flags only what
 * the operator can already SEE differ on screen.
 */
import { PERSISTED_RESULT_FIELDS } from './calcEngine.js';

/** Float noise only — not a budget for real movement. */
const REL_TOL = 1e-9;

/**
 * @param {Record<string, any>|null|undefined} saved  quote.result as persisted
 * @param {Record<string, any>|null|undefined} live   result the screen computes now
 * @returns {{ fields: string[], savedSubtotal: number|undefined, liveSubtotal: number|undefined } | null}
 */
export function savedResultDrift(saved, live) {
  if (!saved || !live || typeof saved !== 'object' || typeof live !== 'object') return null;
  const fields = [];
  for (const k of PERSISTED_RESULT_FIELDS) {
    const a = saved[k];
    const b = live[k];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > REL_TOL * Math.max(1, Math.abs(a), Math.abs(b))) fields.push(k);
  }
  if (!fields.length) return null;
  return { fields, savedSubtotal: saved.s_ttl, liveSubtotal: live.s_ttl };
}
