/**
 * Operation-status state-machine transition guard — Sprint MES-2.2.
 *
 * Pure function. No DB, no I/O, no console, no throw. Returns a discriminated
 * result object so the caller (kiosk router) can render an RFC-7807 envelope
 * without a try/catch. Mirrors the contract style of MES-1.2
 * `workOrderTransition` exactly: same 3-shape discriminated union, same
 * never-throws posture, same inverse-lookup `allowed_from` semantics.
 *
 * The 9 valid edges (PRD §10):
 *   dispatch              PENDING       → DISPATCHED   (planner)
 *   start                 DISPATCHED    → SETUP        (kiosk)
 *   start_run             SETUP         → RUNNING      (kiosk)
 *   scan                  SETUP         → RUNNING      (alias of start_run; first /scan)
 *   pause                 RUNNING       → PAUSED       (kiosk; reason_code in service)
 *   resume                PAUSED        → RUNNING      (kiosk)
 *   complete              RUNNING       → DONE         (kiosk)
 *   complete_from_pause   PAUSED        → DONE         (kiosk)
 *   accept                DONE          → ACCEPTED     (planner)
 *
 * Of 7 states × 9 events = 63 ordered pairs:
 *   - 9 are valid edges (forward transitions, exactly one .to per pair)
 *   - 8 are no-change (already at the event's target — idempotent retry)
 *   - 46 are invalid (incl. all 9 ACCEPTED-row pairs — terminal beats no-change)
 *
 * `allowed_from` on an invalid result is the inverse lookup — the set of
 * `from` states from which the asked event WOULD be valid. Operationally:
 * "to do this event, you'd need to be in one of these states." Terminal
 * states return `[]` because no event is ever valid out of a terminal state,
 * regardless of which event the caller asks.
 *
 * ctx parameter (decision parity with MES-1.2 — kept pure of ctx semantics):
 *   The signature accepts `ctx` to match the service-layer call shape and
 *   leave room for future extension, but the pure function intentionally
 *   ignores it. Both `ctx.actor` authorization (planner-vs-kiosk) and
 *   `ctx.reason_code` presence checks are enforced by the service layer
 *   (MES-2.4) so this function stays trivially testable, reusable, and
 *   reasoned-about as a (state, event) → result mapping.
 */

import { OP_TERMINAL_STATUSES } from '../../shared/constants/workOrderStates.js';

const TRANSITIONS = Object.freeze({
  dispatch: Object.freeze({ from: 'PENDING', to: 'DISPATCHED' }),
  start: Object.freeze({ from: 'DISPATCHED', to: 'SETUP' }),
  start_run: Object.freeze({ from: 'SETUP', to: 'RUNNING' }),
  scan: Object.freeze({ from: 'SETUP', to: 'RUNNING' }),
  pause: Object.freeze({ from: 'RUNNING', to: 'PAUSED' }),
  resume: Object.freeze({ from: 'PAUSED', to: 'RUNNING' }),
  complete: Object.freeze({ from: 'RUNNING', to: 'DONE' }),
  complete_from_pause: Object.freeze({ from: 'PAUSED', to: 'DONE' }),
  accept: Object.freeze({ from: 'DONE', to: 'ACCEPTED' }),
});

const TERMINAL_SET = new Set(OP_TERMINAL_STATUSES);

const INVALID_EMPTY = Object.freeze({
  ok: false,
  error: Object.freeze({
    type: 'op-invalid-transition',
    allowed_from: Object.freeze([]),
  }),
});

const NO_CHANGE = Object.freeze({
  ok: false,
  error: Object.freeze({ type: 'op-no-change' }),
});

/**
 * @param {string} from current op status (one of WO_OP_STATUSES)
 * @param {string} eventType one of OP_STATUS_EVENTS
 * @param {object} [_ctx] reserved for service-layer use; ignored by the pure fn
 * @returns {{ ok: true, to: string }
 *   | { ok: false, error: { type: 'op-no-change' } }
 *   | { ok: false, error: { type: 'op-invalid-transition', allowed_from: readonly string[] } }}
 */
export function opStatusTransition(from, eventType, _ctx) {
  // Terminal: no event is ever valid out of a terminal state. Special-case
  // up front so the caller gets the operationally-truthful "nothing's
  // possible from here" signal (allowed_from = []) regardless of event.
  if (TERMINAL_SET.has(from)) {
    return INVALID_EMPTY;
  }
  const edge = TRANSITIONS[eventType];
  // Unknown event (incl. eventType=null/undefined/non-string) — no edge exists.
  if (!edge) {
    return INVALID_EMPTY;
  }
  // Already at this event's target — idempotent retry. Not a hard error,
  // but also not a state change worth auditing; let the route translate
  // to a 200/304-style response per RFC-7807 envelope conventions.
  if (from === edge.to) {
    return NO_CHANGE;
  }
  // Valid edge.
  if (from === edge.from) {
    return { ok: true, to: edge.to };
  }
  // Caller is in the wrong source state for this event. allowed_from is
  // exactly [edge.from] because each event has a single valid source.
  return {
    ok: false,
    error: {
      type: 'op-invalid-transition',
      allowed_from: Object.freeze([edge.from]),
    },
  };
}
