/**
 * Work Order state-machine transition guard — Sprint MES-1.
 *
 * Pure function. No DB, no I/O, no console, no throw. Returns a discriminated
 * result object so callers can render an RFC-7807 envelope without a try/catch.
 *
 * The 13 valid edges (PRD §8.1):
 *   forward (6)       CREATED→RELEASED→SCHEDULED→IN_PROGRESS→COMPLETED→QC_RELEASED→CLOSED
 *   pause / resume(2) IN_PROGRESS ⇄ ON_HOLD
 *   cancel (5)        {CREATED,RELEASED,SCHEDULED,IN_PROGRESS,ON_HOLD} → CANCELLED
 *
 * Of 9² = 81 ordered pairs: 13 valid · 9 self-loops (no-change) · 59 invalid.
 *
 * `allowed_from` on an invalid result is the inverse lookup — the set of
 * `from` states from which `to` IS reachable — so the caller (or operator)
 * can recover by routing through one of those.
 */

import { WO_STATES } from '../../shared/constants/workOrderStates.js';

const VALID_TRANSITIONS = Object.freeze({
  CREATED: Object.freeze(['RELEASED', 'CANCELLED']),
  RELEASED: Object.freeze(['SCHEDULED', 'CANCELLED']),
  SCHEDULED: Object.freeze(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: Object.freeze(['ON_HOLD', 'COMPLETED', 'CANCELLED']),
  ON_HOLD: Object.freeze(['IN_PROGRESS', 'CANCELLED']),
  COMPLETED: Object.freeze(['QC_RELEASED']),
  QC_RELEASED: Object.freeze(['CLOSED']),
  CLOSED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

const INVERSE_TRANSITIONS = Object.freeze(
  Object.fromEntries(
    WO_STATES.map((to) => [
      to,
      Object.freeze(WO_STATES.filter((from) => VALID_TRANSITIONS[from].includes(to))),
    ])
  )
);

const STATE_SET = new Set(WO_STATES);

/**
 * @param {string} from current state
 * @param {string} to   desired next state
 * @returns {{ ok: true } | { ok: false, error: { type: string, allowed_from?: readonly string[] } }}
 */
export function workOrderTransition(from, to) {
  if (!STATE_SET.has(from) || !STATE_SET.has(to)) {
    return { ok: false, error: { type: 'urn:ops:wo-unknown-state' } };
  }
  if (from === to) {
    return { ok: false, error: { type: 'urn:ops:wo-no-change' } };
  }
  if (VALID_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: {
      type: 'urn:ops:wo-invalid-transition',
      allowed_from: INVERSE_TRANSITIONS[to],
    },
  };
}
