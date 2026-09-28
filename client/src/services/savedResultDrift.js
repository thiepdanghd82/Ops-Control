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
 *
 * A drift also carries its SIZE: how far the subtotal moves as a share of the
 * selling price (of the saved subtotal when there is no price). More than half
 * is `implausible` — not a formula refinement but an input that today's engine
 * reads differently from when the quote was saved (a tool with no tool life
 * falling back to 1; a manual-labour speed read per operator). Measured
 * 2026-09-28 over the 44 Standard quotes still drifting: 40 moved by under 31%
 * of their price, 9 by 196% or more, none in between — RFQ-2026-S0007 would
 * save $444/pc. The calculators do not let such a drift light Save.
 */
import { PERSISTED_RESULT_FIELDS } from './calcEngine.js';

/** Float noise only — not a budget for real movement. */
const REL_TOL = 1e-9;

/** A subtotal moving by more than this share of the selling price is not saved with one click. */
export const IMPLAUSIBLE_DRIFT_SHARE = 0.5;

/**
 * @param {Record<string, any>|null|undefined} saved  quote.result as persisted
 * @param {Record<string, any>|null|undefined} live   result the screen computes now
 * @returns {{ fields: string[], savedSubtotal: number|undefined, liveSubtotal: number|undefined,
 *   share: number|undefined, implausible: boolean } | null}
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
  const savedSubtotal = saved.s_ttl;
  const liveSubtotal = live.s_ttl;
  const price =
    Number(live.sp) > 0 ? Number(live.sp) : Number(saved.sp) > 0 ? Number(saved.sp) : savedSubtotal;
  const share =
    Number.isFinite(savedSubtotal) && Number.isFinite(liveSubtotal) && price > 0
      ? Math.abs(liveSubtotal - savedSubtotal) / price
      : undefined;
  const implausible = share !== undefined && share > IMPLAUSIBLE_DRIFT_SHARE;
  return { fields, savedSubtotal, liveSubtotal, share, implausible };
}
